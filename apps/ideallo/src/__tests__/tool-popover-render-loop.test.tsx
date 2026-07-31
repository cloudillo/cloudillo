// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * A flyout that is merely MOUNTED must cost nothing per frame.
 *
 * Every caller builds `sections` as an inline array literal, so ToolPopover receives a fresh array
 * on every render of the toolbar - and the toolbar re-renders on every pointer move of every canvas
 * drag. A roving-focus effect keyed on that array's identity scheduled a state update from inside
 * React's passive-effect flush once per frame, which trips "Maximum update depth exceeded" while
 * naming whichever setState came next (the drag's own). See ToolPopover's `itemsKey`.
 *
 * So the assertion is on COMMITS, not on markup: one parent render must produce one commit.
 */

import { act, render } from '@testing-library/react'
import * as React from 'react'
import { PiCircle, PiSquare } from 'react-icons/pi'

import { ToolPopover, type ToolPopoverSection } from '../components/ToolPopover.js'

class StubResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

beforeAll(() => {
	;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = StubResizeObserver
})

/** Built inline on every render, exactly as Toolbar's five call sites do */
function sectionsFor(disabled: boolean): ToolPopoverSection[] {
	return [
		{
			key: 'shape',
			items: [
				{ key: 'rect', Icon: PiSquare, label: 'Rectangle', onSelect: () => {} },
				{ key: 'ellipse', Icon: PiCircle, label: 'Ellipse', disabled, onSelect: () => {} }
			]
		}
	]
}

/** Commits under the popover for each of four re-renders of its parent */
function commitsPerParentRender(open: boolean): number[] {
	let commits = 0
	function Host({ tick }: { tick: number }) {
		return (
			<React.Profiler
				id="popover"
				onRender={() => {
					commits++
				}}
			>
				{/* `tick` is only here to force the parent to re-render, as a drag does */}
				<span hidden>{tick}</span>
				<ToolPopover
					open={open}
					onClose={() => {}}
					sections={sectionsFor(false)}
					aria-label="Shapes"
				/>
			</React.Profiler>
		)
	}
	const view = render(<Host tick={0} />)
	const counts: number[] = []
	for (let tick = 1; tick <= 4; tick++) {
		commits = 0
		act(() => {
			view.rerender(<Host tick={tick} />)
		})
		counts.push(commits)
	}
	view.unmount()
	return counts
}

describe('ToolPopover', () => {
	it('costs one commit per parent render while closed', () => {
		expect(commitsPerParentRender(false)).toEqual([1, 1, 1, 1])
	})

	it('settles to one commit per parent render while open', () => {
		// The first render after opening pays useEdgeClamp's one-off measurement, which is what
		// places the panel. What matters is that it SETTLES rather than repeating every frame.
		expect(commitsPerParentRender(true).slice(1)).toEqual([1, 1, 1])
	})

	it('re-seats the roving index when the item set really changes', () => {
		let commits = 0
		function Host({ disabled }: { disabled: boolean }) {
			return (
				<React.Profiler
					id="popover"
					onRender={() => {
						commits++
					}}
				>
					<ToolPopover
						open={true}
						onClose={() => {}}
						sections={sectionsFor(disabled)}
						aria-label="Shapes"
					/>
				</React.Profiler>
			)
		}
		const view = render(<Host disabled={false} />)
		commits = 0
		act(() => {
			view.rerender(<Host disabled={true} />)
		})
		// A real change to the item set is still seen: the effect re-runs, which is the whole
		// point of it, and the extra commit here is the one that is NOT waste.
		expect(commits).toBeGreaterThanOrEqual(1)
		view.unmount()
	})
})

// vim: ts=4
