// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Local corner refinement for a document quad: each edge of a rough seed quad is re-fitted
 * against the intensity gradient in a narrow band around it, and the corners recomputed as
 * the intersections of the fitted lines.
 *
 * Free of OpenCV, canvas and DOM on purpose — a plain luma buffer, so it is unit-testable
 * under node and has no Mat lifecycle hazards.
 *
 * All internal geometry is in PIXELS: normalized space is anisotropic (0.02 is 12.8px in x
 * but 9.6px in y at 640x480), so gradients and distances must not be computed there.
 */

import type { CropPoints } from '../types.js'

export interface GrayImage {
	data: Uint8ClampedArray // length === width * height, 0..255 luma
	width: number
	height: number
}

export interface RefineResult {
	quad: CropPoints
	refinedEdges: number // 0..4 — how many edges got a fitted line
	maxShiftPx: number // largest accepted corner displacement, for logging
}

/** a*x + b*y = c, with a² + b² = 1 (so residuals are already in pixels) */
export interface Line {
	a: number
	b: number
	c: number
}

interface Pt {
	x: number
	y: number
}

// Sample the middle 76% of each edge: excludes corner rounding, corner occlusion by
// fingers, and the region where the perpendicular band would cross the adjacent edge.
const T_MIN = 0.12
const T_MAX = 0.88

// Shorter than this and the whole edge sits inside the search band.
const MIN_EDGE_LEN_PX = 24

// Minimum gradient magnitude for a sample to count. Phone JPEG q0.92 noise reaches σ≈1.4-2.4
// after the 3-tap average and central difference, so 12 is roughly 5σ. A paper-on-white-desk
// shadow line still gives 15-30, paper-on-desk 60-150. Do not raise above 15.
const GRAD_MIN = 12

// A competing gradient peak this strong (relative to the best one) makes the sample
// ambiguous — typically a drop shadow parallel to the paper edge.
const AMBIGUITY_RATIO = 0.8

// MAD-based outlier rejection. The absolute floor is essential: on a near-collinear set
// MAD → 0, so σ̂ → 0, and without it every point would be rejected.
const OUTLIER_K = 3
const OUTLIER_FLOOR_PX = 1.5

// A real straight paper edge fits well under 1px; >2px means a curved page or a fit that
// wandered onto the wrong edge.
const RMS_MAX_PX = 2.0

// |det| of two unit normals is sin(angle between the lines); 0.26 ≈ sin 15°. Below that,
// positional error at the intersection is amplified more than 3.8x.
const PARALLEL_MIN = 0.26

// Refined quad must stay within this fraction of the seed's area (plus convexity and
// orientation match) or the whole refinement is discarded.
const AREA_MIN_RATIO = 0.7
const AREA_MAX_RATIO = 1.4

function clamp(v: number, lo: number, hi: number): number {
	return v < lo ? lo : v > hi ? hi : v
}

/** Half-width of the perpendicular search band, in pixels — scale-relative, 16 @1024. */
function bandHalf(maxDim: number): number {
	return clamp(Math.round(0.016 * maxDim), 8, 24)
}

/** Bilinear sample with clamped border addressing. */
export function sampleBilinear(img: GrayImage, x: number, y: number): number {
	const { data, width, height } = img
	if (width < 1 || height < 1) return 0
	if (!Number.isFinite(x) || !Number.isFinite(y)) return 0

	const cx = clamp(x, 0, width - 1)
	const cy = clamp(y, 0, height - 1)
	const x0 = Math.floor(cx)
	const y0 = Math.floor(cy)
	const x1 = Math.min(x0 + 1, width - 1)
	const y1 = Math.min(y0 + 1, height - 1)
	const fx = cx - x0
	const fy = cy - y0

	const v00 = data[y0 * width + x0]
	const v10 = data[y0 * width + x1]
	const v01 = data[y1 * width + x0]
	const v11 = data[y1 * width + x1]

	const top = v00 + (v10 - v00) * fx
	const bottom = v01 + (v11 - v01) * fx
	return top + (bottom - top) * fy
}

/**
 * Sub-sample offset of a gradient peak from three consecutive magnitudes.
 * Returns 0 when the triple is not strictly concave (no interpolable peak).
 */
export function parabolaPeak(mPrev: number, mCur: number, mNext: number): number {
	const d2 = mPrev - 2 * mCur + mNext
	if (!(d2 < -1e-6)) return 0
	const delta = (0.5 * (mPrev - mNext)) / d2
	if (!Number.isFinite(delta)) return 0
	return clamp(delta, -0.5, 0.5)
}

/**
 * Total least squares (orthogonal regression) line fit. Required rather than y = mx + b:
 * a document's left and right edges are near-vertical, where a slope fit blows up.
 */
