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
 * Smart Ink - Intelligent stroke processing
 *
 * Main entry point for the Smart Ink feature.
 * Analyzes freehand strokes and optionally converts them to shapes
 * based on user drawing intent (speed-based).
 */

import { isClosedPath, type Point } from '../utils/geometry.js'
import { rdpSimplify } from '../utils/index.js'
import {
	analyzeStroke,
	classifyIntent,
	shouldDetectShapes,
	getSmoothingFactor,
	type TimedPoint,
	type StrokeMetrics,
	type DrawingIntent
} from './stroke-analyzer.js'
import {
	// Line
	detectLine,
	isConfidentLine,
	type LineCandidate,
	// Ellipse
	detectEllipse,
	isConfidentEllipse,
	type EllipseCandidate,
	// Rectangle
	detectRectangle,
	isConfidentRectangle,
	type RectangleCandidate,
	// Polygon
	detectPolygon,
	isConfidentPolygon,
	type PolygonCandidate,
	// Arrow
	detectArrow,
	isConfidentArrow,
	type ArrowCandidate
} from './shape-detectors/index.js'
import { adaptiveSmooth } from './path-processing/index.js'

// Re-export types and utilities
export * from './stroke-analyzer.js'
export * from './shape-detectors/index.js'
export * from './path-processing/index.js'
export * from './morph-animation.js'

// Processing configuration
const RDP_TOLERANCE = 1.5

// Debug configuration - set to true to enable console logging
const DEBUG_SMART_INK = true

function debugLog(title: string, data: Record<string, unknown>) {
	if (!DEBUG_SMART_INK) return
	console.group(`%c🎨 Smart Ink: ${title}`, 'color: #6366f1; font-weight: bold')
	for (const [key, value] of Object.entries(data)) {
		if (typeof value === 'number') {
			console.log(`  ${key}: %c${value.toFixed(3)}`, 'color: #22c55e')
		} else if (value === null) {
			console.log(`  ${key}: %cnull`, 'color: #ef4444')
		} else {
			console.log(`  ${key}:`, value)
		}
	}
	console.groupEnd()
}

/**
 * Result type for Smart Ink processing
 */
export type SmartInkResultType = 'line' | 'ellipse' | 'rect' | 'arrow' | 'polygon' | 'freehand'

/**
 * Result of processing a stroke with Smart Ink
 */
export interface SmartInkResult {
	/**
	 * Type of detected shape
	 */
	type: SmartInkResultType

	/**
	 * Processed points (smoothed and/or simplified)
	 */
	points: Point[]

	/**
	 * Original input points (for undo)
	 */
	originalPoints: Point[]

	/**
	 * Stroke metrics from analysis
	 */
	metrics: StrokeMetrics

	/**
	 * Drawing intent classification
	 */
	intent: DrawingIntent

	/**
	 * Detected shape candidates (if any)
	 */
	lineCandidate?: LineCandidate
	ellipseCandidate?: EllipseCandidate
	rectangleCandidate?: RectangleCandidate
	polygonCandidate?: PolygonCandidate
	arrowCandidate?: ArrowCandidate

	/**
	 * Whether shape was auto-detected (for snapped flag)
	 */
	snapped: boolean
}

/**
 * Process a stroke with Smart Ink
 *
 * This is the main entry point for stroke processing.
 * It analyzes the stroke, detects shapes if appropriate,
 * and applies smoothing based on drawing speed.
 *
 * Detection priority:
 * 1. Closed paths: ellipse → rectangle → polygon
 * 2. Open paths: arrow → line
 * 3. Default: smoothed freehand
 *
 * @param timedPoints - Points with timestamps from drawing
 * @returns Processing result with type, points, and metadata
 */
