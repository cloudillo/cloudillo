// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

export const reactionTypes = [
	{ key: 'LIKE', emoji: '👍', label: 'Like', pastLabel: 'Liked' },
	{ key: 'LOVE', emoji: '❤️', label: 'Love', pastLabel: 'Loved' },
	{ key: 'LAUGH', emoji: '😂', label: 'Haha', pastLabel: 'Haha' },
	{ key: 'WOW', emoji: '😮', label: 'Wow', pastLabel: 'Wow' },
	{ key: 'SAD', emoji: '😢', label: 'Sad', pastLabel: 'Sad' },
	{ key: 'ANGRY', emoji: '😠', label: 'Angry', pastLabel: 'Angry' }
] as const

export type ReactionKey = (typeof reactionTypes)[number]['key']

export function getReactionEmoji(key: string): string {
	const found = reactionTypes.find((r) => r.key === key)
	return found ? found.emoji : '👍'
}

export function getReactionPastLabel(key: string): string {
	const found = reactionTypes.find((r) => r.key === key)
	return found ? found.pastLabel : 'Liked'
}

// Short keys for compact encoding (canonical format: "<total>,L52,V2,...")
export const reactionKeys: Record<string, string> = {
	LIKE: 'L',
	LOVE: 'V',
	LAUGH: 'H',
	WOW: 'W',
	SAD: 'S',
	ANGRY: 'A'
}
export const keyToReaction: Record<string, string> = {
	L: 'LIKE',
	V: 'LOVE',
	H: 'LAUGH',
	W: 'WOW',
	S: 'SAD',
	A: 'ANGRY'
}

export interface ReactionCount {
	key: string
	emoji: string
	count: number
}

/** Parse "54,L52,V2" → [{key: 'LIKE', emoji: '👍', count: 52}, ...] */
export function parseReactionCounts(s?: string): ReactionCount[] {
	if (!s) return []
	const parts = s.split(',')
	const result: ReactionCount[] = []
	// First token is always the total — skip it.
	for (let i = 1; i < parts.length; i++) {
		const part = parts[i]
		if (part.length < 2) continue
		const shortKey = part[0]
		const count = parseInt(part.slice(1), 10)
		const reactionName = keyToReaction[shortKey]
		if (!reactionName || Number.isNaN(count) || count <= 0) continue
		result.push({ key: reactionName, emoji: getReactionEmoji(reactionName), count })
	}
	return result
}

/** Total reaction count read from the leading number of the encoded string. */
export function totalReactions(s?: string): number {
	if (!s) return 0
	const firstComma = s.indexOf(',')
	const head = firstComma >= 0 ? s.slice(0, firstComma) : s
	const n = parseInt(head, 10)
	return Number.isNaN(n) ? 0 : n
}

/** Update counts string. Re-emits canonical "<total>,L52,V2,..." (sorted DESC by count, cap 5). */
export function updateReactionCounts(
	s: string | undefined,
	reaction: string,
	delta: 1 | -1
): string {
	const entries = parseReactionCounts(s)
	const counts = new Map<string, number>()
	for (const r of entries) {
		const k = reactionKeys[r.key]
		if (k) counts.set(k, r.count)
	}
	const shortKey = reactionKeys[reaction]
	if (shortKey) {
		const next = (counts.get(shortKey) ?? 0) + delta
		if (next > 0) counts.set(shortKey, next)
		else counts.delete(shortKey)
	}
	// Re-sort deterministically: count DESC, code ASC. Cap at 5.
	const sorted = [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, 5)
	const totalNow = [...counts.values()].reduce((acc, v) => acc + v, 0)
	if (totalNow === 0) return ''
	return `${totalNow},${sorted.map(([k, v]) => `${k}${v}`).join(',')}`
}

// vim: ts=4
