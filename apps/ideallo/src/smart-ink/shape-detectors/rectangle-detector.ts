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
 * Rectangle/Diamond Detector for Smart Ink
 *
 * Detects if a freehand stroke is approximately a rectangle or diamond.
 * Uses corner detection and angle/parallel validation.
 * Diamonds are detected as rectangles with ~45° rotation.
 */

import {
	distance,
	detectCorners,
	directionChange,
	angleAtVertex,
	areParallel,
	isClosedPath,
	lineAngle,
	getBoundsFromPoints,
	type Point
} from '../../utils/geometry.js'
import type { Bounds } from '../../crdt/index.js'

export interface RectangleCandidate {
	type: 'rectangle'
	corners: [Point, Point, Point, Point]
	bounds: Bounds
	rotation: number // 0 for upright, ~45 for diamond
	isDiamond: boolean
	confidence: number // 0-1
	originalPoints: Point[]
}

// Detection thresholds
const MIN_POINTS = 8 // Minimum points for rectangle detection
const CORNER_MIN_ANGLE = 50 // Minimum turn angle to detect a corner (lowered from 60)
const RIGHT_ANGLE_TOLERANCE = 25 // How close to 90° each corner must be (relaxed from 20)
const PARALLEL_TOLERANCE = 25 // How parallel opposite sides must be (relaxed from 20)
const MIN_SIDE_LENGTH = 15 // Minimum side length in pixels
const MIN_CONFIDENCE = 0.5 // Minimum confidence for auto-detection
const HIGH_CONFIDENCE = 0.65 // High confidence threshold (lowered from 0.70)
const ROTATION_SNAP_ANGLE = 45 // Snap to multiples of this angle
const ROTATION_SNAP_THRESHOLD = 10 // Snap if within this many degrees

// Debug flag
const DEBUG_RECT = true

/**
 * Detect if a stroke is a rectangle or diamond
 *
 * Algorithm:
 * 1. Check if path is closed
 * 2. Detect corners (should find exactly 4)
 * 3. Validate corner angles (~90°)
 * 4. Validate opposite sides are parallel
 * 5. Determine if diamond orientation
 */
