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
 * Bezier Curve Fitting for Smart Ink
 *
 * Converts freehand strokes to cubic bezier curves with:
 * - Speed-aware corner detection
 * - Adaptive coordinate precision
 * - Auto-close detection for closed shapes
 * - G1 continuity at segment boundaries
 */

import type { TimedPoint, StrokeMetrics, DrawingIntent } from '../smart-ink/stroke-analyzer.js'
import { distance, getBoundsFromPoints, type Point } from './geometry.js'
import type { Bounds } from '../crdt/index.js'

// ============================================================================
// Types
// ============================================================================

export interface BezierSegment {
	start: Point
	control1: Point
	control2: Point
	end: Point
}

export interface PrecisionConfig {
	decimalPlaces: number
	quantizationStep: number
}

export interface BezierFitResult {
	pathData: string
	bounds: Bounds
	closed: boolean
}

// ============================================================================
// Constants
// ============================================================================

// Speed thresholds (from stroke-analyzer)
const SPEED_EXPRESSIVE = 800
const SPEED_PRECISE = 200

// Corner detection parameters by intent
const CORNER_CONFIG = {
	expressive: { minAngle: 60, speedWeight: 0.3 },
	balanced: { minAngle: 40, speedWeight: 0.5 },
	precise: { minAngle: 25, speedWeight: 0.7 }
}

// Adaptive subdivision parameters
const MAX_RECURSION_DEPTH = 6
const MIN_SEGMENT_POINTS = 3
const DEVIATION_SAMPLES = 20 // Number of t-samples for deviation calculation

// Max deviation thresholds by intent (in pixels)
const MAX_DEVIATION = {
	expressive: 4.0,
	balanced: 2.0,
	precise: 1.0
}

// Straightness threshold: if path length / chord length < this, treat as straight
// This prevents subdivision of nearly-straight lines which would add wobble
const STRAIGHTNESS_THRESHOLD = 1.02

// ============================================================================
// Coordinate Precision
// ============================================================================

/**
 * Calculate precision based on stroke bounds size
 */
export function calculatePrecision(bounds: Bounds, intent: DrawingIntent): PrecisionConfig {
	const diagonal = Math.sqrt(bounds.width ** 2 + bounds.height ** 2)

	// Base precision from stroke size
	let decimalPlaces: number
	let quantizationStep: number

	if (diagonal < 50) {
		decimalPlaces = 2
		quantizationStep = 0.01
	} else if (diagonal < 200) {
		decimalPlaces = 1
		quantizationStep = 0.1
	} else if (diagonal < 500) {
		decimalPlaces = 1
		quantizationStep = 0.5
	} else {
		decimalPlaces = 0
		quantizationStep = 1
	}

	// Adjust for intent
	if (intent === 'precise') {
		decimalPlaces = Math.min(decimalPlaces + 1, 2)
		quantizationStep = Math.max(quantizationStep / 10, 0.01)
	} else if (intent === 'expressive') {
		decimalPlaces = Math.max(decimalPlaces - 1, 0)
		quantizationStep = Math.min(quantizationStep * 10, 1)
	}

	return { decimalPlaces, quantizationStep }
}

/**
 * Quantize a coordinate value
 */
export function quantizeCoord(value: number, precision: PrecisionConfig): number {
	const quantized = Math.round(value / precision.quantizationStep) * precision.quantizationStep
	return Number(quantized.toFixed(precision.decimalPlaces))
}

// ============================================================================
// Speed Calculation
// ============================================================================

/**
 * Calculate speeds between consecutive timed points
 */
function calculateSpeeds(timedPoints: TimedPoint[]): number[] {
	const speeds: number[] = []
	for (let i = 1; i < timedPoints.length; i++) {
		const prev = timedPoints[i - 1]
		const curr = timedPoints[i]
		const dist = distance([prev.x, prev.y], [curr.x, curr.y])
		const timeDelta = curr.timestamp - prev.timestamp
		if (timeDelta > 0) {
			speeds.push((dist / timeDelta) * 1000)
		} else {
			speeds.push(speeds.length > 0 ? speeds[speeds.length - 1] : 0)
		}
	}
	return speeds
}

/**
 * Get local speed at a point index (average of nearby speeds)
 */
function getLocalSpeed(speeds: number[], idx: number, windowSize: number = 3): number {
	const start = Math.max(0, idx - windowSize)
	const end = Math.min(speeds.length, idx + windowSize)
	if (start >= end) return speeds[idx] ?? 0
	let sum = 0
	for (let i = start; i < end; i++) {
		sum += speeds[i]
	}
	return sum / (end - start)
}

