// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Shared read-marker primitive for the feed (Pillar A) and messages (Pillar G).
 *
 * Watermarks live on the reader's own home node, as columns on the entity row:
 * `profiles.feed_read_at` (feed) and `profiles.msg_read_at` (DM peer). The
 * frontend seeds from values already on the loaded profile objects and writes
 * forward-only via the own-node endpoint `PUT /read-marker { scope, key, position }`.
 * Thread/comment read state uses this same hook with a `thread:<actionId>` scope
 * key, writing the `actions.comments_read_at` watermark (see `feed.tsx`'s `Comments`).
 *
 * `scopeKey` is `"<scope>:<key>"` — `feed:<ctxIdTag>`, `msg:<peerIdTag>` or
 * `thread:<actionId>`.
 * `readPositionAtom` is keyed by the full `scopeKey`; `unreadCountAtom` is keyed
 * by the bare entity id (so nav/sidebar badges can look it up by
 * `contextIdTag` / `community.idTag`).
 */

import type { ApiClient } from '@cloudillo/core'
import { useApi, useAuth, useThrottledCallback } from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import { atom, type PrimitiveAtom, useAtom, useSetAtom, type useStore } from 'jotai'
import * as React from 'react'
import { useLocation } from 'react-router-dom'

import { useApiContext, useCommunitiesList } from './context/index.js'
import { runWithLimit } from './utils.js'
import { useWsBus } from './ws-bus.js'

// The backend stores all timestamps in epoch SECONDS (actions.created_at =
// unixepoch(), profiles.feed_read_at, Timestamp::now() = as_secs()), and
// ActionView.createdAt reaches the client in seconds. Watermarks must therefore
// be in seconds too — comparing a Date.now() (ms) value against created_at
// (seconds) makes every comparison false (unread-count returns 0, divider sticks).

// First-run unread window (seconds): when a context has no stored watermark yet,
// bootstrap it to this far in the past so recent posts surface as unread (and a
// real marker gets persisted) instead of the feature staying dormant.
export const INITIAL_UNREAD_WINDOW_SEC = 7 * 24 * 60 * 60

// Skip re-probing a target that was successfully probed within this window;
// prevents redundant federated fan-out when the communities list re-populates
// or the probe effect re-fires for unrelated reasons. Live ACTION pushes
// bypass this via { force: true }.
const PROBE_TTL_MS = 60_000

// Current time in epoch seconds.
export function nowSeconds(): number {
	return Math.floor(Date.now() / 1000)
}

// Normalize an `ActionView.createdAt` to epoch seconds. The list endpoint
// (`GET /actions`) serializes timestamps as ISO 8601 strings (e.g.
// "2026-06-14T23:16:06Z"), while watermarks and WS payloads are numeric epoch
// seconds — so every comparison against the watermark must funnel through here.
// Returns 0 for missing/unparseable values.
export function createdAtToSeconds(createdAt: string | number | undefined): number {
	if (typeof createdAt === 'number') return createdAt
	if (typeof createdAt === 'string') {
		// All-digit string → numeric epoch seconds; else ISO 8601.
		if (/^\d+$/.test(createdAt)) return Number(createdAt)
		const ms = Date.parse(createdAt)
		return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000)
	}
	return 0
}

// Timestamp the feed read-tracking keys off of. All feeds order/track by
// ingestion time (received_at) so late-federated posts surface at the top and
// are correctly unread; falls back to createdAt when received_at is missing.
export function feedReadTs(action: {
	createdAt?: string | number
	receivedAt?: string | number
}): number {
	const r = createdAtToSeconds(action.receivedAt)
	if (r > 0) return r
	// A 0 return means "no usable timestamp" → callers treat the post as already
	// read (0 <= watermark), which keeps the read-divider from wedging on
	// malformed data; the tracker also skips such nodes (see report()).
	return createdAtToSeconds(action.createdAt)
}

