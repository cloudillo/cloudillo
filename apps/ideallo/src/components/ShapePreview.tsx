// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
/**
 * Renders shape preview during creation (before commit)
 */

import type { ShapePreview as ShapePreviewType } from '../tools/index.js'
import { colorToCss } from '../utils/palette.js'

export interface ShapePreviewProps {
	preview: ShapePreviewType
}

export function ShapePreview({ preview }: ShapePreviewProps) {
	const { type, startX, startY, endX, endY, style } = preview

	// Normalize bounds for rect/ellipse
	const minX = Math.min(startX, endX)
	const minY = Math.min(startY, endY)
	const width = Math.abs(endX - startX)
	const height = Math.abs(endY - startY)

	const commonProps = {
		fill: colorToCss(style.fillColor),
		stroke: colorToCss(style.strokeColor),
		strokeWidth: style.strokeWidth,
		strokeLinecap: 'round' as const,
		strokeLinejoin: 'round' as const,
		opacity: 0.7
	}

	if (type === 'rect') {
		return <rect x={minX} y={minY} width={width} height={height} {...commonProps} />
	}

	if (type === 'ellipse') {
		return (
			<ellipse
				cx={minX + width / 2}
				cy={minY + height / 2}
				rx={width / 2}
				ry={height / 2}
				{...commonProps}
			/>
		)
	}

	if (type === 'line') {
		return <line x1={startX} y1={startY} x2={endX} y2={endY} {...commonProps} fill="none" />
	}

	if (type === 'arrow') {
		// Calculate arrowhead
		const angle = Math.atan2(endY - startY, endX - startX)
		const headLength = 12
		const headAngle = Math.PI / 6

		const arrowX1 = endX - headLength * Math.cos(angle - headAngle)
		const arrowY1 = endY - headLength * Math.sin(angle - headAngle)
		const arrowX2 = endX - headLength * Math.cos(angle + headAngle)
		const arrowY2 = endY - headLength * Math.sin(angle + headAngle)

		return (
			<g {...commonProps} fill="none">
				<line x1={startX} y1={startY} x2={endX} y2={endY} />
				<polyline points={`${arrowX1},${arrowY1} ${endX},${endY} ${arrowX2},${arrowY2}`} />
			</g>
		)
	}

	return null
}

// vim: ts=4
