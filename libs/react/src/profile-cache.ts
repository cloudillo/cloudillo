// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * One module-level store of public profiles, shared by every hook that shows a
 * face: the DocBar roster, the person card, anything else. A face already on
 * screen costs nothing to look up again.
 *
 * Keyed by node, then idTag — the same tag can resolve differently on two
 * nodes (one has mirrored it, the other has not). Only the node's own omission
 * is cached (as `null`): that is an answer, and asking again would change
 * nothing. A transport failure is not, so those tags stay absent and are retried
 * after `PROFILE_RETRY_MS`; a blip must not blank a face for the session.
 */

import {
	createApiClient,
	decodeBadges,
	getAppBus,
	type ProfileBadge,
	type PublicProfile
} from '@cloudillo/core'
import { isLiveBadge } from '@cloudillo/types'
import * as React from 'react'

import { PersonActionsContext } from './components/Person/PersonActionsContext.js'

/**
 * `GET /profiles/batch` rejects (400) beyond this many distinct tags rather than
 * truncating, so chunk instead of slicing — a dropped tag would be asked for
 * again on every roster change.
 */
const PROFILE_BATCH_MAX = 64

/** Back-off before a failed profile lookup is attempted again. */
const PROFILE_RETRY_MS = 30_000

/** The node to resolve profiles against, and the token to use there. */
export interface ProfileNode {
	tag?: string
	token?: string
}

/**
 * The node to resolve collaborator profiles against, and the token to use there.
 *
 * The DOCUMENT's node, not the viewer's: a collaborator on a foreign-hosted
 * document is routinely someone the viewer's own node has never synced. With no
 * owner tag to aim at (a legacy '#_embed:<nonce>' hash, a standalone mount) we
 * fall back to the viewer's node, but WITHOUT the token — it was minted for a
 * different node and must not be handed to this one.
 */
export function profileNode(bus: ReturnType<typeof getAppBus>): ProfileNode {
	if (bus.ownerTag) return { tag: bus.ownerTag, token: bus.accessToken }
	return { tag: bus.idTag, token: undefined }
}

// nodeTag -> idTag -> the profile, or null when the node answered without it.
const cache = new Map<string, Map<string, PublicProfile | null>>()
// `${nodeTag}\0${idTag}` keys. In flight: without this, a roster change during
// the round trip re-asks for everything already being asked about.
const inFlight = new Set<string>()
/** In-flight keys invalidated before their answer landed: that answer is dropped. */
const stale = new Set<string>()
// nodeTag -> tags queued for the next microtask flush. Every card on a feed asks
// for its own one tag from its own effect; this turns a render's worth of those
// into one batch call per node instead of one per card.
const pending = new Map<string, { node: ProfileNode; tags: Set<string> }>()
// Earliest time we may ask again after a FAILED lookup.
const retryAt = new Map<string, number>()
// The back-off map only says "not yet"; without a timer nothing ever asks again
// on a quiet feed (RTDB presence changes only on a page or block event). One
// timer for the whole back-off, so a second failure does not stack a wake-up.
let retryTimer: ReturnType<typeof setTimeout> | undefined
// Bumped on every change; `useSyncExternalStore` snapshots this number.
let version = 0
// Bumped by `resetProfileCache`, so a request from before the reset is dropped.
let generation = 0
const listeners = new Set<() => void>()

function notify() {
	version++
	for (const l of listeners) l()
}