// scopeKey → lastRead (epoch seconds)
export const readPositionAtom: PrimitiveAtom<Record<string, number>> = atom<Record<string, number>>(
	{}
)

// Unread counts keyed by a bare entity id (feed/community dot) or a `msg:<convId>`
// key for per-conversation message unread (the nav badge sums all `msg:` entries).
export const unreadCountAtom: PrimitiveAtom<Record<string, number>> = atom<Record<string, number>>(
	{}
)

// bare entity id → true once the global probe has fetched its profile
// (and seeded readPositionAtom from feedReadAt). Lets FeedApp's bootstrap
// distinguish "server confirmed no watermark" from "still loading".
export const feedSeedLoadedAtom: PrimitiveAtom<Record<string, boolean>> = atom<
	Record<string, boolean>
>({})

// Forward-only seed of a community's local feed watermark from the Home watermark.
// Used when a community is switched shown→hidden so its new sidebar dot only flags
// posts newer than what Home already surfaced. Persists so it survives reload.
export function seedCommunityFromHome(
	store: ReturnType<typeof useStore>,
	api: ApiClient | null | undefined,
	idTag: string,
	ownIdTag: string
): void {
	if (!idTag || !ownIdTag) return
	const home = store.get(readPositionAtom)[`feed:${ownIdTag}`] ?? 0
	if (home <= 0) return // nothing to carry; community keeps its own/bootstrap watermark
	const k = `feed:${idTag}`
	store.set(readPositionAtom, (prev) => {
		const cur = prev[k] ?? 0
		return home > cur ? { ...prev, [k]: home } : prev
	})
	// Persist forward-only so the carryover survives reload (the probe otherwise
	// re-seeds feed:<idTag> from the community's backend feedReadAt). Backend marker
	// is itself forward-only, so a redundant lower write is a harmless no-op.
	api?.actions.setReadMarker({ scope: 'feed', key: idTag, position: home }).catch(() => {})
}

type ReadScope = 'feed' | 'msg' | 'thread'

function parseScopeKey(scopeKey: string): { scope: ReadScope; key: string } {
	const i = scopeKey.indexOf(':')
	if (i < 0) return { scope: 'feed', key: scopeKey }
	return { scope: scopeKey.slice(0, i) as ReadScope, key: scopeKey.slice(i + 1) }
}

export interface UseReadMarker {
	readPosition: number
	advanceTo: (ts: number) => void
	markReadNow: (ts: number) => void
	flushNow: () => void
}

// Flush any pending watermark write when the user leaves: route change, unmount,
// or the tab being hidden (the most reliable "leaving" signal). Used by
// `useReadMarker` to flush its throttled own-node write.
function useFlushOnLeave(flush: () => void): void {
	const location = useLocation()
	React.useEffect(() => {
		flush()
	}, [location.pathname, flush])
	React.useEffect(() => () => flush(), [flush])
	React.useEffect(() => {
		function onVisibility() {
			if (document.visibilityState === 'hidden') flush()
		}
		document.addEventListener('visibilitychange', onVisibility)
		return () => document.removeEventListener('visibilitychange', onVisibility)
	}, [flush])
}

/**
 * Read/advance the watermark for `scopeKey`. `seed` is the server value already
 * in hand (profile.feedReadAt / profile.msgReadAt / action.stat.commentsReadAt);
 * it seeds the atom forward-only without a write-back.
 */
