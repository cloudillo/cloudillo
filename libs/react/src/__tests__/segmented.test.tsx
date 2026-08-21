// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { render, screen } from '@testing-library/react'
import * as React from 'react'

import { Segmented } from '../components/Segmented/Segmented.js'
import { SegmentedItem } from '../components/Segmented/SegmentedItem.js'

function renderGroup(value?: string) {
	return render(
		<Segmented aria-label="Mode" value={value}>
			<SegmentedItem value="auto">Automatic</SegmentedItem>
			<SegmentedItem value="custom">Custom</SegmentedItem>
		</Segmented>
	)
}

describe('SegmentedItem roving tabindex', () => {
	it('keeps every item tabbable while nothing is selected', () => {
		renderGroup()
		const items = screen.getAllByRole('radio')
		expect(items).toHaveLength(2)
		for (const item of items) {
			expect(item.tabIndex).toBe(0)
		}
	})

	it('leaves one tab stop once a value is selected', () => {
		renderGroup('custom')
		const items = screen.getAllByRole('radio')
		expect(items.map((item) => item.tabIndex)).toEqual([-1, 0])
	})

	it('keeps a tab stop when the value matches no item', () => {
		// A typo, a value read from storage, a list narrowed by a feature flag: the
		// per-item rule leaves *every* item at -1 and Tab cannot enter the group.
		renderGroup('nope')
		const items = screen.getAllByRole('radio')
		expect(items.map((item) => item.tabIndex)).toEqual([0, -1])
	})

	it('leaves one tab stop after an unmatched value becomes a real one', () => {
		// The fallback is written straight to the DOM, so React's vdom for that item
		// still says -1 and its diff will never take it back — without the effect
		// retracting its own write, the group ends up with two tab stops.
		const { rerender } = renderGroup('nope')
		expect(screen.getAllByRole('radio').map((item) => item.tabIndex)).toEqual([0, -1])
		rerender(
			<Segmented aria-label="Mode" value="custom">
				<SegmentedItem value="auto">Automatic</SegmentedItem>
				<SegmentedItem value="custom">Custom</SegmentedItem>
			</Segmented>
		)
		expect(screen.getAllByRole('radio').map((item) => item.tabIndex)).toEqual([-1, 0])
	})

	it('keeps a tab stop when every item is driven inactive from outside', () => {
		// `active` is the documented escape hatch for a group driven from outside,
		// and `false` on all of them is the same dead end.
		render(
			<Segmented aria-label="Mode">
				<SegmentedItem value="auto" active={false}>
					Automatic
				</SegmentedItem>
				<SegmentedItem value="custom" active={false}>
					Custom
				</SegmentedItem>
			</Segmented>
		)
		const items = screen.getAllByRole('radio')
		expect(items.map((item) => item.tabIndex)).toEqual([0, -1])
	})
})

// vim: ts=4
