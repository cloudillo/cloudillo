// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { astarRoute } from '../connectors/routing/astar.js'
import { collapseCollinear } from '../connectors/routing/common.js'
import type { Dock } from '../connectors/routing/elbow.js'
import { analyticElbow, pathCost } from '../connectors/routing/elbow.js'
import { segmentPenetratesRect } from '../connectors/shape-outline.js'
import type { Bounds, Dir } from '../crdt/runtime-types.js'

type Pt = [number, number]

function dock(point: Pt, d: Pt, dir: Dir | null): Dock {
	return { point, dock: d, dir }
}

/** A* emits every grid crossing; collapse before costing so turns are counted honestly */
function routeCost(points: Pt[]): number {
	return pathCost(collapseCollinear(points))
}

function eachSegment(points: Pt[], fn: (a: Pt, b: Pt) => void) {
	for (let i = 0; i < points.length - 1; i++) fn(points[i], points[i + 1])
}

const A: Bounds = { x: 0, y: 0, width: 100, height: 100 }
const B: Bounds = { x: 300, y: 0, width: 100, height: 100 }

describe('astarRoute', () => {
	it('returns null with no obstacles - there is nothing to search around', () => {
		expect(
			astarRoute(dock([100, 50], [120, 50], 'e'), dock([300, 50], [280, 50], 'w'), [])
		).toBeNull()
	})

	it('produces an axis-aligned path', () => {
		const path = astarRoute(dock([100, 50], [120, 50], 'e'), dock([300, 50], [280, 50], 'w'), [
			A,
			B
		])
		expect(path).not.toBeNull()
		eachSegment(path!, (p, q) => {
			expect(Math.abs(p[0] - q[0]) < 1e-6 || Math.abs(p[1] - q[1]) < 1e-6).toBe(true)
		})
	})

	it('never enters a padded obstacle', () => {
		const layouts: [Bounds, Bounds, Dock, Dock][] = [
			[A, B, dock([100, 50], [120, 50], 'e'), dock([300, 50], [280, 50], 'w')],
			[
				A,
				{ x: 0, y: 300, width: 100, height: 100 },
				dock([50, 100], [50, 120], 's'),
				dock([50, 300], [50, 280], 'n')
			],
			[
				A,
				{ x: 200, y: 200, width: 100, height: 100 },
				dock([100, 50], [120, 50], 'e'),
				dock([200, 250], [180, 250], 'w')
			],
			[
				A,
				{ x: 60, y: 60, width: 100, height: 100 },
				dock([50, 0], [50, -20], 'n'),
				dock([160, 110], [180, 110], 'e')
			]
		]
		for (const [o1, o2, start, end] of layouts) {
			const path = astarRoute(start, end, [o1, o2])
			if (!path) continue
			eachSegment(path, (p, q) => {
				expect(segmentPenetratesRect(p, q, o1)).toBe(false)
				expect(segmentPenetratesRect(p, q, o2)).toBe(false)
			})
		}
	})

	it('starts and ends at the docks', () => {
		const start = dock([100, 50], [120, 50], 'e')
		const end = dock([300, 50], [280, 50], 'w')
		const path = astarRoute(start, end, [A, B])!
		expect(path[0][0]).toBeCloseTo(start.dock[0], 6)
		expect(path[path.length - 1][0]).toBeCloseTo(end.dock[0], 6)
	})

	// Every peer derives its own copy of every route. Two peers disagreeing by one dog-leg
	// disagree visibly, so equal-cost ties must break on geometry, never on insertion order.
	it('is deterministic across shuffled obstacle order', () => {
		const start = dock([100, 50], [120, 50], 'e')
		const end = dock([200, 250], [180, 250], 'w')
		const obstacles = [A, { x: 200, y: 200, width: 100, height: 100 }]
		const reference = JSON.stringify(astarRoute(start, end, obstacles))
		expect(JSON.stringify(astarRoute(start, end, [...obstacles].reverse()))).toBe(reference)
	})

	it('repeats byte-identically across runs', () => {
		const start = dock([100, 50], [120, 50], 'e')
		const end = dock([50, 300], [50, 280], 'n')
		const obstacles = [A, { x: 0, y: 300, width: 100, height: 100 }]
		const reference = JSON.stringify(astarRoute(start, end, obstacles))
		for (let i = 0; i < 10; i++) {
			expect(JSON.stringify(astarRoute(start, end, obstacles))).toBe(reference)
		}
	})

	it('is never worse than the analytic fallback', () => {
		const layouts: [Dock, Dock, Bounds[]][] = [
			[dock([100, 50], [120, 50], 'e'), dock([300, 50], [280, 50], 'w'), [A, B]],
			[
				dock([50, 100], [50, 120], 's'),
				dock([50, 300], [50, 280], 'n'),
				[A, { x: 0, y: 300, width: 100, height: 100 }]
			],
			[
				dock([100, 50], [120, 50], 'e'),
				dock([200, 250], [180, 250], 'w'),
				[A, { x: 200, y: 200, width: 100, height: 100 }]
			],
			[
				dock([50, 0], [50, -20], 'n'),
				dock([300, 100], [320, 100], 'e'),
				[A, { x: 200, y: 50, width: 100, height: 100 }]
			]
		]
		for (const [start, end, obstacles] of layouts) {
			const searched = astarRoute(start, end, obstacles)
			if (!searched) continue
			const analytic = analyticElbow(start, end, obstacles)
			// Allow one turn's slack: A* also pays proximity costs this metric ignores, and it
			// is confined to the obstacle-derived grid while the analytic router is not.
			expect(routeCost(searched)).toBeLessThanOrEqual(routeCost(analytic) + 24)
		}
	})

	it('gives up rather than hanging when an anchor is enclosed', () => {
		// The start dock sits inside its own padded obstacle - unreachable
		const enclosing: Bounds = { x: 0, y: 0, width: 500, height: 500 }
		const path = astarRoute(
			dock([100, 100], [120, 100], 'e'),
			dock([400, 400], [420, 400], 'e'),
			[enclosing]
		)
		expect(path).toBeNull()
	})

	/**
	 * Grid lines within LINE_EPSILON (1px) of each other are merged, and the dock has to win the
	 * merge: an obstacle edge that evicts it makes the path's terminal vertex miss the dock, and
	 * routeElbow's forced perpendicular first/last segment then comes out slightly diagonal.
	 */
	it('keeps a dock coordinate that an obstacle edge sorts just before', () => {
		// B's left edge is 119.5 - half a pixel short of the start dock at x=120
		const near: Bounds = { x: 119.5, y: 200, width: 100, height: 100 }
		const start = dock([100, 50], [120, 50], 'e')
		const end = dock([169.5, 200], [169.5, 180], 'n')

		const path = astarRoute(start, end, [A, near])
		expect(path).not.toBeNull()
		expect(path![0]).toEqual(start.dock)
		expect(path![path!.length - 1]).toEqual(end.dock)
	})

	// `preferred` holds BOTH docks, and the cluster branch used to REPLACE the representative
	// - so when the two fell within one LINE_EPSILON the second dock evicted the first, the routed
	// terminal vertex missed its dock, and routeElbow's forced perpendicular stub came out
	// slightly diagonal. Two boxes side by side, one nudged 0.6px down.
	it('keeps both dock coordinates when they land in the same cluster', () => {
		const lower: Bounds = { x: 300, y: 0.6, width: 100, height: 100 }
		const start = dock([100, 50], [120, 50], 'e')
		const end = dock([300, 50.6], [280, 50.6], 'w')

		const path = astarRoute(start, end, [A, lower])
		expect(path).not.toBeNull()
		expect(path![0]).toEqual(start.dock)
		expect(path![path!.length - 1]).toEqual(end.dock)
	})

	/*
	 * The harder shape of the same case - BOTH docks cluster with an obstacle edge that sorts
	 * ahead of them. The first dock has to evict the edge (it is not preferred) and the second has
	 * to widen the grid rather than evict the first, so the cluster ends up holding both docks and
	 * neither dock's coordinate is approximated. There is deliberately no branch that drops a dock
	 * instead: a dropped dock is what makes routeElbow's forced perpendicular stub come out
	 * diagonal.
	 */
	it('keeps both docks when they cluster with an obstacle edge', () => {
		// Both boxes' bottom edge is y=100; the docks sit 0.4 and 0.9 below it, one cluster
		const start = dock([100, 100.4], [120, 100.4], 'e')
		const end = dock([300, 100.9], [280, 100.9], 'w')

		const path = astarRoute(start, end, [A, B])
		expect(path).not.toBeNull()
		expect(path![0]).toEqual(start.dock)
		expect(path![path!.length - 1]).toEqual(end.dock)
		// A grid line left out of order would show up here as a diagonal segment
		eachSegment(path!, (a, b) => {
			expect(a[0] === b[0] || a[1] === b[1]).toBe(true)
		})
	})
})
