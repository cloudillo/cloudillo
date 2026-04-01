// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Utility functions for building SVG stroke and fill properties
 */

import type { ResolvedShapeStyle } from '../crdt'

/**
 * Build stroke properties for SVG elements
 *
 * @param style - Resolved shape style
 * @param isSelected - Whether the object is selected (adds 2px to strokeWidth)
 * @returns SVG stroke properties object
 */
export function buildStrokeProps(style: ResolvedShapeStyle, isSelected?: boolean) {
	return {
		stroke: style.stroke,
		strokeWidth: isSelected ? style.strokeWidth + 2 : style.strokeWidth,
		strokeOpacity: style.strokeOpacity,
		strokeDasharray: style.strokeDasharray || undefined,
		strokeLinecap: style.strokeLinecap,
		strokeLinejoin: style.strokeLinejoin
	}
}

/**
 * Build fill properties for SVG elements
 *
 * @param style - Resolved shape style
 * @param gradientId - Optional gradient ID (for gradient fills)
 * @returns SVG fill properties object
 */
export function buildFillProps(style: ResolvedShapeStyle, gradientId?: string | null) {
	return {
		fill: gradientId
			? `url(#${gradientId})`
			: style.fill === 'none'
				? 'transparent'
				: style.fill,
		fillOpacity: style.fillOpacity
	}
}

// vim: ts=4
