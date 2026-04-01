// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
/**
 * Renders text label objects using RichTextDisplay from canvas-text
 */

import type * as Y from 'yjs'
import type { TextObject } from '../crdt/index.js'
import { colorToCss } from '../utils/palette.js'
import { RichTextDisplay } from '@cloudillo/canvas-text'
import type { BaseTextStyle } from '@cloudillo/canvas-text'

export interface TextLabelProps {
	object: TextObject
	yText?: Y.Text
}

export function TextLabel({ object, yText }: TextLabelProps) {
	const { x, y, fontSize = 16, fontFamily, style, width, height } = object

	// Text color comes from strokeColor for text objects
	const textColor = colorToCss(style.strokeColor)

	const baseStyle: BaseTextStyle = {
		fontFamily: fontFamily || 'system-ui, sans-serif',
		fontSize: fontSize ?? 16,
		fontWeight: 'normal',
		fontItalic: false,
		textDecoration: 'none',
		fill: textColor,
		textAlign: 'left',
		verticalAlign: 'top',
		lineHeight: 1.2,
		letterSpacing: 0
	}

	if (yText) {
		return (
			<RichTextDisplay
				x={x}
				y={y}
				width={width}
				height={height}
				yText={yText}
				baseStyle={baseStyle}
			/>
		)
	}

	// Fallback for objects without Y.Text (shouldn't happen normally)
	return (
		<text
			x={x}
			y={y + (fontSize ?? 16)}
			fill={textColor}
			fontSize={fontSize}
			fontFamily={fontFamily || 'system-ui, sans-serif'}
			opacity={style.opacity}
		>
			{object.text}
		</text>
	)
}

// vim: ts=4