export function detectRectangle(points: Point[]): RectangleCandidate | null {
	if (points.length < MIN_POINTS) {
		if (DEBUG_RECT) console.log('  [Rect] REJECT: too few points', points.length)
		return null
	}

	// Must be a closed path
	if (!isClosedPath(points, 30)) {
		if (DEBUG_RECT) console.log('  [Rect] REJECT: path not closed')
		return null
	}

	// Detect corners with appropriate sensitivity
	// Cap window size to avoid over-smoothing
	const windowSize = Math.min(8, Math.max(3, Math.floor(points.length / 25)))
	if (DEBUG_RECT) console.log('  [Rect] windowSize:', windowSize, 'minAngle:', CORNER_MIN_ANGLE)

	const cornerIndices = detectCorners(points, {
		minAngle: CORNER_MIN_ANGLE,
		windowSize,
		closed: true // Enable wrap-around for closed rectangle paths
	})

	if (DEBUG_RECT) {
		console.log(
			'  [Rect] corners detected:',
			cornerIndices.length,
			'at indices:',
			cornerIndices,
			'need: 4'
		)
		// Show top direction changes for debugging
		const changes: { idx: number; change: number }[] = []
		for (let i = windowSize; i < points.length - windowSize; i++) {
			const change = directionChange(
				points[i - windowSize],
				points[i],
				points[i + windowSize]
			)
			changes.push({ idx: i, change })
		}
		changes.sort((a, b) => b.change - a.change)
		console.log(
			'  [Rect] top 6 changes:',
			changes.slice(0, 6).map((c) => `${c.idx}:${c.change.toFixed(1)}`)
		)
		console.log(
			'  [Rect] minSpacing would be:',
			Math.max(windowSize * 2, Math.floor(points.length / 12))
		)
	}

	// Must have exactly 4 corners
	if (cornerIndices.length !== 4) {
		if (DEBUG_RECT) console.log('  [Rect] REJECT: wrong corner count')
		return null
	}

	// Extract corner points
	const corners = cornerIndices.map((i) => points[i]) as [Point, Point, Point, Point]

	// Validate corner angles (should all be ~90°)
	const angles: number[] = []
	for (let i = 0; i < 4; i++) {
		const prev = corners[(i + 3) % 4]
		const curr = corners[i]
		const next = corners[(i + 1) % 4]
		angles.push(angleAtVertex(prev, curr, next))
	}

	// Check if angles are close to 90°
	const angleDeviations = angles.map((a) => Math.abs(90 - a))
	const maxAngleDeviation = Math.max(...angleDeviations)
	const avgAngleDeviation = angleDeviations.reduce((a, b) => a + b, 0) / 4

	if (
		maxAngleDeviation > RIGHT_ANGLE_TOLERANCE * 1.5 ||
		avgAngleDeviation > RIGHT_ANGLE_TOLERANCE
	) {
		return null
	}

	// Check if opposite sides are parallel
	const side0 = [corners[0], corners[1]] as const
	const side1 = [corners[1], corners[2]] as const
	const side2 = [corners[2], corners[3]] as const
	const side3 = [corners[3], corners[0]] as const

	const parallel02 = areParallel(side0[0], side0[1], side2[0], side2[1], PARALLEL_TOLERANCE)
	const parallel13 = areParallel(side1[0], side1[1], side3[0], side3[1], PARALLEL_TOLERANCE)

	if (!parallel02 || !parallel13) {
		return null
	}

	// Check minimum side lengths
	const sideLengths = [
		distance(corners[0], corners[1]),
		distance(corners[1], corners[2]),
		distance(corners[2], corners[3]),
		distance(corners[3], corners[0])
	]
	if (Math.min(...sideLengths) < MIN_SIDE_LENGTH) {
		return null
	}

	// Calculate rotation angle and snap to nearest 45° if close
	const { rotation, isDiamond } = calculateRotation(corners)

	if (DEBUG_RECT) console.log('  [Rect] rotation:', rotation.toFixed(1), 'isDiamond:', isDiamond)

	// Calculate bounds
	// For rotated rectangles, we need the actual rectangle dimensions, not the AA bounding box
	const bounds = calculateRectangleBounds(corners, sideLengths, rotation)

	// Calculate confidence
	const confidence = calculateConfidence(avgAngleDeviation, sideLengths, corners)

	return {
		type: 'rectangle',
		corners,
		bounds,
		rotation,
		isDiamond,
		confidence,
		originalPoints: points
	}
}

/**
 * Check if an rectangle candidate meets the auto-detection threshold
 */
export function isConfidentRectangle(candidate: RectangleCandidate | null): boolean {
	return candidate !== null && candidate.confidence >= HIGH_CONFIDENCE
}

/**
 * Calculate rotation angle for a rectangle with snapping to 45° increments
 * Returns the rotation and whether it's a diamond (45° rotated)
 */
function calculateRotation(corners: [Point, Point, Point, Point]): {
	rotation: number
	isDiamond: boolean
} {
	// Calculate the angle of the first side (from corner 0 to corner 1)
	const sideAngle = lineAngle(corners[0], corners[1])

	// Normalize to -90 to 90 range (we want rotation relative to horizontal)
	let rawRotation = sideAngle
	if (rawRotation > 90) rawRotation -= 180
	if (rawRotation < -90) rawRotation += 180

	// Snap to nearest multiple of ROTATION_SNAP_ANGLE if within threshold
	const snapMultiple = Math.round(rawRotation / ROTATION_SNAP_ANGLE)
	const snappedAngle = snapMultiple * ROTATION_SNAP_ANGLE
	const snapDiff = Math.abs(rawRotation - snappedAngle)

	let rotation: number
	if (snapDiff <= ROTATION_SNAP_THRESHOLD) {
		rotation = snappedAngle
	} else {
		rotation = rawRotation
	}

	// Normalize rotation to -90 to 90 range
	if (rotation > 90) rotation -= 180
	if (rotation < -90) rotation += 180
	if (rotation === -90) rotation = 90 // Prefer positive 90

	// It's a diamond if rotation is close to ±45°
	const isDiamond = Math.abs(Math.abs(rotation) - 45) < 5

	return { rotation, isDiamond }
}

