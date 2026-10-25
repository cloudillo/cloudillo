// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Community badges: the received `BDG` actions reduced to one badge per
 * community and slot, the owner's shown set (`profile.badges`), and the
 * profile page's shown badge tokens (`/me/full` `badges`), verified by the
 * viewer's home node, or for guests in the browser against each issuing
 * community's own `/me` keys.
 */

import type { ApiClient, ProfileKeys, VerifyTokenResult } from '@cloudillo/core'
import { type CommunityBadgeData, useApi, useAuth } from '@cloudillo/react'
import {
	type ActionView,
	BADGE_EXP_SLACK_SECS,
	BADGE_MAX_TTL_SECS,
	type BadgeLevel,
	type BadgeSlot,
	isBadge,
	isLiveBadge
} from '@cloudillo/types'
import dayjs from 'dayjs'
import type { TFunction } from 'i18next'
import * as React from 'react'

import {
	cacheProfileKeys,
	decodeJws,
	getCachedProfileKeys,
	homeVerified,
	verifyActionToken
} from '../apps/feed/verifyAction.js'
import { useApiContext } from '../context/index.js'

export const SETTING = 'profile.badges'
/** Most badges shown on a profile (backend `MAX_SHOWN_BADGES`). */
export const MAX_SHOWN = 10

/** A received badge, keyed `"<community>:<slot>"` as in `profile.badges`. */
export interface ReceivedBadge extends CommunityBadgeData {
	key: string
}

/** Unix seconds of an action timestamp (number: already seconds). */
function unixSecs(t: string | number): number {
	return typeof t === 'number' ? t : dayjs(t).unix()
}

/** A `BDG` action as a badge, expired or not; `undefined` when it is not a known one. */
function parseBadge(action: ActionView): ReceivedBadge | undefined {
	if (action.type !== 'BDG' || action.expiresAt === undefined) return
	const level = (action.content as { b?: unknown } | undefined)?.b
	if (!isBadge(action.subType, level)) return
	const slot = action.subType as BadgeSlot
	return {
		key: `${action.issuer.idTag}:${slot}`,
		community: action.issuer,
		slot,
		level: level as BadgeLevel,
		exp: unixSecs(action.expiresAt)
	}
}

/** A `BDG` action as a badge, or `undefined` when it is not a known, unexpired one. */
export function badgeFromAction(action: ActionView): ReceivedBadge | undefined {
	const badge = parseBadge(action)
	return badge && isLiveBadge(badge) ? badge : undefined
}

/** Every current (`N`/`A`) `BDG` action matching `filter`, all pages. */
export async function listBadgeActions(
	api: ApiClient,
	filter: { issuer?: string; audience?: string }
): Promise<ActionView[]> {
	const out: ActionView[] = []
	let cursor: string | undefined
	do {
		const res = await api.actions.listPaginated({
			type: 'BDG',
			status: ['N', 'A'],
			...filter,
			limit: 200,
			cursor
		})
		out.push(...(res.data as ActionView[]))
		cursor = res.cursorPagination?.hasMore
			? (res.cursorPagination.nextCursor ?? undefined)
			: undefined
	} while (cursor)
	return out
}

/**
 * audience -> `community:slot` -> the live badge. The newest `createdAt` per
 * audience and key wins, and only then is it dropped when expired: a downgrade
 * or a shorter renewal holds, and an older, longer-lived badge never comes back.
 */
export function latestBadges(
	actions: readonly ActionView[]
): Map<string, Map<string, ReceivedBadge>> {
	const newest = new Map<string, Map<string, { badge: ReceivedBadge; at: number }>>()
	for (const action of actions) {
		const badge = parseBadge(action)
		const audience = action.audience?.idTag
		if (!badge || !audience) continue
		const at = unixSecs(action.createdAt)
		let byKey = newest.get(audience)
		if (!byKey) {
			byKey = new Map()
			newest.set(audience, byKey)
		}
		const prev = byKey.get(badge.key)
		if (!prev || at > prev.at) byKey.set(badge.key, { badge, at })
	}
	const out = new Map<string, Map<string, ReceivedBadge>>()
	for (const [audience, byKey] of newest) {
		const live = new Map<string, ReceivedBadge>()
		for (const [k, { badge }] of byKey) if (isLiveBadge(badge)) live.set(k, badge)
		if (live.size) out.set(audience, live)
	}
	return out
}

