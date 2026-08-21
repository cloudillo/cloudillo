// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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
	createApiClient,
	dedupePresenceUsers,
	getAppBus,
	getFileUrl,
	PRESENCE_THROTTLE_MS,
	type PresenceEntry,
	type PresenceFeed,
	type PublicProfile
} from '@cloudillo/core'
import { awarenessPresenceFeed } from '@cloudillo/crdt'
import * as React from 'react'
import type { Awareness } from 'y-protocols/awareness'

import { useThrottledCallback } from './useThrottledCallback.js'

/**
 * `GET /profiles/batch` rejects (400) beyond this many distinct tags rather than
 * truncating, so chunk instead of slicing — a dropped tag would be asked for
 * again on every roster change.
 */
const PROFILE_BATCH_MAX = 64

/** Back-off before a failed profile lookup is attempted again. */
const PROFILE_RETRY_MS = 30_000

/**
 * The node to resolve collaborator profiles against, and the token to use there.
 *
 * The DOCUMENT's node, not the viewer's: a collaborator on a foreign-hosted
 * document is routinely someone the viewer's own node has never synced. With no
 * owner tag to aim at (a legacy '#_embed:<nonce>' hash, a standalone mount) we
 * fall back to the viewer's node, but WITHOUT the token — it was minted for a
 * different node and must not be handed to this one.
 */
function profileNode(bus: ReturnType<typeof getAppBus>): {
	tag?: string
	token?: string
} {
	if (bus.ownerTag) return { tag: bus.ownerTag, token: bus.accessToken }
	return { tag: bus.idTag, token: undefined }
}

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
	// idTag -> the profile, or null when the node answered and had nothing for
	// that tag — a real negative answer, cached so it is asked once.
	const [profiles, setProfiles] = React.useState<Record<string, PublicProfile | null>>({})
	const profilesRef = React.useRef(profiles)
	profilesRef.current = profiles
	// Tags with a request in the air. Without this, a roster change during the
	// round trip re-asks for everything that is already being asked about.
	const inFlightRef = React.useRef(new Set<string>())
	// Tag -> earliest time we may ask again after a FAILED lookup. A failure is
	// not an answer, so it must not be cached like one — nor retried on every tick.
	const retryAtRef = React.useRef(new Map<string, number>())
	// The back-off map only says "not yet"; without a timer nothing ever asks again
	// on a quiet feed. A Yjs roster churns on every cursor move and re-runs the
	// effect by accident, but RTDB presence changes only on a page or block event —
	// one blip would leave a collaborator a monogram for the rest of the session.
	const [retryTick, setRetryTick] = React.useState(0)
	const retryTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	// Only unmount discards a resolved profile. The resolution effect re-runs on
	// every roster change, so a per-run `cancelled` flag would throw away an answer
	// that is still good — and the in-flight gate would stop the re-run re-asking.
	const mountedRef = React.useRef(true)
	React.useEffect(() => {
		mountedRef.current = true
		return () => {
			mountedRef.current = false
			if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
		}
	}, [])

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

	// Nothing about a face travels over presence: it is looked up here from the
	// idTag, and the idTag is the one field the relay stamps from the sender's own
	// token. That pair is what stops a peer wearing someone else's face.
	//
	// Only the node's own omission is cached (as `null`) — that is an answer, and
	// asking again would change nothing. A transport failure is not, so those tags
	// stay absent and are retried after `PROFILE_RETRY_MS`; a blip must not blank a
	// face for the rest of the session.
	React.useEffect(() => {
		const now = Date.now()
		const unknown = [
			...new Set(
				entries
					.map((u) => u.idTag)
					.filter(
						(idTag): idTag is string =>
							!!idTag &&
							!(idTag in profilesRef.current) &&
							!inFlightRef.current.has(idTag) &&
							(retryAtRef.current.get(idTag) ?? 0) <= now
					)
			)
		]
		if (!unknown.length) return
		for (const idTag of unknown) inFlightRef.current.add(idTag)

		void (async function () {
			const resolved: Record<string, PublicProfile> = {}
			const answered = new Set<string>() // tags whose chunk got a reply
			const failed: string[] = [] // tags whose chunk did not
			try {
				const bus = getAppBus()
				const { tag: targetTag, token } = profileNode(bus)
				if (!targetTag) throw new Error('no node to resolve profiles against')
				// A fresh client per call: the shell rotates the scoped token, so
				// reading it at call time keeps a long-lived document working
				// across a rotation.
				const api = createApiClient({ idTag: targetTag, authToken: token })
				const chunks: string[][] = []
				for (let i = 0; i < unknown.length; i += PROFILE_BATCH_MAX) {
					chunks.push(unknown.slice(i, i + PROFILE_BATCH_MAX))
				}
				// Per chunk, not all-or-nothing: one rejected chunk must not discard
				// every chunk that succeeded alongside it.
				const settled = await Promise.allSettled(
					chunks.map((c) => api.profiles.getBatch(c))
				)
				settled.forEach((res, i) => {
					if (res.status === 'fulfilled') {
						for (const idTag of chunks[i]) answered.add(idTag)
						// Tags the node has not mirrored are omitted, so key by
						// idTag rather than by position.
						for (const profile of res.value) resolved[profile.idTag] = profile
					} else {
						failed.push(...chunks[i])
						console.warn('[presence] profile batch failed', chunks[i], res.reason)
					}
				})
			} catch (err) {
				// Nothing went out at all — no node to aim at, no client. Warn
				// rather than swallow: a bare `catch {}` hides even "AppBus not
				// initialized", making a missing-avatar report undiagnosable.
				console.warn('[presence] could not resolve profiles', unknown, err)
				failed.push(...unknown)
			} finally {
				for (const idTag of unknown) inFlightRef.current.delete(idTag)
			}
			if (!mountedRef.current) return
			for (const idTag of failed) retryAtRef.current.set(idTag, Date.now() + PROFILE_RETRY_MS)
			// One timer for the whole back-off, not one per failure: a second
			// failure while the first is pending must not stack another wake-up.
			if (failed.length && !retryTimerRef.current) {
				retryTimerRef.current = setTimeout(() => {
					retryTimerRef.current = undefined
					if (mountedRef.current) setRetryTick((t) => t + 1)
				}, PROFILE_RETRY_MS)
			}
			// `setProfiles` re-renders, so the effect re-runs for anything still
			// unknown; the back-off map is what stops that becoming a loop.
			if (answered.size) {
				setProfiles((prev) => {
					const next = { ...prev }
					for (const idTag of answered) next[idTag] = resolved[idTag] ?? null
					return next
				})
			}
		})()
	}, [entries, retryTick])

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
