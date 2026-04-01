// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
/**
 * ZoneDivider component - Renders a subtle horizontal line
 * separating the template zone from the view zone.
 */

export interface ZoneDividerProps {
	y: number
	leftX: number
	rightX: number
}

export function ZoneDivider({ y, leftX, rightX }: ZoneDividerProps) {
	// Extend slightly beyond the view bounds
	const padding = 50

	return (
		<line
			className="c-zone-divider"
			x1={leftX - padding}
			y1={y}
			x2={rightX + padding}
			y2={y}
			stroke="#d0d0d0"
			strokeWidth={1}
			strokeDasharray="8,4"
			opacity={0.6}
			pointerEvents="none"
		/>
	)
}

// vim: ts=4
