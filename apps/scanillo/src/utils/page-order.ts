// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

export type MoveDir = 'earlier' | 'later'

/** The `movePage(pageId, targetId, position)` arguments that swap a page with its neighbour,
 * or null when there is no neighbour in that direction. */
export function neighbourMove(
	pages: readonly { id: string; order: number }[],
	pageId: string,
	dir: MoveDir
): { targetId: string; position: 'before' | 'after' } | null {
	const sorted = [...pages].sort((a, b) => a.order - b.order)
	const idx = sorted.findIndex((p) => p.id === pageId)
	if (idx === -1) return null
	const target = sorted[dir === 'earlier' ? idx - 1 : idx + 1]
	if (!target) return null
	return { targetId: target.id, position: dir === 'earlier' ? 'before' : 'after' }
}

// vim: ts=4
