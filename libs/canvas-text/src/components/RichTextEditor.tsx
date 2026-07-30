// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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

import Quill from 'quill'
import * as React from 'react'
import { QuillBinding } from 'y-quill'
import type * as Y from 'yjs'

import type { BaseTextStyle, ContainerStyle } from '../types'

// Border width for the drag zone around the editor
const BORDER_WIDTH = 8

/** Viewport point the editor was opened from, used to seed the caret. */
export interface CaretPoint {
	clientX: number
	clientY: number
}

export interface RichTextEditorProps {
	x: number
	y: number
	width: number
	height: number
	yText: Y.Text
	baseStyle: BaseTextStyle
	onSave: () => void
	/**
	 * Where the pointer was when editing started.
	 *
	 * The editor is mounted in place of whatever was clicked, so the click that opened it never
	 * reached this DOM and the browser has no caret to offer. Given the point we can put the caret
	 * back under the user's finger; without one - creation, or a keyboard-triggered edit - the
	 * caret goes to the end.
	 */
	caretPoint?: CaretPoint
	awareness?: ConstructorParameters<typeof QuillBinding>[2]
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
	/**
	 * Screen-reader-only instruction for leaving the editor. Required by WCAG 2.1.2: Tab indents
	 * inside Quill, so the way out has to be announced rather than discovered.
	 *
	 * Defaults to English. Consumers with i18n should pass a translated string; the canvas apps
	 * have none yet, which is why this is a default rather than a required prop.
	 */
	exitHint?: string
}

/** Off-screen but readable: the exit hint is for screen readers only. */
const HINT_CSS: React.CSSProperties = {
	position: 'absolute',
	width: 1,
	height: 1,
	overflow: 'hidden',
	clipPath: 'inset(50%)',
	whiteSpace: 'nowrap'
}

const VERTICAL_ALIGN_CSS: Record<string, string> = {
	top: 'flex-start',
	middle: 'center',
	bottom: 'flex-end'
}

/**
 * Put the caret at a viewport point, or report that the point is not in this editor.
 *
 * `caretPositionFromPoint` is the standard; WebKit only has the older `caretRangeFromPoint`. Both
 * hand back a DOM position, which Quill's blot registry turns back into a document index.
 */
function placeCaretFromPoint(quill: Quill, root: HTMLElement, point: CaretPoint): boolean {
	const d = document as Document & {
		caretPositionFromPoint?: (
			x: number,
			y: number
		) => { offsetNode: Node; offset: number } | null
		caretRangeFromPoint?: (x: number, y: number) => Range | null
	}

	let node: Node | null = null
	let offset = 0
	const position = d.caretPositionFromPoint?.(point.clientX, point.clientY)
	if (position) {
		node = position.offsetNode
		offset = position.offset
	} else {
		const range = d.caretRangeFromPoint?.(point.clientX, point.clientY)
		if (range) {
			node = range.startContainer
			offset = range.startOffset
		}
	}

	// A click past the end of the text lands on something else entirely - the canvas, the note's
	// padding - and the blot lookup there would resolve against a foreign editor.
	if (!node || !root.contains(node)) return false

	const blot = Quill.find(node, true)
	if (!blot || blot instanceof Quill) return false

	const index = blot.offset(quill.scroll) + offset
	if (!Number.isFinite(index)) return false

	quill.setSelection(Math.min(index, Math.max(0, quill.getLength() - 1)), 0)
	return true
}

export function RichTextEditor({
	x,
	y,
	width,
	height,
	yText,
	baseStyle,
	onSave,
	caretPoint,
	awareness,
	quillRef,
	containerStyle,
	bulletIconUrl,
	onDragStart,
	shouldIgnoreBlur,
	onSetDragFlag,
	rotationTransform,
	onHeightChange,
	exitHint = 'Press Escape or Control+Enter to finish editing.'
}: RichTextEditorProps) {
	const editorRef = React.useRef<HTMLDivElement>(null)
	const quillInstanceRef = React.useRef<Quill | null>(null)
	const bindingRef = React.useRef<QuillBinding | null>(null)
	const isReadyRef = React.useRef(false)
	const [editorHeight, setEditorHeight] = React.useState(height)
	const hintId = React.useId()

	// Initialize Quill
	React.useEffect(() => {
		if (!editorRef.current) return

		const quill = new Quill(editorRef.current, {
			theme: false as unknown as string, // No theme — we style it ourselves
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
			const placed =
				caretPoint && editorRef.current
					? placeCaretFromPoint(quill, editorRef.current, caretPoint)
					: false
			// No usable point - opened by creation or by keyboard - so the caret goes to the end
			if (!placed) quill.setSelection(quill.getLength() - 1, 0)
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

	/*
	 * Escape and Ctrl/Cmd+Enter both mean "done": step out of edit mode, keeping what was typed.
	 *
	 * There is deliberately no discard key. Every keystroke is already in the CRDT and on every
	 * collaborator's screen, so the only coherent rollback is undo - which Ctrl+Z provides.
	 *
	 * Tab is left to Quill: it indents list items, which is the whole point of a bullet list.
	 */
	const handleKeyDown = React.useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
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
	const editorCSS: React.CSSProperties & Record<string, string | number | undefined> = {
		width: '100%',
		minWidth: width,
		fontFamily: baseStyle.fontFamily,
		fontSize: `${baseStyle.fontSize}px`,
		fontWeight: baseStyle.fontWeight,
		fontStyle: baseStyle.fontItalic ? 'italic' : 'normal',
		color: baseStyle.fill,
		lineHeight: baseStyle.lineHeight,
		letterSpacing: `${baseStyle.letterSpacing}px`,
		textAlign: baseStyle.textAlign as React.CSSProperties['textAlign'],
		border: 'none',
		padding: 0,
		boxSizing: 'border-box' as const,
		background: 'transparent',
		outline: 'none',
		overflow: 'hidden',
		whiteSpace: 'pre-wrap' as const,
		wordWrap: 'break-word' as const,
		overflowWrap: 'break-word' as const,
		// The canvas <svg> sets user-select: none, which inherits into foreignObject content
		userSelect: 'text' as const
	}

	// Set custom bullet icon CSS variable if provided
	if (bulletIconUrl) {
		editorCSS['--bullet-icon'] = bulletIconUrl
	}

	// Apply container style. The background lives on the wrapper (which fills the
	// foreignObject) so it covers the whole box, not just the text's own height.
	if (containerStyle) {
		if (containerStyle.background) innerCSS.background = containerStyle.background
		if (containerStyle.padding !== undefined) editorCSS.padding = `${containerStyle.padding}px`
		if (containerStyle.borderRadius !== undefined)
			innerCSS.borderRadius = `${containerStyle.borderRadius}px`
	}

	const content = (
		<>
			{/* Border drag zone — only when the app wires up dragging */}
			{onDragStart && (
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
			)}
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
						aria-describedby={hintId}
						onKeyDown={handleKeyDown}
						onBlur={handleBlur}
						onPointerDown={handleEditorPointerDown}
						onClick={(e) => e.stopPropagation()}
					/>
					{/*
						WCAG 2.1.2: Tab indents inside the editor, so the way out has to be
						announced rather than discovered.
					*/}
					<div id={hintId} style={HINT_CSS}>
						{exitHint}
					</div>
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
