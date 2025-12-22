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
 * Arrow Detector for Smart Ink
 *
 * Detects if a freehand stroke is an arrow (line with arrowhead).
 * Builds on line detection and looks for return stroke pattern.
 */

import {
	distance,
	perpendicularDistance,
	lineAngle,
	angleBetweenVectors,
	type Point
} from '../../utils/geometry.js'
import { detectLine, type LineCandidate } from './line-detector.js'

export type ArrowheadPosition = 'start' | 'end' | 'both'

export interface ArrowCandidate {
	type: 'arrow'
	start: Point
	end: Point
	arrowheadPosition: ArrowheadPosition
	confidence: number // 0-1
	originalPoints: Point[]
}

// Detection thresholds
const MIN_POINTS = 8 // Minimum points for arrow detection
const MIN_LINE_LENGTH = 30 // Minimum shaft length
const ARROWHEAD_PERCENT = 0.25 // Look at last 25% of points for arrowhead
const MIN_ARROWHEAD_ANGLE = 25 // Minimum angle of arrowhead from shaft
const MAX_ARROWHEAD_ANGLE = 75 // Maximum angle of arrowhead from shaft
const MIN_RETURN_DISTANCE = 8 // Minimum return stroke distance
const MAX_SHAFT_DEVIATION = 0.05 // Max deviation for shaft (5% of length)
const MIN_CONFIDENCE = 0.5 // Minimum confidence for auto-detection
const HIGH_CONFIDENCE = 0.65 // High confidence threshold

/**
 * Detect if a stroke is an arrow
 *
 * Algorithm:
 * 1. Check if main stroke is approximately a line
 * 2. Look for return stroke pattern at end (and optionally start)
 * 3. Validate arrowhead angle is within expected range
 */
export function detectArrow(points: Point[]): ArrowCandidate | null {
	if (points.length < MIN_POINTS) return null

	const n = points.length
	const start = points[0]
	const approximateEnd = points[Math.floor(n * 0.7)] // Look at ~70% as potential shaft end

	// Check if main portion is approximately a line
	const shaftPoints = points.slice(0, Math.floor(n * 0.75))
	const lineCandidate = detectLine(shaftPoints)

	// If main shaft isn't line-like, try full detection
	if (!lineCandidate || lineCandidate.confidence < 0.3) {
		return detectArrowWithFullAnalysis(points)
	}

	// Look for arrowhead at end
	const arrowheadInfo = detectArrowhead(points, lineCandidate.start, lineCandidate.end, 'end')

	if (!arrowheadInfo.hasArrowhead) {
		return null
	}

	// Check for arrowhead at start too
	const startArrowhead = detectArrowhead(
		[...points].reverse(),
		lineCandidate.end,
		lineCandidate.start,
		'start'
	)

	let arrowheadPosition: ArrowheadPosition = 'end'
	if (startArrowhead.hasArrowhead && arrowheadInfo.hasArrowhead) {
		arrowheadPosition = 'both'
	}

	// Calculate confidence
	const confidence = calculateConfidence(
		lineCandidate.confidence,
		arrowheadInfo.confidence,
		distance(lineCandidate.start, lineCandidate.end)
	)

	return {
		type: 'arrow',
		start: lineCandidate.start,
		end: lineCandidate.end,
		arrowheadPosition,
		confidence,
		originalPoints: points
	}
}

/**
 * Alternative arrow detection for cases where shaft isn't clearly a line
 * (e.g., when arrowhead takes up more of the stroke)
 */
function detectArrowWithFullAnalysis(points: Point[]): ArrowCandidate | null {
	const n = points.length

	// Find the point that's furthest from start
	let maxDist = 0
	let furthestIdx = 0
	const start = points[0]

	for (let i = 1; i < n; i++) {
		const d = distance(start, points[i])
		if (d > maxDist) {
			maxDist = d
			furthestIdx = i
		}
	}

	if (maxDist < MIN_LINE_LENGTH) return null

	const end = points[furthestIdx]

	// Check if path up to furthest point is line-like
	const shaftPoints = points.slice(0, furthestIdx + 1)
	let maxDeviation = 0
	for (const p of shaftPoints) {
		const dev = perpendicularDistance(p, start, end)
		maxDeviation = Math.max(maxDeviation, dev)
	}

	const relativeDeviation = maxDeviation / maxDist
	if (relativeDeviation > MAX_SHAFT_DEVIATION * 2) {
		return null
	}

	// Check for arrowhead in remaining points
	const remainingPoints = points.slice(furthestIdx)
	if (remainingPoints.length < 3) return null

	const arrowheadInfo = analyzeArrowhead(remainingPoints, start, end)
	if (!arrowheadInfo.hasArrowhead) return null

	const confidence = calculateConfidence(
		1 - relativeDeviation / MAX_SHAFT_DEVIATION,
		arrowheadInfo.confidence,
		maxDist
	)

	return {
		type: 'arrow',
		start,
		end,
		arrowheadPosition: 'end',
		confidence,
		originalPoints: points
	}
}