export function useReadMarker(scopeKey: string, seed?: number): UseReadMarker {
	const { api } = useApi()
	const [positions, setPositions] = useAtom(readPositionAtom)
	const { scope, key } = React.useMemo(() => parseScopeKey(scopeKey), [scopeKey])

	const readPosition = positions[scopeKey] ?? 0
	const readPositionRef = React.useRef(readPosition)
	readPositionRef.current = readPosition

	const writeMarker = React.useCallback(
		(position: number) => {
			if (!api || !key) return
			api.actions.setReadMarker({ scope, key, position }).catch(() => {
				/* own-node write is best-effort; the watermark also lives in-memory */
			})
		},
		[api, scope, key]
	)

	const [throttledWrite, flushNow] = useThrottledCallback(writeMarker, 1500)

	// Seed from the already-loaded server value (forward-only, no write-back).
	React.useEffect(() => {
		if (seed == null || seed <= 0) return
		setPositions((prev) => {
			const cur = prev[scopeKey] ?? 0
			if (seed <= cur) return prev
			return { ...prev, [scopeKey]: seed }
		})
	}, [scopeKey, seed, setPositions])

	const advanceTo = React.useCallback(
		(ts: number) => {
			if (!ts || ts <= readPositionRef.current) return // forward-only
			readPositionRef.current = ts
			setPositions((prev) => {
				const cur = prev[scopeKey] ?? 0
				if (ts <= cur) return prev
				return { ...prev, [scopeKey]: ts }
			})
			throttledWrite(ts)
		},
		[scopeKey, setPositions, throttledWrite]
	)

	// Explicit "mark read up to `ts`" for user actions (the Unread "Mark all as
	// read" button / Feed "Caught up" pill). Advances the in-memory watermark
	// forward-only like `advanceTo`, but ALWAYS issues the marker write
	// immediately — bypassing the 1.5s throttle and the forward-only write skip —
	// so the click produces a request and clears the dot even when scroll-driven
	// reading has already advanced the in-memory position. The backend itself is
	// forward-only, so a redundant equal/lower write is a harmless no-op there.
	const markReadNow = React.useCallback(
		(ts: number) => {
			if (!ts) return
			if (ts > readPositionRef.current) {
				readPositionRef.current = ts
				setPositions((prev) => {
					const cur = prev[scopeKey] ?? 0
					if (ts <= cur) return prev
					return { ...prev, [scopeKey]: ts }
				})
			}
			writeMarker(ts)
		},
		[scopeKey, setPositions, writeMarker]
	)

	useFlushOnLeave(flushNow)

	return { readPosition, advanceTo, markReadNow, flushNow }
}

/**
 * Engagement gate for scroll-driven mark-as-read. Returns a ref whose `.current`
 * flips to `true` after the first *downward* scroll, so the watermark never
 * advances from passive viewing — the user must actively scroll down first.
 * Resets to `false` whenever `enabled` toggles (callers remount/re-key it per
 * view/context). `reset()` clears it manually (e.g. after a fresh load).
 */
export function useScrollEngaged(
	enabled: boolean,
	target?: HTMLElement | null
): {
	engagedRef: React.MutableRefObject<boolean>
	reset: () => void
} {
	const engagedRef = React.useRef(false)
	const reset = React.useCallback(() => {
		engagedRef.current = false
	}, [])

	React.useEffect(() => {
		engagedRef.current = false
		if (!enabled) return
		const el = target ?? window
		let lastY = target ? target.scrollTop : window.scrollY
		function onScroll() {
			const y = target ? target.scrollTop : window.scrollY
			if (y > lastY + 4) engagedRef.current = true
			lastY = y
		}
		el.addEventListener('scroll', onScroll, { passive: true })
		return () => el.removeEventListener('scroll', onScroll)
	}, [enabled, target])

	return { engagedRef, reset }
}

export interface UseReadPositionTrackerOptions {
	enabled: boolean
	onReach: (maxTs: number) => void
	// 'visible' (default): newest item currently intersecting the viewport — a
	// post counts as read once seen, even if nothing ever scrolls off the top.
	// 'above': newest item fully scrolled above the viewport top — gated by
	// `engagedRef` so the watermark only advances after the user scrolls down.
	// 'below': newest item that has scrolled fully below the root's bottom edge
	// after having been visible — advances the watermark as the user scrolls UP
	// through a newest→oldest list, one post at a time.
	mode?: 'visible' | 'above' | 'below'
	engagedRef?: React.MutableRefObject<boolean>
	// IntersectionObserver root. Defaults to the viewport (`null`); pass the
	// scroll container so 'above' is measured against its top edge, not y=0.
	root?: Element | null
}

