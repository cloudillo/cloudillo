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
 * RichTextEditor - Quill-based inline editor for rich text objects.
 *
 * Mounts a Quill 2 instance inside a foreignObject, connected to Y.Text
 * via y-quill's QuillBinding for collaborative editing.
 *
 * The toolbar is hidden — formatting is controlled via the app's properties
 * panel or keyboard shortcuts. The `quillRef` prop allows the app to call
 * quill.format() from outside.
 */

import * as React from 'react'
import type * as Y from 'yjs'
import Quill from 'quill'
import { QuillBinding } from 'y-quill'

import type { BaseTextStyle, ContainerStyle } from '../types'

// Border width for the drag zone around the editor
const BORDER_WIDTH = 8

export interface RichTextEditorProps {
	x: number
	y: number
	width: number
	height: number
	yText: Y.Text
	baseStyle: BaseTextStyle
	onSave: () => void
	onCancel: () => void
	awareness?: any // Yjs Awareness instance for cursor display
	/** Ref to access the Quill instance for formatting from properties panel */
	quillRef?: React.MutableRefObject<Quill | null>
	containerStyle?: ContainerStyle
	/** CSS url(...) value for custom bullet icon, set as --bullet-icon CSS variable */
	bulletIconUrl?: string
	/** Callback when border is pointer-downed (for drag) */
	onDragStart?: (
		e: React.PointerEvent,
		options?: { grabPointOverride?: { x: number; y: number }; forceStartDrag?: boolean }
	) => void
	/** Callback to check if blur should be ignored */
	shouldIgnoreBlur?: () => boolean
	/** Callback to set the drag flag */
	onSetDragFlag?: () => void
	/** Rotation transform string for the wrapping group */
	rotationTransform?: string
	/** Callback when editor content height changes (for auto-grow) */
	onHeightChange?: (height: number) => void
}

const VERTICAL_ALIGN_CSS: Record<string, string> = {
	top: 'flex-start',
	middle: 'center',
	bottom: 'flex-end'
}

