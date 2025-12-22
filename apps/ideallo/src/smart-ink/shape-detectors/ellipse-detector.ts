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
 * Ellipse/Circle Detector for Smart Ink
 *
 * Detects if a freehand stroke is approximately a circle or ellipse
 * using centroid analysis and least-squares fitting.
 */

import {
	distance,
	calculateCentroid,
	mean,
	standardDeviation,
	isClosedPath,
	type Point
} from '../../utils/geometry.js'

export interface EllipseCandidate {
	type: 'circle' | 'ellipse'
	center: Point
	radiusX: number
	radiusY: number
	rotation: number // degrees
	confidence: number // 0-1
	originalPoints: Point[]
}

// Detection thresholds
const MIN_POINTS = 8 // Minimum points for ellipse detection
const MAX_RADIUS_VARIANCE = 0.25 // Max coefficient of variation for circle (25%)
const MAX_ELLIPSE_DEVIATION = 0.22 // Max average deviation from fitted ellipse (22%)
const CIRCLE_ASPECT_THRESHOLD = 0.85 // Aspect ratio above which it's a circle
const MIN_CONFIDENCE = 0.5 // Minimum confidence for auto-detection
const HIGH_CONFIDENCE = 0.7 // High confidence threshold

// Debug flag
const DEBUG_ELLIPSE = true

/**
 * Detect if a stroke is a circle or ellipse
 *
 * Algorithm:
 * 1. Check if path is closed
 * 2. Calculate centroid
 * 3. Measure distances from centroid (radius variance)
 * 4. Fit ellipse using simplified least-squares
 * 5. Calculate fit quality
 */
export function detectEllipse(points: Point[]): EllipseCandidate | null {
	if (points.length < MIN_POINTS) {
		if (DEBUG_ELLIPSE) console.log('  [Ellipse] REJECT: too few points', points.length)
		return null
	}

	// Must be a closed path
	if (!isClosedPath(points, 25)) {
		if (DEBUG_ELLIPSE) console.log('  [Ellipse] REJECT: path not closed')
		return null
	}

	// Calculate centroid
	const center = calculateCentroid(points)

	// Calculate distances from centroid
	const distances = points.map((p) => distance(p, center))
	const avgRadius = mean(distances)

	// Early exit if too small
	if (avgRadius < 10) {
		if (DEBUG_ELLIPSE) console.log('  [Ellipse] REJECT: too small, avgRadius=', avgRadius)
		return null
	}

	// Calculate radius variance (coefficient of variation)
	const radiusStdDev = standardDeviation(distances)
	const radiusCV = radiusStdDev / avgRadius

	if (DEBUG_ELLIPSE)
		console.log(
			'  [Ellipse] radiusCV:',
			radiusCV.toFixed(3),
			'threshold:',
			(MAX_RADIUS_VARIANCE * 2).toFixed(3)
		)

	// If very low variance, it's likely a circle
	if (radiusCV > MAX_RADIUS_VARIANCE * 2) {
		// Too irregular to be any ellipse
		if (DEBUG_ELLIPSE) console.log('  [Ellipse] REJECT: radiusCV too high')
		return null
	}

	// For circles/near-circles with low radiusCV, use simpler approach
	// based on actual measured radii rather than PCA fitting
	if (radiusCV < 0.15) {
		// This is close to a circle - use measured avgRadius
		if (DEBUG_ELLIPSE) console.log('  [Ellipse] using circle mode (low radiusCV)')

		const confidence = calculateConfidence(radiusCV * 0.5, radiusCV, {
			radiusX: avgRadius,
			radiusY: avgRadius
		})

		if (DEBUG_ELLIPSE) console.log('  [Ellipse] circle confidence:', confidence.toFixed(3))

		return {
			type: 'circle',
			center,
			radiusX: avgRadius,
			radiusY: avgRadius,
			rotation: 0,
			confidence,
			originalPoints: points
		}
	}

	// Fit ellipse to points using PCA for non-circular shapes
	const ellipse = fitEllipse(points, center)

	// Scale PCA results to match actual measured distances
	const pcaScale = avgRadius / ((ellipse.radiusX + ellipse.radiusY) / 2)
	const scaledRadiusX = ellipse.radiusX * pcaScale
	const scaledRadiusY = ellipse.radiusY * pcaScale
	const scaledEllipse = { ...ellipse, radiusX: scaledRadiusX, radiusY: scaledRadiusY }

	if (DEBUG_ELLIPSE)
		console.log('  [Ellipse] fitted:', {
			radiusX: scaledRadiusX.toFixed(1),
			radiusY: scaledRadiusY.toFixed(1),
			rotation: ellipse.rotation.toFixed(1)
		})

	// Calculate how well points fit the ellipse
	const deviations = points.map((p) => {
		const expected = getExpectedRadius(p, center, scaledEllipse)
		const actual = distance(p, center)
		return Math.abs(actual - expected) / expected
	})
	const avgDeviation = mean(deviations)

	if (DEBUG_ELLIPSE)
		console.log(
			'  [Ellipse] avgDeviation:',
			avgDeviation.toFixed(3),
			'threshold:',
			MAX_ELLIPSE_DEVIATION.toFixed(3)
		)

	if (avgDeviation > MAX_ELLIPSE_DEVIATION) {
		if (DEBUG_ELLIPSE) console.log('  [Ellipse] REJECT: avgDeviation too high')
		return null
	}

	// Calculate confidence based on fit quality
	const confidence = calculateConfidence(avgDeviation, radiusCV, scaledEllipse)

	// Determine if circle or ellipse
	const aspectRatio =
		Math.min(scaledRadiusX, scaledRadiusY) / Math.max(scaledRadiusX, scaledRadiusY)
	const isCircle = aspectRatio >= CIRCLE_ASPECT_THRESHOLD

	if (DEBUG_ELLIPSE)
		console.log(
			'  [Ellipse] confidence:',
			confidence.toFixed(3),
			'aspectRatio:',
			aspectRatio.toFixed(3)
		)

	return {
		type: isCircle ? 'circle' : 'ellipse',
		center,
		radiusX: scaledRadiusX,
		radiusY: scaledRadiusY,
		rotation: ellipse.rotation,
		confidence,
		originalPoints: points
	}
}