/**
 * Track posts/comments via an IntersectionObserver. `register` is a stable ref
 * callback attached by each item; the item supplies its createdAt via a
 * `data-read-ts` attribute. `onReach(maxTs)` fires with the newest qualifying
 * createdAt (see `mode` above). The callback returns a cleanup function that
 * React 19 calls on detach, so there is no per-render prune sweep.
 */
export function useReadPositionTracker(options: UseReadPositionTrackerOptions): {
	register: (node: Element | null) => (() => void) | undefined
} {
	const { enabled, onReach, mode = 'visible', engagedRef, root = null } = options
	const onReachRef = React.useRef(onReach)
	onReachRef.current = onReach
	const nodesRef = React.useRef<Map<Element, number>>(new Map())
	const observerRef = React.useRef<IntersectionObserver | null>(null)
	// 'below' mode only: elements that have been on-screen at least once, so a
	// later bottom-exit counts as "read" (posts that merely sat below the fold
	// at load are never counted).
	const seenRef = React.useRef<Set<Element>>(new Set())

	React.useEffect(() => {
		if (!enabled) return
		seenRef.current = new Set()
		// Report the qualifying elements: the overall max ts via onReach.
		const report = (elements: Element[]) => {
			let maxTs = 0
			for (const el of elements) {
				const ts = nodesRef.current.get(el)
				// Untimestamped nodes (ts<=0) can't advance a watermark — skip them.
				if (!ts || ts <= 0) continue
				if (ts > maxTs) maxTs = ts
			}
			if (maxTs > 0) onReachRef.current(maxTs)
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (mode === 'below') {
					const qualifying: Element[] = []
					for (const entry of entries) {
						if (entry.isIntersecting) {
							// On-screen now → remember it so a later bottom-exit
							// counts as "read".
							seenRef.current.add(entry.target)
							continue
						}
						// Must have been seen (excludes posts that only ever sat
						// below the fold).
						if (!seenRef.current.has(entry.target)) continue
						// Fully below the root's bottom edge (scrolled out the
						// bottom, not the top).
						const bottom = entry.rootBounds?.bottom ?? 0
						if (entry.boundingClientRect.top < bottom) continue
						qualifying.push(entry.target)
					}
					report(qualifying)
					return
				}
				if (mode === 'above') {
					// Only advance after the user has actively scrolled down.
					if (engagedRef && !engagedRef.current) return
					const qualifying: Element[] = []
					for (const entry of entries) {
						// Item fully scrolled above the root's top edge.
						if (entry.isIntersecting) continue
						const top = entry.rootBounds?.top ?? 0
						if (entry.boundingClientRect.bottom > top) continue
						qualifying.push(entry.target)
					}
					report(qualifying)
					return
				}
				const qualifying: Element[] = []
				for (const entry of entries) {
					if (!entry.isIntersecting) continue
					qualifying.push(entry.target)
				}
				report(qualifying)
			},
			{ root: root ?? null, rootMargin: '0px', threshold: 0 }
		)
		observerRef.current = observer
		// Observe nodes registered before the observer existed.
		for (const node of nodesRef.current.keys()) observer.observe(node)
		return () => {
			observer.disconnect()
			observerRef.current = null
		}
	}, [enabled, mode, engagedRef, root])

	// Stable ref callback: reads the timestamp from the node's `data-read-ts`
	// attribute and returns a cleanup (React 19 calls it on detach), so no manual
	// prune sweep of disconnected nodes is needed.
	const register = React.useCallback((node: Element | null) => {
		if (node === null) return undefined
		// Under React 19's cleanup-ref protocol the callback only ever receives a
		// real node (detach is handled by the returned cleanup), so `node` is non-null.
		const el = node as HTMLElement
		const ts = Number(el.dataset.readTs) || 0
		nodesRef.current.set(el, ts)
		observerRef.current?.observe(el)
		return () => {
			nodesRef.current.delete(el)
			seenRef.current.delete(el)
			observerRef.current?.unobserve(el)
		}
	}, [])

	return { register }
}

