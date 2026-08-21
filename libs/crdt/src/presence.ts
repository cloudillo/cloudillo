// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Document presence over Yjs awareness.
 *
 * A thin adapter: the roster rules live in `@cloudillo/core`'s `presence.ts` and
 * are shared with the RTDB transport. This maps awareness's
 * `Map<clientId, state>` onto them and re-exports the shared surface so an
 * awareness-based app has one import site.
 *
 * The `user.idTag` an app publishes here is not peer-asserted: the `/ws/crdt`
 * relay rewrites it from the connection's own token (guests get it removed). See
 * `cloudillo-rs/crates/cloudillo-crdt/src/websocket.rs`.
 */

import {
	buildPresenceUser,
	type PresenceEntry as CorePresenceEntry,
	dedupePresenceUsers,
	PRESENCE_FIELD,
	type PresenceFeed,
	type PresenceSource,
	type PresenceUser,
	readPresenceEntries
} from '@cloudillo/core'
import type { Awareness } from 'y-protocols/awareness'

export type { PresenceFeed, PresenceSource, PresenceUser } from '@cloudillo/core'
export {
	buildPresenceUser,
	dedupePresenceUsers,
	PRESENCE_FIELD,
	PRESENCE_THROTTLE_MS,
	readPresenceEntries,
	readPresenceUser
} from '@cloudillo/core'

/**
 * The shared entry with the awareness client id re-attached. `connId` is
 * `String(clientId)` and is what the shared code keys and colours on; `clientId`
 * stays for the numeric-id call sites.
 */
export interface PresenceEntry extends CorePresenceEntry {
	clientId: number
}

/** Publish the local user on `awareness`, and return what was published. */
export function initPresence(awareness: Awareness, bus: PresenceSource): PresenceUser {
	const user = buildPresenceUser(bus)
	awareness.setLocalStateField(PRESENCE_FIELD, user)
	return user
}

/** Awareness's state map as the shared reader wants it: one item per connection. */
function awarenessConnections(awareness: Awareness) {
	const localClientId = awareness.clientID
	const connections: Array<{ connId: string; state: unknown; self: boolean }> = []
	for (const [clientId, state] of awareness.getStates() as Map<number, unknown>) {
		connections.push({
			connId: String(clientId),
			state,
			self: clientId === localClientId
		})
	}
	return connections
}

/** `connId` is always `String(clientId)` here, so this is lossless. */
function withClientId(entry: CorePresenceEntry): PresenceEntry {
	return { ...entry, clientId: Number(entry.connId) }
}

/**
 * Everyone currently in the document, deduplicated by idTag and sorted: self
 * first, then identified users by name, then anonymous guests last.
 */
export function readPresenceUsers(awareness: Awareness): PresenceEntry[] {
	return dedupePresenceUsers(readPresenceEntries(awarenessConnections(awareness))).map(
		withClientId
	)
}

/**
 * Subscribe to the deduplicated roster.
 *
 * Fires immediately with the current roster, then on every awareness change.
 * Awareness fires on every cursor move, so throttle in the consumer —
 * `useDocPresence` does.
 *
 * @returns Unsubscribe function
 */
export function subscribePresence(
	awareness: Awareness,
	cb: (users: PresenceEntry[]) => void
): () => void {
	const handler = () => cb(readPresenceUsers(awareness))
	awareness.on('change', handler)
	handler()
	return () => {
		awareness.off('change', handler)
	}
}

/**
 * An awareness channel as a transport-neutral `PresenceFeed`.
 *
 * Emits the PER-CONNECTION list, not the deduplicated roster: the consumer
 * (`useDocPresence`) resolves profile pictures over it and deduplicates
 * afterwards, and an app filtering on its own state fields — a cursor, a page —
 * needs one entry per tab.
 */
export function awarenessPresenceFeed(awareness: Awareness): PresenceFeed {
	return {
		subscribe(cb) {
			const handler = () => cb(readPresenceEntries(awarenessConnections(awareness)))
			awareness.on('change', handler)
			handler()
			return () => {
				awareness.off('change', handler)
			}
		}
	}
}

// vim: ts=4