export function RichTextEditor({
	x,
	y,
	width,
	height,
	yText,
	baseStyle,
	onSave,
	onCancel,
	awareness,
	quillRef,
	containerStyle,
	bulletIconUrl,
	onDragStart,
	shouldIgnoreBlur,
	onSetDragFlag,
	rotationTransform,
	onHeightChange
}: RichTextEditorProps) {
	const editorRef = React.useRef<HTMLDivElement>(null)
	const quillInstanceRef = React.useRef<Quill | null>(null)
	const bindingRef = React.useRef<QuillBinding | null>(null)
	const isReadyRef = React.useRef(false)
	const [editorHeight, setEditorHeight] = React.useState(height)

	// Initialize Quill
	React.useEffect(() => {
		if (!editorRef.current) return

		const quill = new Quill(editorRef.current, {
			theme: false as any, // No theme — we style it ourselves
			modules: {
				toolbar: false, // No toolbar — formatting from properties panel
				history: false // Yjs handles undo/redo
			},
			placeholder: ''
		})

		quillInstanceRef.current = quill
		if (quillRef) quillRef.current = quill

		// Connect to Y.Text via y-quill
		const binding = new QuillBinding(yText, quill, awareness)
		bindingRef.current = binding

		// Focus with small delay to avoid immediate blur
		const timer = setTimeout(() => {
			quill.focus()
			// Move cursor to end
			quill.setSelection(quill.getLength() - 1, 0)
			isReadyRef.current = true
		}, 50)

		// Observe content changes for height auto-resize
		const handleTextChange = () => {
			if (editorRef.current) {
				const scrollHeight = editorRef.current.scrollHeight
				const newHeight = Math.max(scrollHeight, height)
				setEditorHeight(newHeight)
				onHeightChange?.(newHeight)
			}
		}
		quill.on('text-change', handleTextChange)

		return () => {
			clearTimeout(timer)
			quill.off('text-change', handleTextChange)
			binding.destroy()
			bindingRef.current = null
			quillInstanceRef.current = null
			if (quillRef) quillRef.current = null
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [yText])

	// Handle keyboard events
	const handleKeyDown = React.useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault()
				onSave()
			}
			e.stopPropagation()
		},
		[onSave]
	)

	// Handle blur (save on blur)
	const handleBlur = React.useCallback(() => {
		if (!isReadyRef.current) return
		if (shouldIgnoreBlur?.()) return
		onSave()
	}, [onSave, shouldIgnoreBlur])

	// Handle border drag
	const handleBorderPointerDown = React.useCallback(
		(e: React.PointerEvent) => {
			e.preventDefault()
			e.stopPropagation()
			onSetDragFlag?.()
			onDragStart?.(e, { forceStartDrag: true })
		},
		[onDragStart, onSetDragFlag]
	)

	// Handle Alt+drag from inside editor
	const handleEditorPointerDown = React.useCallback(
		(e: React.PointerEvent) => {
			if (e.altKey) {
				e.preventDefault()
				e.stopPropagation()
				onSetDragFlag?.()
				const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
				const grabPointX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
				const grabPointY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
				onDragStart?.(e, {
					grabPointOverride: { x: grabPointX, y: grabPointY },
					forceStartDrag: true
				})
				return
			}
			e.stopPropagation()
		},
		[onDragStart, onSetDragFlag]
	)

	// Container style
	const innerCSS: React.CSSProperties = {
		width: '100%',
		height: '100%',
		display: 'flex',
		alignItems: VERTICAL_ALIGN_CSS[baseStyle.verticalAlign] || 'flex-start',
		overflow: 'visible',
		position: 'relative'
	}

	// Quill editor container styles
	const editorCSS: Record<string, any> = {
		width: '100%',
		minWidth: width,
		fontFamily: baseStyle.fontFamily,
		fontSize: `${baseStyle.fontSize}px`,
		fontWeight: baseStyle.fontWeight,
		fontStyle: baseStyle.fontItalic ? 'italic' : 'normal',
		color: baseStyle.fill,
		lineHeight: baseStyle.lineHeight,
		letterSpacing: `${baseStyle.letterSpacing}px`,
		textAlign: baseStyle.textAlign as any,
		border: 'none',
		padding: 0,
		boxSizing: 'border-box' as const,
		background: 'transparent',
		outline: 'none',
		overflow: 'hidden',
		whiteSpace: 'pre-wrap' as const,
		wordWrap: 'break-word' as const,
		overflowWrap: 'break-word' as const
	}

	// Set custom bullet icon CSS variable if provided
	if (bulletIconUrl) {
		editorCSS['--bullet-icon'] = bulletIconUrl
	}

	// Apply container style
	if (containerStyle) {
		if (containerStyle.background) editorCSS.background = containerStyle.background
		if (containerStyle.padding !== undefined) editorCSS.padding = `${containerStyle.padding}px`
		if (containerStyle.borderRadius !== undefined)
			editorCSS.borderRadius = `${containerStyle.borderRadius}px`
	}

	const content = (
		<>
			{/* Border drag zone */}
			<rect
				data-text-edit-handle="true"
				x={x - BORDER_WIDTH / 2}
				y={y - BORDER_WIDTH / 2}
				width={width + BORDER_WIDTH}
				height={editorHeight + BORDER_WIDTH}
				fill="none"
				stroke="#0066ff"
				strokeWidth={BORDER_WIDTH}
				style={{ cursor: 'move', pointerEvents: 'stroke' }}
				onPointerDown={handleBorderPointerDown}
			/>
			<foreignObject
				x={x}
				y={y}
				width={width}
				height={editorHeight}
				style={{ overflow: 'visible' }}
			>
				<div style={innerCSS} onClick={() => quillInstanceRef.current?.focus()}>
					<div
						ref={editorRef}
						data-rich-text-editor="true"
						className={bulletIconUrl ? 'custom-bullet' : undefined}
						style={editorCSS}
						onKeyDown={handleKeyDown}
						onBlur={handleBlur}
						onPointerDown={handleEditorPointerDown}
						onClick={(e) => e.stopPropagation()}
					/>
				</div>
			</foreignObject>
		</>
	)

	if (rotationTransform) {
		return <g transform={rotationTransform}>{content}</g>
	}

	return content
}

// vim: ts=4
