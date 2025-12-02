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
 * TextEditOverlay component - Inline text editor for text objects
 */

import * as React from 'react'
import type { PrelloObject, ResolvedTextStyle } from '../crdt'
import { TEXT_ALIGN_CSS, getTextDecorationCSS } from '../utils/text-styles'

export interface TextEditOverlayProps {
	object: PrelloObject
	textStyle: ResolvedTextStyle
	onSave: (text: string) => void
	onCancel: () => void
}

export function TextEditOverlay({ object, textStyle, onSave, onCancel }: TextEditOverlayProps) {
	const inputRef = React.useRef<HTMLTextAreaElement>(null)
	const [text, setText] = React.useState(object.type === 'text' ? object.text : '')

	// Focus and select all on mount
	React.useEffect(() => {
		if (inputRef.current) {
			inputRef.current.focus()
			inputRef.current.select()
		}
	}, [])

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault()
			onSave(text)
		} else if (e.key === 'Escape') {
			e.preventDefault()
			onCancel()
		}
		// Stop propagation to prevent canvas keyboard handlers
		e.stopPropagation()
	}

	function handleBlur() {
		onSave(text)
	}

	const textDecorationCSS = getTextDecorationCSS(textStyle.textDecoration)

	return (
		<foreignObject
			x={object.x}
			y={object.y}
			width={object.width}
			height={object.height}
			style={{ overflow: 'visible' }}
		>
			<textarea
				ref={inputRef}
				value={text}
				placeholder="Enter text..."
				onChange={(e) => setText(e.target.value)}
				onKeyDown={handleKeyDown}
				onBlur={handleBlur}
				onClick={(e) => e.stopPropagation()}
				onMouseDown={(e) => e.stopPropagation()}
				style={{
					width: '100%',
					height: '100%',
					minWidth: object.width,
					minHeight: object.height,
					fontSize: `${textStyle.fontSize}px`,
					fontFamily: textStyle.fontFamily,
					fontWeight: textStyle.fontWeight,
					fontStyle: textStyle.fontItalic ? 'italic' : 'normal',
					textDecoration: textDecorationCSS,
					textAlign: TEXT_ALIGN_CSS[textStyle.textAlign] as any,
					lineHeight: textStyle.lineHeight,
					letterSpacing: `${textStyle.letterSpacing}px`,
					color: textStyle.fill,
					border: '2px solid #0066ff',
					borderRadius: '2px',
					padding: '2px 4px',
					boxSizing: 'border-box',
					resize: 'none',
					background: 'rgba(255, 255, 255, 0.95)',
					outline: 'none',
					overflow: 'visible'
				}}
			/>
		</foreignObject>
	)
}

// vim: ts=4
