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
 * Hit Testing Utilities for Canvas Objects
 *
 * Provides precise hit testing for different object types:
 * - Freehand paths (SVG bezier curves)
 * - Ellipses (filled and unfilled)
 * - Polygons (filled and unfilled)
 *
 * Uses distance-based testing for stroke objects and
 * point-in-shape testing for filled objects.
 */

import type { Point } from './geometry.js'
import type { Bounds, IdealloObject } from '../crdt/index.js'
import {
	distance,
	perpendicularDistance,
	rotatePoint,
	getBoundsFromPoints,
	expandBounds,
	pointInBounds
} from './geometry.js'

// ============================================================================
// Types
// ============================================================================

export interface BezierSegment {
	start: Point
	control1: Point
	control2: Point
	end: Point
}

export interface ParsedPath {
	segments: BezierSegment[]
	closed: boolean
}

// ============================================================================
// Constants
// ============================================================================

const BEZIER_SAMPLES = 20 // Number of samples for distance calculation
const ELLIPSE_SAMPLES = 36 // Number of samples for ellipse edge distance

// ============================================================================
// Path Caching
// ============================================================================

const pathCache = new Map<string, ParsedPath>()

/**
 * Get parsed path with caching
 */
function getCachedParsedPath(pathData: string): ParsedPath {
	let parsed = pathCache.get(pathData)
	if (!parsed) {
		parsed = parseSvgPath(pathData)
		pathCache.set(pathData, parsed)
	}
	return parsed
}

// ============================================================================
// SVG Path Parsing
// ============================================================================

/**
 * Parse SVG path string into bezier segments
 * Supports M (move to), C (cubic bezier), Q (quadratic bezier), and L (line) commands
 */
export function parseSvgPath(pathData: string): ParsedPath {
	const segments: BezierSegment[] = []
	let closed = false

	if (!pathData || pathData.length === 0) {
		return { segments, closed }
	}

	// Check for close command
	closed = pathData.includes('Z') || pathData.includes('z')

	// Extract move-to command to get starting point
	const moveMatch = pathData.match(/M\s*([-\d.]+)\s+([-\d.]+)/)
	if (!moveMatch) {
		return { segments, closed }
	}

	let currentX = parseFloat(moveMatch[1])
	let currentY = parseFloat(moveMatch[2])

	// Use a unified regex to find all path commands
	// Match C (cubic), Q (quadratic), or L (line) commands
	const commandRegex = /([CQL])\s*([-\d.\s]+)/gi
	let match: RegExpExecArray | null

	while ((match = commandRegex.exec(pathData)) !== null) {
		const cmd = match[1].toUpperCase()
		const coords = match[2]
			.trim()
			.split(/[\s,]+/)
			.map(parseFloat)

		if (cmd === 'C' && coords.length >= 6) {
			// Cubic bezier: C x1 y1 x2 y2 x y
			const segment: BezierSegment = {
				start: [currentX, currentY],
				control1: [coords[0], coords[1]],
				control2: [coords[2], coords[3]],
				end: [coords[4], coords[5]]
			}
			segments.push(segment)
			currentX = coords[4]
			currentY = coords[5]
		} else if (cmd === 'Q' && coords.length >= 4) {
			// Quadratic bezier: Q cx cy x y
			// Convert to cubic: control points at 2/3 distance from endpoints to Q control
			const qcx = coords[0],
				qcy = coords[1]
			const endX = coords[2],
				endY = coords[3]
			const segment: BezierSegment = {
				start: [currentX, currentY],
				control1: [
					currentX + (2 / 3) * (qcx - currentX),
					currentY + (2 / 3) * (qcy - currentY)
				],
				control2: [endX + (2 / 3) * (qcx - endX), endY + (2 / 3) * (qcy - endY)],
				end: [endX, endY]
			}
			segments.push(segment)
			currentX = endX
			currentY = endY
		} else if (cmd === 'L' && coords.length >= 2) {
			// Line: L x y - treat as degenerate cubic with control points on the line
			const endX = coords[0],
				endY = coords[1]
			const segment: BezierSegment = {
				start: [currentX, currentY],
				control1: [currentX + (endX - currentX) / 3, currentY + (endY - currentY) / 3],
				control2: [
					currentX + (2 * (endX - currentX)) / 3,
					currentY + (2 * (endY - currentY)) / 3
				],
				end: [endX, endY]
			}
			segments.push(segment)
			currentX = endX
			currentY = endY
		}
	}

	return { segments, closed }
}

