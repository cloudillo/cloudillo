// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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

import type { Bounds, IdealloObject } from '../crdt/index.js'
// Cyclic with bounds.ts, which imports calculatePathBounds from here. Both sides only call across
// the cycle at runtime, never during module initialisation, so it resolves cleanly - and one
// shared getObjectBounds is worth it.
import { getObjectBounds, getRotationCenter } from './bounds.js'
import type { Point } from './geometry.js'
import {
	distance,
	expandBounds,
	perpendicularDistance,
	pointInBounds,
	rotatePoint
} from './geometry.js'
import { isPaintSet } from './paint.js'

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

/**
 * Both path caches are bounded for the same reason inscribedCache in utils/geometry.ts is: this
 * module lives for the whole SPA session and a user may open board after board, so "a stroke is
 * immutable once drawn" bounds the key space per board, not per session. Maps iterate in insertion
 * order, so the first key is the oldest.
 */
export const PATH_CACHE_MAX = 512

function evictOldest(cache: Map<string, unknown>, max: number): void {
	if (cache.size < max) return
	const oldest = cache.keys().next()
	if (!oldest.done) cache.delete(oldest.value)
}

const pathCache = new Map<string, ParsedPath>()

/**
 * Get parsed path with caching
 */
function getCachedParsedPath(pathData: string): ParsedPath {
	let parsed = pathCache.get(pathData)
	if (!parsed) {
		parsed = parseSvgPath(pathData)
		evictOldest(pathCache, PATH_CACHE_MAX)
		pathCache.set(pathData, parsed)
	}
	return parsed
}

/**
 * Sibling of pathCache for the BOUNDS, which the parse cache alone does not cover.
 *
 * Parsing is memoised above, but calculatePathBounds re-samples 11 points per bezier segment on
 * every call - and it is called per object per frame from getObjectBounds, which every connector
 * hover and bind-target lookup goes through. A board with a few hundred pen strokes paid the whole
 * re-sample on each pointermove.
 *
 * Keyed on the pathData string exactly like pathCache, and bounded the same way. `null` (an empty
 * or unparseable path) is cached too, so a degenerate stroke does not re-parse forever.
 */
const pathBoundsCache = new Map<string, Bounds | null>()

/** Test seam, mirroring clearInscribedCache() in utils/geometry.ts */
export function clearPathCaches(): void {
	pathCache.clear()
	pathBoundsCache.clear()
}

/** Cache size, for the bound test */
export function pathBoundsCacheSize(): number {
	return pathBoundsCache.size
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
	let match: RegExpExecArray | null = commandRegex.exec(pathData)

	while (match) {
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
		match = commandRegex.exec(pathData)
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
	// Memoised: see pathBoundsCache. `has` rather than a truthiness check, so a cached null hits.
	if (pathBoundsCache.has(pathData)) return pathBoundsCache.get(pathData) ?? null

	const bounds = computePathBounds(pathData)
	evictOldest(pathBoundsCache, PATH_CACHE_MAX)
	pathBoundsCache.set(pathData, bounds)
	return bounds
}

function computePathBounds(pathData: string): Bounds | null {
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

/** Nearest distance from a point to any segment of a polyline */
export function distanceToPolyline(point: Point, points: [number, number][]): number {
	if (points.length === 0) return Infinity
	if (points.length === 1) return distance(point, points[0])
	let best = Infinity
	for (let i = 0; i < points.length - 1; i++) {
		// perpendicularDistance already clamps to the segment
		const d = perpendicularDistance(point, points[i], points[i + 1])
		if (d < best) best = d
	}
	return best
}

/**
 * Check if an object has a visible fill (not transparent)
 *
 * No `isStroked` counterpart on purpose: an UNSTROKED shape must stay grabbable by its edge, and
 * the stroke-distance fallback is the only thing that makes a thin shape clickable at all.
 */
function isFilled(obj: IdealloObject): boolean {
	return isPaintSet(obj.style.fillColor)
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
		const center = getRotationCenter(obj)
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
		case 'connector':
			if (obj.route) {
				// Nearest approach to any segment of the route, not just the chord - clicking
				// an elbow's far-side detour has to work.
				return distanceToPolyline(testPoint, obj.route.points) <= tolerance
			}
			return (
				perpendicularDistance(testPoint, [obj.startX, obj.startY], [obj.endX, obj.endY]) <=
				tolerance
			)

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
