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
import type { PrezilloObject, ResolvedTextStyle } from '../crdt'
import { TEXT_ALIGN_CSS, getTextDecorationCSS } from '../utils/text-styles'

// Border width for the drag zone around the textarea
const BORDER_WIDTH = 8

export interface TextEditOverlayProps {
	object: PrezilloObject
	textStyle: ResolvedTextStyle
	onSave: (text: string) => void
	onCancel: () => void
	onTextChange?: (text: string) => void
	onDragStart?: (e: React.PointerEvent) => void
}

export function TextEditOverlay({
	object,
	textStyle,
	onSave,
	onCancel,
	onTextChange,
	onDragStart
}: TextEditOverlayProps) {
	const inputRef = React.useRef<HTMLTextAreaElement>(null)
	const initialText = object.type === 'text' ? object.text : ''
	const [text, setText] = React.useState(initialText)

	// Notify parent of initial text and any changes
	React.useEffect(() => {
		onTextChange?.(text)
	}, [text, onTextChange])
	const [textareaHeight, setTextareaHeight] = React.useState(object.height)
	const isReadyRef = React.useRef(false)

	// Auto-resize textarea to fit content
	const updateTextareaHeight = React.useCallback(() => {
		if (inputRef.current) {
			// Reset height to measure scrollHeight accurately
			inputRef.current.style.height = 'auto'
			const scrollHeight = inputRef.current.scrollHeight
			const newHeight = Math.max(scrollHeight, object.height)
			inputRef.current.style.height = `${newHeight}px`
			setTextareaHeight(newHeight)
		}
	}, [object.height])

	// Focus on mount with small delay to avoid immediate blur from click event
	React.useEffect(() => {
		const timer = setTimeout(() => {
			if (inputRef.current) {
				inputRef.current.focus()
				isReadyRef.current = true
			}
		}, 50)
		return () => clearTimeout(timer)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Update height on mount and when text changes
	React.useEffect(() => {
		updateTextareaHeight()
	}, [text, updateTextareaHeight])

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault()
			onSave(text)
		}
		// Stop propagation to prevent canvas keyboard handlers
		e.stopPropagation()
	}

	function handleBlur() {
		// Ignore blur events before we're ready (prevents immediate blur from click)
		if (!isReadyRef.current) return
		onSave(text)
	}

	function handleBorderPointerDown(e: React.PointerEvent) {
		e.stopPropagation()
		onDragStart?.(e)
	}

	const textDecorationCSS = getTextDecorationCSS(textStyle.textDecoration)

	// Calculate rotation transform (same as ObjectShape)
	const rotation = object.rotation ?? 0
	const pivotX = object.pivotX ?? 0.5
	const pivotY = object.pivotY ?? 0.5
	const cx = object.x + object.width * pivotX
	const cy = object.y + object.height * pivotY
	const rotationTransform = rotation !== 0 ? `rotate(${rotation} ${cx} ${cy})` : undefined

	return (
		<g transform={rotationTransform}>
			{/* Border drag zone - visible border that can be dragged to move the textbox */}
			<rect
				x={object.x - BORDER_WIDTH / 2}
				y={object.y - BORDER_WIDTH / 2}
				width={object.width + BORDER_WIDTH}
				height={textareaHeight + BORDER_WIDTH}
				fill="none"
				stroke="#0066ff"
				strokeWidth={BORDER_WIDTH}
				style={{ cursor: 'move', pointerEvents: 'stroke' }}
				onPointerDown={handleBorderPointerDown}
			/>
			<foreignObject
				x={object.x}
				y={object.y}
				width={object.width}
				height={textareaHeight}
				style={{ overflow: 'visible' }}
			>
				<textarea
					ref={inputRef}
					value={text}
					placeholder="Type here..."
					onChange={(e) => setText(e.target.value)}
					onKeyDown={handleKeyDown}
					onBlur={handleBlur}
					onPointerDown={(e) => e.stopPropagation()}
					onClick={(e) => e.stopPropagation()}
					onMouseDown={(e) => e.stopPropagation()}
					style={{
						width: '100%',
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
						border: 'none',
						padding: '4px 6px',
						boxSizing: 'border-box',
						resize: 'none',
						background: 'rgba(255, 255, 255, 0.95)',
						outline: 'none',
						overflow: 'hidden'
					}}
				/>
			</foreignObject>
		</g>
	)
}

// vim: ts=4
