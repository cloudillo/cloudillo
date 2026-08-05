// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `getCornerPoints`' fallback accounting — the signal `detectDocumentDetailed`
 * gates on. Two or more corners falling back to "farthest point regardless of the
 * edge margin" means the contour is really the image border, so the pass reports
 * 'no-corners' and drops the quad: `detectDocument` (the 5fps preview wrapper)
 * reports `quad` alone and never looks at `source`, so a quad left there would
 * seed the capture pass as if it had been detected.
 *
 * The gate itself cannot be exercised from here — `detectDocumentDetailed` needs
 * OpenCV and a real canvas — so this covers the input it keys on.
 */

import { jest } from '@jest/globals'

import { getCornerPoints } from '../detect-document.js'

type Contour = Parameters<typeof getCornerPoints>[0]

const W = 100
const H = 100

/** A contour of x,y pairs, in the `data32S` layout OpenCV hands over. */
function contourOf(points: [number, number][]): Contour {
	return { data32S: Int32Array.from(points.flat()) } as unknown as Contour
}

beforeEach(() => {
	// The only OpenCV call in `getCornerPoints`. Partitioning is relative to the
	// rect centre, so the frame centre keeps one point per quadrant.
	;(globalThis as unknown as { cv: unknown }).cv = {
		minAreaRect: () => ({ center: { x: W / 2, y: H / 2 } })
	}
})

afterEach(() => {
	jest.restoreAllMocks()
})

describe('getCornerPoints', () => {
	it('counts no fallbacks when every corner sits inland', () => {
		const picked = getCornerPoints(
			contourOf([
				[10, 10],
				[90, 10],
				[10, 90],
				[90, 90]
			]),
			W,
			H
		)

		expect(picked).not.toBeNull()
		expect(picked?.fallbackCount).toBe(0)
		expect(picked?.corners.topLeftCorner).toEqual({ x: 10, y: 10 })
		expect(picked?.corners.bottomRightCorner).toEqual({ x: 90, y: 90 })
	})

	it('reports fallbackCount >= 2 for a contour pinned to the image border', () => {
		// The two top corners have nothing but border points to choose from — a
		// full-frame quad wearing a detection's clothes.
		const picked = getCornerPoints(
			contourOf([
				[0, 0],
				[99, 0],
				[10, 60],
				[60, 60]
			]),
			W,
			H
		)

		expect(picked).not.toBeNull()
		expect(picked?.fallbackCount).toBeGreaterThanOrEqual(2)
	})
})

// vim: ts=4
