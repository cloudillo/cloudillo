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
 * ZoneDivider component - Renders a subtle horizontal line
 * separating the template zone from the view zone.
 */

import * as React from 'react'

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