function subscribe(listener: () => void) {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

function getVersion() {
	return version
}

function scheduleRetry(delay: number) {
	retryTimer = setTimeout(() => {
		retryTimer = undefined
		// Subscribers re-render and re-request whatever is still unknown.
		notify()
		// A batch that failed while this timer was pending backs off past it: wake again for it.
		const now = Date.now()
		let next = Number.POSITIVE_INFINITY
		for (const at of retryAt.values()) if (at > now && at < next) next = at
		if (next !== Number.POSITIVE_INFINITY) scheduleRetry(next - now)
	}, delay)
}

const key = (nodeTag: string, idTag: string) => `${nodeTag}\0${idTag}`

/** Fetch whatever of `idTags` is neither known, in flight, nor backing off. */
function request(idTags: readonly string[], node: ProfileNode) {
	const nodeTag = node.tag
	// No node to aim at (the shell before auth, an app before init): not a
	// failure, so no back-off — just nothing to do until there is one.
	if (!nodeTag) return
	const known = cache.get(nodeTag)
	const now = Date.now()
	const unknown = [
		...new Set(
			idTags.filter(
				(idTag) =>
					!!idTag &&
					!known?.has(idTag) &&
					!inFlight.has(key(nodeTag, idTag)) &&
					(retryAt.get(key(nodeTag, idTag)) ?? 0) <= now
			)
		)
	]
	if (!unknown.length) return
	for (const idTag of unknown) inFlight.add(key(nodeTag, idTag))

	let batch = pending.get(nodeTag)
	if (!batch) {
		const b = { node, tags: new Set<string>() }
		batch = b
		pending.set(nodeTag, b)
		const gen = generation
		// A promise job, not `queueMicrotask`: jest's fake timers stub the latter.
		void Promise.resolve().then(() => {
			// A reset in between already dropped the queue and its in-flight marks.
			if (gen !== generation) return
			pending.delete(nodeTag)
			fetchProfiles(nodeTag, b.node, [...b.tags], gen)
		})
	}
	// The latest caller's token: it may have rotated since the first one queued.
	batch.node = node
	for (const idTag of unknown) batch.tags.add(idTag)
}

/** One batch round trip for `unknown` (already marked in flight), chunked at the server cap. */
function fetchProfiles(nodeTag: string, node: ProfileNode, unknown: string[], gen: number) {
	void (async function () {
		const resolved: Record<string, PublicProfile> = {}
		const answered = new Set<string>() // tags whose chunk got a reply
		const failed: string[] = [] // tags whose chunk did not
		try {
			// A fresh client per call: the shell rotates the scoped token, so
			// reading it at call time keeps a long-lived document working across
			// a rotation.
			const api = createApiClient({ idTag: nodeTag, authToken: node.token })
			const chunks: string[][] = []
			for (let i = 0; i < unknown.length; i += PROFILE_BATCH_MAX) {
				chunks.push(unknown.slice(i, i + PROFILE_BATCH_MAX))
			}
			// Per chunk, not all-or-nothing: one rejected chunk must not discard
			// every chunk that succeeded alongside it.
			const settled = await Promise.allSettled(chunks.map((c) => api.profiles.getBatch(c)))
			settled.forEach((res, i) => {
				if (res.status === 'fulfilled') {
					for (const idTag of chunks[i]) answered.add(idTag)
					// Tags the node has not mirrored are omitted, so key by idTag
					// rather than by position.
					for (const profile of res.value) resolved[profile.idTag] = profile
				} else {
					failed.push(...chunks[i])
					console.warn('[profiles] profile batch failed', chunks[i], res.reason)
				}
			})
		} catch (err) {
			// Nothing went out at all. Warn rather than swallow: a bare `catch {}`
			// makes a missing-avatar report undiagnosable.
			console.warn('[profiles] could not resolve profiles', unknown, err)
			failed.push(...unknown)
		} finally {
			if (gen === generation) {
				for (const idTag of unknown) inFlight.delete(key(nodeTag, idTag))
			}
		}
		if (gen !== generation) return
		for (const idTag of failed) {
			stale.delete(key(nodeTag, idTag))
			retryAt.set(key(nodeTag, idTag), Date.now() + PROFILE_RETRY_MS)
		}
		if (failed.length && !retryTimer) scheduleRetry(PROFILE_RETRY_MS)
		if (answered.size) {
			let byTag = cache.get(nodeTag)
			if (!byTag) {
				byTag = new Map()
				cache.set(nodeTag, byTag)
			}
			for (const idTag of answered) {
				// Left uncached: `notify()` makes its subscribers request it again.
				if (stale.delete(key(nodeTag, idTag))) continue
				byTag.set(idTag, resolved[idTag] ?? null)
			}
			notify()
		}
	})()
}

/**
 * Profiles for `idTags` on `node`: idTag -> profile, `null` when the node has
 * none, absent while unknown (loading, or backing off after a failure).
 */
export function useProfiles(
	idTags: readonly string[],
	node: ProfileNode
): Record<string, PublicProfile | null> {
	const v = React.useSyncExternalStore(subscribe, getVersion, getVersion)
	const tagsKey = idTags.join('\n')
	// The token rotates without the node changing; read the latest at fetch time.
	const nodeRef = React.useRef(node)
	nodeRef.current = node

	// `v` re-runs this after every store change — that is how the retry timer
	// turns into a new request.
	React.useEffect(() => {
		request(tagsKey ? tagsKey.split('\n') : [], nodeRef.current)
	}, [tagsKey, node.tag, v])

	return React.useMemo(() => {
		const known = node.tag ? cache.get(node.tag) : undefined
		const out: Record<string, PublicProfile | null> = {}
		if (!known || !tagsKey) return out
		for (const idTag of tagsKey.split('\n')) {
			const p = known.get(idTag)
			if (p !== undefined) out[idTag] = p
		}
		return out
	}, [tagsKey, node.tag, v])
}

/**
 * One profile. `node` defaults to the app bus's (`profileNode(getAppBus())`);
 * the shell, where the bus is never initialised, passes its own.
 * `undefined` while unknown, `null` when the node has no such profile.
 */
export function useProfile(
	idTag: string | undefined,
	node?: ProfileNode
): PublicProfile | null | undefined {
	const n = node ?? profileNode(getAppBus())
	const tags = React.useMemo(() => (idTag ? [idTag] : []), [idTag])
	const profiles = useProfiles(tags, n)
	return idTag ? profiles[idTag] : undefined
}

const NO_BADGES: ProfileBadge[] = []
const NO_NODE: ProfileNode = {}

/** The catalog-valid badges in a batch-served profile, expired ones included. */
function profileBadges(profile: PublicProfile | null | undefined): ProfileBadge[] {
	return profile?.badges ? decodeBadges(profile.badges) : NO_BADGES
}

/**
 * The unexpired subset. Filtered here, not by the server alone: the cache lives
 * for the whole session. `NO_BADGES` when none, so the reference is stable.
 */
function unexpired(badges: ProfileBadge[]): ProfileBadge[] {
	const live = badges.filter((b) => isLiveBadge(b))
	return live.length ? live : NO_BADGES
}

/** The unexpired, catalog-valid badges in a batch-served profile. */
export function liveBadges(profile: PublicProfile | null | undefined): ProfileBadge[] {
	return unexpired(profileBadges(profile))
}

/**
 * Community badges of `idTag`, as the viewer's home node has accepted them.
 *
 * Reads the node (and its token) from `PersonActionsContext`. Apps have no node
 * there, nor do guests, so they get `[]` and nothing is fetched — deliberately no
 * fallback to the app bus's node: badges are only meaningful from the home node.
 * Badges are never read from the `ProfileInfo` embedded in actions.
 */
export function useProfileBadges(idTag: string | undefined): ProfileBadge[] {
	const { node } = React.useContext(PersonActionsContext)
	const nodeTag = node?.tag
	const tags = React.useMemo(() => (idTag && nodeTag ? [idTag] : []), [idTag, nodeTag])
	const profiles = useProfiles(tags, node ?? NO_NODE)
	const profile = idTag && nodeTag ? profiles[idTag] : undefined
	const badges = React.useMemo(() => profileBadges(profile), [profile])
	// Per render, not memoized: a badge expiring mid-session drops out on the next one.
	return unexpired(badges)
}

/**
 * Drop everything, including the retry timer and any answer still in the air.
 * Public for one shell use — the logged-in identity changed (badges are per
 * viewer, `person-actions.tsx`) — and for tests. To refresh one profile, use
 * `invalidateProfile`.
 */
export function resetProfileCache() {
	if (retryTimer) clearTimeout(retryTimer)
	retryTimer = undefined
	cache.clear()
	inFlight.clear()
	stale.clear()
	pending.clear()
	retryAt.clear()
	generation++
	notify()
}

/** Forget `idTag` on every node, so subscribers showing it fetch it again. */
export function invalidateProfile(idTag: string) {
	for (const byTag of cache.values()) byTag.delete(idTag)
	// An answer already in flight may predate the change: drop it when it lands.
	for (const k of inFlight) if (k.endsWith(`\0${idTag}`)) stale.add(k)
	for (const k of retryAt.keys()) if (k.endsWith(`\0${idTag}`)) retryAt.delete(k)
	notify()
}

// vim: ts=4
