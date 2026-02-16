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
 * Sticky note component (display-only)
 * Renders a colored note with fixed 18px text, auto-grows height during editing
 * Uses standard fill color from style for background
 *
 * For editing, use StickyEditOverlay instead.
 */

import * as React from 'react'
import { useMemo } from 'react'
import * as Y from 'yjs'
import type { StickyObject } from '../crdt/index.js'
import { DEFAULT_PADDING, DEFAULT_LINE_HEIGHT } from '../utils/text-scaling.js'
import { colorToCss } from '../utils/palette.js'
import { RichTextDisplay } from '@cloudillo/canvas-text'
import type { BaseTextStyle } from '@cloudillo/canvas-text'

const STICKY_FONT_SIZE = 18

// Sticky note text uses theme variable for proper theming support
const STICKY_TEXT_COLOR = 'var(--palette-n0, #1e1e1e)'

export interface StickyNoteProps {
	object: StickyObject
	yText?: Y.Text
}

export function StickyNote({ object, yText }: StickyNoteProps) {
	const { x, y, width, height, text, style } = object

	// Use standard fill color for background
	const bgColor = colorToCss(style.fillColor)

	// Generate a subtle random rotation for organic feel (-0.5 to +0.5 degrees)
	// Use object ID to ensure consistent rotation per note
	// Note: Main rotation is handled by ObjectRenderer, this is just organic tilt
	const organicRotation = useMemo(() => {
		// Simple hash of first few chars of id to get rotation
		const hash = object.id.charCodeAt(0) + object.id.charCodeAt(1)
		return ((hash % 3) - 1) * 0.5 // -0.5 to +0.5 degrees
	}, [object.id])

	const baseStyle: BaseTextStyle = {
		fontFamily: 'system-ui, -apple-system, sans-serif',
		fontSize: STICKY_FONT_SIZE,
		fontWeight: 'normal',
		fontItalic: false,
		textDecoration: 'none',
		fill: STICKY_TEXT_COLOR,
		textAlign: 'left',
		verticalAlign: 'top',
		lineHeight: DEFAULT_LINE_HEIGHT,
		letterSpacing: 0
	}

	return (
		<g
			transform={
				organicRotation !== 0
					? `rotate(${organicRotation} ${x + width / 2} ${y + height / 2})`
					: undefined
			}
		>
			{/* Background rectangle with shadow effect */}
			<rect
				x={x + 2}
				y={y + 3}
				width={width}
				height={height}
				fill="rgba(0,0,0,0.08)"
				rx={2}
			/>
			{/* Main background */}
			<rect
				x={x}
				y={y}
				width={width}
				height={height}
				fill={bgColor}
				rx={2}
				opacity={style.opacity}
			/>

			{yText ? (
				<RichTextDisplay
					x={x}
					y={y}
					width={width}
					height={height}
					yText={yText}
					baseStyle={baseStyle}
					containerStyle={{
						padding: DEFAULT_PADDING,
						background: 'transparent'
					}}
				/>
			) : (
				/* Fallback: Text content using foreignObject for HTML rendering */
				<foreignObject x={x} y={y} width={width} height={height}>
					<div
						style={{
							width: '100%',
							height: '100%',
							padding: `${DEFAULT_PADDING}px`,
							boxSizing: 'border-box',
							fontSize: `${STICKY_FONT_SIZE}px`,
							lineHeight: DEFAULT_LINE_HEIGHT,
							fontFamily: 'system-ui, -apple-system, sans-serif',
							color: STICKY_TEXT_COLOR,
							overflow: 'hidden',
							wordWrap: 'break-word',
							whiteSpace: 'pre-wrap',
							userSelect: 'none'
						}}
						// @ts-expect-error - xmlns needed for foreignObject
						xmlns="http://www.w3.org/1999/xhtml"
					>
						{text}
					</div>
				</foreignObject>
			)}
		</g>
	)
}

// vim: ts=4
