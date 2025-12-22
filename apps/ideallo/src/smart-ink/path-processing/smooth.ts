// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Path Smoothing for Smart Ink
 *
 * Implements Chaikin's corner-cutting algorithm for smoothing freehand paths.
 * The algorithm iteratively cuts corners to produce smooth curves.
 */

import type { Point } from '../../utils/geometry.js'

/**
 * Chaikin's corner-cutting algorithm
 *
 * Smooths a path by replacing each segment with two new points
 * positioned at 25% and 75% along the segment. Multiple iterations
 * produce progressively smoother curves.
 *
 * @param points - Input path points
 * @param iterations - Number of smoothing iterations (1-4 typical)
 * @param keepEndpoints - Whether to keep first and last points fixed
 */
export function chaikinSmooth(
	points: Point[],
	iterations: number = 1,
	keepEndpoints: boolean = true
): Point[] {
	if (points.length < 3) return points

	let result = points

	for (let iter = 0; iter < iterations; iter++) {
		const smoothed: Point[] = []

		// Optionally keep the first endpoint
		if (keepEndpoints) {
			smoothed.push(result[0])
		}

		for (let i = 0; i < result.length - 1; i++) {
			const p0 = result[i]
			const p1 = result[i + 1]

			// Q = 3/4 * P0 + 1/4 * P1 (point closer to P0)
			const q: Point = [0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1]]

			// R = 1/4 * P0 + 3/4 * P1 (point closer to P1)
			const r: Point = [0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1]]

			// Skip first Q if keeping endpoints (to avoid near-duplicate)
			if (!keepEndpoints || i > 0) {
				smoothed.push(q)
			}
			// Skip last R if keeping endpoints (to avoid near-duplicate)
			if (!keepEndpoints || i < result.length - 2) {
				smoothed.push(r)
			}
		}

		// Optionally keep the last endpoint
		if (keepEndpoints) {
			smoothed.push(result[result.length - 1])
		}

		result = smoothed
	}

	return result
}

/**
 * Adaptive smoothing based on smoothing factor
 *
 * Higher factor = more smoothing (more iterations)
 * Factor maps to iterations: 0.0-0.3 = 0, 0.3-0.5 = 1, 0.5-0.7 = 2, 0.7-1.0 = 3
 *
 * @param points - Input path points
 * @param factor - Smoothing factor 0-1 (from getSmoothingFactor)
 */
export function adaptiveSmooth(points: Point[], factor: number): Point[] {
	// Map factor to iterations
	let iterations: number
	if (factor < 0.3) {
		iterations = 0
	} else if (factor < 0.5) {
		iterations = 1
	} else if (factor < 0.7) {
		iterations = 2
	} else {
		iterations = 3
	}

	if (iterations === 0) return points

	return chaikinSmooth(points, iterations, true)
}

// vim: ts=4
