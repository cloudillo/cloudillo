// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

/**
 * Sticky note component (display-only)
 * Renders a colored note whose text layout comes from objectTextLayout, so it cannot drift from
 * StickyEditOverlay's.
 *
 * For editing, use StickyEditOverlay instead.
 */

import { RichTextDisplay } from '@cloudillo/canvas-text'
import { useMemo } from 'react'
import type * as Y from 'yjs'

import type { StickyObject } from '../crdt/index.js'
import {
	objectTextLayout,
	STICKY_CORNER_RADIUS,
	STICKY_SHADOW_FILTER_ID
} from '../utils/object-text.js'
import { colorToCss } from '../utils/palette.js'
import { DEFAULT_LINE_HEIGHT } from '../utils/text-scaling.js'
import { VERTICAL_ALIGN_CSS } from '../utils/text-styles.js'

export interface StickyNoteProps {
	object: StickyObject
	yText?: Y.Text
}

export function StickyNote({ object, yText }: StickyNoteProps) {
	const { x, y, width, height, text, style } = object

	// Use standard fill color for background
	const bgColor = colorToCss(style.fillColor)

	const { box, baseStyle, padding } = objectTextLayout(object)

	// Generate a subtle random rotation for organic feel (-0.5 to +0.5 degrees)
	// Use object ID to ensure consistent rotation per note
	// Note: Main rotation is handled by ObjectRenderer, this is just organic tilt
	const organicRotation = useMemo(() => {
		// Simple hash of first few chars of id to get rotation
		const hash = object.id.charCodeAt(0) + object.id.charCodeAt(1)
		return ((hash % 3) - 1) * 0.5 // -0.5 to +0.5 degrees
	}, [object.id])

	return (
		<g
			transform={
				organicRotation !== 0
					? `rotate(${organicRotation} ${x + width / 2} ${y + height / 2})`
					: undefined
			}
		>
			{/* The card, casting its shadow through the board-wide filter */}
			<rect
				x={x}
				y={y}
				width={width}
				height={height}
				fill={bgColor}
				rx={STICKY_CORNER_RADIUS}
				opacity={style.opacity}
				filter={`url(#${STICKY_SHADOW_FILTER_ID})`}
			/>

			{yText ? (
				<RichTextDisplay
					x={box.x}
					y={box.y}
					width={box.width}
					height={box.height}
					yText={yText}
					baseStyle={baseStyle}
					containerStyle={{
						padding,
						background: 'transparent'
					}}
				/>
			) : (
				/* Fallback: Text content using foreignObject for HTML rendering */
				<foreignObject x={x} y={y} width={width} height={height}>
					<div
						style={{
							// Flex only to make verticalAlign reachable; the live RichTextDisplay
							// path above resolves it from the same four fields, and the two must
							// not disagree about what an object's text looks like
							display: 'flex',
							flexDirection: 'column',
							justifyContent: VERTICAL_ALIGN_CSS[baseStyle.verticalAlign],
							width: '100%',
							height: '100%',
							padding: `${padding}px`,
							boxSizing: 'border-box',
							fontSize: `${baseStyle.fontSize}px`,
							lineHeight: DEFAULT_LINE_HEIGHT,
							fontFamily: baseStyle.fontFamily,
							textAlign: baseStyle.textAlign,
							// Straight off baseStyle rather than a constant of its own: the fill now
							// decides the glyph colour (a note filled with the darkest neutral would
							// otherwise print black on black), and this fallback must not disagree
							// with the RichTextDisplay path above about it
							color: baseStyle.fill,
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
