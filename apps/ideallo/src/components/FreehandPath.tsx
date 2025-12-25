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
 * Renders a freehand stroke path (bezier)
 */

import * as React from 'react'
import type { FreehandObject } from '../crdt/index.js'
import { colorToCss } from '../utils/palette.js'

export interface FreehandPathProps {
	object: FreehandObject
	isSelected?: boolean
	onClick?: (e: React.MouseEvent) => void
	onPointerDown?: (e: React.PointerEvent) => void
}

export const FreehandPath = React.memo(function FreehandPath({
	object,
	isSelected,
	onClick,
	onPointerDown
}: FreehandPathProps) {
	const strokeStyle = object.style

	// Get stroke dasharray based on style
	let strokeDasharray: string | undefined
	switch (strokeStyle.strokeStyle) {
		case 'dashed':
			strokeDasharray = '8,4'
			break
		case 'dotted':
			strokeDasharray = '2,4'
			break
		default:
			strokeDasharray = undefined
	}

	// Closed paths can be filled
	const fill = object.closed ? colorToCss(strokeStyle.fillColor) : 'none'

	// Path data uses relative coordinates (relative to bounds origin)
	// Apply translation to position at object.x, object.y
	return (
		<g transform={`translate(${object.x}, ${object.y})`}>
			<path
				d={object.pathData}
				fill={fill}
				stroke={colorToCss(strokeStyle.strokeColor)}
				strokeWidth={strokeStyle.strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeDasharray={strokeDasharray}
				opacity={strokeStyle.opacity}
				style={{ cursor: 'move' }}
				onClick={onClick}
				onPointerDown={onPointerDown}
			/>
		</g>
	)
})

// vim: ts=4