/** Received, live badges of `idTag`, one per `community:slot` (see `latestBadges`). */
export async function listReceivedBadges(api: ApiClient, idTag: string): Promise<ReceivedBadge[]> {
	const actions = await listBadgeActions(api, { audience: idTag })
	return [...(latestBadges(actions).get(idTag)?.values() ?? [])]
}

/** The owner's shown badge keys, in order. `profile.badges` defaults to `[]`, never 404s. */
export async function readShownBadges(api: ApiClient): Promise<string[]> {
	const res = await api.settings.get(SETTING)
	return Array.isArray(res.value)
		? res.value.filter((k): k is string => typeof k === 'string')
		: []
}

/**
 * After the shown set is written: `'added'` (`detail`: the key) from `addShownBadge`, so an
 * open settings page reloads; `'changed'` from every write, so the owner's open profile reloads.
 */
export const shownBadgeEvents = new EventTarget()

/**
 * Appends `key` to `profile.badges`, dropping stale (expired, unknown) keys.
 * Writes nothing when already shown, `MAX_SHOWN` live badges are shown, or `key`
 * is no longer a live received badge (`'gone'`: superseded or expired).
 */
export async function addShownBadge(
	api: ApiClient,
	idTag: string,
	key: string
): Promise<'added' | 'present' | 'full' | 'gone'> {
	const [received, keys] = await Promise.all([
		listReceivedBadges(api, idTag),
		readShownBadges(api)
	])
	const live = new Set(received.map((b) => b.key))
	if (!live.has(key)) return 'gone'
	const shown = keys.filter((k) => live.has(k))
	if (shown.includes(key)) return 'present'
	if (shown.length >= MAX_SHOWN) return 'full'
	await api.settings.update(SETTING, { value: [...shown, key] })
	shownBadgeEvents.dispatchEvent(new CustomEvent('added', { detail: key }))
	shownBadgeEvents.dispatchEvent(new Event('changed'))
	return 'added'
}

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i
const PRIVATE_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa']

/**
 * A public-looking DNS name: dotted, no `/`, `:` or `@` (so it can't steer
 * `getClientFor` to an arbitrary URL), a TLD starting with a letter (no IPv4
 * literals), and not an obviously private name.
 * A client-side denylist can't know every private name; the dashed
 * `unknown` style and the shown `@idTag` stay the user-facing guard.
 */
export function isIssuerHost(iss: string): boolean {
	if (iss.length > 253) return false
	const labels = iss.split('.')
	if (labels.length < 2 || !labels.every((l) => LABEL_RE.test(l))) return false
	if (!/^[a-z]/i.test(labels[labels.length - 1])) return false
	const host = iss.toLowerCase()
	return host !== 'localhost' && !PRIVATE_SUFFIXES.some((s) => host.endsWith(s))
}

/** A shown badge token's claims, checked except for the signature. */
export interface BadgeClaim {
	token: string
	iss: string
	slot: BadgeSlot
	level: BadgeLevel
	/** Unix seconds */
	exp: number
}

/**
 * The well-formed, unexpired badge claims in `tokens`, in order: the first per
 * `iss:slot`, at most `MAX_SHOWN`. Deduped before verification: the owner picks which
 * token per `iss:slot` is shown, so a superseded (e.g. downgraded) token stays showable
 * until its `exp`, at most `BADGE_MAX_TTL_SECS` away.
 */
export function badgeClaims(tokens: readonly string[], now = Date.now()): BadgeClaim[] {
	const out: BadgeClaim[] = []
	const seen = new Set<string>()
	for (const token of tokens) {
		if (out.length >= MAX_SHOWN) break
		const payload = decodeJws(token)?.payload
		if (!payload?.iss || (payload.t !== 'BDG:STD' && payload.t !== 'BDG:PAT')) continue
		const iss = payload.iss
		if (!isIssuerHost(iss)) continue
		const slot = payload.t.slice(4)
		const level = (payload.c as { b?: unknown } | undefined)?.b
		if (!isBadge(slot, level)) continue
		// JWS `exp` is Unix seconds; verifyActionToken checks neither `t` nor `exp`.
		const exp = payload.exp
		if (typeof exp !== 'number' || !isLiveBadge({ exp }, now)) continue
		// Backend `badge_exp_within_max`: no longer-lived token than an issuer can sign.
		if (exp > now / 1000 + BADGE_MAX_TTL_SECS + BADGE_EXP_SLACK_SECS) continue
		if (seen.has(`${iss}:${slot}`)) continue
		seen.add(`${iss}:${slot}`)
		out.push({ token, iss, slot: slot as BadgeSlot, level: level as BadgeLevel, exp })
	}
	return out
}

