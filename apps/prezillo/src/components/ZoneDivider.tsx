// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import * as React from 'react'
/**
 * ZoneDivider component - Renders a subtle vertical line
 * separating the template zone from the view zone.
 */

export interface ZoneDividerProps {
	x: number
	topY: number
	bottomY: number
}

export function ZoneDivider({ x, topY, bottomY }: ZoneDividerProps) {
	// Extend slightly beyond the view bounds
	const padding = 50

	return (
		<line
			className="c-zone-divider"
			x1={x}
			y1={topY - padding}
			x2={x}
			y2={bottomY + padding}
			stroke="#d0d0d0"
			strokeWidth={1}
			strokeDasharray="8,4"
			opacity={0.6}
			pointerEvents="none"
		/>
	)
}

// vim: ts=4
