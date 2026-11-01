// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { cycleIndex, selectionCycleIndex } from '../utils/a11y.js'

describe('cycleIndex', () => {
	it('enters at the first object on Tab and the last on Shift+Tab', () => {
		expect(cycleIndex(3, null, 1)).toBe(0)
		expect(cycleIndex(3, null, -1)).toBe(2)
	})

	it('steps through the order', () => {
		expect(cycleIndex(3, 0, 1)).toBe(1)
		expect(cycleIndex(3, 2, -1)).toBe(1)
	})

	it('returns null past either end so focus can leave the canvas', () => {
		expect(cycleIndex(3, 2, 1)).toBeNull()
		expect(cycleIndex(3, 0, -1)).toBeNull()
		expect(cycleIndex(0, null, 1)).toBeNull()
	})
})

describe('selectionCycleIndex', () => {
	const order = ['a', 'b', 'c', 'd']

	it('takes the frontmost selected going forward and the backmost going back', () => {
		const selected = new Set(['b', 'c'])
		expect(selectionCycleIndex(order, selected, 1)).toBe(2)
		expect(selectionCycleIndex(order, selected, -1)).toBe(1)
	})

	it('is null with no selection', () => {
		expect(selectionCycleIndex(order, new Set(), 1)).toBeNull()
	})
})
