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
 * Line Detector for Smart Ink
 *
 * Detects if a freehand stroke is approximately a straight line
 * using perpendicular distance analysis.
 */

import { distance, perpendicularDistance, type Point } from '../../utils/geometry.js'

export interface LineCandidate {
	type: 'line'
	start: Point
	end: Point
	confidence: number // 0-1, higher = better match
	maxDeviation: number // max perpendicular distance in pixels
	originalPoints: Point[] // for undo/animation
}

// Detection thresholds
const MIN_LINE_LENGTH = 20 // Minimum line length in pixels
const MAX_DEVIATION_PERCENT = 0.03 // 3% of line length
const MIN_DEVIATION_PX = 8 // Minimum absolute threshold in pixels
const MIN_CONFIDENCE = 0.5 // Minimum confidence for auto-detection

/**
 * Detect if a stroke is a straight line
 *
 * Uses perpendicular distance from each point to the start-end line.
 * If max deviation is within threshold, it's a line.
 */
export function detectLine(points: Point[]): LineCandidate | null {
	if (points.length < 2) return null

	const start = points[0]
	const end = points[points.length - 1]
	const lineLength = distance(start, end)

	// Too short to be a meaningful line
	if (lineLength < MIN_LINE_LENGTH) return null

	// Calculate max perpendicular distance from any point
	let maxDeviation = 0
	for (const point of points) {
		const deviation = perpendicularDistance(point, start, end)
		maxDeviation = Math.max(maxDeviation, deviation)
	}

	// Dynamic threshold: 3% of line length, but at least 8px
	const threshold = Math.max(MIN_DEVIATION_PX, lineLength * MAX_DEVIATION_PERCENT)

	if (maxDeviation < threshold) {
		// Calculate confidence: 1 when maxDeviation is 0, decreasing toward threshold
		const confidence = 1 - maxDeviation / threshold

		return {
			type: 'line',
			start,
			end,
			confidence,
			maxDeviation,
			originalPoints: points
		}
	}

	return null
}

/**
 * Check if a line candidate meets the auto-detection threshold
 */
export function isConfidentLine(candidate: LineCandidate | null): boolean {
	return candidate !== null && candidate.confidence >= MIN_CONFIDENCE
}

/**
 * Generate interpolated points along a straight line
 * Used for morph animation from freehand to straight line
 */
export function generateLinePoints(start: Point, end: Point, numPoints: number): Point[] {
	if (numPoints < 2) return [start, end]

	const points: Point[] = []
	for (let i = 0; i < numPoints; i++) {
		const t = i / (numPoints - 1)
		points.push([start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t])
	}
	return points
}

// vim: ts=4