export function processSmartInk(timedPoints: TimedPoint[]): SmartInkResult {
	// Convert to simple points
	const originalPoints: Point[] = timedPoints.map((p) => [p.x, p.y])

	// Analyze stroke metrics
	const metrics = analyzeStroke(timedPoints)
	const intent = classifyIntent(metrics)

	debugLog('Stroke Analysis', {
		pointCount: metrics.pointCount,
		totalTime: metrics.totalTime,
		pathLength: metrics.pathLength,
		avgSpeed: metrics.avgSpeed,
		speedVariance: metrics.speedVariance,
		isClosed: metrics.isClosed,
		intent
	})

	// Default result (freehand with RDP simplification)
	let result: SmartInkResult = {
		type: 'freehand',
		points: rdpSimplify(originalPoints, RDP_TOLERANCE),
		originalPoints,
		metrics,
		intent,
		snapped: false
	}

	// Check if we should attempt shape detection
	const shouldDetect = shouldDetectShapes(metrics)
	if (!shouldDetect) {
		debugLog('Detection Skipped', {
			reason: 'Speed too high or stroke too short',
			shouldDetect
		})
		return result
	}

	// Check if path is closed for closed-shape detection
	const isClosed = isClosedPath(originalPoints, 25)

	debugLog('Path Analysis', {
		isClosed,
		closedThreshold: 25
	})

	if (isClosed) {
		// Try closed shape detection in priority order
		// Rectangle/polygon first (more specific), then ellipse (more general)

		// 1. Try rectangle (includes diamond) - check first as it's more specific
		const rectangleCandidate = detectRectangle(originalPoints)
		debugLog('Rectangle Detection', {
			detected: rectangleCandidate !== null,
			confidence: rectangleCandidate?.confidence ?? null,
			isConfident: isConfidentRectangle(rectangleCandidate),
			isDiamond: rectangleCandidate?.isDiamond ?? null,
			bounds: rectangleCandidate
				? `${rectangleCandidate.bounds.width.toFixed(1)}x${rectangleCandidate.bounds.height.toFixed(1)}`
				: null,
			rotation: rectangleCandidate?.rotation ?? null
		})
		if (isConfidentRectangle(rectangleCandidate)) {
			debugLog('Result', {
				type: 'rect',
				snapped: true,
				isDiamond: rectangleCandidate!.isDiamond
			})
			return {
				type: 'rect',
				points: rectangleCandidate!.corners,
				originalPoints,
				metrics,
				intent,
				rectangleCandidate: rectangleCandidate!,
				snapped: true
			}
		}

		// 2. Try polygon (triangles, pentagons, etc.)
		const polygonCandidate = detectPolygon(originalPoints)
		debugLog('Polygon Detection', {
			detected: polygonCandidate !== null,
			confidence: polygonCandidate?.confidence ?? null,
			isConfident: isConfidentPolygon(polygonCandidate),
			vertexCount: polygonCandidate?.vertexCount ?? null
		})
		if (isConfidentPolygon(polygonCandidate)) {
			debugLog('Result', {
				type: 'polygon',
				snapped: true,
				vertexCount: polygonCandidate!.vertexCount
			})
			return {
				type: 'polygon',
				points: polygonCandidate!.vertices,
				originalPoints,
				metrics,
				intent,
				polygonCandidate: polygonCandidate!,
				snapped: true
			}
		}

		// 3. Try ellipse (most general closed shape)
		const ellipseCandidate = detectEllipse(originalPoints)
		debugLog('Ellipse Detection', {
			detected: ellipseCandidate !== null,
			confidence: ellipseCandidate?.confidence ?? null,
			isConfident: isConfidentEllipse(ellipseCandidate),
			center: ellipseCandidate
				? `(${ellipseCandidate.center[0].toFixed(1)}, ${ellipseCandidate.center[1].toFixed(1)})`
				: null,
			radiusX: ellipseCandidate?.radiusX ?? null,
			radiusY: ellipseCandidate?.radiusY ?? null,
			rotation: ellipseCandidate?.rotation ?? null
		})
		if (isConfidentEllipse(ellipseCandidate)) {
			debugLog('Result', { type: 'ellipse', snapped: true })
			return {
				type: 'ellipse',
				points: originalPoints, // Points will be regenerated for ellipse
				originalPoints,
				metrics,
				intent,
				ellipseCandidate: ellipseCandidate!,
				snapped: true
			}
		}
	} else {
		// Try open shape detection

		// 1. Try arrow first (more specific than line)
		const arrowCandidate = detectArrow(originalPoints)
		debugLog('Arrow Detection', {
			detected: arrowCandidate !== null,
			confidence: arrowCandidate?.confidence ?? null,
			isConfident: isConfidentArrow(arrowCandidate),
			arrowheadPosition: arrowCandidate?.arrowheadPosition ?? null
		})
		if (isConfidentArrow(arrowCandidate)) {
			debugLog('Result', {
				type: 'arrow',
				snapped: true,
				arrowheadPosition: arrowCandidate!.arrowheadPosition
			})
			return {
				type: 'arrow',
				points: [arrowCandidate!.start, arrowCandidate!.end],
				originalPoints,
				metrics,
				intent,
				arrowCandidate: arrowCandidate!,
				snapped: true
			}
		}

		// 2. Try line
		const lineCandidate = detectLine(originalPoints)
		debugLog('Line Detection', {
			detected: lineCandidate !== null,
			confidence: lineCandidate?.confidence ?? null,
			isConfident: isConfidentLine(lineCandidate),
			length: lineCandidate
				? Math.sqrt(
						Math.pow(lineCandidate.end[0] - lineCandidate.start[0], 2) +
							Math.pow(lineCandidate.end[1] - lineCandidate.start[1], 2)
					)
				: null
		})
		if (isConfidentLine(lineCandidate)) {
			debugLog('Result', { type: 'line', snapped: true })
			return {
				type: 'line',
				points: [lineCandidate!.start, lineCandidate!.end],
				originalPoints,
				metrics,
				intent,
				lineCandidate: lineCandidate!,
				snapped: true
			}
		}
	}

	// No confident shape detected - apply adaptive smoothing
	const smoothingFactor = getSmoothingFactor(metrics)
	const smoothed = adaptiveSmooth(originalPoints, smoothingFactor)
	result.points = rdpSimplify(smoothed, RDP_TOLERANCE)

	debugLog('Result', { type: 'freehand', snapped: false, smoothingFactor })

	return result
}

