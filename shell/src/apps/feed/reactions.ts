// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

export const reactionTypes = [
	{ key: 'LIKE', emoji: '👍', label: 'Like' },
	{ key: 'LOVE', emoji: '❤️', label: 'Love' },
	{ key: 'LAUGH', emoji: '😂', label: 'Haha' },
	{ key: 'WOW', emoji: '😮', label: 'Wow' },
	{ key: 'SAD', emoji: '😢', label: 'Sad' },
	{ key: 'ANGRY', emoji: '😠', label: 'Angry' }
] as const

export type ReactionKey = (typeof reactionTypes)[number]['key']

export function getReactionEmoji(key: string): string {
	const found = reactionTypes.find((r) => r.key === key)
	return found ? found.emoji : '👍'
}

// Short keys for compact encoding (e.g. "L5:V3:W1")
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

/** Parse "L5:V3:W1" → [{key: 'LIKE', emoji: '👍', count: 5}, ...] */
export function parseReactionCounts(s?: string): ReactionCount[] {
	if (!s) return []
	const result: ReactionCount[] = []
	for (const part of s.split(':')) {
		if (part.length < 2) continue
		const shortKey = part[0]
		const count = parseInt(part.slice(1), 10)
		const reactionName = keyToReaction[shortKey]
		if (!reactionName || Number.isNaN(count) || count <= 0) continue
		result.push({ key: reactionName, emoji: getReactionEmoji(reactionName), count })
	}
	return result
}

/** Update counts string: updateReactionCounts("L5:V3", "WOW", 1) → "L5:V3:W1" */
export function updateReactionCounts(
	s: string | undefined,
	reaction: string,
	delta: 1 | -1
): string {
	const counts = new Map<string, number>()
	if (s) {
		for (const part of s.split(':')) {
			if (part.length < 2) continue
			const shortKey = part[0]
			const count = parseInt(part.slice(1), 10)
			if (!Number.isNaN(count) && count > 0) counts.set(shortKey, count)
		}
	}
	const shortKey = reactionKeys[reaction]
	if (shortKey) {
		const current = counts.get(shortKey) || 0
		const next = current + delta
		if (next > 0) {
			counts.set(shortKey, next)
		} else {
			counts.delete(shortKey)
		}
	}
	return [...counts.entries()].map(([k, v]) => `${k}${v}`).join(':')
}

/** Total reaction count from encoded string */
export function totalReactions(s?: string): number {
	if (!s) return 0
	let total = 0
	for (const part of s.split(':')) {
		if (part.length < 2) continue
		const count = parseInt(part.slice(1), 10)
		if (!Number.isNaN(count)) total += count
	}
	return total
}

// vim: ts=4