/**
 * Calculate proper bounds for a rectangle (handles rotation)
 * For axis-aligned rectangles, uses the bounding box.
 * For rotated rectangles (diamonds), calculates actual dimensions from side lengths.
 */
function calculateRectangleBounds(
	corners: [Point, Point, Point, Point],
	sideLengths: number[],
	rotation: number
): Bounds {
	// Calculate center as the centroid of the 4 corners
	const centerX = (corners[0][0] + corners[1][0] + corners[2][0] + corners[3][0]) / 4
	const centerY = (corners[0][1] + corners[1][1] + corners[2][1] + corners[3][1]) / 4

	if (Math.abs(rotation) < 5) {
		// Nearly axis-aligned - use bounding box
		return getBoundsFromPoints(corners)
	}

	// For rotated rectangles, use the actual side lengths
	// sideLengths[0] and sideLengths[2] are opposite sides (should be similar)
	// sideLengths[1] and sideLengths[3] are opposite sides (should be similar)
	const width = (sideLengths[0] + sideLengths[2]) / 2
	const height = (sideLengths[1] + sideLengths[3]) / 2

	// Position so that when rotated around center, it matches the corners
	return {
		x: centerX - width / 2,
		y: centerY - height / 2,
		width,
		height
	}
}

/**
 * Calculate confidence score based on rectangle quality
 */
function calculateConfidence(
	avgAngleDeviation: number,
	sideLengths: number[],
	corners: [Point, Point, Point, Point]
): number {
	// Angle score (closer to 90° = better)
	const angleScore = 1 - avgAngleDeviation / RIGHT_ANGLE_TOLERANCE

	// Side length consistency (opposite sides should be similar)
	const side02Ratio =
		Math.min(sideLengths[0], sideLengths[2]) / Math.max(sideLengths[0], sideLengths[2])
	const side13Ratio =
		Math.min(sideLengths[1], sideLengths[3]) / Math.max(sideLengths[1], sideLengths[3])
	const sideScore = (side02Ratio + side13Ratio) / 2

	// Size score (larger rectangles are more confident)
	const avgSide = sideLengths.reduce((a, b) => a + b, 0) / 4
	const sizeScore = Math.min(avgSide / 50, 1)

	// Combined score
	return Math.max(0, Math.min(1, angleScore * 0.5 + sideScore * 0.3 + sizeScore * 0.2))
}

/**
 * Generate points along a rectangle for morph animation
 */
export function generateRectanglePoints(candidate: RectangleCandidate, numPoints: number): Point[] {
	const { corners } = candidate
	const points: Point[] = []

	// Distribute points evenly along the perimeter
	const sideLengths = [
		distance(corners[0], corners[1]),
		distance(corners[1], corners[2]),
		distance(corners[2], corners[3]),
		distance(corners[3], corners[0])
	]
	const perimeter = sideLengths.reduce((a, b) => a + b, 0)

	let pointsRemaining = numPoints
	let currentPoint = 0

	for (let side = 0; side < 4 && pointsRemaining > 0; side++) {
		const start = corners[side]
		const end = corners[(side + 1) % 4]
		const sideLength = sideLengths[side]

		// How many points on this side (proportional to length)
		const pointsOnSide =
			side === 3 ? pointsRemaining : Math.round((sideLength / perimeter) * numPoints)

		for (let i = 0; i < pointsOnSide; i++) {
			const t = i / pointsOnSide
			points.push([start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t])
			currentPoint++
		}

		pointsRemaining -= pointsOnSide
	}

	return points
}

// vim: ts=4
