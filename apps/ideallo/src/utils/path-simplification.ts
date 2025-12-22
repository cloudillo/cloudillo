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
 * Path simplification algorithms for freehand drawing
 */

import { distance, perpendicularDistance } from './geometry.js'

/**
 * Stream simplification for live broadcast
 * Distance-based sampling for real-time transmission
 * Uses sliding window to always show recent drawing activity
 *
 * Used during drawing to reduce points sent via awareness
 */
export function streamSimplify(
	points: [number, number][],
	minDistance: number = 8,
	maxPoints: number = 100
): [number, number][] {
	if (points.length <= 2) return [...points]

	// First pass: distance-based sampling
	const sampled: [number, number][] = [points[0]]
	let lastPoint = points[0]

	for (let i = 1; i < points.length - 1; i++) {
		const dist = distance(points[i], lastPoint)

		if (dist >= minDistance) {
			sampled.push(points[i])
			lastPoint = points[i]
		}
	}

	// Always include last point
	sampled.push(points[points.length - 1])

	// Second pass: if over limit, use sliding window (keep recent points)
	if (sampled.length > maxPoints) {
		return sampled.slice(sampled.length - maxPoints)
	}

	return sampled
}

/**
 * Ramer-Douglas-Peucker simplification for final storage
 * Reduces point count while preserving shape
 *
 * Used when committing stroke to CRDT
 */
export function rdpSimplify(
	points: [number, number][],
	tolerance: number = 1.5
): [number, number][] {
	if (points.length <= 2) return [...points]

	// Find point with max perpendicular distance
	const start = points[0]
	const end = points[points.length - 1]

	let maxDist = 0
	let maxIndex = 0

	for (let i = 1; i < points.length - 1; i++) {
		const dist = perpendicularDistance(points[i], start, end)
		if (dist > maxDist) {
			maxDist = dist
			maxIndex = i
		}
	}

	// If max distance is greater than tolerance, recursively simplify
	if (maxDist > tolerance) {
		const left = rdpSimplify(points.slice(0, maxIndex + 1), tolerance)
		const right = rdpSimplify(points.slice(maxIndex), tolerance)
		return [...left.slice(0, -1), ...right]
	} else {
		return [start, end]
	}
}

/**
 * Convert points array to SVG path data string
 */
export function pointsToSvgPath(points: [number, number][]): string {
	if (points.length === 0) return ''
	if (points.length === 1) {
		return `M ${points[0][0]} ${points[0][1]}`
	}

	let path = `M ${points[0][0]} ${points[0][1]}`
	for (let i = 1; i < points.length; i++) {
		path += ` L ${points[i][0]} ${points[i][1]}`
	}
	return path
}

/**
 * Convert points to a smooth quadratic bezier path
 * Creates smoother curves through control points
 */
export function pointsToSmoothPath(points: [number, number][]): string {
	if (points.length === 0) return ''
	if (points.length === 1) {
		return `M ${points[0][0]} ${points[0][1]}`
	}
	if (points.length === 2) {
		return `M ${points[0][0]} ${points[0][1]} L ${points[1][0]} ${points[1][1]}`
	}

	let path = `M ${points[0][0]} ${points[0][1]}`

	// Use quadratic bezier curves through midpoints
	for (let i = 1; i < points.length - 1; i++) {
		const xc = (points[i][0] + points[i + 1][0]) / 2
		const yc = (points[i][1] + points[i + 1][1]) / 2
		path += ` Q ${points[i][0]} ${points[i][1]} ${xc} ${yc}`
	}

	// Last point
	const last = points[points.length - 1]
	path += ` L ${last[0]} ${last[1]}`

	return path
}

/**
 * Convert flat array to points
 * Used for reading from CRDT stored format
 */
export function flatToPoints(flat: number[]): [number, number][] {
	const result: [number, number][] = []
	for (let i = 0; i < flat.length; i += 2) {
		result.push([flat[i], flat[i + 1]])
	}
	return result
}

/**
 * Convert points to flat array
 * Used for storing to CRDT format
 */
export function pointsToFlat(points: [number, number][]): number[] {
	const result: number[] = []
	for (const [x, y] of points) {
		result.push(x, y)
	}
	return result
}

// vim: ts=4
