// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// Wrap exclusions: band/interval math for lines flowing around page-anchored frames.

import type { Fx } from '../fixed.js'
import type { Box, Frame } from '../model.js'

/** A frame's wrap box (its box grown by `wrap.off`) in page space; `tb` blocks the whole band. */
export interface Exclusion {
	x0: Fx
	y0: Fx
	x1: Fx
	y1: Fx
	tb: boolean
}

/** A free horizontal interval of a column (page space). */
export interface Span {
	x: Fx
	w: Fx
}

/** Wrap boxes of the frames that wrap text. Rotation is render-only, so the unrotated box wraps. */
export function wrapExclusions(frames: Frame[]): Exclusion[] {
	const out: Exclusion[] = []
	for (const f of frames) {
		if (f.wrap.mode === 'none') continue
		const o = f.wrap.off
		out.push({
			x0: f.x - o,
			y0: f.y - o,
			x1: f.x + f.w + o,
			y1: f.y + f.h + o,
			tb: f.wrap.mode === 'tb'
		})
	}
	return out
}

/** The exclusion overlaps the column across the band [top, bottom). */
function hits(col: Box, e: Exclusion, top: Fx, bottom: Fx): boolean {
	return e.y0 < bottom && e.y1 > top && e.x0 < col.x + col.w && e.x1 > col.x
}

/**
 * Widest free interval of `col` across the band [top, bottom), leftmost on a tie; `w` is 0 when
 * a `tb` exclusion crosses the band or `box` exclusions cover all of it.
 */
// One interval per line (no text on both sides of a frame); multi-segment lines would lift that.
export function freeSpan(col: Box, ex: Exclusion[], top: Fx, bottom: Fx): Span {
	let free: [Fx, Fx][] = [[col.x, col.x + col.w]]
	for (const e of ex) {
		if (!hits(col, e, top, bottom)) continue
		if (e.tb) return { x: col.x, w: 0 }
		const rest: [Fx, Fx][] = []
		for (const [a, b] of free) {
			if (e.x0 > a) rest.push([a, Math.min(b, e.x0)])
			if (e.x1 < b) rest.push([Math.max(a, e.x1), b])
		}
		free = rest
	}
	let best: Span = { x: col.x, w: 0 }
	for (const [a, b] of free) {
		if (b - a > best.w) best = { x: a, w: b - a }
	}
	return best
}

/**
 * Top (≥ `top`, page space) of the first band of height `band` whose free span is at least `min`
 * (capped at the column width) wide, stepping down past the exclusions in the way; the column's
 * bottom when there is none.
 */
export function nextFreeTop(col: Box, ex: Exclusion[], top: Fx, band: Fx, min: Fx): Fx {
	const bottom = col.y + col.h
	const need = Math.min(min, col.w)
	while (top < bottom) {
		if (freeSpan(col, ex, top, top + band).w >= need) return top
		let nt = bottom
		for (const e of ex) {
			if (hits(col, e, top, top + band)) nt = Math.min(nt, e.y1)
		}
		top = nt
	}
	return Math.max(top, bottom)
}
