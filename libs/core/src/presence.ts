// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Document presence — who else is in this document — independent of transport.
 *
 * Yjs awareness carries it under its `user` field (`@cloudillo/crdt`), the RTDB
 * presence channel as its free-form `state` (`@cloudillo/rtdb`); everything that
 * shapes a roster out of either lives here so the two cannot drift apart. React
 * binding: `useDocPresence` in `@cloudillo/react`.
 *
 * Only a display name and (for signed-in users) an idTag go on the wire; colours
 * and pictures are derived by the VIEWING client from that idTag, so a peer
 * cannot assert an arbitrary avatar or colour. The idTag is not peer-asserted
 * either — both relays restamp it from the connection's own token, guests get it
 * removed (`cloudillo-rs/crates/cloudillo-crdt/src/websocket.rs`,
 * `cloudillo-rs/crates/cloudillo-rtdb/src/presence.rs`). Everything ELSE stays
 * peer-controlled and unvalidated, hence the defensive readers below.
 */

import { idHue } from './utils.js'

/** What goes ON THE WIRE under the `user` field of a presence state. */
export interface PresenceUser {
	name: string
	/** Absent for anonymous guests. */
	idTag?: string
}

/** What the UI consumes. Colour and picture are derived locally by the viewer. */
export interface PresenceEntry extends PresenceUser {
	/**
	 * Identifies one connection. Yjs uses its awareness client id as a string,
	 * RTDB the server-assigned connection id.
	 */
	connId: string
	self: boolean
	/** Same idTag in two tabs collapses to one avatar; this is how many. */
	connections: number
	/** `idHue(idTag ?? connId)` — the platform-wide identity hue. */
	hue: number
	/** Filled in by the profile resolver, never read off the wire. */
	profilePic?: string
	/**
	 * The whole peer-published state, for apps that put more in it than a user —
	 * a cursor, a page, a block. Untrusted beyond `user`. Absent on a
	 * deduplicated entry, which spans connections whose states differ.
	 */
	state?: Record<string, unknown>
}

/** The field every Cloudillo app stores its presence identity under. */
export const PRESENCE_FIELD = 'user'

/**
 * Longest display name a peer may put in a roster row. Names are peer-controlled
 * and unvalidated by either relay, so a length cap is all that stands between a
 * hostile name and the DocBar's layout.
 */
export const MAX_PRESENCE_NAME_LENGTH = 64

/**
 * Presence fires on every cursor move; untamed that re-renders the DocBar
 * continuously. Shared by both transports so avatars appear at the same pace
 * either way.
 */
export const PRESENCE_THROTTLE_MS = 500

/** The subset of the app bus presence needs — `AppBus` satisfies it as-is. */
export interface PresenceSource {
	idTag?: string
	displayName?: string
	/**
	 * Whether `idTag` stands for a signed-in user. Load-bearing: the shell hands
	 * a share-link guest the DOCUMENT OWNER's tag as `idTag`, so publishing on
	 * `idTag` alone would make every guest wear the owner's name and face.
	 */
	authenticated?: boolean
}

/** One connection's raw state, as a transport hands it over. */
export interface PresenceConnection {
	connId: string
	/** Peer-controlled and unvalidated; `readPresenceEntries` copes. */
	state: unknown
	self: boolean
}

/**
 * A transport-neutral roster source: fires with the full per-connection list
 * immediately on subscribe, then on every change. Satisfied by
 * `awarenessPresenceFeed` (`@cloudillo/crdt`) and `RtdbPresence`
 * (`@cloudillo/rtdb`), which is what lets `useDocPresence` take either.
 */
export interface PresenceFeed {
	subscribe(cb: (entries: PresenceEntry[]) => void): () => void
}

/**
 * Build the local presence payload from the app bus.
 *
 * The bus is passed in rather than fetched with `getAppBus()` so this module
 * stays usable outside an iframe (tests, SSR): that call constructs a bus and
 * installs a message listener on first use.
 */
