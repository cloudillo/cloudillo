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
 * Renders text label objects
 */

import * as React from 'react'
import type { TextObject } from '../crdt/index.js'
import { colorToCss } from '../utils/palette.js'

export interface TextLabelProps {
	object: TextObject
}

export function TextLabel({ object }: TextLabelProps) {
	const { x, y, text, fontSize = 16, fontFamily, style, rotation, width, height } = object

	// Text color comes from strokeColor for text objects
	const textColor = colorToCss(style.strokeColor)

	return (
		<text
			x={x}
			y={y + (fontSize ?? 16)}
			fill={textColor}
			fontSize={fontSize}
			fontFamily={fontFamily || 'system-ui, sans-serif'}
			opacity={style.opacity}
			transform={
				rotation ? `rotate(${rotation} ${x + width / 2} ${y + height / 2})` : undefined
			}
		>
			{text}
		</text>
	)
}

// vim: ts=4
