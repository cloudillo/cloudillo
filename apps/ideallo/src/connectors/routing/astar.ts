// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * A* over a non-uniform grid, for elbow routes that go around obstacles.
 *
 * The grid is built from the obstacles themselves - their edges, their centres and the docks -
 * rather than a fixed pitch, so a typical two-shape route searches 36-81 nodes rather than
 * thousands. Returns null on failure so the caller can fall back to the analytic route; this
 * search is an optimisation, never a dependency.
 *
 * DETERMINISM IS MANDATORY. Every peer derives its own copy of every route from replicated
 * state, so two peers that disagree by one dog-leg disagree visibly. The open set is therefore
 * tie-broken on quantized (f, y, x, dir) and never on insertion order.
 */

import type { Bounds, Dir } from '../../crdt/index.js'
import { hypot } from '../../utils/geometry.js'
import { pointInRect, segmentPenetratesRect } from '../shape-outline.js'
import type { Dock } from './elbow.js'

type Pt = [number, number]

/** Prefers one long dog-leg over a staircase. Empirically ~= DOCK. */
const TURN_PENALTY = 24

/** Discourages running flush along an obstacle edge */
const PROXIMITY_PENALTY = 8

/** How close counts as "running along" an obstacle */
const PROXIMITY_DISTANCE = 12

/** Expansions before we give up and let the analytic route take over */
const EXPANSION_BUDGET = 200

/** Merge grid lines closer together than this */
const LINE_EPSILON = 1

const DIRS: Dir[] = ['e', 's', 'w', 'n']
const DIR_DELTA: Record<Dir, [number, number]> = {
	e: [1, 0],
	s: [0, 1],
	w: [-1, 0],
	n: [0, -1]
}

function opposite(dir: Dir): Dir {
	return dir === 'e' ? 'w' : dir === 'w' ? 'e' : dir === 'n' ? 's' : 'n'
}

/** Quantized to 0.5px, matching the cache signature, so ties break identically everywhere */
function q(n: number): number {
	return Math.round(n * 2) / 2
}

/**
 * Merge near-coincident grid lines, keeping the DOCK coordinate whenever a cluster contains one:
 * a dock dropped in favour of an obstacle edge 1px away makes the route's terminal vertex miss
 * the dock, and routeElbow's forced perpendicular first/last segment is then slightly diagonal.
 *
 * `preferred` holds BOTH docks, and both may land in one cluster - two boxes side by side with one
 * nudged half a pixel down. Neither may evict the other, so that case widens the grid by one line
 * instead of replacing: losing either dock produces exactly the diagonal stub described above.
 *
 * The replacement moves a representative by at most LINE_EPSILON, and the extra line is pushed
 * while `v >= last`, so `out` stays sorted either way.
 */
function sortedUnique(values: number[], preferred: readonly number[] = []): number[] {
	const sorted = [...values].sort((a, b) => a - b)
	const out: number[] = []
	for (const v of sorted) {
		if (!out.length || v - out[out.length - 1] > LINE_EPSILON) {
			out.push(v)
		} else if (preferred.includes(v)) {
			// Same cluster, but this one must survive exactly
			const last = out[out.length - 1]
			// v === last covers two docks on the identical coordinate: already exact, and pushing
			// would leave a duplicate grid line
			if (v === last) continue
			// Two docks in one cluster: widen rather than evict either - see above. There is
			// deliberately no branch that drops `v`.
			if (preferred.includes(last)) out.push(v)
			else out[out.length - 1] = v
		}
	}
	return out
}

/**
 * Candidate grid lines: each obstacle's near edge, centre and far edge, plus the dock
 * coordinates, plus the midpoint of the gap between the two obstacles.
 */
function candidateLines(
	obstacles: Bounds[],
	docks: number[],
	axis: 'x' | 'y',
	lo: number,
	hi: number
): number[] {
	const values: number[] = [...docks]
	for (const o of obstacles) {
		const near = axis === 'x' ? o.x : o.y
		const size = axis === 'x' ? o.width : o.height
		values.push(near, near + size / 2, near + size)
	}
	if (obstacles.length === 2) {
		const [a, b] = obstacles
		const aNear = axis === 'x' ? a.x : a.y
		const aSize = axis === 'x' ? a.width : a.height
		const bNear = axis === 'x' ? b.x : b.y
		const bSize = axis === 'x' ? b.width : b.height
		// Midpoint of the facing gap - the line a Z-route naturally wants to use
		if (aNear + aSize < bNear) values.push((aNear + aSize + bNear) / 2)
		else if (bNear + bSize < aNear) values.push((bNear + bSize + aNear) / 2)
	}
	// Docks must survive clamping or the search would have no start or goal
	const clamped = values.map((v) => (docks.includes(v) ? v : Math.min(Math.max(v, lo), hi)))
	return sortedUnique(clamped, docks)
}

/** Index of the grid line nearest `value` */
function lineIndex(lines: number[], value: number): number {
	let best = 0
	let bestDist = Infinity
	for (let i = 0; i < lines.length; i++) {
		const dist = Math.abs(lines[i] - value)
		if (dist < bestDist) {
			bestDist = dist
			best = i
		}
	}
	return best
}

function blocked(a: Pt, b: Pt, obstacles: Bounds[]): boolean {
	for (const o of obstacles) {
		if (segmentPenetratesRect(a, b, o)) return true
	}
	return false
}

/** Distance from a point to a box, 0 when inside */
function distanceToRect(p: Pt, r: Bounds): number {
	const dx = Math.max(r.x - p[0], 0, p[0] - (r.x + r.width))
	const dy = Math.max(r.y - p[1], 0, p[1] - (r.y + r.height))
	return hypot(dx, dy)
}