// ============================================================================
// Bezier Curve Utilities
// ============================================================================

/**
 * Calculate a point on a cubic bezier curve at parameter t (0-1)
 */
function pointOnBezier(t: number, seg: BezierSegment): Point {
	const mt = 1 - t
	const mt2 = mt * mt
	const mt3 = mt2 * mt
	const t2 = t * t
	const t3 = t2 * t

	return [
		mt3 * seg.start[0] +
			3 * mt2 * t * seg.control1[0] +
			3 * mt * t2 * seg.control2[0] +
			t3 * seg.end[0],
		mt3 * seg.start[1] +
			3 * mt2 * t * seg.control1[1] +
			3 * mt * t2 * seg.control2[1] +
			t3 * seg.end[1]
	]
}

/**
 * Find the minimum distance from a point to a bezier segment
 * Samples the curve and checks distance to line segments between samples
 * (not just the sample points) for accurate hit detection
 */
function distanceToBezierSegment(point: Point, seg: BezierSegment): number {
	let minDist = Infinity

	// Sample points along the bezier curve
	let prevPoint = pointOnBezier(0, seg)

	for (let i = 1; i <= BEZIER_SAMPLES; i++) {
		const t = i / BEZIER_SAMPLES
		const currPoint = pointOnBezier(t, seg)

		// Check distance to line segment between prev and curr points
		const dist = perpendicularDistance(point, prevPoint, currPoint)
		if (dist < minDist) {
			minDist = dist
		}

		prevPoint = currPoint
	}

	return minDist
}

// ============================================================================
// Freehand Path Hit Testing
// ============================================================================

/**
 * Calculate minimum distance from point to freehand path
 * Point should be in path-relative coordinates (subtract obj.x, obj.y first)
 *
 * @param point - Point in path-relative coordinates
 * @param pathData - SVG path string
 * @param tolerance - Early exit if distance <= tolerance (optional optimization)
 * @returns Minimum distance to path
 */
export function distanceToFreehandPath(point: Point, pathData: string, tolerance?: number): number {
	const parsed = getCachedParsedPath(pathData)

	if (parsed.segments.length === 0) {
		return Infinity
	}

	let minDist = Infinity

	for (const segment of parsed.segments) {
		const dist = distanceToBezierSegment(point, segment)
		if (dist < minDist) {
			minDist = dist
		}
		// Early exit optimization
		if (tolerance !== undefined && minDist <= tolerance) {
			return minDist
		}
	}

	return minDist
}

/**
 * Calculate bounds from pathData at runtime by sampling actual curve points.
 * Samples points along the bezier curves (not control points) for accurate bounds.
 * Returns bounds in path-relative coordinates (add obj.x, obj.y to get canvas coords).
 *
 * @param pathData - SVG path string
 * @returns Bounds calculated from sampled curve points, or null if path is empty/invalid
 */
export function calculatePathBounds(pathData: string): Bounds | null {
	const parsed = getCachedParsedPath(pathData)

	if (parsed.segments.length === 0) {
		return null
	}

	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity

	// Sample points along each bezier segment (actual curve, not control points)
	const samplesPerSegment = 10
	for (const seg of parsed.segments) {
		for (let i = 0; i <= samplesPerSegment; i++) {
			const t = i / samplesPerSegment
			const [x, y] = pointOnBezier(t, seg)
			minX = Math.min(minX, x)
			minY = Math.min(minY, y)
			maxX = Math.max(maxX, x)
			maxY = Math.max(maxY, y)
		}
	}

	return {
		x: minX,
		y: minY,
		width: maxX - minX,
		height: maxY - minY
	}
}

/**
 * Sample points along a bezier path for polygon approximation
 */
function samplePathPoints(parsed: ParsedPath, samplesPerSegment: number = 10): Point[] {
	const points: Point[] = []

	for (const segment of parsed.segments) {
		for (let i = 0; i <= samplesPerSegment; i++) {
			const t = i / samplesPerSegment
			points.push(pointOnBezier(t, segment))
		}
	}

	return points
}

/**
 * Test if a point is inside a closed path using ray casting algorithm
 * Point should be in path-relative coordinates
 *
 * @param point - Point in path-relative coordinates
 * @param pathData - SVG path string (must be closed)
 * @returns true if point is inside the closed path
 */