// ============================================================================
// Corner Detection (Speed-Weighted)
// ============================================================================

/**
 * Calculate direction at a point (in radians)
 */
function getDirection(points: Point[], idx: number, windowSize: number = 2): number {
	const n = points.length
	const prevIdx = Math.max(0, idx - windowSize)
	const nextIdx = Math.min(n - 1, idx + windowSize)

	const dx = points[nextIdx][0] - points[prevIdx][0]
	const dy = points[nextIdx][1] - points[prevIdx][1]
	return Math.atan2(dy, dx)
}

/**
 * Calculate direction change at a point (in degrees, 0-180)
 */
function getDirectionChange(points: Point[], idx: number, windowSize: number = 3): number {
	if (idx < windowSize || idx >= points.length - windowSize) return 0

	const dir1 = getDirection(points, idx - windowSize, windowSize)
	const dir2 = getDirection(points, idx + windowSize, windowSize)

	let change = Math.abs(dir2 - dir1)
	if (change > Math.PI) change = 2 * Math.PI - change

	return (change * 180) / Math.PI
}

/**
 * Detect corners using speed-weighted scoring
 */
export function detectBezierCorners(
	timedPoints: TimedPoint[],
	metrics: StrokeMetrics,
	intent: DrawingIntent
): number[] {
	const n = timedPoints.length
	if (n < 6) return []

	const config = CORNER_CONFIG[intent]
	const points: Point[] = timedPoints.map((p) => [p.x, p.y])
	const speeds = calculateSpeeds(timedPoints)

	// Score each point
	const scores: { idx: number; score: number }[] = []
	const windowSize = Math.max(2, Math.min(5, Math.floor(n / 20)))

	for (let i = windowSize; i < n - windowSize; i++) {
		const dirChange = getDirectionChange(points, i, windowSize)

		// Speed factor: slower = higher score multiplier
		const localSpeed = getLocalSpeed(speeds, i, windowSize)
		const speedFactor = Math.min(2, Math.max(0.5, localSpeed / metrics.avgSpeed))

		// Score = direction change * (1 + speedWeight * (2 - speedFactor))
		// Slower drawing → higher score
		const score = dirChange * (1 + config.speedWeight * (2 - speedFactor))

		if (score >= config.minAngle) {
			scores.push({ idx: i, score })
		}
	}

	// Sort by score (highest first) and select corners
	scores.sort((a, b) => b.score - a.score)

	const minSpacing = Math.max(windowSize * 2, Math.floor(n / 15))
	const corners: number[] = []

	for (const { idx } of scores) {
		// Check minimum spacing from existing corners
		let tooClose = false
		for (const c of corners) {
			if (Math.abs(c - idx) < minSpacing) {
				tooClose = true
				break
			}
		}
		if (!tooClose) {
			corners.push(idx)
		}
	}

	// Sort by index
	corners.sort((a, b) => a - b)

	return corners
}

// ============================================================================
// Bezier Fitting
// ============================================================================

/**
 * Estimate tangent at start of segment
 */
function estimateStartTangent(points: Point[], speeds: number[], avgSpeed: number): Point {
	if (points.length < 2) return [1, 0]

	// Use direction from first few points
	const lookAhead = Math.min(3, points.length - 1)
	let dx = 0,
		dy = 0
	for (let i = 0; i < lookAhead; i++) {
		const weight = 1 / (i + 1)
		dx += (points[i + 1][0] - points[i][0]) * weight
		dy += (points[i + 1][1] - points[i][1]) * weight
	}

	const len = Math.sqrt(dx * dx + dy * dy)
	if (len < 0.001) return [1, 0]
	return [dx / len, dy / len]
}

/**
 * Estimate tangent at end of segment
 */
function estimateEndTangent(points: Point[], speeds: number[], avgSpeed: number): Point {
	const n = points.length
	if (n < 2) return [1, 0]

	// Use direction from last few points
	const lookBack = Math.min(3, n - 1)
	let dx = 0,
		dy = 0
	for (let i = 0; i < lookBack; i++) {
		const weight = 1 / (i + 1)
		dx += (points[n - 1 - i][0] - points[n - 2 - i][0]) * weight
		dy += (points[n - 1 - i][1] - points[n - 2 - i][1]) * weight
	}

	const len = Math.sqrt(dx * dx + dy * dy)
	if (len < 0.001) return [1, 0]
	return [dx / len, dy / len]
}