export function buildPresenceUser(bus: PresenceSource): PresenceUser {
	// An idTag is the stable identity, but only when it is actually ours; a guest
	// has only whatever name the share link carried.
	const identified = !!bus.idTag && !!bus.authenticated
	const name = bus.displayName || (identified ? bus.idTag : undefined) || 'Guest'
	return identified ? { name, idTag: bus.idTag } : { name }
}

/**
 * A peer's string field, made safe to render. Control characters go first — the
 * name reaches a CSS `content:` string in notillo's block indicators, where a raw
 * newline terminates the string and drops the rule — then it is clamped, since
 * every consumer is a single-line label.
 */
function readPeerString(value: unknown, max: number): string {
	if (typeof value !== 'string') return ''
	const clean = value
		.replace(/[\p{Cc}\p{Cf}]/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim()
	return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

/**
 * Read a peer's `user` field defensively.
 *
 * The protocol validates nothing beyond the identity stamp, so anything
 * malformed degrades to "anonymous" and what survives is sanitised. `idTag` has
 * the stronger guarantee of a relay stamp, but is still shape-checked — a direct
 * peer connection would have no relay in it.
 */
export function readPresenceUser(state: unknown): PresenceUser | undefined {
	if (!state || typeof state !== 'object') return undefined
	const user = (state as Record<string, unknown>)[PRESENCE_FIELD]
	if (!user || typeof user !== 'object') return undefined
	const { name: rawName, idTag: rawIdTag } = user as Record<string, unknown>
	const name = readPeerString(rawName, MAX_PRESENCE_NAME_LENGTH)
	const idTag = readPeerString(rawIdTag, 128)
	return { name, idTag: idTag || undefined }
}

/**
 * One entry per CONNECTION, in the order the transport listed them.
 *
 * This is the list an app filters — "who is on page 7", "who is in this block" —
 * because those answers are per-tab; `dedupePresenceUsers` collapses it into the
 * per-person roster the avatar stack shows. Connections with no readable `user`
 * are dropped: a member that has not published anything is not in the room.
 */
export function readPresenceEntries(connections: Iterable<PresenceConnection>): PresenceEntry[] {
	const entries: PresenceEntry[] = []

	for (const { connId, state, self } of connections) {
		const user = readPresenceUser(state)
		if (!user) continue
		entries.push({
			name: user.name,
			idTag: user.idTag,
			connId,
			self,
			connections: 1,
			hue: idHue(user.idTag ?? connId),
			// `readPresenceUser` returning means this was an object.
			state: state as Record<string, unknown>
		})
	}

	return entries
}

/**
 * Everyone currently in the document, deduplicated by idTag and sorted: **self
 * first → identified users by name → anonymous guests last**. Two tabs of one
 * signed-in user collapse to a single entry whose `connections` counts them.
 *
 * Entries are copied rather than merged in place, so the per-connection list
 * stays usable alongside this one. `state` is dropped: a merged entry spans
 * connections whose states differ, and there is no truthful single value.
 */
export function dedupePresenceUsers(entries: PresenceEntry[]): PresenceEntry[] {
	const users: PresenceEntry[] = []
	const byIdTag = new Map<string, PresenceEntry>()

	for (const entry of entries) {
		const existing = entry.idTag ? byIdTag.get(entry.idTag) : undefined
		if (existing) {
			existing.connections++
			// Whichever connection is us decides the entry's identity, so the
			// "you" marker cannot land on a stranger's tab.
			if (entry.self) {
				existing.self = true
				existing.connId = entry.connId
			}
			continue
		}

		const { state: _state, ...rest } = entry
		const user: PresenceEntry = { ...rest, connections: 1 }
		if (user.idTag) byIdTag.set(user.idTag, user)
		users.push(user)
	}

	return users.sort((a, b) => {
		if (a.self !== b.self) return a.self ? -1 : 1
		const aAnon = !a.idTag
		const bAnon = !b.idTag
		if (aAnon !== bAnon) return aAnon ? 1 : -1
		const byName = a.name.localeCompare(b.name)
		return byName !== 0 ? byName : a.connId.localeCompare(b.connId)
	})
}

// vim: ts=4
