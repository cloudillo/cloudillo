// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Keyboard access helpers shared by the canvas apps.
 */

/**
 * The next index when Tab (dir 1) / Shift+Tab (dir -1) cycles through `len` objects.
 *
 * With nothing current, Tab starts at the first object and Shift+Tab at the last. Stepping past
 * either end returns null: the caller then leaves the key alone, so focus leaves the canvas
 * (no keyboard trap, WCAG 2.1.2).
 */
export function cycleIndex(len: number, current: number | null, dir: 1 | -1): number | null {
	if (len <= 0) return null
	if (current === null || current < 0 || current >= len) return dir > 0 ? 0 : len - 1
	const next = current + dir
	return next >= 0 && next < len ? next : null
}

/**
 * Index of the current object in `order` for a Tab cycle: the frontmost selected one going
 * forward, the backmost going back, so a multi-selection steps off its edge. null if none.
 */
export function selectionCycleIndex(
	order: readonly string[],
	selected: ReadonlySet<string>,
	dir: 1 | -1
): number | null {
	let current: number | null = null
	for (let i = 0; i < order.length; i++) {
		if (!selected.has(order[i])) continue
		current = i
		if (dir < 0) break
	}
	return current
}

// vim: ts=4