/**
 * Calculate tangent length based on segment length and local speed
 */
function calculateTangentLength(
	segmentLength: number,
	localSpeed: number,
	avgSpeed: number
): number {
	// Base: 1/3 of segment length (standard bezier heuristic)
	// Faster drawing → longer tangents (smoother curves)
	const speedFactor = Math.min(1.5, Math.max(0.5, localSpeed / avgSpeed))
	return segmentLength * 0.33 * speedFactor
}

/**
 * Fit a cubic bezier to a segment of points
 */
export function fitBezierSegment(
	points: Point[],
	speeds: number[],
	avgSpeed: number,
	constrainedStartTangent?: Point
): BezierSegment {
	const n = points.length
	if (n < 2) {
		const p = points[0] ?? [0, 0]
		return { start: p, control1: p, control2: p, end: p }
	}

	const start = points[0]
	const end = points[n - 1]
	const segmentLength = distance(start, end)

	// Get tangent directions
	const startTangent = constrainedStartTangent ?? estimateStartTangent(points, speeds, avgSpeed)
	const endTangent = estimateEndTangent(points, speeds, avgSpeed)

	// Calculate tangent lengths
	const startSpeed =
		speeds.length > 0
			? speeds.slice(0, Math.min(3, speeds.length)).reduce((a, b) => a + b, 0) /
				Math.min(3, speeds.length)
			: avgSpeed
	const endSpeed =
		speeds.length > 0
			? speeds.slice(-Math.min(3, speeds.length)).reduce((a, b) => a + b, 0) /
				Math.min(3, speeds.length)
			: avgSpeed

	const startLen = calculateTangentLength(segmentLength, startSpeed, avgSpeed)
	const endLen = calculateTangentLength(segmentLength, endSpeed, avgSpeed)

	const control1: Point = [
		start[0] + startTangent[0] * startLen,
		start[1] + startTangent[1] * startLen
	]

	const control2: Point = [end[0] - endTangent[0] * endLen, end[1] - endTangent[1] * endLen]

	return { start, control1, control2, end }
}

// ============================================================================
// Bezier Evaluation (for adaptive subdivision)
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
 * Find the minimum distance from a point to the bezier curve
 * Uses sampling approach (faster than analytical for our needs)
 */
function distanceToSegment(point: Point, seg: BezierSegment): number {
	let minDist = Infinity

	// Sample the bezier at multiple t values
	for (let i = 0; i <= DEVIATION_SAMPLES; i++) {
		const t = i / DEVIATION_SAMPLES
		const bezierPoint = pointOnBezier(t, seg)
		const dist = distance(point, bezierPoint)
		if (dist < minDist) {
			minDist = dist
		}
	}

	return minDist
}

/**
 * Calculate max deviation of points from the fitted bezier
 * Returns the maximum deviation and the index of the worst point
 * Skips first and last points (they're on the curve by definition)
 */
function calculateMaxDeviation(
	points: Point[],
	segment: BezierSegment
): { maxDeviation: number; worstIndex: number } {
	let maxDeviation = 0
	let worstIndex = 1 // Default to first interior point

	// Skip first and last points (they match the bezier endpoints)
	for (let i = 1; i < points.length - 1; i++) {
		const deviation = distanceToSegment(points[i], segment)
		if (deviation > maxDeviation) {
			maxDeviation = deviation
			worstIndex = i
		}
	}

	return { maxDeviation, worstIndex }
}

/**
 * Get outgoing tangent direction from a bezier segment
 */
function getOutgoingTangent(seg: BezierSegment): Point {
	const dx = seg.end[0] - seg.control2[0]
	const dy = seg.end[1] - seg.control2[1]
	const len = Math.sqrt(dx * dx + dy * dy)
	if (len < 0.001) return [1, 0]
	return [dx / len, dy / len]
}

/**
 * Calculate total path length (sum of distances between consecutive points)
 */
function calculatePathLength(points: Point[]): number {
	let length = 0
	for (let i = 1; i < points.length; i++) {
		length += distance(points[i - 1], points[i])
	}
	return length
}

/**
 * Check if a segment is "nearly straight"
 * Compares path length to chord length (direct start-to-end distance)
 */
function isNearlyStraight(points: Point[]): boolean {
	if (points.length < 2) return true
	const chordLength = distance(points[0], points[points.length - 1])
	if (chordLength < 1) return true // Very short segment
	const pathLength = calculatePathLength(points)
	return pathLength / chordLength < STRAIGHTNESS_THRESHOLD
}

