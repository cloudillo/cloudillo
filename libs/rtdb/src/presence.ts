// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Document presence over the RTDB presence channel.
 *
 * The counterpart of `awarenessPresenceFeed` in `@cloudillo/crdt`: both satisfy
 * `PresenceFeed`, so `useDocPresence` in `@cloudillo/react` treats either
 * transport identically. Everything here is transport plumbing — the roster
 * rules live in `@cloudillo/core`'s `presence.ts`.
 *
 * The channel carries a free-form state per connection. The server stamps
 * `state.user.idTag` from the socket's own token (guests get it removed) and
 * validates nothing else, so an app may publish a page, a block or a cursor
 * alongside the user and filter on it client-side. It never scopes presence to
 * RTDB paths: the roster is per database, and "who is on page 7" is an app-level
 * filter over `state`.
 */

import {
	PRESENCE_FIELD,
	PRESENCE_THROTTLE_MS,
	type PresenceConnection,
	type PresenceEntry,
	type PresenceFeed,
	type PresenceUser,
	readPresenceEntries
} from '@cloudillo/core'

import type { PresenceEvent } from './types.js'
import type { WebSocketManager } from './websocket.js'

export interface RtdbPresenceOptions {
	/** The local identity, normally `buildPresenceUser(bus)`. */
	user?: PresenceUser
	/** Anything else this app wants peers to see. Free-form and unvalidated. */
	state?: Record<string, unknown>
}

/**
 * The live roster of a presence-enabled RTDB connection.
 *
 * Get one from `client.presence(...)` rather than constructing it: the client
 * memoises a single instance per connection, which is what keeps one socket to
 * one roster.
 */
export class RtdbPresence implements PresenceFeed {
	private user: PresenceUser | undefined
	private appState: Record<string, unknown> = {}
	private roster = new Map<string, unknown>()
	private subscribers = new Set<(entries: PresenceEntry[]) => void>()
	private unlisten: () => void
	private closed = false

	// Leading-and-trailing throttle. Leading so the first move of a drag shows up
	// at once, trailing so the last one is never the one that got dropped —
	// `useThrottledCallback` in @cloudillo/react does neither (it is React-only and
	// trailing-edge-only), which is why this is hand-rolled.
	private lastPublishAt = Number.NEGATIVE_INFINITY
	private trailingTimer: ReturnType<typeof setTimeout> | null = null
	private resendTimer: ReturnType<typeof setTimeout> | null = null

	constructor(
		private ws: WebSocketManager,
		options?: RtdbPresenceOptions
	) {
		this.user = options?.user
		this.appState = options?.state ?? {}
		this.unlisten = ws.onPresenceChange((event) => this.applyEvent(event))
		if (this.user) this.schedulePublish()
	}

	/** This connection's own id, once the server's `sync` has named it. */
	get connId(): string | undefined {
		return this.ws.getConnId()
	}

	/**
	 * Set the local identity and republish.
	 *
	 * Worth calling again on `bus.onIdentityChange`: the shell can correct an
	 * identity after the app has already started, and presence published under the
	 * old one would leave a stale name in every peer's roster.
	 */
	setUser(user: PresenceUser): void {
		this.user = user
		this.schedulePublish()
	}

	/**
	 * Replace this app's half of the published state and republish.
	 *
	 * A replace rather than a merge, so clearing a field is `setState({})` and not
	 * a dance with `undefined`. The `user` field is added on publish and cannot be
	 * overwritten from here.
	 */
	setState(state: Record<string, unknown>): void {
		this.appState = state
		this.schedulePublish()
	}

	/**
	 * The per-CONNECTION roster: fires immediately, then on every change.
	 *
	 * One entry per tab, not per person — that is what an app filters on
	 * (`state.page`, `state.block`). `useDocPresence` deduplicates it into the
	 * avatar stack's per-person list.
	 */
	subscribe(cb: (entries: PresenceEntry[]) => void): () => void {
		this.subscribers.add(cb)
		cb(this.entries())
		return () => {
			this.subscribers.delete(cb)
		}
	}

	/** Clear our roster entry and stop listening. The socket itself stays up. */
	close(): void {
		if (this.closed) return
		this.closed = true
		if (this.trailingTimer) clearTimeout(this.trailingTimer)
		if (this.resendTimer) clearTimeout(this.resendTimer)
		this.trailingTimer = null
		this.resendTimer = null
		this.unlisten()
		this.subscribers.clear()
		this.roster.clear()
		void this.ws.publishPresence(null)
	}

	private entries(): PresenceEntry[] {
		const self = this.connId
		const connections: PresenceConnection[] = []
		for (const [connId, state] of this.roster) {
			connections.push({ connId, state, self: connId === self })
		}
		return readPresenceEntries(connections)
	}

	private emit(): void {
		const entries = this.entries()
		for (const cb of this.subscribers) {
			try {
				cb(entries)
			} catch (error) {
				console.error('[RTDB] Error in presence subscriber:', error)
			}
		}
	}

	private applyEvent(event: PresenceEvent): void {
		if (this.closed) return
		switch (event.action) {
			case 'sync':
				this.roster.clear()
				for (const entry of event.users) this.roster.set(entry.connId, entry.state)
				// A `sync` reflects the room as it was when we joined, which is before
				// we had published anything — so our own entry is missing from it and
				// our avatar would blink out of our own DocBar. Put it back; the server
				// has our state (or is about to) either way.
				this.applyLocalEntry()
				break
			case 'join':
			case 'update':
				this.roster.set(event.connId, event.state)
				break
			case 'leave':
				this.roster.delete(event.connId)
				break
		}
		this.emit()
	}

	/** Our own entry, mirrored locally so it never waits on a round trip. */
	private applyLocalEntry(): void {
		const self = this.connId
		if (!self || !this.user) return
		this.roster.set(self, this.publishedState())
	}

	private publishedState(): Record<string, unknown> {
		return { ...this.appState, [PRESENCE_FIELD]: this.user }
	}

	private schedulePublish(): void {
		if (this.closed) return
		const waited = Date.now() - this.lastPublishAt
		if (waited >= PRESENCE_THROTTLE_MS) {
			this.publishNow()
			return
		}
		// Already coalescing; the pending trailing edge will pick up this state too,
		// since it reads it fresh when it fires.
		if (this.trailingTimer) return
		this.trailingTimer = setTimeout(() => {
			this.trailingTimer = null
			this.publishNow()
		}, PRESENCE_THROTTLE_MS - waited)
	}

	private publishNow(): void {
		if (this.closed || !this.user) return
		this.lastPublishAt = Date.now()
		const state = this.publishedState()
		// Optimistic: the server never echoes an event back to its originator, so
		// without this our own avatar only appears after a reconnect's `sync`.
		this.applyLocalEntry()
		this.emit()
		void this.ws.publishPresence(state).then((result) => {
			// Throttled means the server stored nothing and told nobody, so the state
			// is simply lost unless we say it again. One re-send is enough: it lands a
			// full interval later, by which time the bucket has refilled.
			if (result?.throttled) this.scheduleResend()
		})
	}

	private scheduleResend(): void {
		if (this.closed || this.resendTimer) return
		this.resendTimer = setTimeout(() => {
			this.resendTimer = null
			this.publishNow()
		}, PRESENCE_THROTTLE_MS)
	}
}

// vim: ts=4
