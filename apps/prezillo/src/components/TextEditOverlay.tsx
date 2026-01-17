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
import {
	TEXT_ALIGN_CSS,
	VERTICAL_ALIGN_CSS,
	getTextDecorationCSS,
	calculateRotationTransform
} from '../utils'
import { getBulletIcon, migrateBullet } from '../data/bullet-icons'

// Border width for the drag zone around the textarea
const BORDER_WIDTH = 8

/**
 * Measure text width using Canvas API for accurate bullet positioning
 */
function measureTextWidth(text: string, style: ResolvedTextStyle): number {
	const canvas = document.createElement('canvas')
	const ctx = canvas.getContext('2d')
	if (!ctx) return 0

	const fontStyle = style.fontItalic ? 'italic' : 'normal'
	const fontWeight = style.fontWeight || 'normal'
	const fontSize = style.fontSize || 64
	const fontFamily = style.fontFamily || 'system-ui, sans-serif'

	ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`

	// Apply letter spacing if set
	if (style.letterSpacing && style.letterSpacing !== 0) {
		let width = 0
		for (const char of text) {
			width += ctx.measureText(char).width + style.letterSpacing
		}
		return width - style.letterSpacing
	}

	return ctx.measureText(text).width
}

/**
 * Inline SVG bullet icon component for edit mode
 * Renders bullet as SVG positioned at line start
 */
function BulletIcon({ bulletId, size, color }: { bulletId: string; size: number; color: string }) {
	const icon = getBulletIcon(bulletId)
	if (!icon) return null

	const [vbX, vbY, vbW, vbH] = icon.viewBox

	return (
		<svg
			width={size}
			height={size}
			viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
			style={{ display: 'block' }}
		>
			<path d={icon.pathData} fill={color} />
		</svg>
	)
}

export interface TextEditOverlayProps {
	object: PrezilloObject
	textStyle: ResolvedTextStyle
	onSave: (text: string) => void
	onCancel: () => void
	onTextChange?: (text: string) => void
	onDragStart?: (
		e: React.PointerEvent,
		options?: { grabPointOverride?: { x: number; y: number }; forceStartDrag?: boolean }
	) => void
	/** Text from prototype (for template instances) - shown as placeholder */
	prototypeText?: string
	/** Whether the instance has its own local text (not inheriting) */
	hasLocalText?: boolean
	/** Callback to check if blur should be ignored (e.g., when dragging from handle bar) */
	shouldIgnoreBlur?: () => boolean
	/** Callback to set the drag flag (prevents blur from closing editor during drag) */
	onSetDragFlag?: () => void
}

export function TextEditOverlay({
	object,
	textStyle,
	onSave,
	onCancel,
	onTextChange,
	onDragStart,
	prototypeText,
	hasLocalText,
	shouldIgnoreBlur,
	onSetDragFlag
}: TextEditOverlayProps) {
	const inputRef = React.useRef<HTMLTextAreaElement>(null)
	// For instances inheriting text, start with empty to show placeholder
	// For instances with local text or non-instances, use the object's text
	const isInheritingText = prototypeText !== undefined && !hasLocalText
	const initialText = isInheritingText ? '' : object.type === 'text' ? object.text : ''
	const [text, setText] = React.useState(initialText)

	// Placeholder: use prototype text if inheriting, otherwise default
	const placeholder = isInheritingText ? prototypeText : 'Type here...'

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
			// Always set explicit height to content size
			inputRef.current.style.height = `${scrollHeight}px`
			// foreignObject needs to be at least object.height for vertical alignment
			setTextareaHeight(Math.max(scrollHeight, object.height))
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
		// Ignore blur when dragging from handle bar (blur caused by clicking fixed layer element)
		if (shouldIgnoreBlur?.()) return
		onSave(text)
	}

	function handleBorderPointerDown(e: React.PointerEvent) {
		// preventDefault stops the blur from firing on the textarea
		e.preventDefault()
		e.stopPropagation()
		// Set drag flag to prevent blur from closing editor
		onSetDragFlag?.()
		onDragStart?.(e, { forceStartDrag: true })
	}

	// Handle modifier+drag from textarea for center grab point
	function handleTextareaPointerDown(e: React.PointerEvent) {
		// Alt+drag (Option on Mac) allows dragging from inside text area
		// This enables center snap points by grabbing from the middle of the object
		if (e.altKey) {
			e.preventDefault()
			e.stopPropagation()
			// Set drag flag to prevent blur from closing editor
			onSetDragFlag?.()
			// Calculate grab point based on click position relative to object bounds
			const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
			const grabPointX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
			const grabPointY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
			onDragStart?.(e, {
				grabPointOverride: { x: grabPointX, y: grabPointY },
				forceStartDrag: true
			})
			return
		}
		// Normal click - just stop propagation to allow text selection
		e.stopPropagation()
	}

	const textDecorationCSS = getTextDecorationCSS(textStyle.textDecoration)

	// Calculate bullet indent for padding (must match WrappedText)
	const bulletId = migrateBullet(textStyle.listBullet)
	const bulletIcon = bulletId ? getBulletIcon(bulletId) : null
	const bulletSize = textStyle.fontSize * 0.6
	const bulletGap = textStyle.fontSize * 0.3
	const bulletIndent = bulletIcon ? bulletSize + bulletGap : 0
	const lineHeightPx = textStyle.fontSize * textStyle.lineHeight

	// Split text into lines for bullet positioning
	const lines = text.split('\n')

	// Calculate textarea content height for vertical alignment offset
	const textContentHeight = lines.length * lineHeightPx

	// Match the vertical offset that the textarea gets from flex alignment
	// This ensures bullets stay aligned with the text when verticalAlign is middle or bottom
	let bulletOverlayTop = 0
	const containerHeight = textareaHeight
	if (textStyle.verticalAlign === 'middle' && textContentHeight < containerHeight) {
		bulletOverlayTop = (containerHeight - textContentHeight) / 2
	} else if (textStyle.verticalAlign === 'bottom' && textContentHeight < containerHeight) {
		bulletOverlayTop = containerHeight - textContentHeight
	}

	// Calculate rotation transform using centralized utility
	const rotationTransform = calculateRotationTransform(object)

	return (
		<g transform={rotationTransform}>
			{/* Border drag zone - visible border that can be dragged to move the textbox */}
			<rect
				data-text-edit-handle="true"
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
				<div
					style={{
						width: '100%',
						height: '100%',
						display: 'flex',
						alignItems: VERTICAL_ALIGN_CSS[textStyle.verticalAlign] || 'flex-start',
						overflow: 'visible',
						position: 'relative'
					}}
					onClick={() => inputRef.current?.focus()}
				>
					{/* Bullet icons overlay - positioned at line starts (respecting indentation) */}
					{bulletIcon && bulletId && (
						<div
							style={{
								position: 'absolute',
								left: 0,
								top: bulletOverlayTop,
								pointerEvents: 'none'
							}}
						>
							{lines.map((line, index) => {
								if (line.trim() === '') return null
								// Measure leading whitespace to position bullet after indentation
								const leadingMatch = line.match(/^(\s*)/)
								const leadingSpace = leadingMatch ? leadingMatch[1] : ''
								const leadingWidth = leadingSpace
									? measureTextWidth(leadingSpace, textStyle)
									: 0

								// Calculate bullet position with x-height offset
								// Shift down from line-height center to align with text x-height center
								const xHeightOffset = 0.1 * textStyle.fontSize

								return (
									<div
										key={index}
										style={{
											position: 'absolute',
											top:
												index * lineHeightPx +
												(lineHeightPx - bulletSize) / 2 +
												xHeightOffset,
											left: leadingWidth,
											display: 'flex',
											alignItems: 'center',
											height: bulletSize
										}}
									>
										<BulletIcon
											bulletId={bulletId}
											size={bulletSize}
											color={textStyle.fill}
										/>
									</div>
								)
							})}
						</div>
					)}
					<textarea
						ref={inputRef}
						value={text}
						placeholder={placeholder}
						onChange={(e) => setText(e.target.value)}
						onKeyDown={handleKeyDown}
						onBlur={handleBlur}
						onPointerDown={handleTextareaPointerDown}
						onClick={(e) => e.stopPropagation()}
						style={{
							width: '100%',
							minWidth: object.width,
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
							// Add left padding to account for bullet indent
							padding: `0 0 0 ${bulletIndent}px`,
							boxSizing: 'border-box',
							resize: 'none',
							background: 'transparent',
							outline: 'none',
							overflow: 'hidden',
							// Match WrappedText styling for consistent text wrapping
							whiteSpace: 'pre-wrap',
							wordWrap: 'break-word',
							overflowWrap: 'break-word'
						}}
					/>
				</div>
			</foreignObject>
		</g>
	)
}

// vim: ts=4
