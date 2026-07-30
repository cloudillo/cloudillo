// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	beginResolvePass,
	clearRouteCache,
	endResolvePass,
	getCachedRoute,
	ROUTE_CACHE_CAPACITY,
	routeCacheSize,
	routeSignature,
	setCachedRoute
} from '../connectors/cache.js'
import type { ShapeGeometry } from '../connectors/types.js'
import { toObjectId } from '../crdt/ids.js'
import type { ResolvedRoute } from '../crdt/runtime-types.js'
import {
	calculatePathBounds,
	clearPathCaches,
	PATH_CACHE_MAX,
	pathBoundsCacheSize
} from '../utils/hit-testing.js'

function shape(over: Partial<ShapeGeometry> = {}): ShapeGeometry {
	return {
		id: toObjectId('s1'),
		type: 'rect',
		bounds: { x: 0, y: 0, width: 100, height: 100 },
		rotation: 0,
		pivotX: 0.5,
		pivotY: 0.5,
		...over
	}
}

function input(over: Record<string, unknown> = {}) {
	return {
		routing: 'straight',
		startObjectId: 'a',
		endObjectId: 'b',
		startAnchor: 'auto',
		endAnchor: 'auto',
		startShape: shape(),
		endShape: shape({ bounds: { x: 300, y: 0, width: 100, height: 100 } }),
		startPoint: [50, 50] as [number, number],
		endPoint: [350, 50] as [number, number],
		strokeWidth: 2,
		startArrow: { type: 'none' },
		endArrow: { type: 'arrow' },
		...over
	}
}

function route(): ResolvedRoute {
	return {
		kind: 'straight',
		points: [
			[0, 0],
			[1, 1]
		],
		d: 'M 0 0 L 1 1',
		startDir: null,
		endDir: null,
		bounds: { x: 0, y: 0, width: 1, height: 1 }
	}
}

beforeEach(() => {
	clearRouteCache()
})

describe('routeSignature', () => {
	it('is stable under sub-quantum jitter', () => {
		// 0.5px quantization is what makes drag-time caching actually hit
		const a = routeSignature(input())
		const b = routeSignature(
			input({ startShape: shape({ bounds: { x: 0.1, y: 0.2, width: 100, height: 100 } }) })
		)
		expect(a).toBe(b)
	})

	it('changes when a shape moves past the quantum', () => {
		const a = routeSignature(input())
		const b = routeSignature(
			input({ startShape: shape({ bounds: { x: 3, y: 0, width: 100, height: 100 } }) })
		)
		expect(a).not.toBe(b)
	})

	it.each([
		['routing', { routing: 'orthogonal' }],
		['start binding', { startObjectId: 'other' }],
		['end anchor', { endAnchor: 'left' }],
		['stroke width', { strokeWidth: 8 }],
		['end arrowhead', { endArrow: { type: 'diamond' } }],
		['rotation', { startShape: shape({ rotation: 45 }) }]
	])('changes when the %s changes', (_label, over) => {
		expect(routeSignature(input())).not.toBe(routeSignature(input(over)))
	})

	it('distinguishes a free anchor from a nearby one', () => {
		const a = routeSignature(input({ startAnchor: { x: 0.3, y: 0.5 } }))
		const b = routeSignature(input({ startAnchor: { x: 0.9, y: 0.5 } }))
		expect(a).not.toBe(b)
	})

	it('treats a missing shape distinctly from a present one', () => {
		expect(routeSignature(input({ startShape: undefined }))).not.toBe(routeSignature(input()))
	})
})