export function pointInClosedPath(point: Point, pathData: string): boolean {
	const parsed = getCachedParsedPath(pathData)

	if (!parsed.closed || parsed.segments.length === 0) {
		return false
	}

	// Sample the bezier path to create a polygon approximation
	const polygonPoints = samplePathPoints(parsed, 10)

	// Use ray casting algorithm
	return pointInPolygon(point, polygonPoints)
}

// ============================================================================
// Ellipse Hit Testing
// ============================================================================

/**
 * Test if a point is inside an ellipse
 *
 * @param point - Point to test
 * @param cx - Ellipse center X
 * @param cy - Ellipse center Y
 * @param rx - Ellipse radius X (half width)
 * @param ry - Ellipse radius Y (half height)
 * @returns true if point is inside ellipse
 */
export function pointInEllipse(
	point: Point,
	cx: number,
	cy: number,
	rx: number,
	ry: number
): boolean {
	if (rx <= 0 || ry <= 0) return false

	const dx = point[0] - cx
	const dy = point[1] - cy

	// Point is inside if (dx/rx)^2 + (dy/ry)^2 <= 1
	return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1
}

/**
 * Calculate distance from a point to the nearest point on an ellipse edge
 * Uses sampling approach for simplicity and performance
 *
 * @param point - Point to test
 * @param cx - Ellipse center X
 * @param cy - Ellipse center Y
 * @param rx - Ellipse radius X
 * @param ry - Ellipse radius Y
 * @returns Distance to nearest point on ellipse edge
 */
export function distanceToEllipseEdge(
	point: Point,
	cx: number,
	cy: number,
	rx: number,
	ry: number
): number {
	if (rx <= 0 || ry <= 0) return Infinity

	let minDist = Infinity

	for (let i = 0; i < ELLIPSE_SAMPLES; i++) {
		const angle = (i / ELLIPSE_SAMPLES) * 2 * Math.PI
		const edgeX = cx + rx * Math.cos(angle)
		const edgeY = cy + ry * Math.sin(angle)
		const dist = distance(point, [edgeX, edgeY])
		if (dist < minDist) {
			minDist = dist
		}
	}

	return minDist
}

// ============================================================================
// Polygon Hit Testing
// ============================================================================

/**
 * Test if a point is inside a polygon using ray casting algorithm
 * Works for both convex and concave polygons
 *
 * @param point - Point to test
 * @param vertices - Polygon vertices
 * @returns true if point is inside polygon
 */
export function pointInPolygon(point: Point, vertices: Point[]): boolean {
	if (vertices.length < 3) return false

	let inside = false
	const n = vertices.length
	const [x, y] = point

	for (let i = 0, j = n - 1; i < n; j = i++) {
		const [xi, yi] = vertices[i]
		const [xj, yj] = vertices[j]

		// Check if ray from point intersects edge
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
			inside = !inside
		}
	}

	return inside
}

/**
 * Calculate minimum distance from a point to a polygon edge
 *
 * @param point - Point to test
 * @param vertices - Polygon vertices
 * @param closed - If true, includes edge from last to first vertex (default: true)
 * @returns Minimum distance to any polygon edge
 */
export function distanceToPolygonEdge(
	point: Point,
	vertices: Point[],
	closed: boolean = true
): number {
	if (vertices.length < 2) return Infinity

	let minDist = Infinity
	const n = vertices.length
	const edgeCount = closed ? n : n - 1

	for (let i = 0; i < edgeCount; i++) {
		const v1 = vertices[i]
		const v2 = vertices[(i + 1) % n]
		const dist = perpendicularDistance(point, v1, v2)
		if (dist < minDist) {
			minDist = dist
		}
	}

	return minDist
}

// ============================================================================
// Unified Hit Testing
// ============================================================================

/**
 * Check if an object has a visible fill (not transparent)
 */
function isFilled(obj: IdealloObject): boolean {
	return obj.style.fillColor !== 'transparent'
}

/**
 * Get bounds for an object
 */
