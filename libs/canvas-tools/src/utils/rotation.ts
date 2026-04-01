// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Rotation handle sizing utilities
 */

import type { Bounds } from 'react-svg-canvas'

/** Arc radius min as percentage of viewport min dimension */
export const ARC_RADIUS_MIN_VIEWPORT_RATIO = 0.1

/** Arc radius max as percentage of viewport min dimension */
export const ARC_RADIUS_MAX_VIEWPORT_RATIO = 0.35

/** Default arc padding in screen pixels */
export const DEFAULT_ARC_PADDING = 25

export interface CalculateArcRadiusOptions {
	/** Object bounds in canvas coordinates */
	bounds: Bounds
	/** Canvas zoom scale */
	scale: number
	/** Arc padding in screen pixels, default 25 */
	arcPadding?: number
	/** Min radius as viewport ratio, default 0.10 */
	minViewportRatio?: number
	/** Max radius as viewport ratio, default 0.35 */
	maxViewportRatio?: number
}

/**
 * Calculate rotation handle arc radius with viewport-relative clamping.
 * Returns radius in canvas coordinates.
 *
 * The arc radius is based on the object diagonal (not pivot position),
 * clamped to min/max based on viewport size for consistent UX.
 */
export function calculateArcRadius(options: CalculateArcRadiusOptions): number {
	const {
		bounds,
		scale,
		arcPadding = DEFAULT_ARC_PADDING,
		minViewportRatio = ARC_RADIUS_MIN_VIEWPORT_RATIO,
		maxViewportRatio = ARC_RADIUS_MAX_VIEWPORT_RATIO
	} = options

	// Use object diagonal for consistent sizing regardless of pivot position
	const objectDiagonal = Math.sqrt(bounds.width * bounds.width + bounds.height * bounds.height)

	// Min/max as percentage of viewport (smaller dimension)
	const viewportMin =
		typeof window !== 'undefined' ? Math.min(window.innerWidth, window.innerHeight) : 800
	const minArcRadiusScreen = viewportMin * minViewportRatio
	const maxArcRadiusScreen = viewportMin * maxViewportRatio

	// Base radius: half diagonal + padding (padding is in screen pixels, convert to canvas)
	const baseRadius = objectDiagonal / 2 + arcPadding / scale

	// Clamp to viewport-relative min/max (convert screen pixels to canvas coords)
	return Math.max(minArcRadiusScreen / scale, Math.min(baseRadius, maxArcRadiusScreen / scale))
}

// vim: ts=4