/** Time left until `exp` (Unix seconds), short: `<1d`, `12d`, `3m`. */
export function shortExpiry(exp: number, t: TFunction, now = Date.now()): string {
	const days = Math.floor((exp * 1000 - now) / 86_400_000)
	if (days < 1) return t('<1d')
	if (days < 60) return t('{{n}}d', { n: days })
	return t('{{n}}m', { n: Math.floor(days / 30) })
}

const NO_CLAIMS: BadgeClaim[] = []

type VerifiedBadge = CommunityBadgeData & { token: string }

export interface VerifiedBadges {
	badges: CommunityBadgeData[]
	/** Claims awaiting `verifyAll`: issuers the home node didn't know or check; all for guests. */
	pending: number
	/** Verify the `pending` claims too (contacts their issuers). */
	verifyAll: () => void
}

/**
 * Verified, unexpired badges of `ownerIdTag`, in token (owner) order; invalid tokens are dropped.
 *
 * Logged in: the home node verifies the signatures with its cached issuer keys and profiles
 * (`POST /actions/verify`), in one batch. Issuers it doesn't know yet wait for `verifyAll`,
 * which syncs them one token at a time — the owner picks the issuer hosts.
 *
 * Guest: every issuer waits for `verifyAll`, which fetches its keys, name and picture with an
 * anonymous `GET /me` and verifies in the browser.
 *
 * Dashed (`unknown`): the home node didn't know the issuer and verified the badge after a
 * sync, or the viewer is a guest.
 */
export function useVerifiedBadges(
	ownerIdTag: string,
	tokens: readonly string[] | undefined
): VerifiedBadges {
	const { getClientFor } = useApiContext()
	const [auth] = useAuth()
	const homeTag = auth?.idTag
	// Home client explicitly: plain useApi() follows apiAtom, which may name a community.
	const { api } = useApi(homeTag ?? null)
	const [verified, setVerified] = React.useState<VerifiedBadge[]>([])
	const [verifyAll, setVerifyAll] = React.useState(false)
	// Logged in: claims whose issuer the home node didn't know.
	const [unsynced, setUnsynced] = React.useState<BadgeClaim[]>(NO_CLAIMS)

	// JWS has no newlines; keyed by content so a new array with the same tokens doesn't re-verify.
	const tokenKey = tokens?.join('\n') ?? ''

	const claims = React.useMemo(
		() => (tokenKey ? badgeClaims(tokenKey.split('\n')) : NO_CLAIMS),
		[tokenKey]
	)
	const order = React.useMemo(() => new Map(claims.map((c, i) => [c.token, i])), [claims])

	React.useEffect(() => {
		setVerified([])
		setVerifyAll(false)
		setUnsynced(NO_CLAIMS)
	}, [ownerIdTag, tokenKey])

	React.useEffect(() => {
		if (!api || !homeTag || !claims.length) return
		let cancelled = false
		const append = appendTo(setVerified)
		;(async function () {
			try {
				const res = await api.actions.verify(claims.map((c) => c.token))
				if (cancelled) return
				const unknown: BadgeClaim[] = []
				claims.forEach((claim, i) => {
					const status = res[i]?.status
					if (status === 'verified') {
						append(serverBadge(claim, res[i], ownerIdTag, homeTag, false))
					} else if (status !== 'invalid') unknown.push(claim)
				})
				setUnsynced(unknown)
			} catch {
				// Home node unreachable: every claim keeps the Verify button.
				if (!cancelled) setUnsynced(claims)
			}
		})()
		return () => {
			cancelled = true
		}
	}, [api, homeTag, claims, ownerIdTag])

	React.useEffect(() => {
		if (!verifyAll || !api || !homeTag || !unsynced.length) return
		let cancelled = false
		const append = appendTo(setVerified)
		;(async function () {
			for (const claim of unsynced) {
				try {
					const [res] = await api.actions.verify([claim.token], { sync: true })
					if (cancelled) return
					append(serverBadge(claim, res, ownerIdTag, homeTag, true))
				} catch {
					if (cancelled) return
				}
			}
		})()
		return () => {
			cancelled = true
		}
	}, [verifyAll, api, homeTag, unsynced, ownerIdTag])

	// Guest: everything waits for the click.
	useVerifyClaims(
		ownerIdTag,
		!homeTag && verifyAll ? claims : NO_CLAIMS,
		getClientFor,
		setVerified
	)

	// Owner order, whichever run verified a badge first.
	const badges = React.useMemo(
		() => [...verified].sort((a, b) => (order.get(a.token) ?? 0) - (order.get(b.token) ?? 0)),
		[verified, order]
	)

	return {
		// Expiry rechecked per render, outside the memo.
		badges: badges.filter((b) => isLiveBadge(b)),
		pending: verifyAll ? 0 : homeTag ? unsynced.length : claims.length,
		verifyAll: React.useCallback(() => setVerifyAll(true), [])
	}
}

