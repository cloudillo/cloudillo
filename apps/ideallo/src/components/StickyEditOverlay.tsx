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
 * StickyEditOverlay component - Inline text editor for sticky notes
 *
 * Uses textarea instead of contentEditable for reliable text handling.
 * Includes 8px border drag zone for moving while editing.
 */

import * as React from 'react'
import type { StickyObject } from '../crdt/index.js'
import {
	calculateOptimalFontSize,
	DEFAULT_PADDING,
	DEFAULT_LINE_HEIGHT,
	MIN_FONT_SIZE,
	MAX_FONT_SIZE
} from '../utils/text-scaling.js'
import { colorToCss } from '../utils/palette.js'

// Border width for the drag zone around the textarea
const BORDER_WIDTH = 8

// Sticky note text uses theme variable for proper theming support (same as StickyNote)
const STICKY_TEXT_COLOR = 'var(--palette-n0, #1e1e1e)'

export interface StickyEditOverlayProps {
	object: StickyObject
	onSave: (text: string) => void
	onCancel: () => void
	onTextChange?: (text: string) => void
	onDragStart?: (e: React.PointerEvent) => void
}

export function StickyEditOverlay({
	object,
	onSave,
	onCancel,
	onTextChange,
	onDragStart
}: StickyEditOverlayProps) {
	const inputRef = React.useRef<HTMLTextAreaElement>(null)
	const [text, setText] = React.useState(object.text)
	const [fontSize, setFontSize] = React.useState(MAX_FONT_SIZE)
	const isReadyRef = React.useRef(false)

	const { x, y, width, height, style } = object
	const bgColor = colorToCss(style.fillColor)

	// Notify parent of text changes
	React.useEffect(() => {
		onTextChange?.(text)
	}, [text, onTextChange])

	// Calculate optimal font size when text or dimensions change
	React.useEffect(() => {
		const optimalSize = calculateOptimalFontSize(text, width, height, {
			padding: DEFAULT_PADDING,
			minFontSize: MIN_FONT_SIZE,
			maxFontSize: MAX_FONT_SIZE,
			lineHeight: DEFAULT_LINE_HEIGHT
		})
		setFontSize(optimalSize)
	}, [text, width, height])

	// Focus on mount with small delay to avoid immediate blur from click event
	React.useEffect(() => {
		const timer = setTimeout(() => {
			if (inputRef.current) {
				inputRef.current.focus()
				inputRef.current.select()
				isReadyRef.current = true
			}
		}, 50)
		return () => clearTimeout(timer)
	}, [])

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault()
			onSave(text)
		}
		if (e.key === 'Tab') {
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

	// Generate organic rotation (same as StickyNote)
	// Note: Main rotation is handled by ObjectRenderer, we only add organic rotation here
	const organicRotation = React.useMemo(() => {
		const hash = object.id.charCodeAt(0) + object.id.charCodeAt(1)
		return ((hash % 3) - 1) * 0.5
	}, [object.id])

	// Calculate organic rotation transform only (main rotation handled by ObjectRenderer)
	const pivotX = object.pivotX ?? 0.5
	const pivotY = object.pivotY ?? 0.5
	const cx = x + width * pivotX
	const cy = y + height * pivotY
	const organicTransform =
		organicRotation !== 0 ? `rotate(${organicRotation} ${cx} ${cy})` : undefined

	return (
		<g transform={organicTransform}>
			{/* Shadow effect */}
			<rect
				x={x + 2}
				y={y + 3}
				width={width}
				height={height}
				fill="rgba(0,0,0,0.08)"
				rx={2}
			/>

			{/* Border drag zone - visible border that can be dragged to move the sticky */}
			<rect
				x={x - BORDER_WIDTH / 2}
				y={y - BORDER_WIDTH / 2}
				width={width + BORDER_WIDTH}
				height={height + BORDER_WIDTH}
				fill="none"
				stroke="#0066ff"
				strokeWidth={BORDER_WIDTH}
				style={{ cursor: 'move', pointerEvents: 'stroke' }}
				onPointerDown={handleBorderPointerDown}
			/>

			{/* Textarea for editing - background color is set on textarea itself */}
			<foreignObject x={x} y={y} width={width} height={height}>
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
					// @ts-expect-error - xmlns needed for foreignObject
					xmlns="http://www.w3.org/1999/xhtml"
					style={{
						width: '100%',
						height: '100%',
						padding: `${DEFAULT_PADDING}px`,
						boxSizing: 'border-box',
						fontSize: `${fontSize}px`,
						lineHeight: DEFAULT_LINE_HEIGHT,
						fontFamily: 'system-ui, -apple-system, sans-serif',
						color: STICKY_TEXT_COLOR,
						caretColor: STICKY_TEXT_COLOR,
						background: bgColor,
						border: 'none',
						borderRadius: '2px', // Match sticky note corners
						outline: 'none',
						resize: 'none',
						overflow: 'hidden',
						whiteSpace: 'pre-wrap',
						wordWrap: 'break-word',
						cursor: 'text'
					}}
				/>
			</foreignObject>
		</g>
	)
}

// vim: ts=4