interface ArrowheadInfo {
	hasArrowhead: boolean
	confidence: number
}

/**
 * Detect arrowhead at one end of the arrow
 */
function detectArrowhead(
	points: Point[],
	shaftStart: Point,
	shaftEnd: Point,
	position: 'start' | 'end'
): ArrowheadInfo {
	const n = points.length
	const arrowheadStart = Math.floor(n * (1 - ARROWHEAD_PERCENT))
	const arrowheadPoints = points.slice(arrowheadStart)

	return analyzeArrowhead(arrowheadPoints, shaftStart, shaftEnd)
}

/**
 * Analyze points to determine if they form an arrowhead
 */
function analyzeArrowhead(
	arrowheadPoints: Point[],
	shaftStart: Point,
	shaftEnd: Point
): ArrowheadInfo {
	if (arrowheadPoints.length < 2) {
		return { hasArrowhead: false, confidence: 0 }
	}

	// Direction vector of shaft
	const shaftDx = shaftEnd[0] - shaftStart[0]
	const shaftDy = shaftEnd[1] - shaftStart[1]
	const shaftVector: Point = [shaftDx, shaftDy]

	// Look for return stroke: points moving back toward shaft or away at angle
	const endPoint = arrowheadPoints[arrowheadPoints.length - 1]
	const returnVector: Point = [endPoint[0] - shaftEnd[0], endPoint[1] - shaftEnd[1]]

	// Return distance should be significant
	const returnDist = distance(shaftEnd, endPoint)
	if (returnDist < MIN_RETURN_DISTANCE) {
		return { hasArrowhead: false, confidence: 0 }
	}

	// Calculate angle between shaft and return stroke
	const angle = angleBetweenVectors(shaftVector, returnVector)

	// Arrowhead angle should be between 25° and 75° (or 105° to 155° for other direction)
	const isValidAngle =
		(angle >= MIN_ARROWHEAD_ANGLE && angle <= MAX_ARROWHEAD_ANGLE) ||
		(angle >= 180 - MAX_ARROWHEAD_ANGLE && angle <= 180 - MIN_ARROWHEAD_ANGLE)

	if (!isValidAngle) {
		return { hasArrowhead: false, confidence: 0 }
	}

	// Calculate confidence based on angle quality
	// Best angle is around 45°
	const idealAngle = 45
	const normalizedAngle = angle <= 90 ? angle : 180 - angle
	const angleQuality = 1 - Math.abs(normalizedAngle - idealAngle) / 45

	// Return distance quality
	const distQuality = Math.min(returnDist / 20, 1)

	const confidence = angleQuality * 0.7 + distQuality * 0.3

	return {
		hasArrowhead: true,
		confidence: Math.max(0, Math.min(1, confidence))
	}
}

/**
 * Calculate overall arrow confidence
 */
function calculateConfidence(
	shaftConfidence: number,
	arrowheadConfidence: number,
	shaftLength: number
): number {
	// Size score
	const sizeScore = Math.min(shaftLength / 50, 1)

	// Combined score
	return Math.max(
		0,
		Math.min(1, shaftConfidence * 0.4 + arrowheadConfidence * 0.4 + sizeScore * 0.2)
	)
}

/**
 * Check if an arrow candidate meets the auto-detection threshold
 */
export function isConfidentArrow(candidate: ArrowCandidate | null): boolean {
	return candidate !== null && candidate.confidence >= HIGH_CONFIDENCE
}

/**
 * Generate points along an arrow for morph animation
 * (Just returns line points since arrowhead is rendered separately)
 */
export function generateArrowPoints(candidate: ArrowCandidate, numPoints: number): Point[] {
	const { start, end } = candidate
	const points: Point[] = []

	for (let i = 0; i < numPoints; i++) {
		const t = i / (numPoints - 1)
		points.push([start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t])
	}

	return points
}

// vim: ts=4
