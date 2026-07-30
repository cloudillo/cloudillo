// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

/**
 * Renders text label objects using RichTextDisplay from canvas-text.
 * Its layout comes from objectTextLayout, the same call TextEditOverlay makes.
 */

import { RichTextDisplay } from '@cloudillo/canvas-text'
import type * as Y from 'yjs'

import type { TextObject } from '../crdt/index.js'
import { objectTextLayout } from '../utils/object-text.js'

export interface TextLabelProps {
	object: TextObject
	yText?: Y.Text
}

export function TextLabel({ object, yText }: TextLabelProps) {
	const { x, y, style, width, height } = object

	const { box, baseStyle, padding } = objectTextLayout(object)

	if (yText) {
		return (
			<>
				{/* RichTextDisplay is pointer-events: none, so without this the label has no
				    hit area and never receives the double-click that starts editing */}
				<rect x={x} y={y} width={width} height={height} fill="transparent" />
				<RichTextDisplay
					x={box.x}
					y={box.y}
					width={box.width}
					height={box.height}
					yText={yText}
					baseStyle={baseStyle}
					containerStyle={{ padding }}
				/>
			</>
		)
	}

	// Fallback for objects without Y.Text (shouldn't happen normally)
	return (
		<text
			x={x}
			y={y + baseStyle.fontSize}
			fill={baseStyle.fill}
			fontSize={baseStyle.fontSize}
			fontFamily={baseStyle.fontFamily}
			opacity={style.opacity}
		>
			{object.text}
		</text>
	)
}

// vim: ts=4
