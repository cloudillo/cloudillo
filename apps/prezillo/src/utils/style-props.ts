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
