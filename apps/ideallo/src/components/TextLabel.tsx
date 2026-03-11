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
 * Renders text label objects using RichTextDisplay from canvas-text
 */

import * as React from 'react'
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
