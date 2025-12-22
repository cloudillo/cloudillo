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
 * Polygon Detector for Smart Ink
 *
 * Detects if a freehand stroke is a polygon (triangle, pentagon, hexagon, etc.)
 * Uses corner detection and side straightness validation.
 */

import {
	distance,
	detectCorners,
	perpendicularDistance,
	isClosedPath,
	mean,
	type Point
} from '../../utils/geometry.js'

export interface PolygonCandidate {
	type: 'polygon'
	vertices: Point[] // The detected vertices
	vertexCount: number // Number of vertices (3 = triangle, 5 = pentagon, etc.)
	confidence: number // 0-1
	originalPoints: Point[]
}

// Detection thresholds
const MIN_POINTS = 6 // Minimum points for polygon detection
const MIN_VERTICES = 3 // Minimum vertices (triangle)
const MAX_VERTICES = 8 // Maximum vertices to detect
const CORNER_MIN_ANGLE = 45 // Minimum turn angle to detect a corner
const MIN_SIDE_LENGTH = 15 // Minimum side length in pixels
const MAX_SIDE_DEVIATION = 0.08 // Max deviation from straight side (8% of length)
const MIN_CONFIDENCE = 0.5 // Minimum confidence for auto-detection
const HIGH_CONFIDENCE = 0.65 // High confidence threshold

// Debug flag
const DEBUG_POLYGON = true

/**
 * Detect if a stroke is a polygon (triangle, pentagon, hexagon, etc.)
 * Note: Rectangles (4 corners with 90° angles) are handled by rectangle-detector
 *
 * Algorithm:
 * 1. Check if path is closed
 * 2. Detect corners
 * 3. Validate vertex count (3, 5, 6, 7, 8 - skip 4 as rectangles)
 * 4. Validate each side is relatively straight
 * 5. Calculate confidence from side straightness
 */
export function detectPolygon(points: Point[]): PolygonCandidate | null {
	if (points.length < MIN_POINTS) {
		if (DEBUG_POLYGON) console.log('  [Polygon] REJECT: too few points', points.length)
		return null
	}

	// Must be a closed path
	if (!isClosedPath(points, 30)) {
		if (DEBUG_POLYGON) console.log('  [Polygon] REJECT: path not closed')
		return null
	}

	// Detect corners with appropriate sensitivity
	// Cap window size to avoid over-smoothing
	const windowSize = Math.min(6, Math.max(2, Math.floor(points.length / 30)))
	if (DEBUG_POLYGON)
		console.log('  [Polygon] windowSize:', windowSize, 'minAngle:', CORNER_MIN_ANGLE)

	const cornerIndices = detectCorners(points, {
		minAngle: CORNER_MIN_ANGLE,
		windowSize,
		closed: true // Enable wrap-around for closed polygon paths
	})

	// Must have valid vertex count (skip 4 - handled by rectangle detector)
	const vertexCount = cornerIndices.length
	if (DEBUG_POLYGON) console.log('  [Polygon] vertices detected:', vertexCount, 'valid: 3, 5-8')

	if (vertexCount < MIN_VERTICES || vertexCount > MAX_VERTICES || vertexCount === 4) {
		if (DEBUG_POLYGON) console.log('  [Polygon] REJECT: invalid vertex count')
		return null
	}

	// Extract vertices
	const vertices = cornerIndices.map((i) => points[i])

	// Validate minimum side lengths
	const sideLengths: number[] = []
	for (let i = 0; i < vertexCount; i++) {
		const length = distance(vertices[i], vertices[(i + 1) % vertexCount])
		if (length < MIN_SIDE_LENGTH) return null
		sideLengths.push(length)
	}

	// Validate that each side is relatively straight
	const sideDeviations: number[] = []
	let prevIdx = 0
	for (let i = 0; i < vertexCount; i++) {
		const startIdx = cornerIndices[i]
		const endIdx = cornerIndices[(i + 1) % vertexCount]
		const start = vertices[i]
		const end = vertices[(i + 1) % vertexCount]
		const sideLength = sideLengths[i]

		// Get points between these corners
		const sidePoints = getSidePoints(points, startIdx, endIdx)

		// Calculate max deviation from the straight line
		let maxDeviation = 0
		for (const point of sidePoints) {
			const dev = perpendicularDistance(point, start, end)
			maxDeviation = Math.max(maxDeviation, dev)
		}

		const relativeDeviation = maxDeviation / sideLength
		if (relativeDeviation > MAX_SIDE_DEVIATION * 2) {
			// Side is too curved
			return null
		}
		sideDeviations.push(relativeDeviation)
	}

	// Calculate confidence based on side straightness
	const avgDeviation = mean(sideDeviations)
	const confidence = calculateConfidence(avgDeviation, sideLengths, vertexCount)

	return {
		type: 'polygon',
		vertices,
		vertexCount,
		confidence,
		originalPoints: points
	}
}