describe('route cache', () => {
	it('stores and retrieves', () => {
		setCachedRoute('k', route())
		expect(getCachedRoute('k')).toBeDefined()
		expect(getCachedRoute('missing')).toBeUndefined()
	})

	it('stays bounded past capacity', () => {
		const n = ROUTE_CACHE_CAPACITY * 3
		for (let i = 0; i < n; i++) setCachedRoute(`k${i}`, route())
		// Two generations, so the ceiling is 2x capacity rather than 1x
		expect(routeCacheSize()).toBeLessThanOrEqual(ROUTE_CACHE_CAPACITY * 2 + 2)
		expect(getCachedRoute('k0')).toBeUndefined()
		expect(getCachedRoute(`k${n - 1}`)).toBeDefined()
	})

	/**
	 * THE reason this is not an LRU. An LRU plus a pass that walks the arrows in array order is the
	 * sequential-scan pathology: pass 1 evicts its own head, pass 2 starts at that head, misses, and
	 * evicts the next entry it will need - a 0% hit rate from pass 2 on, forever, with every route
	 * recomputed on every frame. The working set is sized past capacity on purpose.
	 */
	it('hits on every re-scan of a working set larger than capacity', () => {
		const keys = Array.from({ length: ROUTE_CACHE_CAPACITY + 100 }, (_, i) => `s${i}`)

		// Pass 1 populates: every lookup misses and is filled
		for (const k of keys) {
			if (!getCachedRoute(k)) setCachedRoute(k, route())
		}

		for (const pass of [2, 3]) {
			const misses: string[] = []
			for (const k of keys) {
				if (!getCachedRoute(k)) {
					misses.push(k)
					setCachedRoute(k, route())
				}
			}
			expect({ pass, misses: misses.length }).toEqual({ pass, misses: 0 })
		}
	})

	/**
	 * A pass that is all hits performs no `setCachedRoute` at all, so nothing rotates - and while
	 * promotion COPIED rather than moved, `current` grew a second reference to every key `previous`
	 * held and the documented 2*CAPACITY ceiling stopped holding.
	 */
	it('stays bounded when the working set grows by promotion alone', () => {
		// Populate `previous` so there is something to promote out of
		for (let i = 0; i < ROUTE_CACHE_CAPACITY + 10; i++) setCachedRoute(`p${i}`, route())

		// Re-read a working set of ~2x capacity with NO intervening write
		for (let i = 0; i < ROUTE_CACHE_CAPACITY * 2; i++) getCachedRoute(`p${i}`)

		expect(routeCacheSize()).toBeLessThanOrEqual(ROUTE_CACHE_CAPACITY * 2 + 2)
	})

	/** The mechanism behind the ceiling above: a promotion MOVES, so it retains nothing extra */
	it('does not retain an entry it promotes twice over', () => {
		for (let i = 0; i < ROUTE_CACHE_CAPACITY + 10; i++) setCachedRoute(`p${i}`, route())
		const before = routeCacheSize()

		// Every one of these is a hit out of `previous`
		for (let i = 0; i < ROUTE_CACHE_CAPACITY + 1; i++)
			expect(getCachedRoute(`p${i}`)).toBeDefined()

		expect(routeCacheSize()).toBe(before)
	})

	it('keeps an entry read on every pass across rotations', () => {
		setCachedRoute('hot', route())
		for (let i = 0; i < ROUTE_CACHE_CAPACITY * 2 + 50; i++) {
			setCachedRoute(`k${i}`, route())
			getCachedRoute('hot')
		}
		expect(getCachedRoute('hot')).toBeDefined()
	})
})

/**
 * The uncached-route counter is a dev diagnostic for a regressed memo dependency. It is scoped to a
 * begin/end pair because lifecycle.ts resolves routes entirely outside any pass (delete-with-freeze,
 * connector duplicate), and those used to accumulate into it and fire the warning with nothing wrong.
 */
describe('resolve pass diagnostic', () => {
	const WARN_THRESHOLD = 100
	// A plain assignment rather than jest.spyOn: the `jest` global is not injected under ESM and
	// @jest/globals is not a dependency of this package (same pattern as libs/core's tests).
	const realWarn = console.warn
	let warnings: unknown[][]

	beforeEach(() => {
		warnings = []
		console.warn = (...args: unknown[]) => {
			warnings.push(args)
		}
	})

	afterEach(() => {
		console.warn = realWarn
	})

	function fill(n: number, prefix: string) {
		for (let i = 0; i < n; i++) setCachedRoute(`${prefix}${i}`, route())
	}

	it('warns when one pass recomputes far more routes than a drag would touch', () => {
		beginResolvePass()
		fill(WARN_THRESHOLD + 1, 'in')
		endResolvePass()
		expect(warnings).toHaveLength(1)
	})

	it('ignores writes made outside a pass', () => {
		fill(WARN_THRESHOLD * 2, 'out')
		beginResolvePass()
		endResolvePass()
		expect(warnings).toHaveLength(0)
	})

	it('does not carry a previous pass into the next one', () => {
		beginResolvePass()
		fill(WARN_THRESHOLD - 1, 'a')
		endResolvePass()
		beginResolvePass()
		fill(WARN_THRESHOLD - 1, 'b')
		endResolvePass()
		expect(warnings).toHaveLength(0)
	})

	it('leaves the counter at zero when a pass is never opened', () => {
		// resolveConnectorRoutes early-returns before beginResolvePass when nothing is bound
		fill(WARN_THRESHOLD * 2, 'skipped')
		beginResolvePass()
		fill(1, 'later')
		endResolvePass()
		expect(warnings).toHaveLength(0)
	})
})

/**
 * Keyed on the stroke's pathData, which is immutable per stroke - but the module lives for the
 * whole SPA session, so board after board would otherwise accumulate forever.
 */
describe('path bounds cache', () => {
	beforeEach(() => {
		clearPathCaches()
	})

	const path = (i: number) => `M 0 0 C 1 1 2 2 ${i} ${i}`

	it('stays bounded past capacity', () => {
		for (let i = 0; i < PATH_CACHE_MAX + 50; i++) calculatePathBounds(path(i))
		expect(pathBoundsCacheSize()).toBeLessThanOrEqual(PATH_CACHE_MAX)
	})

	it('still answers for a recent key', () => {
		for (let i = 0; i < PATH_CACHE_MAX + 50; i++) calculatePathBounds(path(i))
		const recent = calculatePathBounds(path(PATH_CACHE_MAX + 49))
		expect(recent).not.toBeNull()
		// Cached, not recomputed: the size did not grow to accommodate it
		expect(pathBoundsCacheSize()).toBeLessThanOrEqual(PATH_CACHE_MAX)
	})
})
