// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The roving-tabindex arithmetic behind ToolPopover's arrow-key navigation. Unit-tested here rather
 * than through the component, in keeping with the rest of this suite: the flyout needs a renderer,
 * the index maths does not.
 */

import { nextEnabledIndex } from '../components/ToolPopover.js'

/** Items flattened across sections, exactly as the component flattens them */
const items = (pattern: string) =>
	Array.from(pattern, (c) => ({ disabled: c === '-' })) as { disabled?: boolean }[]

describe('nextEnabledIndex', () => {
	it('steps forward and backward', () => {
		const all = items('ooooo')
		expect(nextEnabledIndex(all, 0, 1)).toBe(1)
		expect(nextEnabledIndex(all, 3, -1)).toBe(2)
	})

	it('wraps at both ends', () => {
		const all = items('ooo')
		expect(nextEnabledIndex(all, 2, 1)).toBe(0)
		expect(nextEnabledIndex(all, 0, -1)).toBe(2)
	})

	it('skips disabled items in both directions', () => {
		const some = items('o--o-o')
		expect(nextEnabledIndex(some, 0, 1)).toBe(3)
		expect(nextEnabledIndex(some, 5, -1)).toBe(3)
		// Wrapping past a disabled tail lands on the first enabled item
		expect(nextEnabledIndex(some, 5, 1)).toBe(0)
	})

	it('expresses Home as (-1, +1) and End as (0, -1)', () => {
		const some = items('-oo-o-')
		expect(nextEnabledIndex(some, -1, 1)).toBe(1)
		expect(nextEnabledIndex(some, 0, -1)).toBe(4)
	})

	it('does not spin when only one item is selectable', () => {
		const one = items('--o--')
		expect(nextEnabledIndex(one, 2, 1)).toBe(2)
		expect(nextEnabledIndex(one, 2, -1)).toBe(2)
	})

	it('reports no selectable item as -1, never as a disabled index', () => {
		expect(nextEnabledIndex(items('---'), -1, 1)).toBe(-1)
		// Would be a real bug to hand `from` back here: index 0 is disabled
		expect(nextEnabledIndex(items('---'), 0, 1)).toBe(-1)
		expect(nextEnabledIndex([], 0, 1)).toBe(-1)
	})
})

// vim: ts=4
