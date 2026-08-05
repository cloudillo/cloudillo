// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { CropPoints } from '../types.js'
import {
	fitLineTLS,
	type GrayImage,
	intersectLines,
	lerpQuad,
	parabolaPeak,
	quadDistance,
	refineQuad,
	sampleBilinear
} from '../utils/refine-quad.js'

// Synthetic image helpers

function makeImage(width: number, height: number, fill: number): GrayImage {
	const data = new Uint8ClampedArray(width * height)
	data.fill(fill)
	return { data, width, height }
}

type Pt = { x: number; y: number }

/** Even-odd fill of a polygon, evaluated at pixel centres. */
function insidePolygon(poly: Pt[], x: number, y: number): boolean {
	let inside = false
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const a = poly[i]
		const b = poly[j]
		if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
			inside = !inside
		}
	}
	return inside
}

const SUBSAMPLES = 8

/**
 * Anti-aliased polygon fill. Pixel (x,y) is the sample at coordinate (x,y) — the same
 * convention sampleBilinear uses — and covers the square [x-0.5,x+0.5] x [y-0.5,y+0.5].
 * Area coverage is what puts the gradient peak exactly on the geometric edge, so the
 * ground truth stays sub-pixel exact instead of being quantized to whole pixels.
 */
function paintPolygon(img: GrayImage, poly: Pt[], value: number): void {
	const background = img.data[0]
	for (let y = 0; y < img.height; y++) {
		for (let x = 0; x < img.width; x++) {
			// Fast path: a pixel whose four corners agree is fully in or fully out
			const c = insidePolygon(poly, x - 0.5, y - 0.5)
			let uniform = true
			for (const [dx, dy] of [
				[0.5, -0.5],
				[-0.5, 0.5],
				[0.5, 0.5]
			]) {
				if (insidePolygon(poly, x + dx, y + dy) !== c) {
					uniform = false
					break
				}
			}

			let coverage: number
			if (uniform) {
				coverage = c ? 1 : 0
			} else {
				let hits = 0
				for (let sy = 0; sy < SUBSAMPLES; sy++) {
					for (let sx = 0; sx < SUBSAMPLES; sx++) {
						const px = x - 0.5 + (sx + 0.5) / SUBSAMPLES
						const py = y - 0.5 + (sy + 0.5) / SUBSAMPLES
						if (insidePolygon(poly, px, py)) hits++
					}
				}
				coverage = hits / (SUBSAMPLES * SUBSAMPLES)
			}
			if (coverage > 0) {
				img.data[y * img.width + x] = background + coverage * (value - background)
			}
		}
	}
}

function paintRect(img: GrayImage, x0: number, y0: number, x1: number, y1: number, v: number) {
	for (let y = Math.max(0, Math.round(y0)); y < Math.min(img.height, Math.round(y1)); y++) {
		for (let x = Math.max(0, Math.round(x0)); x < Math.min(img.width, Math.round(x1)); x++) {
			img.data[y * img.width + x] = v
		}
	}
}

/** 3x3 box blur — approximates the softness of a real (JPEG, lens) edge. */
function boxBlur(img: GrayImage): GrayImage {
	const out = new Uint8ClampedArray(img.data.length)
	for (let y = 0; y < img.height; y++) {
		for (let x = 0; x < img.width; x++) {
			let sum = 0
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					const sx = Math.min(img.width - 1, Math.max(0, x + dx))
					const sy = Math.min(img.height - 1, Math.max(0, y + dy))
					sum += img.data[sy * img.width + sx]
				}
			}
			out[y * img.width + x] = sum / 9
		}
	}
	return { data: out, width: img.width, height: img.height }
}

function rotated(corners: Pt[], degrees: number, cx: number, cy: number): Pt[] {
	const r = (degrees * Math.PI) / 180
	const cos = Math.cos(r)
	const sin = Math.sin(r)
	return corners.map((p) => ({
		x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
		y: cy + (p.x - cx) * sin + (p.y - cy) * cos
	}))
}

function toQuad(pts: Pt[], w: number, h: number): CropPoints {
	const n = (p: Pt): [number, number] => [p.x / w, p.y / h]
	return [n(pts[0]), n(pts[1]), n(pts[2]), n(pts[3])]
}

