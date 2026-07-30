// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Route cache.
 *
 * Caching is mandatory, not an optimisation: routes are recomputed for every arrow on every
 * frame. Dragging one box in a 200-arrow document changes only the signatures of the arrows
 * incident to it; the rest are Map hits.
 *
 * Coordinates are quantized to 0.5px / 0.5deg so a signature actually repeats during a drag.
 * Do not quantize coarser - the stepping becomes visible.
 *
 * Eviction is TWO-GENERATION, not LRU. An LRU here collapses to a 0% hit rate the moment the
 * working set exceeds CAPACITY, because every pass walks the connectors in the same order: pass 1
 * fills the cache and evicts its own head, pass 2 starts at that head, misses, and evicts the next
 * entry it will need - the textbook sequential-scan pathology, and the passes are what this cache
 * exists for. The rotating pair has no such cliff: a working set up to CAPACITY re-scanned in ANY
 * order hits on every pass after the first. The price is a steady state of up to 2*CAPACITY
 * entries, which is cheap next to recomputing an A* route per arrow per frame.
 */

import type { ResolvedRoute } from '../crdt/index.js'
import type { ShapeGeometry } from './types.js'

/** Exported so the tests can size a working set against it rather than hardcode a number */
export const ROUTE_CACHE_CAPACITY = 2048

/** Cap on the dev diagnostic below, so a genuinely regressed memo cannot flood the console */
const MAX_WARNINGS = 3

/** Quantize to 0.5 units - fine enough to be invisible, coarse enough to hit */
function q(n: number): number {
	return Math.round(n * 2) / 2
}

/** Structural signature of a shape: everything routing reads from it */
function shapeSignature(shape: ShapeGeometry | undefined): string {
	if (!shape) return '-'
	const b = shape.bounds
	return `${shape.type}:${q(b.x)},${q(b.y)},${q(b.width)},${q(b.height)},${q(shape.rotation)},${q(shape.pivotX * 100)},${q(shape.pivotY * 100)}`
}

function anchorSignature(anchor: unknown): string {
	if (!anchor) return 'a'
	if (typeof anchor === 'object') {
		const p = anchor as { x: number; y: number }
		return `${q(p.x * 1000)},${q(p.y * 1000)}`
	}
	return String(anchor)
}

function arrowSignature(
	style: { type: string; size?: number; filled?: boolean } | undefined
): string {
	if (!style) return '-'
	return `${style.type}:${style.size ?? 1}:${style.filled ?? true}`
}

export interface RouteSignatureInput {
	routing: string
	startObjectId?: string
	endObjectId?: string
	startAnchor?: unknown
	endAnchor?: unknown
	startShape?: ShapeGeometry
	endShape?: ShapeGeometry
	startPoint: [number, number]
	endPoint: [number, number]
	strokeWidth: number
	startArrow?: { type: string; size?: number; filled?: boolean }
	endArrow?: { type: string; size?: number; filled?: boolean }
}

export function routeSignature(input: RouteSignatureInput): string {
	return [
		input.routing,
		`${input.startObjectId ?? '-'}:${anchorSignature(input.startAnchor)}:${shapeSignature(input.startShape)}`,
		`${input.endObjectId ?? '-'}:${anchorSignature(input.endAnchor)}:${shapeSignature(input.endShape)}`,
		`${q(input.startPoint[0])},${q(input.startPoint[1])},${q(input.endPoint[0])},${q(input.endPoint[1])}`,
		q(input.strokeWidth),
		arrowSignature(input.startArrow),
		arrowSignature(input.endArrow)
	].join('|')
}

/**
 * Two generations. Writes land in `current`; when it fills, it becomes `previous` wholesale and a
 * fresh `current` opens. A key still wanted is MOVED back on lookup, so anything the pass actually
 * touches survives the rotation without being retained twice; everything else falls out when
 * `previous` is replaced.
 */
let current = new Map<string, ResolvedRoute>()
let previous = new Map<string, ResolvedRoute>()

let uncachedThisPass = 0
let warnCount = 0
/** Whether a begin/endResolvePass pair is open - see setCachedRoute */
let inPass = false

// esbuild replaces process.env.NODE_ENV at build time (scripts/esbuild-common.js), so this
// whole branch is compiled out of production bundles.
const isDev = (() => {
	try {
		// @ts-expect-error - process is a build-time define, not a real global here
		return typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production'
	} catch {
		return false
	}
})()

export function getCachedRoute(signature: string): ResolvedRoute | undefined {
	const hit = current.get(signature)
	if (hit) return hit
	const stale = previous.get(signature)
	/*
	 * Promote by MOVING, not copying. A copy left the entry live in both generations, and only
	 * `setCachedRoute` rotates - so an all-hits pass never rotated while `current` grew a second
	 * reference to every key `previous` held, blowing past the 2*CAPACITY ceiling to ~3*CAPACITY.
	 *
	 * Rotating here instead would be worse: `previous` still holds keys this pass has not reached,
	 * and dropping them mid-scan reintroduces the very eviction pathology the two generations
	 * exist to avoid. A move keeps the total constant.
	 */
	if (stale !== undefined) {
		previous.delete(signature)
		current.set(signature, stale)
	}
	return stale
}

export function setCachedRoute(signature: string, route: ResolvedRoute): void {
	current.set(signature, route)
	if (current.size > ROUTE_CACHE_CAPACITY) {
		previous = current
		current = new Map()
	}
	// Only inside an open pass: lifecycle.ts resolves routes outside every pass (delete-with-freeze,
	// connector duplicate), and counting those made the diagnostic below fire with nothing regressed.
	if (inPass) uncachedThisPass++
}

/**
 * Opens a resolve PASS. Canvas, app.tsx's resolvedObjects and GhostEditing each run their own, so a
 * pass is not a frame and the counter below is deliberately pass-scoped.
 */
export function beginResolvePass(): void {
	inPass = true
	uncachedThisPass = 0
}

/**
 * Closes the pass opened by {@link beginResolvePass}. Warns when one pass recomputed far more
 * routes than a drag plausibly touches: cheap early warning that a memo dependency array has
 * regressed. Capped so it cannot spam the console.
 */
export function endResolvePass(): void {
	if (isDev && uncachedThisPass > 100 && warnCount < MAX_WARNINGS) {
		warnCount++
		console.warn(
			`[ideallo/connectors] ${uncachedThisPass} uncached routes in one pass - a memo dependency may have regressed`
		)
	}
	uncachedThisPass = 0
	inPass = false
}

/** Test seam - also re-arms the pass diagnostic above */
export function clearRouteCache(): void {
	current.clear()
	previous.clear()
	uncachedThisPass = 0
	warnCount = 0
	inPass = false
}

export function routeCacheSize(): number {
	return current.size + previous.size
}

// vim: ts=4
