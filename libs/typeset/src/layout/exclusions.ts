// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// Wrap exclusions: band/interval math for lines flowing around page-anchored frames.

import { FX, type Fx } from '../fixed.js'
import type { Box, Frame, ShapeFrameData } from '../model.js'

/**
 * A frame's wrap outline (grown by `wrap.off`) in page space; `tb` blocks the whole band.
 * `x0..y1` is its bounding box. `pts`, when present, is the outline itself: a convex polygon with
 * integer page-space vertices; absent, the outline is the box.
 */
export interface Exclusion {
	x0: Fx
	y0: Fx
	x1: Fx
	y1: Fx
	tb: boolean
	pts?: [Fx, Fx][]
}

/** A free horizontal interval of a column (page space). */
export interface Span {
	x: Fx
	w: Fx
}

/**
 * sin/cos of `deg` degrees from IEEE `+ - * /` only, so every engine gets the same bits
 * (`Math.sin` is not required to). Reduced to |x| ≤ 45° by quadrant; quarter turns are exact.
 */
export function sinCos(deg: number): [number, number] {
	const r = ((deg % 360) + 360) % 360
	const q = Math.round(r / 90)
	const x = ((r - q * 90) * Math.PI) / 180
	const x2 = x * x
	// Taylor series to x^17 / x^16: error < 1e-17 on |x| ≤ π/4.
	let s = 0
	let c = 0
	let ts = x
	let tc = 1
	for (let k = 1; k <= 17; k += 2) {
		s += ts
		c += tc
		ts *= -x2 / ((k + 1) * (k + 2))
		tc *= -x2 / (k * (k + 1))
	}
	switch (q % 4) {
		case 1:
			return [c, -s]
		case 2:
			return [-s, -c]
		case 3:
			return [-c, s]
		default:
			return [s, c]
	}
}

/** Circumscribed polygon of an ellipse: vertex count and the radius factor keeping edges outside. */
const ELLIPSE_N = 32
const ELLIPSE_K = 1 / sinCos(180 / ELLIPSE_N)[1]
/** Clamp on `wrap.off`, so a huge offset cannot overflow the outline math. */
const WRAP_OFF_MAX = 10000 * FX
/** Clamp on frame geometry, keeping the outline products far below 2^53. */
const GEOM_MAX = 1e6 * FX
/** Cap on wrapping frames per page: frames come from peers unvalidated; later ones (paint order) still render but don't wrap. */
export const WRAP_FRAMES_MAX = 256

/**
 * Wrap outlines of the frames that wrap text, following `rot` about the renderer's centre
 * `(x + ⌊w/2⌋, y + ⌊h/2⌋)`. An unrotated or quarter-turned rect is a box (no `pts`); any other
 * rotation, and an ellipse shape (as a circumscribed 32-gon on the renderer's floored radii), is a polygon whose vertices are
 * rounded outward. The trig is `sinCos`, so the outline is the same on every engine. Only the
 * first `WRAP_FRAMES_MAX` wrapping frames (in paint order) wrap.
 */
export function wrapExclusions(frames: Frame[]): Exclusion[] {
	const out: Exclusion[] = []
	for (const f of frames) {
		if (f.wrap.mode === 'none') continue
		if (out.length >= WRAP_FRAMES_MAX) break
		// Non-finite geometry has no outline to wrap, and an empty outline never wraps (an inverted
		// box misses every band); skip both. Huge geometry is clamped so the outline math stays exact.
		if (![f.x, f.y, f.w, f.h, f.wrap.off].every(Number.isFinite)) continue
		const cl = (v: number, m: number) => Math.max(-m, Math.min(m, v))
		const o = cl(f.wrap.off, WRAP_OFF_MAX)
		const [x, y, w, h] = [f.x, f.y, f.w, f.h].map((v) => cl(v, GEOM_MAX))
		if (w + 2 * o <= 0 || h + 2 * o <= 0) continue
		const tb = f.wrap.mode === 'tb'
		const cx = x + Math.floor(w / 2)
		const cy = y + Math.floor(h / 2)
		// A non-finite rot renders unrotated (paginate's `f.rot % 360` is NaN, falsy).
		const r = Number.isFinite(f.rot) ? ((f.rot % 360) + 360) % 360 : 0
		const quarter = r % 90 === 0
		const [s, c] = sinCos(r)
		const ellipse = f.t === 'shp' && (f.data as ShapeFrameData | undefined)?.kind === 'ellipse'
		// Outline relative to (cx, cy), unrotated.
		const rel: [number, number][] = []
		if (ellipse) {
			const rx = (Math.floor(w / 2) + o) * ELLIPSE_K
			const ry = (Math.floor(h / 2) + o) * ELLIPSE_K
			for (let k = 0; k < ELLIPSE_N; k++) {
				const [sv, cv] = sinCos((360 * k) / ELLIPSE_N)
				rel.push([rx * cv, ry * sv])
			}
		} else {
			const left = x - o - cx
			const top = y - o - cy
			const right = x + w + o - cx
			const bottom = y + h + o - cy
			rel.push([left, top], [right, top], [right, bottom], [left, bottom])
		}
		const pts = rel.map(([dx, dy]): [Fx, Fx] => {
			const px = cx + dx * c - dy * s
			const py = cy + dx * s + dy * c
			return [
				px < cx ? Math.floor(px) : Math.ceil(px),
				py < cy ? Math.floor(py) : Math.ceil(py)
			]
		})
		const e: Exclusion = { x0: pts[0][0], y0: pts[0][1], x1: pts[0][0], y1: pts[0][1], tb }
		for (const [vx, vy] of pts) {
			if (vx < e.x0) e.x0 = vx
			if (vx > e.x1) e.x1 = vx
			if (vy < e.y0) e.y0 = vy
			if (vy > e.y1) e.y1 = vy
		}
		if (ellipse || !quarter) e.pts = pts
		out.push(e)
	}
	return out
}

