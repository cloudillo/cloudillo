// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { dirToVector } from '../connectors/arrowheads.js'
import { terminalHeadDirections } from '../connectors/head-direction.js'
import type { Dir } from '../crdt/runtime-types.js'

type Pt = [number, number]

const DIRS: Dir[] = ['n', 's', 'e', 'w']

/** Component-wise, because negating a zero component yields -0 and toEqual is strict about it */
function expectVec(actual: Pt, expected: Pt) {
	expect(actual[0]).toBeCloseTo(expected[0], 6)
	expect(actual[1]).toBeCloseTo(expected[1], 6)
}

// A horizontal route left to right, as two side-by-side boxes would produce
const LINE: Pt[] = [
	[100, 50],
	[300, 50]
]

describe('terminalHeadDirections', () => {
	it('negates a dock direction at both terminals', () => {
		for (const dir of DIRS) {
			const [vx, vy] = dirToVector(dir)
			const heads = terminalHeadDirections(LINE, dir, dir)
			expectVec(heads.start, [-vx, -vy])
			expectVec(heads.end, [-vx, -vy])
		}
	})

	// Two boxes side by side dock 'e' / 'w', so reading the dock direction straight through would
	// point the end head west while the line arrives travelling east
	it('points the end head into the shape it docks against', () => {
		const heads = terminalHeadDirections(LINE, 'e', 'w')
		expectVec(heads.end, [1, 0])
		expectVec(heads.start, [-1, 0])
	})

	it('falls back to the polyline when neither terminal is docked', () => {
		const heads = terminalHeadDirections(LINE, null, null)
		// End follows travel, start points back out of the route
		expect(heads.end).toEqual([200, 0])
		expect(heads.start).toEqual([-200, 0])
	})

	it('uses only the first and last segment of an elbow polyline', () => {
		const elbow: Pt[] = [
			[0, 0],
			[0, 100],
			[200, 100]
		]
		const heads = terminalHeadDirections(elbow, undefined, undefined)
		expect(heads.end).toEqual([200, 0])
		expect(heads.start).toEqual([0, -100])
	})

	it('mixes a docked terminal with an undocked one', () => {
		const heads = terminalHeadDirections(LINE, null, 'w')
		expectVec(heads.start, [-200, 0])
		expectVec(heads.end, [1, 0])
	})

	it('returns a degenerate polyline as pointing east', () => {
		const heads = terminalHeadDirections([[10, 10]], null, null)
		expect(heads.start).toEqual([1, 0])
		expect(heads.end).toEqual([1, 0])
	})
})

// vim: ts=4