export function fitLineTLS(pts: Pt[]): Line | null {
	const n = pts.length
	if (n < 2) return null

	let sx = 0
	let sy = 0
	for (const p of pts) {
		sx += p.x
		sy += p.y
	}
	const mx = sx / n
	const my = sy / n

	let sxx = 0
	let syy = 0
	let sxy = 0
	for (const p of pts) {
		const dx = p.x - mx
		const dy = p.y - my
		sxx += dx * dx
		syy += dy * dy
		sxy += dx * dy
	}
	if (sxx + syy < 1e-9) return null // degenerate: all points coincident

	const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy)
	const a = -Math.sin(theta)
	const b = Math.cos(theta)
	const c = a * mx + b * my
	if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return null
	return { a, b, c }
}

/** Intersection of two normalized lines, or null if they are within 15° of parallel. */
export function intersectLines(l1: Line, l2: Line): Pt | null {
	const det = l1.a * l2.b - l2.a * l1.b
	if (Math.abs(det) < PARALLEL_MIN) return null
	const x = (l1.c * l2.b - l2.c * l1.b) / det
	const y = (l1.a * l2.c - l2.a * l1.c) / det
	if (!Number.isFinite(x) || !Number.isFinite(y)) return null
	return { x, y }
}

// Preview-lock helpers below operate in NORMALIZED space, not pixels.

export function quadDistance(a: CropPoints, b: CropPoints): { mean: number; max: number } {
	let sum = 0
	let max = 0
	for (let i = 0; i < 4; i++) {
		const d = Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1])
		sum += d
		if (d > max) max = d
	}
	return { mean: sum / 4, max }
}

export function lerpQuad(a: CropPoints, b: CropPoints, t: number): CropPoints {
	const p = (i: number): [number, number] => [
		a[i][0] + t * (b[i][0] - a[i][0]),
		a[i][1] + t * (b[i][1] - a[i][1])
	]
	return [p(0), p(1), p(2), p(3)]
}

function lineThrough(p0: Pt, p1: Pt): Line | null {
	const dx = p1.x - p0.x
	const dy = p1.y - p0.y
	const len = Math.hypot(dx, dy)
	if (len < 1e-9) return null
	const a = -dy / len
	const b = dx / len
	return { a, b, c: a * p0.x + b * p0.y }
}