/** The exclusion's outline overlaps the column across the band [top, bottom). */
function hits(col: Box, e: Exclusion, top: Fx, bottom: Fx): boolean {
	if (!(e.y0 < bottom && e.y1 > top)) return false
	const [x0, x1] = extent(e, top, bottom)
	return x0 < col.x + col.w && x1 > col.x
}

/**
 * Blocked x-range of `e` across the band [top, bottom): its box, or the polygon's slice of the
 * band (vertices inside it plus edge crossings of `top`/`bottom`), widened to integers. An empty
 * slice falls back to the bounding box, so it fails closed.
 */
function extent(e: Exclusion, top: Fx, bottom: Fx): [Fx, Fx] {
	const p = e.pts
	if (!p) return [e.x0, e.x1]
	let lo = Number.POSITIVE_INFINITY
	let hi = Number.NEGATIVE_INFINITY
	for (let i = 0; i < p.length; i++) {
		const [xa, ya] = p[i]
		const [xb, yb] = p[(i + 1) % p.length]
		if (ya >= top && ya <= bottom) {
			lo = Math.min(lo, xa)
			hi = Math.max(hi, xa)
		}
		for (const y of [top, bottom]) {
			if ((ya - y) * (yb - y) < 0) {
				const x = xa + ((xb - xa) * (y - ya)) / (yb - ya)
				lo = Math.min(lo, x)
				hi = Math.max(hi, x)
			}
		}
	}
	if (lo > hi) return [e.x0, e.x1]
	return [Math.floor(lo), Math.ceil(hi)]
}

/**
 * Free intervals of `col` across the band [top, bottom), left to right, each at least `min` wide;
 * `[]` when a `tb` exclusion crosses the band.
 */
export function freeSpans(col: Box, ex: Exclusion[], top: Fx, bottom: Fx, min: Fx = 0): Span[] {
	const cut: [Fx, Fx][] = []
	for (const e of ex) {
		if (!hits(col, e, top, bottom)) continue
		if (e.tb) return []
		cut.push(extent(e, top, bottom))
	}
	cut.sort((p, q) => p[0] - q[0])
	const out: Span[] = []
	const end = col.x + col.w
	let x = col.x
	for (const [a, b] of cut) {
		if (x >= end) break
		if (a > x) out.push({ x, w: Math.min(a, end) - x })
		if (b > x) x = b
	}
	if (end > x) out.push({ x, w: end - x })
	return out.filter((s) => s.w >= min)
}

/**
 * Widest free interval of `col` across the band [top, bottom), leftmost on a tie; `w` is 0 when
 * a `tb` exclusion crosses the band or `box` exclusions cover all of it.
 */
export function freeSpan(col: Box, ex: Exclusion[], top: Fx, bottom: Fx): Span {
	let best: Span = { x: col.x, w: 0 }
	for (const s of freeSpans(col, ex, top, bottom)) {
		if (s.w > best.w) best = s
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
	// ponytail: a polygon (tb too: it blocks only where its outline crosses the column) is passed
	// in steps of max(1 pt, band/4, column height/128), at most that much extra gap above the text
	// resuming beside it, so a call takes ≤ ~128 steps plus one jump per box; step to the polygon's
	// vertex y breakpoints if the gap shows. A box jumps to its y1.
	const step = Math.max(FX, Math.ceil(band / 4), Math.ceil(col.h / 128))
	while (top < bottom) {
		if (freeSpan(col, ex, top, top + band).w >= need) return top
		let nt = bottom
		for (const e of ex) {
			if (!hits(col, e, top, top + band)) continue
			if (e.pts) {
				const s = top + step
				nt = Math.min(nt, e.y1, s > top ? s : e.y1)
			} else nt = Math.min(nt, e.y1)
		}
		if (nt <= top) return bottom
		top = nt
	}
	return Math.max(top, bottom)
}
