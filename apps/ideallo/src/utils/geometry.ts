// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Geometry utilities for canvas operations
 */

import type { Bounds } from '../crdt/index.js'

export type Point = [number, number]

/**
 * Euclidean length of a vector, deterministically.
 *
 * NOT Math.hypot: the spec explicitly does not require it to be correctly rounded, so its last
 * bits are engine-dependent. Math.sqrt IS required to be, and connector routes are derived
 * independently on every peer - two peers whose costs differ in the last bit can pick different
 * routes for identical state. Use this everywhere under connectors/.
 */
export function hypot(dx: number, dy: number): number {
	return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Calculate distance between two points
 */
export function distance(p1: Point, p2: Point): number {
	return hypot(p2[0] - p1[0], p2[1] - p1[1])
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

	return Math.sqrt((point[0] - projX) ** 2 + (point[1] - projY) ** 2)
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
 * Map world points from one bounding box into another, for a resize commit.
 *
 * Kept out of the resize handler so the maths is testable on its own: the resize PREVIEW scales a
 * polygon's vertices (applyBoundsOverride in Canvas.tsx) and the commit has to reproduce the same
 * transform, or the shape snaps back to its old outline on pointer-up.
 */
export function scalePointsIntoBounds(
	points: readonly (readonly [number, number])[],
	from: Bounds,
	to: Bounds
): [number, number][] {
	const scaleX = from.width ? to.width / from.width : 1
	const scaleY = from.height ? to.height / from.height : 1
	return points.map(([x, y]) => [to.x + (x - from.x) * scaleX, to.y + (y - from.y) * scaleY])
}

/** The connector fields the resize transform below reads. Structural so tests need no CRDT record. */
export interface ConnectorTerminals {
	x: number
	y: number
	startX: number
	startY: number
	endX: number
	endY: number
	startObjectId?: string
	endObjectId?: string
}

/** What a resize writes to a connector. Bound terminals are absent, not merely unchanged. */
export interface ConnectorTerminalPatch {
	x: number
	y: number
	startX?: number
	startY?: number
	endX?: number
	endY?: number
}

/**
 * Map a connector's terminals from one bounding box into another, for a resize.
 *
 * ONE implementation for both halves of a resize - the PREVIEW (applyBoundsOverride in Canvas.tsx)
 * and the COMMIT (onResizeEnd in app.tsx) - because the two must map out of the same source box by
 * the same rule or the arrow snaps on pointer-up.
 *
 * `from` is the box the SelectionBox is drawn from, i.e. getObjectBounds of the RESOLVED connector
 * = `route.bounds`, which routeBounds() pads by the arrowhead extent and which spans the whole
 * detour on an elbow/curved route. Deriving `from` from the tight endpoint bbox instead is what
 * made the preview and the commit disagree.
 *
 * Returns null when there is nothing to write: a terminal with startObjectId/endObjectId is derived
 * from its target (see connectors/resolve.ts) and must not move, so a fully bound connector is left
 * exactly as it is.
 */
export function scaleConnectorTerminals(
	obj: ConnectorTerminals,
	from: Bounds,
	to: Bounds
): ConnectorTerminalPatch | null {
	const startBound = !!obj.startObjectId
	const endBound = !!obj.endObjectId
	if (startBound && endBound) return null
	// A zero-extent box would scale to NaN/Infinity; hold it still instead.
	const scaleX = from.width ? to.width / from.width : 1
	const scaleY = from.height ? to.height / from.height : 1
	const dx = to.x - from.x
	const dy = to.y - from.y
	const mapX = (x: number) => from.x + dx + (x - from.x) * scaleX
	const mapY = (y: number) => from.y + dy + (y - from.y) * scaleY
	return {
		x: mapX(obj.x),
		y: mapY(obj.y),
		...(startBound ? {} : { startX: mapX(obj.startX), startY: mapY(obj.startY) }),
		...(endBound ? {} : { endX: mapX(obj.endX), endY: mapY(obj.endY) })
	}
}

/** Below this fraction of the bounding box a spiky shape would get no usable text area at all */
const INSCRIBED_BOX_FLOOR = 0.4

/** Rows sampled down the bounding box. 48 lands a sample every ~2% of the height. */
const INSCRIBED_BOX_ROWS = 48

/**
 * Horizontal extent of the polygon at height y, as [left, right], or null off the shape.
 *
 * A concave outline can cross a scanline more than twice; taking the OUTERMOST pair is the
 * approximation that keeps the search cheap.
 */
function spanAtY(vertices: readonly Point[], y: number): [number, number] | null {
	let left = Number.POSITIVE_INFINITY
	let right = Number.NEGATIVE_INFINITY
	for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
		const [xi, yi] = vertices[i]
		const [xj, yj] = vertices[j]
		if (yi > y !== yj > y) {
			const x = xi + ((xj - xi) * (y - yi)) / (yj - yi)
			if (x < left) left = x
			if (x > right) right = x
		}
	}
	return left <= right ? [left, right] : null
}

/**
 * Largest-area axis-aligned box inside the polygon.
 *
 * A diamond's bbox corners lie OUTSIDE the shape, so centred text laid into the bbox would spill
 * into empty space. The box is free to sit anywhere: pinning it to the bbox CENTRE is only right
 * for a shape symmetric about that centre. A triangle is not - a centred box cannot grow past a
 * third of the bbox before its top corners leave the shape, and hits the floor below over-narrow
 * and hanging in the empty upper half rather than over the wide base.
 *
 * Scanline: intersect the polygon's horizontal extent across every row a candidate box covers, and
 * keep the widest*tallest. Exact for a convex polygon up to the row resolution, approximate for a
 * concave one. Each side is floored at 40% of the bbox so even a spike gets somewhere to put a
 * word, at the cost of poking outside the outline.
 */
export function inscribedBox(vertices: readonly Point[], bounds: Bounds): Bounds {
	const key = inscribedCacheKey(vertices, bounds)
	const hit = inscribedCache.get(key)
	// A copy per call: the result reaches component bodies, and one caller mutating a shared Bounds
	// would silently move every other polygon with the same outline
	if (hit) return { ...hit }
	const box = computeInscribedBox(vertices, bounds)
	// Map is insertion-ordered, so the first key is the oldest
	if (inscribedCache.size >= INSCRIBED_CACHE_MAX) {
		const oldest = inscribedCache.keys().next().value
		if (oldest !== undefined) inscribedCache.delete(oldest)
	}
	inscribedCache.set(key, box)
	return { ...box }
}

/**
 * inscribedBox is ~2,300 iterations, and objectTextLayout calls it from five component BODIES with
 * no useMemo - a fresh object identity per document revision makes a React memo useless there. The
 * result depends only on (vertices, bounds), so cache on those.
 *
 * Bounded, unlike hit-testing's pathBoundsCache: this module lives for the whole SPA session and a
 * user may open board after board.
 */
export const INSCRIBED_CACHE_MAX = 512
const inscribedCache = new Map<string, Bounds>()

/** 2dp is enough - the routers already quantise at that scale, and so does the stored geometry */
function inscribedCacheKey(vertices: readonly Point[], bounds: Bounds): string {
	const r = (n: number) => Math.round(n * 100) / 100
	let key = `${r(bounds.x)},${r(bounds.y)},${r(bounds.width)},${r(bounds.height)}`
	for (const v of vertices) key += `|${r(v[0])},${r(v[1])}`
	return key
}

/** Test hook, mirroring clearRouteCache() in connectors/cache.ts */
export function clearInscribedCache(): void {
	inscribedCache.clear()
}

/** Cache size, for the bound test */
export function inscribedCacheSize(): number {
	return inscribedCache.size
}

function computeInscribedBox(vertices: readonly Point[], bounds: Bounds): Bounds {
	if (vertices.length < 3 || bounds.width <= 0 || bounds.height <= 0) return bounds

	// Nudged inside the bbox: at the apex of a triangle the outline is a single point, and at its
	// base the scanline misses the horizontal edge entirely, so both ends would report nothing
	const inset = bounds.height * 1e-4
	const rowY = (i: number) =>
		clamp(
			bounds.y + (i / INSCRIBED_BOX_ROWS) * bounds.height,
			bounds.y + inset,
			bounds.y + bounds.height - inset
		)
	const spans: ([number, number] | null)[] = []
	for (let i = 0; i <= INSCRIBED_BOX_ROWS; i++) spans.push(spanAtY(vertices, rowY(i)))

	let bestArea = 0
	let bestCx = bounds.x + bounds.width / 2
	let bestCy = bounds.y + bounds.height / 2
	let bestWidth = 0
	let bestHeight = 0

	for (let top = 0; top < INSCRIBED_BOX_ROWS; top++) {
		const first = spans[top]
		if (!first) continue
		// Running intersection of every row the box covers, so it stays inside as it grows down
		let left = first[0]
		let right = first[1]
		for (let bottom = top + 1; bottom <= INSCRIBED_BOX_ROWS; bottom++) {
			const span = spans[bottom]
			if (!span) break
			if (span[0] > left) left = span[0]
			if (span[1] < right) right = span[1]
			const width = right - left
			if (width <= 0) break
			const height = rowY(bottom) - rowY(top)
			const area = width * height
			if (area > bestArea) {
				bestArea = area
				bestWidth = width
				bestHeight = height
				bestCx = (left + right) / 2
				bestCy = (rowY(top) + rowY(bottom)) / 2
			}
		}
	}

	const width = Math.max(bestWidth, bounds.width * INSCRIBED_BOX_FLOOR)
	const height = Math.max(bestHeight, bounds.height * INSCRIBED_BOX_FLOOR)
	// A floored side can no longer be centred where it was found without leaving the bbox
	const cx = clamp(bestCx, bounds.x + width / 2, bounds.x + bounds.width - width / 2)
	const cy = clamp(bestCy, bounds.y + height / 2, bounds.y + bounds.height - height / 2)
	return { x: cx - width / 2, y: cy - height / 2, width, height }
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
	const squaredDiffs = values.map((v) => (v - avg) ** 2)
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
