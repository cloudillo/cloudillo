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
 * Renders state variable objects on the canvas
 *
 * Displays dynamic runtime values such as:
 * - users: Number of connected users (from awareness)
 * - Future: time, slide number, total slides, etc.
 */

import * as React from 'react'
import type { StateVarObject, ResolvedTextStyle } from '../crdt'
import { TEXT_ALIGN_CSS, VERTICAL_ALIGN_CSS } from '../utils/text-styles'

export interface StateVarRendererProps {
	object: StateVarObject
	textStyle: ResolvedTextStyle
	/** Bounds for rendering (x, y, width, height) */
	bounds?: {
		x: number
		y: number
		width: number
		height: number
	}
	/** State values passed from parent */
	stateValues: {
		userCount: number
		// Future: currentTime?: Date, slideNumber?: number, totalSlides?: number
	}
}

export function StateVarRenderer({
	object,
	textStyle,
	bounds,
	stateValues
}: StateVarRendererProps) {
	// Use bounds if provided, otherwise use object properties
	const x = bounds?.x ?? object.x
	const y = bounds?.y ?? object.y
	const width = bounds?.width ?? object.width
	const height = bounds?.height ?? object.height

	// Get display value based on variable type
	const displayValue = React.useMemo(() => {
		switch (object.varType) {
			case 'users':
				return String(stateValues.userCount)
			default:
				return '?'
		}
	}, [object.varType, stateValues])

	return (
		<foreignObject x={x} y={y} width={width} height={height} style={{ overflow: 'visible' }}>
			<div
				style={{
					width: '100%',
					height: '100%',
					display: 'flex',
					alignItems: VERTICAL_ALIGN_CSS[textStyle.verticalAlign] || 'center',
					justifyContent: TEXT_ALIGN_CSS[textStyle.textAlign] || 'center',
					overflow: 'visible',
					pointerEvents: 'none'
				}}
			>
				<div
					style={{
						fontFamily: textStyle.fontFamily,
						fontSize: `${textStyle.fontSize}px`,
						fontWeight: textStyle.fontWeight,
						fontStyle: textStyle.fontItalic ? 'italic' : 'normal',
						color: textStyle.fill,
						lineHeight: textStyle.lineHeight,
						letterSpacing: `${textStyle.letterSpacing}px`
					}}
				>
					{displayValue}
				</div>
			</div>
		</foreignObject>
	)
}

// vim: ts=4