function runsAlongObstacle(a: Pt, b: Pt, obstacles: Bounds[]): boolean {
	const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
	for (const o of obstacles) {
		if (distanceToRect(mid, o) < PROXIMITY_DISTANCE) return true
	}
	return false
}

interface SearchNode {
	xi: number
	yi: number
	dir: Dir
	g: number
	f: number
	parent: SearchNode | null
}

/**
 * Route from `start.dock` to `end.dock` around `obstacles`.
 * Returns the intermediate polyline INCLUDING both docks, or null to fall back.
 */
export function astarRoute(start: Dock, end: Dock, obstacles: Bounds[]): Pt[] | null {
	// With nothing in the way there is nothing to search around
	if (!obstacles.length) return null

	const from = start.dock
	const goal = end.dock

	// The search area: everything the obstacles and docks span, with room to go around
	const pad = 40
	const allX = [from[0], goal[0], ...obstacles.flatMap((o) => [o.x, o.x + o.width])]
	const allY = [from[1], goal[1], ...obstacles.flatMap((o) => [o.y, o.y + o.height])]
	const loX = Math.min(...allX) - pad
	const hiX = Math.max(...allX) + pad
	const loY = Math.min(...allY) - pad
	const hiY = Math.max(...allY) + pad

	const xs = candidateLines(obstacles, [from[0], goal[0]], 'x', loX, hiX)
	const ys = candidateLines(obstacles, [from[1], goal[1]], 'y', loY, hiY)
	if (xs.length < 2 || ys.length < 2) return null

	const startXi = lineIndex(xs, from[0])
	const startYi = lineIndex(ys, from[1])
	const goalXi = lineIndex(xs, goal[0])
	const goalYi = lineIndex(ys, goal[1])

	// A dock buried inside a padded obstacle means the anchor is enclosed; give up early
	const at = (xi: number, yi: number): Pt => [xs[xi], ys[yi]]
	if (
		obstacles.some(
			(o) => pointInRect(at(startXi, startYi), o) || pointInRect(at(goalXi, goalYi), o)
		)
	) {
		return null
	}

	const arrivalDir = end.dir ? opposite(end.dir) : null
	const heuristic = (xi: number, yi: number, dir: Dir): number => {
		const dx = xs[goalXi] - xs[xi]
		const dy = ys[goalYi] - ys[yi]
		let h = Math.abs(dx) + Math.abs(dy)
		// At least one more turn is needed when the current heading cannot reach the goal
		const needsTurn =
			(dir === 'e' && dx < 0) ||
			(dir === 'w' && dx > 0) ||
			(dir === 's' && dy < 0) ||
			(dir === 'n' && dy > 0) ||
			(Math.abs(dx) > LINE_EPSILON && Math.abs(dy) > LINE_EPSILON)
		if (needsTurn) h += TURN_PENALTY
		return h
	}

	const initialDir: Dir = start.dir ?? 'e'
	const open: SearchNode[] = [
		{
			xi: startXi,
			yi: startYi,
			dir: initialDir,
			g: 0,
			f: heuristic(startXi, startYi, initialDir),
			parent: null
		}
	]
	const bestG = new Map<string, number>()
	const key = (xi: number, yi: number, dir: Dir) => `${xi},${yi},${dir}`
	bestG.set(key(startXi, startYi, initialDir), 0)

	let expansions = 0
	while (open.length) {
		if (++expansions > EXPANSION_BUDGET) return null

		// Linear scan with a total order on (f, y, x, dir). A heap would reorder equal-f nodes
		// by insertion, which is exactly the non-determinism this design cannot tolerate.
		let bestIdx = 0
		for (let i = 1; i < open.length; i++) {
			const a = open[i]
			const b = open[bestIdx]
			const af = q(a.f)
			const bf = q(b.f)
			if (
				af < bf ||
				(af === bf &&
					(a.yi < b.yi ||
						(a.yi === b.yi &&
							(a.xi < b.xi ||
								(a.xi === b.xi && DIRS.indexOf(a.dir) < DIRS.indexOf(b.dir))))))
			) {
				bestIdx = i
			}
		}
		const current = open.splice(bestIdx, 1)[0]

		if (current.xi === goalXi && current.yi === goalYi) {
			// Prefer arriving along the end dock's normal, but do not require it
			const path: Pt[] = []
			for (let n: SearchNode | null = current; n; n = n.parent) path.unshift(at(n.xi, n.yi))
			return path
		}

		for (const dir of DIRS) {
			const [dx, dy] = DIR_DELTA[dir]
			const nxi = current.xi + dx
			const nyi = current.yi + dy
			if (nxi < 0 || nxi >= xs.length || nyi < 0 || nyi >= ys.length) continue
			// Never double back
			if (dir === opposite(current.dir) && current.parent) continue

			const a = at(current.xi, current.yi)
			const b = at(nxi, nyi)
			if (blocked(a, b, obstacles)) continue

			let cost = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])
			if (dir !== current.dir) cost += TURN_PENALTY
			if (runsAlongObstacle(a, b, obstacles)) cost += PROXIMITY_PENALTY
			// A final segment that does not enter the end dock head-on costs an extra turn
			if (nxi === goalXi && nyi === goalYi && arrivalDir && dir !== arrivalDir) {
				cost += TURN_PENALTY
			}

			const g = current.g + cost
			const k = key(nxi, nyi, dir)
			const known = bestG.get(k)
			if (known !== undefined && known <= g) continue
			bestG.set(k, g)
			open.push({
				xi: nxi,
				yi: nyi,
				dir,
				g,
				f: g + heuristic(nxi, nyi, dir),
				parent: current
			})
		}
	}
	return null
}

// vim: ts=4
