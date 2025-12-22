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
 * Geometry utilities for canvas operations
 */

import type { Bounds } from '../crdt/index.js'

export type Point = [number, number]

/**
 * Calculate distance between two points
 */
export function distance(p1: Point, p2: Point): number {
	const dx = p2[0] - p1[0]
	const dy = p2[1] - p1[1]
	return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Calculate perpendicular distance from point to line
 */
export function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
	const dx = lineEnd[0] - lineStart[0]
	const dy = lineEnd[1] - lineStart[1]
	const lineLengthSq = dx * dx + dy * dy

	if (lineLengthSq === 0) {
		return distance(point, lineStart)
	}

	const t = Math.max(
		0,
		Math.min(
			1,
			((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / lineLengthSq
		)
	)

	const projX = lineStart[0] + t * dx
	const projY = lineStart[1] + t * dy

	return Math.sqrt(Math.pow(point[0] - projX, 2) + Math.pow(point[1] - projY, 2))
}

/**
 * Calculate bounding box of points
 */
export function getBoundsFromPoints(points: Point[]): Bounds {
	if (points.length === 0) {
		return { x: 0, y: 0, width: 0, height: 0 }
	}

	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity

	for (const [x, y] of points) {
		minX = Math.min(minX, x)
		minY = Math.min(minY, y)
		maxX = Math.max(maxX, x)
		maxY = Math.max(maxY, y)
	}

	return {
		x: minX,
		y: minY,
		width: maxX - minX,
		height: maxY - minY
	}
}

/**
 * Check if point is inside bounds
 */
export function pointInBounds(point: Point, bounds: Bounds): boolean {
	return (
		point[0] >= bounds.x &&
		point[0] <= bounds.x + bounds.width &&
		point[1] >= bounds.y &&
		point[1] <= bounds.y + bounds.height
	)
}

/**
 * Check if two bounds overlap
 */
export function boundsOverlap(a: Bounds, b: Bounds): boolean {
	return !(
		a.x + a.width < b.x ||
		b.x + b.width < a.x ||
		a.y + a.height < b.y ||
		b.y + b.height < a.y
	)
}

/**
 * Check if bounds A contains bounds B
 */
export function boundsContains(a: Bounds, b: Bounds): boolean {
	return (
		b.x >= a.x &&
		b.y >= a.y &&
		b.x + b.width <= a.x + a.width &&
		b.y + b.height <= a.y + a.height
	)
}

/**
 * Expand bounds by a padding amount
 */
export function expandBounds(bounds: Bounds, padding: number): Bounds {
	return {
		x: bounds.x - padding,
		y: bounds.y - padding,
		width: bounds.width + padding * 2,
		height: bounds.height + padding * 2
	}
}

/**
 * Get center point of bounds
 */
export function getBoundsCenter(bounds: Bounds): Point {
	return [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2]
}

/**
 * Normalize angle to 0-360 range
 */
export function normalizeAngle(angle: number): number {
	return ((angle % 360) + 360) % 360
}

/**
 * Convert degrees to radians
 */
export function degToRad(deg: number): number {
	return deg * (Math.PI / 180)
}

/**
 * Convert radians to degrees
 */
export function radToDeg(rad: number): number {
	return rad * (180 / Math.PI)
}

/**
 * Rotate a point around a center
 */
export function rotatePoint(point: Point, center: Point, angleDeg: number): Point {
	const rad = degToRad(angleDeg)
	const cos = Math.cos(rad)
	const sin = Math.sin(rad)
	const dx = point[0] - center[0]
	const dy = point[1] - center[1]
	return [center[0] + dx * cos - dy * sin, center[1] + dx * sin + dy * cos]
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max)
}

// ============================================================================
// Smart Ink Geometry Utilities
// ============================================================================

/**
 * Calculate the centroid (center of mass) of a set of points
 */
export function calculateCentroid(points: Point[]): Point {
	if (points.length === 0) return [0, 0]

	let sumX = 0
	let sumY = 0
	for (const [x, y] of points) {
		sumX += x
		sumY += y
	}
	return [sumX / points.length, sumY / points.length]
}

/**
 * Calculate the mean of an array of numbers
 */
export function mean(values: number[]): number {
	if (values.length === 0) return 0
	return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * Calculate the standard deviation of an array of numbers
 */
export function standardDeviation(values: number[]): number {
	if (values.length === 0) return 0

	const avg = mean(values)
	const squaredDiffs = values.map((v) => Math.pow(v - avg, 2))
	return Math.sqrt(mean(squaredDiffs))
}

/**
 * Calculate the angle of a line segment in degrees (0-360)
 * 0° = right, 90° = down, 180° = left, 270° = up
 */
export function lineAngle(p1: Point, p2: Point): number {
	const dx = p2[0] - p1[0]
	const dy = p2[1] - p1[1]
	const radians = Math.atan2(dy, dx)
	return normalizeAngle(radToDeg(radians))
}

/**
 * Calculate the angle between two vectors in degrees (0-180)
 */
export function angleBetweenVectors(v1: Point, v2: Point): number {
	const dot = v1[0] * v2[0] + v1[1] * v2[1]
	const mag1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1])
	const mag2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1])

	if (mag1 === 0 || mag2 === 0) return 0

	const cosAngle = clamp(dot / (mag1 * mag2), -1, 1)
	return radToDeg(Math.acos(cosAngle))
}

