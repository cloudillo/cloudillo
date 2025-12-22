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
 * Path Interpolation for Smart Ink
 *
 * Provides functions for interpolating between two paths,
 * used for morph animations when a shape is detected.
 */

import type { Point } from '../../utils/geometry.js'

/**
 * Resample a path to a specific number of points
 *
 * Uses linear interpolation along the path to create evenly-spaced points.
 * This is necessary for path morphing when source and target have different point counts.
 */
export function resamplePath(points: Point[], targetCount: number): Point[] {
	if (points.length < 2) return points
	if (targetCount < 2) return [points[0], points[points.length - 1]]

	// Calculate total path length
	let totalLength = 0
	const segmentLengths: number[] = [0] // Cumulative lengths
	for (let i = 1; i < points.length; i++) {
		const dx = points[i][0] - points[i - 1][0]
		const dy = points[i][1] - points[i - 1][1]
		totalLength += Math.sqrt(dx * dx + dy * dy)
		segmentLengths.push(totalLength)
	}

	if (totalLength === 0) {
		// All points are the same, return copies
		return Array(targetCount).fill(points[0])
	}

	// Sample at regular intervals
	const result: Point[] = []
	const interval = totalLength / (targetCount - 1)

	for (let i = 0; i < targetCount; i++) {
		const targetDist = i * interval

		// Find the segment containing this distance
		let segIdx = 0
		while (segIdx < segmentLengths.length - 1 && segmentLengths[segIdx + 1] < targetDist) {
			segIdx++
		}

		if (segIdx >= points.length - 1) {
			result.push(points[points.length - 1])
			continue
		}

		// Interpolate within the segment
		const segStart = segmentLengths[segIdx]
		const segEnd = segmentLengths[segIdx + 1]
		const segLength = segEnd - segStart

		const t = segLength > 0 ? (targetDist - segStart) / segLength : 0
		const p0 = points[segIdx]
		const p1 = points[segIdx + 1]

		result.push([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t])
	}

	return result
}

/**
 * Interpolate between two paths
 *
 * @param from - Source path points
 * @param to - Target path points
 * @param t - Interpolation factor (0 = from, 1 = to)
 * @returns Interpolated path
 */
export function interpolatePaths(from: Point[], to: Point[], t: number): Point[] {
	// Use the larger point count for smoother animation
	const targetCount = Math.max(from.length, to.length)

	// Resample both paths to same point count
	const fromResampled = from.length === targetCount ? from : resamplePath(from, targetCount)
	const toResampled = to.length === targetCount ? to : resamplePath(to, targetCount)

	// Linear interpolation between corresponding points
	const result: Point[] = []
	for (let i = 0; i < targetCount; i++) {
		const p0 = fromResampled[i]
		const p1 = toResampled[i]
		result.push([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t])
	}

	return result
}

/**
 * Easing function: ease-out (fast start, slow end)
 * f(t) = 1 - (1 - t)^2
 */
export function easeOut(t: number): number {
	return 1 - Math.pow(1 - t, 2)
}

/**
 * Easing function: ease-in-out
 * f(t) = t^2 * (3 - 2t)
 */
export function easeInOut(t: number): number {
	return t * t * (3 - 2 * t)
}

// vim: ts=4
