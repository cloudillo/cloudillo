// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
/**
 * SymbolRenderer component - Renders a symbol from the symbol library
 *
 * Resolves the symbol from the library and renders it using standard fill/stroke styling.
 */

import type { SymbolObject, ResolvedShapeStyle } from '../crdt'
import { getSymbolById } from '../data/symbol-library'

export interface SymbolRendererProps {
	object: SymbolObject
	style: ResolvedShapeStyle
	bounds: {
		x: number
		y: number
		width: number
		height: number
	}
	/** Gradient URL reference for fill */
	gradientId?: string | null
}

/**
 * Renders a symbol from the symbol library within the given bounds
 */
export function SymbolRenderer({ object, style, bounds, gradientId }: SymbolRendererProps) {
	const symbol = getSymbolById(object.symbolId)

	if (!symbol) {
		// Fallback: render a placeholder rect if symbol not found
		return (
			<rect
				x={bounds.x}
				y={bounds.y}
				width={bounds.width}
				height={bounds.height}
				fill="#cccccc"
				stroke="#999999"
				strokeWidth={1}
				strokeDasharray="4 2"
			/>
		)
	}

	const [vbX, vbY, vbWidth, vbHeight] = symbol.viewBox

	// Calculate transform to fit symbol in bounds while preserving aspect ratio
	const symbolAspect = vbWidth / vbHeight
	const boundsAspect = bounds.width / bounds.height

	let scaleX: number
	let scaleY: number
	let offsetX = 0
	let offsetY = 0

	if (symbolAspect > boundsAspect) {
		// Symbol is wider - fit to width, center vertically
		scaleX = bounds.width / vbWidth
		scaleY = scaleX
		offsetY = (bounds.height - vbHeight * scaleY) / 2
	} else {
		// Symbol is taller - fit to height, center horizontally
		scaleY = bounds.height / vbHeight
		scaleX = scaleY
		offsetX = (bounds.width - vbWidth * scaleX) / 2
	}

	// Build fill value - use gradient if provided, otherwise use solid fill
	const fillValue = gradientId
		? `url(#${gradientId})`
		: style.fill === 'none'
			? 'none'
			: style.fill

	// Build stroke props
	const strokeProps = {
		stroke: style.stroke === 'none' ? 'none' : style.stroke,
		strokeWidth: style.strokeWidth / scaleX, // Adjust stroke width for scaling
		strokeOpacity: style.strokeOpacity,
		strokeDasharray: style.strokeDasharray || undefined,
		strokeLinecap: style.strokeLinecap,
		strokeLinejoin: style.strokeLinejoin
	}

	return (
		<g
			transform={`translate(${bounds.x + offsetX - vbX * scaleX}, ${bounds.y + offsetY - vbY * scaleY}) scale(${scaleX}, ${scaleY})`}
		>
			<path
				d={symbol.pathData}
				fill={fillValue}
				fillOpacity={style.fillOpacity}
				{...strokeProps}
			/>
		</g>
	)
}

// vim: ts=4
