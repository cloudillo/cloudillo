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
 * Stroke Analyzer for Smart Ink
 *
 * Collects metrics about drawing speed and intent to determine
 * whether to apply shape detection and smoothing.
 */

import { distance, type Point } from '../utils/geometry.js'

export interface TimedPoint {
	x: number
	y: number
	timestamp: number
}

export interface StrokeMetrics {
	avgSpeed: number // pixels per second
	speedVariance: number // consistency of speed
	totalTime: number // stroke duration in ms
	pathLength: number // total distance traveled
	isClosed: boolean // start ≈ end (within threshold)
	pointCount: number // number of points captured
}

export type DrawingIntent = 'expressive' | 'balanced' | 'precise'

// Speed thresholds (pixels per second)
const SPEED_EXPRESSIVE = 800 // > 800 px/s = fast, expressive drawing
const SPEED_PRECISE = 200 // < 200 px/s = slow, precise drawing
const CLOSED_THRESHOLD = 20 // pixels - distance for considering path closed

/**
 * Analyze a stroke to determine drawing intent and metrics
 */
export function analyzeStroke(timedPoints: TimedPoint[]): StrokeMetrics {
	if (timedPoints.length < 2) {
		return {
			avgSpeed: 0,
			speedVariance: 0,
			totalTime: 0,
			pathLength: 0,
			isClosed: false,
			pointCount: timedPoints.length
		}
	}

	const speeds: number[] = []
	let pathLength = 0

	// Calculate speeds between consecutive points
	for (let i = 1; i < timedPoints.length; i++) {
		const prev = timedPoints[i - 1]
		const curr = timedPoints[i]

		const dist = distance([prev.x, prev.y], [curr.x, curr.y])
		const timeDelta = curr.timestamp - prev.timestamp

		pathLength += dist

		if (timeDelta > 0) {
			const speed = (dist / timeDelta) * 1000 // Convert to px/second
			speeds.push(speed)
		}
	}

	// Calculate average speed
	const avgSpeed = speeds.length > 0 ? speeds.reduce((sum, s) => sum + s, 0) / speeds.length : 0

	// Calculate speed variance (standard deviation)
	const speedVariance =
		speeds.length > 0
			? Math.sqrt(
					speeds.reduce((sum, s) => sum + Math.pow(s - avgSpeed, 2), 0) / speeds.length
				)
			: 0

	// Total time
	const totalTime =
		timedPoints.length > 1
			? timedPoints[timedPoints.length - 1].timestamp - timedPoints[0].timestamp
			: 0

	// Check if path is closed
	const first = timedPoints[0]
	const last = timedPoints[timedPoints.length - 1]
	const isClosed = distance([first.x, first.y], [last.x, last.y]) < CLOSED_THRESHOLD

	return {
		avgSpeed,
		speedVariance,
		totalTime,
		pathLength,
		isClosed,
		pointCount: timedPoints.length
	}
}

/**
 * Classify drawing intent based on speed
 */
export function classifyIntent(metrics: StrokeMetrics): DrawingIntent {
	if (metrics.avgSpeed > SPEED_EXPRESSIVE) return 'expressive'
	if (metrics.avgSpeed < SPEED_PRECISE) return 'precise'
	return 'balanced'
}

/**
 * @deprecated Shape detection is now always attempted.
 * Confidence thresholds in each detector decide if a shape is recognized.
 */
export function shouldDetectShapes(_metrics: StrokeMetrics): boolean {
	return true
}

/**
 * Get smoothing factor based on drawing speed
 * Fast strokes → less smoothing (preserve expression)
 * Slow strokes → more smoothing (clean output)
 */
export function getSmoothingFactor(metrics: StrokeMetrics): number {
	// Map speed to smoothing factor (inverted: slow = high smoothing)
	const clampedSpeed = Math.max(SPEED_PRECISE, Math.min(SPEED_EXPRESSIVE, metrics.avgSpeed))
	const normalized = (clampedSpeed - SPEED_PRECISE) / (SPEED_EXPRESSIVE - SPEED_PRECISE)

	// Invert: high speed → low smoothing, low speed → high smoothing
	// Range: 0.2 (fast/expressive) to 0.8 (slow/precise)
	return 0.8 - normalized * 0.6
}

/**
 * Convert points with timestamps to simple point array
 */
export function timedPointsToPoints(timedPoints: TimedPoint[]): Point[] {
	return timedPoints.map((p) => [p.x, p.y])
}

// vim: ts=4