// ============================================================================
// Preview functions for visual hints during drawing
// ============================================================================

/**
 * Quick check if stroke might be a line (for preview during drawing)
 */
export function mightBeLine(points: Point[]): boolean {
	if (points.length < 5) return false
	const lineCandidate = detectLine(points)
	return lineCandidate !== null && lineCandidate.confidence > 0.35
}

/**
 * Quick check if stroke might be an ellipse
 */
export function mightBeEllipse(points: Point[]): boolean {
	if (points.length < 8) return false
	const ellipseCandidate = detectEllipse(points)
	return ellipseCandidate !== null && ellipseCandidate.confidence > 0.5
}

/**
 * Quick check if stroke might be a rectangle
 */
export function mightBeRectangle(points: Point[]): boolean {
	if (points.length < 8) return false
	const rectangleCandidate = detectRectangle(points)
	return rectangleCandidate !== null && rectangleCandidate.confidence > 0.5
}

/**
 * Quick check if stroke might be a polygon
 */
export function mightBePolygon(points: Point[]): boolean {
	if (points.length < 6) return false
	const polygonCandidate = detectPolygon(points)
	return polygonCandidate !== null && polygonCandidate.confidence > 0.45
}

/**
 * Quick check if stroke might be an arrow
 */
export function mightBeArrow(points: Point[]): boolean {
	if (points.length < 8) return false
	const arrowCandidate = detectArrow(points)
	return arrowCandidate !== null && arrowCandidate.confidence > 0.45
}

// vim: ts=4