/**
 * Check if a polygon candidate meets the auto-detection threshold
 */
export function isConfidentPolygon(candidate: PolygonCandidate | null): boolean {
	return candidate !== null && candidate.confidence >= HIGH_CONFIDENCE
}

/**
 * Get points between two indices in a circular array
 */
function getSidePoints(points: Point[], startIdx: number, endIdx: number): Point[] {
	const result: Point[] = []
	const n = points.length

	let i = (startIdx + 1) % n
	while (i !== endIdx) {
		result.push(points[i])
		i = (i + 1) % n
	}

	return result
}

/**
 * Calculate confidence score based on polygon quality
 */
function calculateConfidence(
	avgDeviation: number,
	sideLengths: number[],
	vertexCount: number
): number {
	// Straightness score (lower deviation = better)
	const straightnessScore = 1 - avgDeviation / MAX_SIDE_DEVIATION

	// Side length consistency (all sides should be similar for regular polygons)
	const avgLength = mean(sideLengths)
	const lengthRatios = sideLengths.map((l) => Math.min(l, avgLength) / Math.max(l, avgLength))
	const consistencyScore = mean(lengthRatios)

	// Vertex count bonus (triangles are more common/expected)
	let vertexBonus = 0
	if (vertexCount === 3) vertexBonus = 0.1 // Triangle bonus
	if (vertexCount === 5 || vertexCount === 6) vertexBonus = 0.05 // Pentagon/hexagon

	// Size score
	const sizeScore = Math.min(avgLength / 40, 1)

	// Combined score
	return Math.max(
		0,
		Math.min(
			1,
			straightnessScore * 0.45 + consistencyScore * 0.25 + sizeScore * 0.2 + vertexBonus
		)
	)
}

/**
 * Generate points along a polygon for morph animation
 */
export function generatePolygonPoints(candidate: PolygonCandidate, numPoints: number): Point[] {
	const { vertices } = candidate
	const vertexCount = vertices.length
	const points: Point[] = []

	// Calculate side lengths and perimeter
	const sideLengths: number[] = []
	for (let i = 0; i < vertexCount; i++) {
		sideLengths.push(distance(vertices[i], vertices[(i + 1) % vertexCount]))
	}
	const perimeter = sideLengths.reduce((a, b) => a + b, 0)

	// Distribute points evenly along the perimeter
	let pointsRemaining = numPoints

	for (let side = 0; side < vertexCount && pointsRemaining > 0; side++) {
		const start = vertices[side]
		const end = vertices[(side + 1) % vertexCount]
		const sideLength = sideLengths[side]

		// How many points on this side
		const pointsOnSide =
			side === vertexCount - 1
				? pointsRemaining
				: Math.round((sideLength / perimeter) * numPoints)

		for (let i = 0; i < pointsOnSide; i++) {
			const t = i / pointsOnSide
			points.push([start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t])
		}

		pointsRemaining -= pointsOnSide
	}

	return points
}

// vim: ts=4