/** Fixed pseudo-random unit directions — deterministic, no PRNG seeding needed. */
const OFFSET_DIRS: Pt[] = [
	{ x: -0.78, y: -0.63 },
	{ x: 0.92, y: -0.39 },
	{ x: 0.44, y: 0.9 },
	{ x: -0.6, y: 0.8 }
]

function offsetSeed(truth: Pt[], distance: number, w: number, h: number): CropPoints {
	return toQuad(
		truth.map((p, i) => ({
			x: p.x + OFFSET_DIRS[i].x * distance,
			y: p.y + OFFSET_DIRS[i].y * distance
		})),
		w,
		h
	)
}

function cornerErrors(quad: CropPoints, truth: Pt[], w: number, h: number): number[] {
	return quad.map((c, i) => Math.hypot(c[0] * w - truth[i].x, c[1] * h - truth[i].y))
}

describe('sampleBilinear', () => {
	// 2x2 ramp: (0,0)=0 (1,0)=100 (0,1)=200 (1,1)=300→clamped to 255 by Uint8ClampedArray
	const ramp: GrayImage = {
		data: Uint8ClampedArray.from([0, 100, 200, 255]),
		width: 2,
		height: 2
	}

	it('returns exact values at integer coordinates', () => {
		expect(sampleBilinear(ramp, 0, 0)).toBe(0)
		expect(sampleBilinear(ramp, 1, 0)).toBe(100)
		expect(sampleBilinear(ramp, 0, 1)).toBe(200)
		expect(sampleBilinear(ramp, 1, 1)).toBe(255)
	})

	it('interpolates bilinearly', () => {
		expect(sampleBilinear(ramp, 0.5, 0)).toBeCloseTo(50, 6)
		expect(sampleBilinear(ramp, 0, 0.5)).toBeCloseTo(100, 6)
		// top = 0 + 100*0.25 = 25; bottom = 200 + 55*0.25 = 213.75; 25 + 188.75*0.75
		expect(sampleBilinear(ramp, 0.25, 0.75)).toBeCloseTo(25 + (213.75 - 25) * 0.75, 6)
	})

	it('clamps to the border outside the image', () => {
		expect(sampleBilinear(ramp, -5, -5)).toBe(0)
		expect(sampleBilinear(ramp, 99, 99)).toBe(255)
		expect(sampleBilinear(ramp, -3, 1)).toBe(200)
	})

	it('returns 0 for non-finite coordinates', () => {
		expect(sampleBilinear(ramp, Number.NaN, 0)).toBe(0)
		expect(sampleBilinear(ramp, 0, Number.POSITIVE_INFINITY)).toBe(0)
	})
})

describe('parabolaPeak', () => {
	it('shifts toward the larger neighbour', () => {
		expect(parabolaPeak(1, 3, 2)).toBeCloseTo(1 / 6, 10)
		expect(parabolaPeak(2, 3, 1)).toBeCloseTo(-1 / 6, 10)
	})

	it('returns 0 for a symmetric peak', () => {
		expect(parabolaPeak(1, 3, 1)).toBeCloseTo(0, 12)
	})

	it('returns 0 when the triple is not strictly concave', () => {
		expect(parabolaPeak(1, 1, 1)).toBe(0)
		expect(parabolaPeak(3, 1, 3)).toBe(0)
		expect(parabolaPeak(1, 2, 3)).toBe(0)
	})

	it('clamps to +-0.5', () => {
		// d2 = -1e-6 - 2*0 + 0 → barely concave with a huge asymmetry
		const delta = parabolaPeak(100, 100.000001, 0)
		expect(delta).toBeLessThanOrEqual(0.5)
		expect(delta).toBeGreaterThanOrEqual(-0.5)
	})
})