/**
 * Check if an ellipse candidate meets the auto-detection threshold
 */
export function isConfidentEllipse(candidate: EllipseCandidate | null): boolean {
	return candidate !== null && candidate.confidence >= HIGH_CONFIDENCE
}

/**
 * Fit an ellipse to points using simplified principal component analysis
 */
function fitEllipse(
	points: Point[],
	center: Point
): {
	radiusX: number
	radiusY: number
	rotation: number
} {
	// Translate points to center
	const centered = points.map((p) => [p[0] - center[0], p[1] - center[1]] as Point)

	// Calculate covariance matrix
	let sumXX = 0,
		sumYY = 0,
		sumXY = 0
	for (const [x, y] of centered) {
		sumXX += x * x
		sumYY += y * y
		sumXY += x * y
	}
	const n = points.length
	const covXX = sumXX / n
	const covYY = sumYY / n
	const covXY = sumXY / n

	// Calculate eigenvalues and eigenvectors for principal axes
	const trace = covXX + covYY
	const det = covXX * covYY - covXY * covXY
	const discriminant = Math.sqrt(Math.max(0, (trace * trace) / 4 - det))

	const lambda1 = trace / 2 + discriminant
	const lambda2 = trace / 2 - discriminant

	// Radii are proportional to sqrt of eigenvalues, scaled by 2
	const radiusX = Math.sqrt(lambda1) * 2
	const radiusY = Math.sqrt(lambda2) * 2

	// Rotation angle from eigenvector
	let rotation = 0
	if (Math.abs(covXY) > 0.001) {
		rotation = Math.atan2(lambda1 - covXX, covXY) * (180 / Math.PI)
	} else if (covYY > covXX) {
		rotation = 90
	}

	return { radiusX, radiusY, rotation }
}

/**
 * Get expected radius at a given angle for an ellipse
 */
function getExpectedRadius(
	point: Point,
	center: Point,
	ellipse: { radiusX: number; radiusY: number; rotation: number }
): number {
	const dx = point[0] - center[0]
	const dy = point[1] - center[1]

	// Angle from center to point
	const angle = Math.atan2(dy, dx)

	// Adjust for ellipse rotation
	const rotRad = ellipse.rotation * (Math.PI / 180)
	const adjustedAngle = angle - rotRad

	// Ellipse radius at this angle
	const cos = Math.cos(adjustedAngle)
	const sin = Math.sin(adjustedAngle)
	const a = ellipse.radiusX
	const b = ellipse.radiusY

	// r = ab / sqrt((b*cos)^2 + (a*sin)^2)
	return (a * b) / Math.sqrt(Math.pow(b * cos, 2) + Math.pow(a * sin, 2))
}

/**
 * Calculate confidence score based on fit quality
 */
function calculateConfidence(
	avgDeviation: number,
	radiusCV: number,
	ellipse: { radiusX: number; radiusY: number }
): number {
	// Base confidence from deviation (lower is better) - this is the most important
	const deviationScore = 1 - avgDeviation / MAX_ELLIPSE_DEVIATION

	// For ellipses, high radiusCV is expected (elongated shapes have varying radii)
	// Only penalize if radiusCV is extremely high (> 0.5)
	const regularityScore = radiusCV < 0.5 ? 1 : 1 - (radiusCV - 0.5) / 0.5

	// Size score (very small ellipses get penalized)
	const avgRadius = (ellipse.radiusX + ellipse.radiusY) / 2
	const sizeScore = Math.min(avgRadius / 30, 1)

	// Combined score - deviation is most important
	return Math.max(
		0,
		Math.min(1, deviationScore * 0.65 + regularityScore * 0.15 + sizeScore * 0.2)
	)
}

/**
 * Generate points along an ellipse for morph animation
 */
export function generateEllipsePoints(candidate: EllipseCandidate, numPoints: number): Point[] {
	const { center, radiusX, radiusY, rotation } = candidate
	const rotRad = rotation * (Math.PI / 180)
	const points: Point[] = []

	for (let i = 0; i < numPoints; i++) {
		const angle = (i / numPoints) * 2 * Math.PI

		// Point on unrotated ellipse
		const x = radiusX * Math.cos(angle)
		const y = radiusY * Math.sin(angle)

		// Rotate and translate
		const rotatedX = x * Math.cos(rotRad) - y * Math.sin(rotRad)
		const rotatedY = x * Math.sin(rotRad) + y * Math.cos(rotRad)

		points.push([center[0] + rotatedX, center[1] + rotatedY])
	}

	return points
}

// vim: ts=4
