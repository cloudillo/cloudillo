// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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