export interface UseBottomDwellOptions {
	scrollEl: HTMLElement | null
	enabled: boolean
	onDwell: () => void
	// Distance (px) from the bottom that counts as "at the bottom".
	thresholdPx?: number
	delayMs?: number
	// Re-evaluate the at-bottom state when this changes (e.g. newest-loaded ts), so a
	// new message arriving while parked at the bottom re-arms the timer.
	recheckKey?: number
}

// Fire `onDwell` once after the user rests within `thresholdPx` of the bottom for
// `delayMs`. The newest items never scroll above the viewport top, so a bottom-dwell
// marks them read. Fires once per session; re-arms when the user leaves or `recheckKey`
// changes.
export function useBottomDwell(options: UseBottomDwellOptions): void {
	const { scrollEl, enabled, onDwell, thresholdPx = 120, delayMs = 3000, recheckKey } = options
	const onDwellRef = React.useRef(onDwell)
	onDwellRef.current = onDwell

	React.useEffect(() => {
		if (!enabled || !scrollEl) return
		let timer: ReturnType<typeof setTimeout> | null = null
		let fired = false
		const atBottom = () =>
			scrollEl.scrollHeight - (scrollEl.scrollTop + scrollEl.clientHeight) <= thresholdPx
		const clear = () => {
			if (timer) {
				clearTimeout(timer)
				timer = null
			}
		}
		const evaluate = () => {
			if (atBottom()) {
				if (fired || timer) return
				timer = setTimeout(() => {
					timer = null
					fired = true
					onDwellRef.current()
				}, delayMs)
			} else {
				fired = false
				clear()
			}
		}
		scrollEl.addEventListener('scroll', evaluate, { passive: true })
		evaluate() // handle "already at bottom" on mount / recheckKey change
		return () => {
			clear()
			scrollEl.removeEventListener('scroll', evaluate)
		}
	}, [scrollEl, enabled, thresholdPx, delayMs, recheckKey])
}

/**
 * App-wide unread probe (Pillar D coverage). Mounted once at the layout level so
 * the nav/sidebar dots populate for every context — home + each community —
 * regardless of which page is open.
 *
 * Home dot: a single own-node count against the home watermark, so it reflects
 * exactly what is in the merged home feed (own-node received content).
 *
 * Community dot: probed on the community's OWN node via a proxy token, because a
 * federated community's posts live only on its node — a member who merely belongs
 * to it (without following an author there) has zero community-audience rows on
 * their own node, so an own-node count would always be 0. The proxy list probe
 * (`createdAfter` + `limit:1`) detects existence the same federation path the
 * community feed view uses.
 *
 * When a context has no watermark yet, the count is computed against a week-ago
 * floor so a fresh deployment shows recent content as unread — but the marker is
 * NOT persisted here (compute-only; FeedApp owns persistence, writing the
 * bootstrap marker only once the user opens that context's feed).
 */