function getObjectBounds(obj: IdealloObject): Bounds {
	switch (obj.type) {
		case 'freehand':
		case 'rect':
		case 'ellipse':
		case 'text':
		case 'sticky':
		case 'image':
			return { x: obj.x, y: obj.y, width: obj.width, height: obj.height }
		case 'polygon':
			return getBoundsFromPoints(obj.vertices)
		case 'line':
		case 'arrow':
			return {
				x: Math.min(obj.startX, obj.endX),
				y: Math.min(obj.startY, obj.endY),
				width: Math.abs(obj.endX - obj.startX),
				height: Math.abs(obj.endY - obj.startY)
			}
	}
}

/**
 * Get rotation center for an object based on pivot point
 */
function getRotationCenter(obj: IdealloObject, pivotX: number, pivotY: number): Point {
	if (obj.type === 'line' || obj.type === 'arrow') {
		const bounds = getObjectBounds(obj)
		return [bounds.x + bounds.width * pivotX, bounds.y + bounds.height * pivotY]
	} else if (obj.type === 'polygon') {
		const bounds = getBoundsFromPoints(obj.vertices)
		return [bounds.x + bounds.width * pivotX, bounds.y + bounds.height * pivotY]
	} else {
		// Rect, ellipse, text, sticky, image, freehand
		return [obj.x + obj.width * pivotX, obj.y + obj.height * pivotY]
	}
}

/**
 * Hit test a point against an object with configurable tolerance
 *
 * Handles rotation by inverse-transforming the test point around the object's
 * pivot, then performs precise hit testing based on object type.
 *
 * @param obj - The object to test against
 * @param point - The point to test (in canvas coordinates)
 * @param tolerance - Hit tolerance in canvas units (default 8)
 * @returns true if the point hits the object
 */
export function hitTestObject(obj: IdealloObject, point: Point, tolerance: number = 8): boolean {
	// Transform point to object's local coordinate system if rotated
	let testPoint = point
	if (obj.rotation && Math.abs(obj.rotation) > 0.1) {
		const pivotX = obj.pivotX ?? 0.5
		const pivotY = obj.pivotY ?? 0.5
		const center = getRotationCenter(obj, pivotX, pivotY)
		testPoint = rotatePoint(point, center, -obj.rotation)
	}

	// For freehand, calculate bounds from pathData at runtime
	if (obj.type === 'freehand') {
		const pathBounds = calculatePathBounds(obj.pathData)
		if (pathBounds) {
			const canvasBounds = {
				x: obj.x + pathBounds.x,
				y: obj.y + pathBounds.y,
				width: pathBounds.width,
				height: pathBounds.height
			}
			// Use larger margin for bounds check
			const expandedBounds = expandBounds(canvasBounds, tolerance * 2)
			if (!pointInBounds(testPoint, expandedBounds)) {
				return false
			}
		}

		// Transform test point to path-relative coordinates
		const relPoint: Point = [testPoint[0] - obj.x, testPoint[1] - obj.y]

		// For filled closed paths, check if point is inside
		if (obj.closed && isFilled(obj)) {
			if (pointInClosedPath(relPoint, obj.pathData)) {
				return true
			}
		}
		// Check distance to path stroke
		const dist = distanceToFreehandPath(relPoint, obj.pathData, tolerance)
		return dist <= tolerance
	}

	const bounds = getObjectBounds(obj)
	const expandedBounds = expandBounds(bounds, tolerance)

	// Quick bounds check first
	if (!pointInBounds(testPoint, expandedBounds)) {
		return false
	}

	switch (obj.type) {
		case 'line':
		case 'arrow': {
			const dist = perpendicularDistance(
				testPoint,
				[obj.startX, obj.startY],
				[obj.endX, obj.endY]
			)
			return dist <= tolerance
		}

		case 'ellipse': {
			const cx = obj.x + obj.width / 2
			const cy = obj.y + obj.height / 2
			const rx = obj.width / 2
			const ry = obj.height / 2

			if (isFilled(obj)) {
				return pointInEllipse(testPoint, cx, cy, rx + tolerance, ry + tolerance)
			}
			return distanceToEllipseEdge(testPoint, cx, cy, rx, ry) <= tolerance
		}

		case 'polygon': {
			if (isFilled(obj)) {
				if (pointInPolygon(testPoint, obj.vertices)) {
					return true
				}
			}
			return distanceToPolygonEdge(testPoint, obj.vertices) <= tolerance
		}

		// Rect, sticky, image, text - bounding box is the correct behavior
		default:
			return pointInBounds(testPoint, bounds)
	}
}

// vim: ts=4