/** Appends a badge to the verified list, once per token. */
function appendTo(setVerified: React.Dispatch<React.SetStateAction<VerifiedBadge[]>>) {
	return (badge: VerifiedBadge | undefined) => {
		if (!badge) return
		setVerified((prev) => (prev.some((b) => b.token === badge.token) ? prev : [...prev, badge]))
	}
}

/**
 * A claim the home node verified, as a badge: the signature checked there, the claims here
 * on the same token bytes. The picture is the home node's synced copy, hence `srcTag`.
 * `unknown`: verified only after a sync (the node didn't know the issuer).
 */
function serverBadge(
	claim: BadgeClaim,
	res: VerifyTokenResult | undefined,
	ownerIdTag: string,
	homeTag: string,
	unknown: boolean
): VerifiedBadge | undefined {
	const { token, iss, slot, level, exp } = claim
	if (
		!homeVerified(res, token, { issuerIdTag: iss, audienceTag: ownerIdTag }) ||
		res?.issuer?.type !== 'community'
	)
		return
	const { name, profilePic } = res.issuer
	return {
		token,
		community: { idTag: iss, name, profilePic },
		slot,
		level,
		exp,
		srcTag: homeTag,
		unknown
	}
}

/** Verifies `claims` one at a time, appending each valid one to `setVerified`. */
function useVerifyClaims(
	ownerIdTag: string,
	claims: readonly BadgeClaim[],
	getClientFor: ReturnType<typeof useApiContext>['getClientFor'],
	setVerified: React.Dispatch<React.SetStateAction<VerifiedBadge[]>>
) {
	React.useEffect(() => {
		if (!claims.length) return
		let cancelled = false
		// One key fetch per issuer, even when it issued both slots.
		const fetches = new Map<string, Promise<ProfileKeys | undefined>>()
		async function fetchKeys(iss: string, fresh = false): Promise<ProfileKeys | undefined> {
			const cached = fresh ? undefined : getCachedProfileKeys(iss)
			if (cached) return cached
			const client = getClientFor(iss, { auth: 'none' })
			if (!client) return
			try {
				const keys = await client.profiles.getOwn()
				cacheProfileKeys(iss, keys)
				return keys
			} catch {
				return
			}
		}
		function keysFor(iss: string): Promise<ProfileKeys | undefined> {
			let p = fetches.get(iss)
			if (!p) {
				p = fetchKeys(iss)
				fetches.set(iss, p)
			}
			return p
		}

		async function verify(claim: BadgeClaim): Promise<VerifiedBadge | undefined> {
			const { token, iss, slot, level, exp } = claim
			const wasCached = !!getCachedProfileKeys(iss)
			let keys = await keysFor(iss)
			if (keys?.type !== 'community') return
			const expect = { issuerIdTag: iss, audienceTag: ownerIdTag }
			let res = await verifyActionToken(token, keys, expect)
			// A cached key set may predate a key rotation: refetch once.
			if (res.status === 'no-key' && wasCached) {
				const p = fetchKeys(iss, true)
				fetches.set(iss, p)
				keys = await p
				if (keys?.type !== 'community') return
				res = await verifyActionToken(token, keys, expect)
			}
			if (res.status !== 'verified') return
			return {
				token,
				community: { idTag: iss, name: keys.name, profilePic: keys.profilePic },
				slot,
				level,
				exp,
				srcTag: iss,
				unknown: true
			}
		}
		// One at a time, capped (`badgeClaims`): an honest node serves at most MAX_SHOWN,
		// and each distinct issuer costs the visitor an anonymous `GET /me`.
		;(async function () {
			for (const claim of claims) {
				const badge = await verify(claim)
				if (cancelled) return
				if (badge) {
					setVerified((prev) =>
						prev.some((b) => b.token === badge.token) ? prev : [...prev, badge]
					)
				}
			}
		})()
		return () => {
			cancelled = true
		}
	}, [ownerIdTag, claims, getClientFor, setVerified])
}

// vim: ts=4