/**
 * Recursively fit beziers with adaptive subdivision
 * Subdivides at the point of maximum deviation until error is acceptable
 */
function fitBezierAdaptive(
	points: Point[],
	speeds: number[],
	avgSpeed: number,
	maxAllowedDeviation: number,
	depth: number,
	constrainedStartTangent?: Point
): BezierSegment[] {
	// Base case: too few points or max depth reached
	if (points.length < MIN_SEGMENT_POINTS || depth >= MAX_RECURSION_DEPTH) {
		return [fitBezierSegment(points, speeds, avgSpeed, constrainedStartTangent)]
	}

	// Skip subdivision for nearly-straight segments to avoid adding wobble
	if (isNearlyStraight(points)) {
		return [fitBezierSegment(points, speeds, avgSpeed, constrainedStartTangent)]
	}

	// Fit a single bezier to this segment
	const segment = fitBezierSegment(points, speeds, avgSpeed, constrainedStartTangent)

	// Check if the fit is good enough
	const { maxDeviation, worstIndex } = calculateMaxDeviation(points, segment)

	if (maxDeviation <= maxAllowedDeviation) {
		return [segment] // Good enough, return this single segment
	}

	// Subdivide at the worst point
	const leftPoints = points.slice(0, worstIndex + 1)
	const rightPoints = points.slice(worstIndex)

	// Slice speeds accordingly (speeds array has length = points.length - 1)
	const leftSpeeds = speeds.slice(0, worstIndex)
	const rightSpeeds = speeds.slice(worstIndex)

	// Recursively fit left side
	const leftSegments = fitBezierAdaptive(
		leftPoints,
		leftSpeeds,
		avgSpeed,
		maxAllowedDeviation,
		depth + 1,
		constrainedStartTangent
	)

	// Get outgoing tangent from last left segment for G1 continuity
	const lastLeft = leftSegments[leftSegments.length - 1]
	const outgoingTangent = getOutgoingTangent(lastLeft)

	// Recursively fit right side with tangent constraint
	const rightSegments = fitBezierAdaptive(
		rightPoints,
		rightSpeeds,
		avgSpeed,
		maxAllowedDeviation,
		depth + 1,
		outgoingTangent
	)

	return [...leftSegments, ...rightSegments]
}

/**
 * Fit bezier curves to points, splitting at corners
 * Uses adaptive subdivision to preserve detail within each corner-segment
 */
export function fitBezierCurves(
	timedPoints: TimedPoint[],
	metrics: StrokeMetrics,
	intent: DrawingIntent,
	corners: number[]
): BezierSegment[] {
	const n = timedPoints.length
	if (n < 2) return []

	const points: Point[] = timedPoints.map((p) => [p.x, p.y])
	const speeds = calculateSpeeds(timedPoints)
	const avgSpeed = metrics.avgSpeed

	// Get max deviation threshold based on intent
	const maxDeviation = MAX_DEVIATION[intent]

	// Create segment boundaries (including start and end)
	const boundaries = [0, ...corners, n - 1]

	// Remove duplicates and sort
	const uniqueBoundaries = [...new Set(boundaries)].sort((a, b) => a - b)

	const allSegments: BezierSegment[] = []
	let prevOutgoingTangent: Point | undefined

	for (let i = 0; i < uniqueBoundaries.length - 1; i++) {
		const startIdx = uniqueBoundaries[i]
		const endIdx = uniqueBoundaries[i + 1]

		if (endIdx <= startIdx) continue

		// Extract segment points and speeds
		const segmentPoints = points.slice(startIdx, endIdx + 1)
		const segmentSpeeds = speeds.slice(startIdx, endIdx)

		// Use adaptive subdivision to fit beziers
		const subSegments = fitBezierAdaptive(
			segmentPoints,
			segmentSpeeds,
			avgSpeed,
			maxDeviation,
			0, // initial depth
			prevOutgoingTangent
		)

		allSegments.push(...subSegments)

		// Get outgoing tangent from last sub-segment for G1 continuity
		if (subSegments.length > 0) {
			prevOutgoingTangent = getOutgoingTangent(subSegments[subSegments.length - 1])
		}
	}

	return allSegments
}

// ============================================================================
// Auto-Close Detection
// ============================================================================

/**
 * Determine if path should be auto-closed
 */
export function shouldAutoClose(points: Point[], bounds: Bounds): boolean {
	if (points.length < 3) return false

	const start = points[0]
	const end = points[points.length - 1]
	const gap = distance(start, end)

	// Threshold: smaller of 20px or 5% of stroke diagonal
	const diagonal = Math.sqrt(bounds.width ** 2 + bounds.height ** 2)
	const threshold = Math.min(20, diagonal * 0.05)

	return gap <= threshold
}

