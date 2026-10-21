// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * React binding for document presence, over either transport.
 *
 * The roster rules (sorting, deduplication, tolerating malformed peer state)
 * live in `@cloudillo/core`'s `presence.ts`; this adds only what React needs —
 * subscription lifetime, throttling, and resolving profile pictures. A Yjs app
 * hands in its `Awareness`, an RTDB app the `PresenceFeed` from
 * `client.presence()`; everything downstream is identical.
 */

import {
	dedupePresenceUsers,
	getAppBus,
	getFileUrl,
	PRESENCE_THROTTLE_MS,
	type PresenceEntry,
	type PresenceFeed
} from '@cloudillo/core'
import { awarenessPresenceFeed } from '@cloudillo/crdt'
import * as React from 'react'
import type { Awareness } from 'y-protocols/awareness'

import { profileNode, useProfiles } from './profile-cache.js'
import { useThrottledCallback } from './useThrottledCallback.js'

export interface DocPresence {
	/** One per person: two tabs of one user collapse into one entry. */
	users: PresenceEntry[]
	/**
	 * One per CONNECTION, carrying each peer's whole published `state` — what an
	 * app filters on for "who is on this page", "who is in this block". Those
	 * questions are per-tab, and a merged entry has no single truthful state.
	 */
	entries: PresenceEntry[]
	/** `users.length` — people, not connections. */
	count: number
	self?: PresenceEntry
}

const EMPTY: PresenceEntry[] = []
const EMPTY_PRESENCE: DocPresence = { users: EMPTY, entries: EMPTY, count: 0 }

/**
 * Who is currently in this document.
 *
 * Takes a Yjs `Awareness` or a transport-neutral `PresenceFeed` (what
 * `@cloudillo/rtdb`'s `client.presence()` returns). Pass `undefined` for a
 * document with no presence channel at all and this returns an empty roster
 * rather than requiring a conditional at every call site.
 */
export function useDocPresence(source?: Awareness | PresenceFeed | null): DocPresence {
	const [entries, setEntries] = React.useState<PresenceEntry[]>(EMPTY)
	// Nothing about a face travels over presence: it is looked up from the idTag,
	// and the idTag is the one field the relay stamps from the sender's own token.
	// That pair is what stops a peer wearing someone else's face. The lookup —
	// batching, in-flight, back-off — lives in the shared profile cache.
	const node = profileNode(getAppBus())
	const idTags = React.useMemo(
		() => [...new Set(entries.map((u) => u.idTag).filter((t): t is string => !!t))],
		[entries]
	)
	const profiles = useProfiles(idTags, node)

	const [onPresenceChange, flushPresence] = useThrottledCallback(
		(next: PresenceEntry[]) => setEntries(next),
		PRESENCE_THROTTLE_MS
	)

	// The one place the two transports differ. `getStates` is awareness's, and
	// nothing on a `PresenceFeed` has it.
	const feed = React.useMemo(() => {
		if (!source) return undefined
		return 'getStates' in source ? awarenessPresenceFeed(source) : source
	}, [source])

	React.useEffect(() => {
		if (!feed) {
			setEntries(EMPTY)
			return
		}
		const unsubscribe = feed.subscribe(onPresenceChange)
		// The first roster is the one the user is waiting for; only later churn
		// needs damping.
		flushPresence()
		return () => {
			unsubscribe()
			// Drain the throttle first: a pending trailing call would otherwise
			// fire after the reset below and repopulate the roster from the feed
			// we just let go of.
			flushPresence()
			setEntries(EMPTY)
		}
	}, [feed, onPresenceChange, flushPresence])

	return React.useMemo(() => {
		const bus = getAppBus()
		// The node that served the profile row also serves the picture. No token —
		// `vis.pf` blobs are public, and a guest has no token that would work on a
		// stranger's node anyway.
		const nodeTag = profileNode(bus).tag
		// Enrich per CONNECTION and deduplicate afterwards, so both lists carry the
		// resolved name and the roster sorts on the name actually displayed.
		const withPictures = entries.map((u) => {
			const profile = u.idTag ? profiles[u.idTag] : undefined
			if (!profile) return u
			// The node's name wins over the broadcast one: the tag is
			// server-stamped, so the profile behind it is the authority. Decided
			// independently of the picture — a peer without one must not thereby
			// get to keep a name it made up.
			const name = profile.name || u.name || profile.idTag
			// A picture additionally needs a node to fetch it from.
			const profilePic =
				profile.profilePic && u.idTag && nodeTag
					? getFileUrl(nodeTag, profile.profilePic, 'vis.pf')
					: undefined
			if (name === u.name && !profilePic) return u
			return profilePic ? { ...u, name, profilePic } : { ...u, name }
		})
		const users = dedupePresenceUsers(withPictures)
		return {
			users,
			entries: withPictures,
			count: users.length,
			self: users.find((u) => u.self)
		}
	}, [entries, profiles])
}

const PresenceContext = React.createContext<DocPresence | undefined>(undefined)

/**
 * Compute the roster once for a whole app. Without it every consumer — the
 * DocBar, notillo's block indicators, its page sidebar — subscribes separately,
 * each with its own throttle and its own profile lookups.
 */
export function PresenceProvider({
	source,
	children
}: {
	source?: Awareness | PresenceFeed | null
	children?: React.ReactNode
}) {
	const presence = useDocPresence(source)
	return <PresenceContext.Provider value={presence}>{children}</PresenceContext.Provider>
}

/** The app-wide roster, or an empty one outside a `PresenceProvider`. */
export function usePresence(): DocPresence {
	return React.useContext(PresenceContext) ?? EMPTY_PRESENCE
}

/**
 * The app-wide roster, or `undefined` when there is no `PresenceProvider`. The
 * DocBar needs the difference: with a provider it reads the roster off the
 * context, without one it subscribes for itself.
 */
export function usePresenceContext(): DocPresence | undefined {
	return React.useContext(PresenceContext)
}

// vim: ts=4
