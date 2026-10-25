// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Community badge catalog: ids only. Must match cloudillo-rs
 * `cloudillo_types::badges::{BADGE_STD_LEVELS, BADGE_PAT_LEVELS}`. The English
 * labels live in `libs/react` (`badgeLabel`), where `l-scan` can extract them.
 */
export const BADGE_LEVELS = {
	STD: ['verified', 'trusted'],
	PAT: ['bronze', 'silver', 'gold', 'diamond']
} as const

export type BadgeSlot = keyof typeof BADGE_LEVELS
export type BadgeLevel = (typeof BADGE_LEVELS)[BadgeSlot][number]

/** `'PAT:gold'` */
export function badgeId(slot: BadgeSlot, level: BadgeLevel): string {
	return `${slot}:${level}`
}

/** True when `slot` / `level` name a badge in the catalog. */
export function isBadge(slot: unknown, level: unknown): boolean {
	return (
		(slot === 'STD' || slot === 'PAT') &&
		(BADGE_LEVELS[slot] as readonly unknown[]).includes(level)
	)
}

/** Longest badge lifetime, seconds. Must match cloudillo-rs `cloudillo_types::badges`. */
export const BADGE_MAX_TTL_SECS = 366 * 86400
/** Clock slack on top of `BADGE_MAX_TTL_SECS`. Must match cloudillo-rs `cloudillo_types::badges`. */
export const BADGE_EXP_SLACK_SECS = 86_400

/** True while `b` has not expired; `exp` is Unix seconds. The one expiry check. */
export function isLiveBadge(b: { exp: number }, now = Date.now()): boolean {
	return b.exp * 1000 > now
}

/** The community's own name, or `undefined` when it has none or it is just the idTag (stub/mirrored profiles). */
export function communityName(c: { idTag: string; name?: string }): string | undefined {
	return c.name && c.name.toLowerCase() !== c.idTag.toLowerCase() ? c.name : undefined
}

// vim: ts=4
