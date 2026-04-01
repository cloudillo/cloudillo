// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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