function median(values: number[]): number {
	const s = [...values].sort((x, y) => x - y)
	const mid = s.length >> 1
	return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Scan perpendicular to the edge at one sample position and return the sub-pixel
 * gradient peak, or null if the sample is too weak, ambiguous, or at the band boundary.
 */
function scanNormal(img: GrayImage, q: Pt, u: Pt, n: Pt, band: number): Pt | null {
	const span = 2 * band + 1

	// Pre-smooth ALONG the edge (3-tap box): the edge signal is coherent along u while
	// noise is not, which raises SNR by ~1.7x for free.
	const prof = new Float64Array(span)
	for (let s = -band; s <= band; s++) {
		const bx = q.x + s * n.x
		const by = q.y + s * n.y
		prof[s + band] =
			(sampleBilinear(img, bx - u.x, by - u.y) +
				sampleBilinear(img, bx, by) +
				sampleBilinear(img, bx + u.x, by + u.y)) /
			3
	}

	// Central difference along the normal; valid for s = -band+1 .. band-1.
	const mag = new Float64Array(span)
	for (let i = 1; i < span - 1; i++) mag[i] = Math.abs(prof[i + 1] - prof[i - 1])

	let best = -1
	let bestVal = 0
	for (let i = 1; i < span - 1; i++) {
		if (mag[i] > bestVal) {
			bestVal = mag[i]
			best = i
		}
	}
	if (best < 0 || bestVal < GRAD_MIN) return null

	// Peak at the edge of the valid range: the true edge is probably outside the band,
	// and there is no room for a parabola fit either way.
	if (best === 1 || best === span - 2) return null

	// A competing peak at least 3px away means we cannot tell which edge is the paper.
	for (let i = 1; i < span - 1; i++) {
		if (Math.abs(i - best) < 3) continue
		if (mag[i] >= mag[i - 1] && mag[i] >= mag[i + 1] && mag[i] > AMBIGUITY_RATIO * bestVal) {
			return null
		}
	}

	const sSub = best - band + parabolaPeak(mag[best - 1], mag[best], mag[best + 1])
	return { x: q.x + sSub * n.x, y: q.y + sSub * n.y }
}

/** Fit one edge; null means "keep the seed edge". */
function fitEdge(img: GrayImage, p0: Pt, p1: Pt, band: number): Line | null {
	const dx = p1.x - p0.x
	const dy = p1.y - p0.y
	const len = Math.hypot(dx, dy)
	if (!(len >= MIN_EDGE_LEN_PX)) return null

	const u: Pt = { x: dx / len, y: dy / len }
	const n: Pt = { x: -u.y, y: u.x }

	// >=10px spacing (closer samples are correlated anyway), capped for cost.
	const count = clamp(Math.round((len * (T_MAX - T_MIN)) / 10), 8, 24)
	const step = (T_MAX - T_MIN) / (count - 1)

	const pts: Pt[] = []
	for (let k = 0; k < count; k++) {
		const t = T_MIN + k * step
		const q: Pt = { x: p0.x + t * len * u.x, y: p0.y + t * len * u.y }
		const hit = scanNormal(img, q, u, n, band)
		if (hit) pts.push(hit)
	}

	// 40% lets a finger covering a third of the edge still refine; the absolute floor is
	// there because a 5-point TLS + MAD fit is not robust.
	const minSurvivors = Math.max(6, Math.ceil(0.4 * count))
	if (pts.length < minSurvivors) return null

	const first = fitLineTLS(pts)
	if (!first) return null

	// Exactly two passes: MAD rejection then one refit. Deterministic, unlike RANSAC (which
	// would need a seeded PRNG for stable tests) and better on a 1-D residual with >=60%
	// expected inliers.
	const res = pts.map((p) => first.a * p.x + first.b * p.y - first.c)
	const med = median(res)
	const sigma = 1.4826 * median(res.map((r) => Math.abs(r - med)))
	const threshold = Math.max(OUTLIER_K * sigma, OUTLIER_FLOOR_PX)
	const inliers = pts.filter((_, i) => Math.abs(res[i] - med) <= threshold)
	if (inliers.length < minSurvivors) return null

	const line = fitLineTLS(inliers)
	if (!line) return null

	let sumSq = 0
	for (const p of inliers) {
		const r = line.a * p.x + line.b * p.y - line.c
		sumSq += r * r
	}
	if (!(Math.sqrt(sumSq / inliers.length) <= RMS_MAX_PX)) return null

	return line
}

function signedArea(pts: Pt[]): number {
	let sum = 0
	for (let i = 0; i < pts.length; i++) {
		const p = pts[i]
		const q = pts[(i + 1) % pts.length]
		sum += p.x * q.y - q.x * p.y
	}
	return sum / 2
}

/** True when every consecutive-edge cross product has the given sign (convex, matching). */
function isConvexWithSign(pts: Pt[], sign: number): boolean {
	for (let i = 0; i < 4; i++) {
		const a = pts[i]
		const b = pts[(i + 1) % 4]
		const c = pts[(i + 2) % 4]
		const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
		if (cross === 0 || Math.sign(cross) !== sign) return false
	}
	return true
}

function isFiniteQuad(quad: CropPoints): boolean {
	for (const [x, y] of quad) {
		if (!Number.isFinite(x) || !Number.isFinite(y)) return false
	}
	return true
}

/**
 * Refine a seed quad against the image.
 *
 * Edges are `[TL,TR]`, `[TR,BR]`, `[BR,BL]`, `[BL,TL]`; corner j is the intersection of
 * edge (j+3)%4 and edge j. Any edge that cannot be fitted keeps its seed line, so a
 * partially occluded document still gets its visible edges sharpened. If the resulting
 * quad fails the convexity/orientation/area sanity gate the seed is returned untouched.
 */
export function refineQuad(img: GrayImage, seed: CropPoints): RefineResult {
	const fallback: RefineResult = { quad: seed, refinedEdges: 0, maxShiftPx: 0 }
	if (!img?.data || img.width < 2 || img.height < 2) return fallback
	if (img.data.length < img.width * img.height) return fallback
	if (!isFiniteQuad(seed)) return fallback

	const w = img.width
	const h = img.height
	const px: Pt[] = seed.map(([x, y]) => ({ x: x * w, y: y * h }))

	const seedArea = signedArea(px)
	const orient = Math.sign(seedArea)
	if (orient === 0) return fallback

	const band = bandHalf(Math.max(w, h))
	const maxCornerShift = 1.5 * band

	const lines: (Line | null)[] = []
	let refinedEdges = 0
	for (let i = 0; i < 4; i++) {
		const p0 = px[i]
		const p1 = px[(i + 1) % 4]
		const fitted = fitEdge(img, p0, p1, band)
		if (fitted) {
			lines.push(fitted)
			refinedEdges++
		} else {
			lines.push(lineThrough(p0, p1))
		}
	}
	if (refinedEdges === 0) return fallback

	const out: Pt[] = []
	let maxShiftPx = 0
	for (let j = 0; j < 4; j++) {
		const prev = lines[(j + 3) % 4]
		const cur = lines[j]
		let corner = px[j]
		if (prev && cur) {
			const hit = intersectLines(prev, cur)
			if (hit) {
				const shift = Math.hypot(hit.x - px[j].x, hit.y - px[j].y)
				if (shift <= maxCornerShift) {
					corner = hit
					if (shift > maxShiftPx) maxShiftPx = shift
				}
			}
		}
		out.push(corner)
	}

	for (const p of out) {
		if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return fallback
	}
	if (!isConvexWithSign(out, orient)) return fallback
	const area = Math.abs(signedArea(out))
	const seedAbs = Math.abs(seedArea)
	if (area < AREA_MIN_RATIO * seedAbs || area > AREA_MAX_RATIO * seedAbs) return fallback

	const norm = (p: Pt): [number, number] => [clamp(p.x / w, 0, 1), clamp(p.y / h, 0, 1)]
	return {
		quad: [norm(out[0]), norm(out[1]), norm(out[2]), norm(out[3])],
		refinedEdges,
		maxShiftPx
	}
}

// vim: ts=4
