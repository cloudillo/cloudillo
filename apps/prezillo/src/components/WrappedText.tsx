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
 * WrappedText component - renders text with word wrapping and alignment in SVG
 * Uses foreignObject with HTML div for native CSS text layout capabilities
 */

import * as React from 'react'
import type { ResolvedTextStyle } from '../crdt'
import { TEXT_ALIGN_CSS, VERTICAL_ALIGN_CSS, getTextDecorationCSS } from '../utils/text-styles'

interface WrappedTextProps {
	x: number
	y: number
	width: number
	height: number
	text: string
	textStyle: ResolvedTextStyle
	isPlaceholder?: boolean
}

export function WrappedText({
	x,
	y,
	width,
	height,
	text,
	textStyle,
	isPlaceholder = false
}: WrappedTextProps) {
	const textDecorationCSS = getTextDecorationCSS(textStyle.textDecoration)

	return (
		<foreignObject x={x} y={y} width={width} height={height} style={{ overflow: 'visible' }}>
			<div
				style={{
					width: '100%',
					height: '100%',
					display: 'flex',
					alignItems: VERTICAL_ALIGN_CSS[textStyle.verticalAlign] || 'flex-start',
					overflow: 'visible',
					pointerEvents: 'none'
				}}
			>
				<div
					style={{
						width: '100%',
						fontFamily: textStyle.fontFamily,
						fontSize: `${textStyle.fontSize}px`,
						fontWeight: textStyle.fontWeight,
						fontStyle: isPlaceholder
							? 'italic'
							: textStyle.fontItalic
								? 'italic'
								: 'normal',
						color: isPlaceholder ? '#999999' : textStyle.fill,
						lineHeight: textStyle.lineHeight,
						letterSpacing: `${textStyle.letterSpacing}px`,
						textDecoration: textDecorationCSS,
						textAlign: TEXT_ALIGN_CSS[textStyle.textAlign] as any,
						wordWrap: 'break-word',
						whiteSpace: 'pre-wrap',
						overflowWrap: 'break-word'
					}}
				>
					{text}
				</div>
			</div>
		</foreignObject>
	)
}

// vim: ts=4