/**
 * Create closing segment from end back to start
 */
export function createClosingSegment(segments: BezierSegment[], avgSpeed: number): BezierSegment {
	if (segments.length === 0) {
		return { start: [0, 0], control1: [0, 0], control2: [0, 0], end: [0, 0] }
	}

	const lastSeg = segments[segments.length - 1]
	const firstSeg = segments[0]
	const start = lastSeg.end
	const end = firstSeg.start

	// Get outgoing tangent from last segment
	const lastDx = lastSeg.end[0] - lastSeg.control2[0]
	const lastDy = lastSeg.end[1] - lastSeg.control2[1]
	const lastLen = Math.sqrt(lastDx * lastDx + lastDy * lastDy)
	const startTangent: Point = lastLen > 0.001 ? [lastDx / lastLen, lastDy / lastLen] : [1, 0]

	// Get incoming tangent to first segment
	const firstDx = firstSeg.control1[0] - firstSeg.start[0]
	const firstDy = firstSeg.control1[1] - firstSeg.start[1]
	const firstLen = Math.sqrt(firstDx * firstDx + firstDy * firstDy)
	const endTangent: Point = firstLen > 0.001 ? [firstDx / firstLen, firstDy / firstLen] : [1, 0]

	const segmentLength = distance(start, end)
	const tangentLen = segmentLength * 0.33

	return {
		start,
		control1: [
			start[0] + startTangent[0] * tangentLen,
			start[1] + startTangent[1] * tangentLen
		],
		control2: [end[0] - endTangent[0] * tangentLen, end[1] - endTangent[1] * tangentLen],
		end
	}
}

// ============================================================================
// SVG Path Generation
// ============================================================================

/**
 * Format a coordinate with precision
 */
function formatCoord(value: number, precision: PrecisionConfig): string {
	const q = quantizeCoord(value, precision)
	return precision.decimalPlaces === 0
		? String(Math.round(q))
		: q.toFixed(precision.decimalPlaces)
}

/**
 * Convert bezier segments to SVG path string with relative coordinates
 * Offsets all coordinates by -offsetX, -offsetY so path is relative to bounds origin
 */
export function segmentsToSvgPath(
	segments: BezierSegment[],
	precision: PrecisionConfig,
	closed: boolean,
	offsetX: number = 0,
	offsetY: number = 0
): string {
	if (segments.length === 0) return ''

	const parts: string[] = []

	// Move to start (relative to offset)
	const first = segments[0]
	parts.push(
		`M${formatCoord(first.start[0] - offsetX, precision)} ${formatCoord(first.start[1] - offsetY, precision)}`
	)

	// Add curve commands (all coords relative to offset)
	for (const seg of segments) {
		parts.push(
			`C${formatCoord(seg.control1[0] - offsetX, precision)} ${formatCoord(seg.control1[1] - offsetY, precision)} ` +
				`${formatCoord(seg.control2[0] - offsetX, precision)} ${formatCoord(seg.control2[1] - offsetY, precision)} ` +
				`${formatCoord(seg.end[0] - offsetX, precision)} ${formatCoord(seg.end[1] - offsetY, precision)}`
		)
	}

	// Close path if needed
	if (closed) {
		parts.push('Z')
	}

	return parts.join('')
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Convert timed points to an optimized bezier path
 */
export function fitBezierPath(
	timedPoints: TimedPoint[],
	metrics: StrokeMetrics,
	intent: DrawingIntent
): BezierFitResult {
	const points: Point[] = timedPoints.map((p) => [p.x, p.y])
	const bounds = getBoundsFromPoints(points)

	// Calculate precision
	const precision = calculatePrecision(bounds, intent)

	// Detect corners
	const corners = detectBezierCorners(timedPoints, metrics, intent)

	// Fit bezier curves
	let segments = fitBezierCurves(timedPoints, metrics, intent, corners)

	// Check for auto-close
	const closed = shouldAutoClose(points, bounds)
	if (closed && segments.length > 0) {
		const closingSeg = createClosingSegment(segments, metrics.avgSpeed)
		segments.push(closingSeg)
	}

	// Generate SVG path with coordinates relative to bounds origin
	const pathData = segmentsToSvgPath(segments, precision, closed, bounds.x, bounds.y)

	return {
		pathData,
		bounds,
		closed
	}
}

// vim: ts=4