export function useGlobalUnreadProbe(): void {
	const { api } = useApi()
	const [auth] = useAuth()
	const { communities } = useCommunitiesList()
	const { getTokenFor, getClientFor } = useApiContext()
	const setUnread = useSetAtom(unreadCountAtom)
	const setReadPosition = useSetAtom(readPositionAtom)
	const setSeedLoaded = useSetAtom(feedSeedLoadedAtom)

	const ownIdTag = auth?.idTag
	// Bake each community's showInHome flag into the memo key so a toggle re-fires
	// probeAll: shown-in-Home communities are held at count 0 (no dot), hidden ones
	// get the federated proxy probe.
	const communityIds = communities.map((c) => `${c.idTag}:${c.showInHome ? 1 : 0}`).join(',')

	// idTag → showInHome lookup, refreshed each render so the live WS re-probe
	// handler (which reads it from a ref) sees the current toggle state.
	const showInHomeRef = React.useRef<Map<string, boolean>>(new Map())
	showInHomeRef.current = new Map(communities.map((c) => [c.idTag, c.showInHome]))

	// Per-target last successful probe time (epoch ms), for the TTL guard below.
	const lastProbedRef = React.useRef<Map<string, number>>(new Map())

	// Probe a single target (own home or one community) and store its count.
	const probeTarget = React.useCallback(
		async (idTag: string, community: boolean, opts?: { force?: boolean }) => {
			if (!api || !idTag) return
			try {
				// Skip if probed recently, unless a live ACTION push forces it.
				const last = lastProbedRef.current.get(idTag) ?? 0
				if (!opts?.force && Date.now() - last < PROBE_TTL_MS) return
				const profile = await api.profiles.get(idTag)
				let since = createdAtToSeconds(profile?.feedReadAt)
				// Seed FeedApp's watermark (forward-only) so it needn't re-fetch the
				// same profile when the context is opened, and mark it ready.
				const seedTs = since
				if (seedTs > 0) {
					const k = `feed:${idTag}`
					setReadPosition((prev) => {
						const cur = prev[k] ?? 0
						return seedTs > cur ? { ...prev, [k]: seedTs } : prev
					})
				}
				setSeedLoaded((prev) => (prev[idTag] ? prev : { ...prev, [idTag]: true }))
				if (!since) {
					// No watermark yet → count against a week-ago floor (compute-only;
					// FeedApp persists the bootstrap marker when the feed is opened).
					since = nowSeconds() - INITIAL_UNREAD_WINDOW_SEC
				}
				if (community) {
					// A community's posts live on its OWN node — probe there via a proxy
					// token (connected communities are an established relationship, so
					// `explicit:true` bypasses the passive-trust gate). The owner-only
					// unread-count endpoint rejects a proxied member, so detect existence
					// with the (proxy-readable) list endpoint: any POST/REPOST newer than
					// the member's locally-stored watermark lights the dot.
					const tok = await getTokenFor(idTag, { explicit: true })
					if (!tok) return
					const capi = getClientFor(idTag, { token: tok.token })
					if (!capi) return
					// Existence probe via the (proxy-readable) list endpoint: only a
					// *visible* unread post lights the dot. A pre-visibility COUNT(*)
					// could count rows the reader can never load (e.g. hidden-community
					// posts), pinning the dot on with nothing to show.
					const res = await capi.actions.listPaginated({
						type: ['POST', 'REPOST'],
						status: ['A'],
						audience: idTag,
						createdAfter: new Date(since * 1000).toISOString(),
						excludeOwnIssuer: true,
						sort: 'received',
						sortDir: 'asc',
						limit: 1
					})
					const count =
						res.data.length > 0 || res.cursorPagination?.hasMore === true ? 1 : 0
					lastProbedRef.current.set(idTag, Date.now())
					setUnread((prev) =>
						prev[idTag] === count ? prev : { ...prev, [idTag]: count }
					)
				} else {
					// Home dot: own-node existence probe (mirrors the community branch,
					// minus the proxy token and audience). No audience = the merged home
					// feed, so the server's hidden-community exclusion applies.
					const res = await api.actions.listPaginated({
						type: ['POST', 'REPOST'],
						status: ['A'],
						createdAfter: new Date(since * 1000).toISOString(),
						excludeOwnIssuer: true,
						sort: 'received',
						sortDir: 'asc',
						limit: 1
					})
					const count =
						res.data.length > 0 || res.cursorPagination?.hasMore === true ? 1 : 0
					lastProbedRef.current.set(idTag, Date.now())
					setUnread((prev) =>
						prev[idTag] === count ? prev : { ...prev, [idTag]: count }
					)
				}
			} catch {
				/* best-effort; leave the prior value */
			}
		},
		[api, getTokenFor, getClientFor, setUnread, setReadPosition, setSeedLoaded]
	)

	const probeAll = React.useCallback(async () => {
		if (!api || !ownIdTag) return
		await probeTarget(ownIdTag, false)
		const communityTasks = communityIds
			.split(',')
			.filter(Boolean)
			.map((entry) => {
				// entry is `<idTag>:<0|1>`; the idTag may itself contain ':' only in
				// theory, but the showInHome flag is always the final segment.
				const sep = entry.lastIndexOf(':')
				const idTag = entry.slice(0, sep)
				const shown = entry.slice(sep + 1) === '1'
				return () => {
					if (shown) {
						// Shown in Home → no dedicated dot: its posts are already
						// represented by the Home dot. Actively zero any stale count so a
						// hidden→shown toggle drops the dot, and clear lastProbed so a
						// later shown→hidden toggle re-probes immediately (not TTL-suppressed).
						setUnread((prev) => (prev[idTag] ? { ...prev, [idTag]: 0 } : prev))
						lastProbedRef.current.delete(idTag)
						return Promise.resolve()
					}
					return probeTarget(idTag, true)
				}
			})
		await runWithLimit(communityTasks, 3)
	}, [api, ownIdTag, communityIds, probeTarget, setUnread])

	React.useEffect(() => {
		probeAll()
	}, [probeAll])

	// Debounced re-probe on live POST/REPOST arrivals (avoid a storm). Re-probe
	// every audience affected during the window: a community post carries
	// `audience.idTag`; a personal post falls back to the own home. Hold both
	// closures in refs so the debounced handler calls the latest ones.
	const probeAllRef = React.useRef(probeAll)
	probeAllRef.current = probeAll
	const probeTargetRef = React.useRef(probeTarget)
	probeTargetRef.current = probeTarget
	const ownIdTagRef = React.useRef(ownIdTag)
	ownIdTagRef.current = ownIdTag
	const pendingAudiencesRef = React.useRef<Set<string>>(new Set())
	const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
	useWsBus({ cmds: ['ACTION'] }, function handleAction(msg) {
		const action = msg.data as ActionView
		if (action.type !== 'POST' && action.type !== 'REPOST') return
		const aud = action.audience?.idTag ?? ownIdTagRef.current
		// '*' = no audience and no own id yet → fall back to a full probe.
		pendingAudiencesRef.current.add(aud || '*')
		if (timerRef.current) return
		timerRef.current = setTimeout(() => {
			timerRef.current = null
			const targets = pendingAudiencesRef.current
			pendingAudiencesRef.current = new Set()
			if (targets.has('*')) {
				// The '*' fallback respects the TTL (no force) — a rare path
				// (no audience and no own id yet); a real per-target push below
				// forces a fresh probe.
				probeAllRef.current()
				return
			}
			for (const t of targets) {
				// community = anything that isn't the reader's own home id. A live
				// POST/REPOST is real new content → bypass the TTL.
				const isCommunity = t !== ownIdTagRef.current
				if (isCommunity && showInHomeRef.current.get(t) === true) {
					// Shown-in-Home community → no dedicated dot (its content is
					// represented by the Home dot, which the home audience push also
					// re-probes). Zero any stale count instead of probing.
					setUnread((prev) => (prev[t] ? { ...prev, [t]: 0 } : prev))
					continue
				}
				probeTargetRef.current(t, isCommunity, { force: true })
			}
		}, 4000)
	})
	React.useEffect(
		() => () => {
			if (timerRef.current) clearTimeout(timerRef.current)
		},
		[]
	)
}

// vim: ts=4
