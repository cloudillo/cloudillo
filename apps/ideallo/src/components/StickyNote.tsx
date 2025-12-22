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
 * Sticky note component with auto-scaling text
 * Renders a colored note with text that automatically adjusts font size
 * Uses standard fill color from style for background
 */

import * as React from 'react'
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { StickyObject } from '../crdt/index.js'
import {
	calculateOptimalFontSize,
	DEFAULT_PADDING,
	DEFAULT_LINE_HEIGHT,
	MIN_FONT_SIZE,
	MAX_FONT_SIZE
} from '../utils/text-scaling.js'
import { colorToCss } from '../utils/palette.js'

// Sticky note text uses theme variable for proper theming support
const STICKY_TEXT_COLOR = 'var(--palette-n0, #1e1e1e)'

export interface StickyNoteProps {
	object: StickyObject
	isEditing?: boolean
	onTextChange?: (text: string) => void
	onEditComplete?: () => void
}

export function StickyNote({
	object,
	isEditing = false,
	onTextChange,
	onEditComplete
}: StickyNoteProps) {
	const { x, y, width, height, text, style } = object
	const textRef = useRef<HTMLDivElement>(null)
	const [fontSize, setFontSize] = useState(MAX_FONT_SIZE)

	// Use standard fill color for background
	const bgColor = colorToCss(style.fillColor)

	// Calculate optimal font size when text or dimensions change
	useEffect(() => {
		const optimalSize = calculateOptimalFontSize(text, width, height, {
			padding: DEFAULT_PADDING,
			minFontSize: MIN_FONT_SIZE,
			maxFontSize: MAX_FONT_SIZE,
			lineHeight: DEFAULT_LINE_HEIGHT
		})
		setFontSize(optimalSize)
	}, [text, width, height])

	// Track if we're actively editing to prevent text prop from resetting cursor
	const isEditingRef = useRef(false)

	// Focus the text area when entering edit mode
	useEffect(() => {
		if (isEditing && textRef.current) {
			isEditingRef.current = true
			// Set initial text content when starting to edit
			textRef.current.textContent = text
			textRef.current.focus()
			// Select all text for easy replacement
			const selection = window.getSelection()
			const range = document.createRange()
			range.selectNodeContents(textRef.current)
			selection?.removeAllRanges()
			selection?.addRange(range)
		} else {
			isEditingRef.current = false
		}
	}, [isEditing]) // Note: intentionally not including `text` to avoid resetting during edit

	// Handle text input
	const handleInput = useCallback(
		(e: React.FormEvent<HTMLDivElement>) => {
			const newText = e.currentTarget.textContent || ''
			onTextChange?.(newText)
		},
		[onTextChange]
	)

	// Handle blur (exit edit mode)
	const handleBlur = useCallback(() => {
		onEditComplete?.()
	}, [onEditComplete])

	// Handle key events
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault()
				onEditComplete?.()
			}
			// Tab also exits edit mode
			if (e.key === 'Tab') {
				onEditComplete?.()
			}
		},
		[onEditComplete]
	)

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

			{/* Text content using foreignObject for HTML rendering */}
			<foreignObject x={x} y={y} width={width} height={height}>
				<div
					ref={textRef}
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
						overflow: 'hidden',
						wordWrap: 'break-word',
						whiteSpace: 'pre-wrap',
						outline: 'none',
						cursor: isEditing ? 'text' : 'default',
						userSelect: isEditing ? 'text' : 'none'
					}}
					contentEditable={isEditing}
					suppressContentEditableWarning
					onInput={handleInput}
					onBlur={handleBlur}
					onKeyDown={handleKeyDown}
					// @ts-expect-error - xmlns needed for foreignObject
					xmlns="http://www.w3.org/1999/xhtml"
				>
					{/* Only render text when not editing - during editing, contentEditable manages its own state */}
					{!isEditing && text}
				</div>
			</foreignObject>
		</g>
	)
}

// vim: ts=4