describe('fitLineTLS', () => {
	function residual(line: { a: number; b: number; c: number }, p: Pt): number {
		return line.a * p.x + line.b * p.y - line.c
	}

	it('fits a perfectly vertical line (where a slope fit would blow up)', () => {
		const pts = [
			{ x: 7, y: 0 },
			{ x: 7, y: 1 },
			{ x: 7, y: 2 },
			{ x: 7, y: 50 }
		]
		const line = fitLineTLS(pts)
		expect(line).not.toBeNull()
		for (const p of pts) expect(Math.abs(residual(line!, p))).toBeLessThan(1e-9)
		expect(Math.abs(line!.b)).toBeLessThan(1e-9)
	})

	it('fits a horizontal line', () => {
		const pts = [
			{ x: 0, y: 4 },
			{ x: 10, y: 4 },
			{ x: 25, y: 4 }
		]
		const line = fitLineTLS(pts)
		expect(line).not.toBeNull()
		for (const p of pts) expect(Math.abs(residual(line!, p))).toBeLessThan(1e-9)
		expect(Math.abs(line!.a)).toBeLessThan(1e-9)
	})

	it('fits a diagonal line', () => {
		const pts = [
			{ x: 0, y: 0 },
			{ x: 3, y: 3 },
			{ x: 9, y: 9 }
		]
		const line = fitLineTLS(pts)
		expect(line).not.toBeNull()
		for (const p of pts) expect(Math.abs(residual(line!, p))).toBeLessThan(1e-9)
	})

	it('has unit normals', () => {
		const line = fitLineTLS([
			{ x: 1, y: 2 },
			{ x: 4, y: 9 },
			{ x: 7, y: 16 }
		])
		expect(line!.a ** 2 + line!.b ** 2).toBeCloseTo(1, 12)
	})

	it('returns null for coincident or insufficient points', () => {
		expect(
			fitLineTLS([
				{ x: 3, y: 3 },
				{ x: 3, y: 3 },
				{ x: 3, y: 3 }
			])
		).toBeNull()
		expect(fitLineTLS([{ x: 0, y: 0 }])).toBeNull()
		expect(fitLineTLS([])).toBeNull()
	})
})

describe('intersectLines', () => {
	function lineAt(degrees: number, through: Pt) {
		const r = (degrees * Math.PI) / 180
		const a = -Math.sin(r)
		const b = Math.cos(r)
		return { a, b, c: a * through.x + b * through.y }
	}

	it('intersects two perpendicular lines', () => {
		const x5 = { a: 1, b: 0, c: 5 } // x = 5
		const y9 = { a: 0, b: 1, c: 9 } // y = 9
		const hit = intersectLines(x5, y9)
		expect(hit).not.toBeNull()
		expect(hit!.x).toBeCloseTo(5, 10)
		expect(hit!.y).toBeCloseTo(9, 10)
	})

	it('rejects lines within 15 degrees of parallel', () => {
		const l1 = lineAt(0, { x: 0, y: 0 })
		const l2 = lineAt(5, { x: 0, y: 3 })
		expect(intersectLines(l1, l2)).toBeNull()
	})

	it('accepts lines 20 degrees apart', () => {
		const l1 = lineAt(0, { x: 0, y: 0 })
		const l2 = lineAt(20, { x: 0, y: 0 })
		const hit = intersectLines(l1, l2)
		expect(hit).not.toBeNull()
		expect(hit!.x).toBeCloseTo(0, 8)
		expect(hit!.y).toBeCloseTo(0, 8)
	})

	it('rejects identical lines', () => {
		const l = lineAt(30, { x: 2, y: 2 })
		expect(intersectLines(l, { ...l })).toBeNull()
	})
})

describe('quadDistance / lerpQuad', () => {
	const a: CropPoints = [
		[0, 0],
		[1, 0],
		[1, 1],
		[0, 1]
	]

	it('computes mean and max corner distance', () => {
		const b: CropPoints = [
			[0.3, 0.4], // 0.5
			[1, 0], // 0
			[1, 1], // 0
			[0, 0.9] // 0.1
		]
		const d = quadDistance(a, b)
		expect(d.max).toBeCloseTo(0.5, 10)
		expect(d.mean).toBeCloseTo(0.6 / 4, 10)
	})

	it('is zero for identical quads', () => {
		expect(quadDistance(a, a)).toEqual({ mean: 0, max: 0 })
	})

	it('lerps componentwise', () => {
		const b: CropPoints = [
			[0.2, 0.4],
			[0.6, 0.2],
			[0.5, 0.5],
			[0.1, 0.3]
		]
		expect(lerpQuad(a, b, 0)).toEqual(a)
		const end = lerpQuad(a, b, 1)
		for (let i = 0; i < 4; i++) {
			expect(end[i][0]).toBeCloseTo(b[i][0], 12)
			expect(end[i][1]).toBeCloseTo(b[i][1], 12)
		}
		const mid = lerpQuad(a, b, 0.5)
		expect(mid[0][0]).toBeCloseTo(0.1, 10)
		expect(mid[1][1]).toBeCloseTo(0.1, 10)
		expect(mid[2][0]).toBeCloseTo(0.75, 10)
		expect(mid[3][1]).toBeCloseTo(0.65, 10)
	})
})

