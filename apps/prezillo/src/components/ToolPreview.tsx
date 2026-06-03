// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { DEFAULT_SHAPE_STYLE } from '../crdt'
import type { SymbolObject, QrCodeObject } from '../crdt'
import { buildFillProps, buildStrokeProps } from '../utils'
import { SymbolRenderer } from './SymbolRenderer'
import { QRCodeRenderer } from './QRCodeRenderer'

interface ToolPreviewProps {
	tool: string
	toolEvent: { startX: number; startY: number; x: number; y: number }
	selectedSymbolId: string | null
}

// Synthetic base for preview-only objects (id is unused by the leaf renderers).
function previewBase(x: number, y: number, width: number, height: number) {
	return {
		id: 'preview',
		x,
		y,
		width,
		height,
		rotation: 0,
		pivotX: 0.5,
		pivotY: 0.5,
		opacity: 1,
		visible: true,
		locked: false,
		hidden: false
	}
}

export function ToolPreview({ tool, toolEvent, selectedSymbolId }: ToolPreviewProps) {
	const minX = Math.min(toolEvent.startX, toolEvent.x)
	const minY = Math.min(toolEvent.startY, toolEvent.y)
	let width = Math.abs(toolEvent.x - toolEvent.startX)
	let height = Math.abs(toolEvent.y - toolEvent.startY)

	// Geometric primitives: real default-styled shapes
	if (tool === 'rect' || tool === 'ellipse' || tool === 'line') {
		const fillProps = buildFillProps(DEFAULT_SHAPE_STYLE)
		const strokeProps = buildStrokeProps(DEFAULT_SHAPE_STYLE)
		if (tool === 'ellipse') {
			return (
				<ellipse
					cx={minX + width / 2}
					cy={minY + height / 2}
					rx={width / 2}
					ry={height / 2}
					{...fillProps}
					{...strokeProps}
					pointerEvents="none"
				/>
			)
		}
		if (tool === 'line') {
			return (
				<line
					x1={toolEvent.startX}
					y1={toolEvent.startY}
					x2={toolEvent.x}
					y2={toolEvent.y}
					{...strokeProps}
					pointerEvents="none"
				/>
			)
		}
		return (
			<rect
				x={minX}
				y={minY}
				width={width}
				height={height}
				{...fillProps}
				{...strokeProps}
				pointerEvents="none"
			/>
		)
	}

	// Symbol / QR code: square, real renderer
	if (tool === 'symbol' || tool === 'qrcode') {
		const maxDim = Math.max(width, height)
		width = maxDim
		height = maxDim
		const bounds = { x: minX, y: minY, width, height }
		if (tool === 'symbol') {
			const obj = {
				...previewBase(minX, minY, width, height),
				type: 'symbol',
				symbolId: selectedSymbolId ?? ''
			} as SymbolObject
			return (
				<g pointerEvents="none">
					<SymbolRenderer
						object={obj}
						style={DEFAULT_SHAPE_STYLE}
						bounds={bounds}
						gradientId={null}
					/>
				</g>
			)
		}
		const obj = {
			...previewBase(minX, minY, width, height),
			type: 'qrcode',
			url: ''
		} as QrCodeObject
		return (
			<g pointerEvents="none">
				<QRCodeRenderer object={obj} bounds={bounds} />
			</g>
		)
	}

	// Content-driven placeholders (text, image, document, pollframe, tablegrid, statevar)
	return (
		<rect
			x={minX}
			y={minY}
			width={width}
			height={height}
			stroke="#0066ff"
			strokeWidth={2}
			strokeDasharray="4,4"
			fill="rgba(0, 102, 255, 0.1)"
			pointerEvents="none"
		/>
	)
}