/**
 * Calculate the angle at a vertex formed by three points (in degrees, 0-180)
 * The angle is measured at p2 (the vertex)
 */
export function angleAtVertex(p1: Point, p2: Point, p3: Point): number {
	const v1: Point = [p1[0] - p2[0], p1[1] - p2[1]]
	const v2: Point = [p3[0] - p2[0], p3[1] - p2[1]]
	return angleBetweenVectors(v1, v2)
}

/**
 * Calculate the direction change at a point (how much the path "turns")
 * Returns angle in degrees (0-180)
 */
export function directionChange(prev: Point, curr: Point, next: Point): number {
	// Vectors from current point
	const v1: Point = [prev[0] - curr[0], prev[1] - curr[1]]
	const v2: Point = [next[0] - curr[0], next[1] - curr[1]]

	// Angle between the reversed first vector and second vector
	// This gives us the "turn" angle
	const angle = angleBetweenVectors(v1, v2)
	return 180 - angle
}

/**
 * Detect corners (significant direction changes) in a path
 * Returns indices of points that are corners
 */
export function detectCorners(
	points: Point[],
	options: {
		minAngle?: number // Minimum turn angle to be a corner (default 45)
		windowSize?: number // Points to skip before/after for angle calc (default 3)
		closed?: boolean // If true, wrap around for closed paths
	} = {}
): number[] {
	const { minAngle = 45, windowSize = 3, closed = false } = options
	const corners: number[] = []
	const n = points.length

	if (n < windowSize * 2 + 1) return corners

	// Calculate all direction changes
	const changes: { idx: number; change: number }[] = []

	// For closed paths, check ALL points by wrapping around
	// For open paths, only check points with enough neighbors
	const startIdx = closed ? 0 : windowSize
	const endIdx = closed ? n : n - windowSize

	for (let i = startIdx; i < endIdx; i++) {
		// Use modulo for wrap-around on closed paths
		const prevIdx = closed ? (i - windowSize + n) % n : i - windowSize
		const nextIdx = closed ? (i + windowSize) % n : i + windowSize

		const prev = points[prevIdx]
		const curr = points[i]
		const next = points[nextIdx]
		const change = directionChange(prev, curr, next)
		if (change >= minAngle) {
			changes.push({ idx: i, change })
		}
	}

	// Sort by direction change (highest first)
	changes.sort((a, b) => b.change - a.change)

	// Minimum spacing between corners (avoid detecting same corner twice)
	const minSpacing = Math.max(windowSize * 2, Math.floor(n / 12))

	// Greedily select corners, starting with sharpest
	for (const { idx } of changes) {
		// Check if too close to an already selected corner
		// For closed paths, also check wrap-around distance
		let tooClose = false
		for (const c of corners) {
			const directDist = Math.abs(c - idx)
			const wrapDist = closed ? n - directDist : Infinity
			if (Math.min(directDist, wrapDist) < minSpacing) {
				tooClose = true
				break
			}
		}
		if (!tooClose) {
			corners.push(idx)
		}
	}

	// Sort by position for consistent output
	corners.sort((a, b) => a - b)

	return corners
}

/**
 * Check if two line segments are approximately parallel
 */
export function areParallel(
	seg1Start: Point,
	seg1End: Point,
	seg2Start: Point,
	seg2End: Point,
	tolerance: number = 15 // degrees
): boolean {
	const angle1 = lineAngle(seg1Start, seg1End)
	const angle2 = lineAngle(seg2Start, seg2End)

	// Segments are parallel if they have similar angles (or opposite: 180° apart)
	let diff = Math.abs(angle1 - angle2)
	if (diff > 180) diff = 360 - diff
	if (diff > 90) diff = 180 - diff // Account for opposite directions

	return diff < tolerance
}

/**
 * Check if a path is approximately closed (start near end)
 */
export function isClosedPath(points: Point[], threshold: number = 20): boolean {
	if (points.length < 3) return false
	return distance(points[0], points[points.length - 1]) < threshold
}

/**
 * Check if a circle overlaps a bounding box
 * Used for eraser tool hit detection
 */
export function circleIntersectsBounds(
	cx: number,
	cy: number,
	radius: number,
	bounds: Bounds
): boolean {
	// Find closest point on bounds to circle center
	const closestX = clamp(cx, bounds.x, bounds.x + bounds.width)
	const closestY = clamp(cy, bounds.y, bounds.y + bounds.height)
	// Check if closest point is within radius
	const dx = cx - closestX
	const dy = cy - closestY
	return dx * dx + dy * dy <= radius * radius
}

// vim: ts=4