describe('refineQuad', () => {
	const W = 400
	const H = 300

	/** Axis-aligned document with sub-pixel-precise corners. */
	const AXIS_TRUTH: Pt[] = [
		{ x: 60, y: 50 },
		{ x: 340, y: 50 },
		{ x: 340, y: 250 },
		{ x: 60, y: 250 }
	]

	function paperImage(truth: Pt[], paper = 255, background = 40): GrayImage {
		const img = makeImage(W, H, background)
		paintPolygon(img, truth, paper)
		return boxBlur(img)
	}

	it('recovers axis-aligned corners from a +6px offset seed', () => {
		const img = paperImage(AXIS_TRUTH)
		const seed = offsetSeed(AXIS_TRUTH, 6, W, H)
		const result = refineQuad(img, seed)

		expect(result.refinedEdges).toBe(4)
		for (const err of cornerErrors(result.quad, AXIS_TRUTH, W, H)) {
			expect(err).toBeLessThan(0.7)
		}
	})

	it.each([15, 40])('recovers corners of a %d-degree rotated document', (degrees) => {
		const truth = rotated(
			[
				{ x: 110, y: 80 },
				{ x: 290, y: 80 },
				{ x: 290, y: 220 },
				{ x: 110, y: 220 }
			],
			degrees,
			200,
			150
		)
		const img = paperImage(truth)
		const seed = offsetSeed(truth, 6, W, H)
		const result = refineQuad(img, seed)

		expect(result.refinedEdges).toBe(4)
		for (const err of cornerErrors(result.quad, truth, W, H)) {
			expect(err).toBeLessThan(0.7)
		}
	})

	it('reports the largest accepted corner shift', () => {
		const img = paperImage(AXIS_TRUTH)
		const seed = offsetSeed(AXIS_TRUTH, 6, W, H)
		const result = refineQuad(img, seed)
		expect(result.maxShiftPx).toBeGreaterThan(4)
		expect(result.maxShiftPx).toBeLessThan(9)
	})

	it('refines an edge that is 35% occluded', () => {
		const img = makeImage(W, H, 40)
		paintPolygon(img, AXIS_TRUTH, 255)
		// Black out 35% of the top edge, spanning it symmetrically. The occluder reaches
		// the image border so it contributes no gradient of its own inside the band.
		paintRect(img, 151, 0, 249, 60, 0)
		const blurred = boxBlur(img)

		const seed = offsetSeed(AXIS_TRUTH, 6, W, H)
		const result = refineQuad(blurred, seed)

		expect(result.refinedEdges).toBe(4)
		const errors = cornerErrors(result.quad, AXIS_TRUTH, W, H)
		expect(errors[0]).toBeLessThan(0.7)
		expect(errors[1]).toBeLessThan(0.7)
	})

	it('keeps the seed edge line when an edge is 75% occluded', () => {
		const img = makeImage(W, H, 40)
		paintPolygon(img, AXIS_TRUTH, 255)
		// Black out 75% of the top edge — too few samples survive to fit it
		paintRect(img, 95, 0, 305, 60, 0)
		const blurred = boxBlur(img)

		const seed = offsetSeed(AXIS_TRUTH, 6, W, H)
		const result = refineQuad(blurred, seed)

		expect(result.refinedEdges).toBe(3)

		// The unfitted edge keeps its seed line, so corners 0 (TL) and 1 (TR) still slide
		// along it as their refined neighbours pull them — but never off it.
		const p0 = { x: seed[0][0] * W, y: seed[0][1] * H }
		const p1 = { x: seed[1][0] * W, y: seed[1][1] * H }
		const len = Math.hypot(p1.x - p0.x, p1.y - p0.y)
		const a = -(p1.y - p0.y) / len
		const b = (p1.x - p0.x) / len
		const c = a * p0.x + b * p0.y
		for (const i of [0, 1]) {
			const dist = Math.abs(a * result.quad[i][0] * W + b * result.quad[i][1] * H - c)
			expect(dist).toBeLessThan(1e-6)
		}

		// The other three edges are intact, so BR lands on the truth
		expect(cornerErrors(result.quad, AXIS_TRUTH, W, H)[2]).toBeLessThan(0.7)
	})

	it('returns the seed unchanged when contrast is below GRAD_MIN', () => {
		const img = makeImage(W, H, 122)
		paintPolygon(img, AXIS_TRUTH, 130)
		const blurred = boxBlur(img)

		const seed = offsetSeed(AXIS_TRUTH, 6, W, H)
		const result = refineQuad(blurred, seed)

		expect(result.refinedEdges).toBe(0)
		expect(result.quad).toEqual(seed)
		expect(result.maxShiftPx).toBe(0)
	})

	it('rejects samples with a competing parallel edge instead of fitting it', () => {
		// Desk 40, a glare band at 90% of the paper's contrast just outside the top edge,
		// then the paper. Both flanks of the glare compete with the paper edge.
		const img = makeImage(W, H, 40)
		paintRect(img, 60, 40, 340, 47, 233) // glare, rows 40..46
		paintRect(img, 60, 50, 340, 250, 255) // paper, rows 50..249
		const blurred = boxBlur(img)

		// Top edge seeded between the glare and the paper; the other three on the truth
		const seed = toQuad(
			[
				{ x: 59.5, y: 46 },
				{ x: 339.5, y: 46 },
				{ x: 339.5, y: 249.5 },
				{ x: 59.5, y: 249.5 }
			],
			W,
			H
		)
		const result = refineQuad(blurred, seed)

		// Every top sample is ambiguous, so the top edge keeps its seed line rather than
		// snapping onto the glare at y≈40 or the paper at y≈49.5.
		expect(result.refinedEdges).toBe(3)
		expect(result.quad[0][1] * H).toBeCloseTo(46, 6)
		expect(result.quad[1][1] * H).toBeCloseTo(46, 6)

		// The unambiguous side edges still refine onto the true boundary
		expect(result.quad[3][0] * W).toBeCloseTo(59.5, 1)
		expect(result.quad[2][0] * W).toBeCloseTo(339.5, 1)
	})

	it.each([
		[
			'zero-area quad',
			[
				[0.5, 0.5],
				[0.5, 0.5],
				[0.5, 0.5],
				[0.5, 0.5]
			] as CropPoints
		],
		[
			'two coincident corners',
			[
				[0.2, 0.2],
				[0.2, 0.2],
				[0.8, 0.8],
				[0.2, 0.8]
			] as CropPoints
		],
		[
			'quad entirely outside the image',
			[
				[3, 3],
				[4, 3],
				[4, 4],
				[3, 4]
			] as CropPoints
		],
		[
			'self-intersecting seed',
			[
				[0.2, 0.2],
				[0.8, 0.8],
				[0.8, 0.2],
				[0.2, 0.8]
			] as CropPoints
		]
	])('survives a degenerate seed: %s', (_name, seed) => {
		const img = paperImage(AXIS_TRUTH)
		const result = refineQuad(img, seed)

		expect(result.quad).toEqual(seed)
		for (const [x, y] of result.quad) {
			expect(Number.isFinite(x)).toBe(true)
			expect(Number.isFinite(y)).toBe(true)
		}
	})

	it('returns finite coordinates for every accepted refinement', () => {
		const img = paperImage(AXIS_TRUTH)
		const result = refineQuad(img, offsetSeed(AXIS_TRUTH, 6, W, H))
		for (const [x, y] of result.quad) {
			expect(Number.isFinite(x)).toBe(true)
			expect(Number.isFinite(y)).toBe(true)
			expect(x).toBeGreaterThanOrEqual(0)
			expect(x).toBeLessThanOrEqual(1)
			expect(y).toBeGreaterThanOrEqual(0)
			expect(y).toBeLessThanOrEqual(1)
		}
	})

	it('returns the seed for a degenerate image', () => {
		const seed = offsetSeed(AXIS_TRUTH, 6, W, H)
		expect(
			refineQuad({ data: new Uint8ClampedArray(0), width: 0, height: 0 }, seed).quad
		).toEqual(seed)
		expect(refineQuad(makeImage(1, 1, 128), seed).quad).toEqual(seed)
	})
})

// vim: ts=4
