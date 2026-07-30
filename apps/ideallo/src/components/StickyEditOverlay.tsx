// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * StickyEditOverlay component - Rich text editor for sticky notes
 *
 * Uses RichTextEditor from @cloudillo/canvas-text for collaborative editing.
 * Includes 8px border drag zone for moving while editing.
 *
 * The whole note is swapped out for this overlay, which is why the shadow rect is redrawn here.
 * The TEXT layout, though, comes from objectTextLayout - the same call StickyNote makes - so the
 * glyphs cannot shift on entering edit mode.
 */

import type { CaretPoint } from '@cloudillo/canvas-text'
import { RichTextEditor } from '@cloudillo/canvas-text'
import type Quill from 'quill'
import * as React from 'react'
import type * as Y from 'yjs'

import type { StickyObject } from '../crdt/index.js'
import { objectTextLayout, STICKY_CORNER_RADIUS } from '../utils/object-text.js'
import { colorToCss } from '../utils/palette.js'

export interface StickyEditOverlayProps {
	object: StickyObject
	yText?: Y.Text
	onSave: () => void
	/** Where the pointer was when editing started, so the caret lands there */
	caretPoint?: CaretPoint
	/** Blur into the property bar is the user styling what they are editing, not leaving it */
	shouldIgnoreBlur?: () => boolean
	onDragStart?: (e: React.PointerEvent) => void
	quillRef?: React.MutableRefObject<Quill | null>
	onHeightChange?: (height: number) => void
}

export function StickyEditOverlay({
	object,
	yText,
	onSave,
	caretPoint,
	shouldIgnoreBlur,
	onDragStart,
	quillRef,
	onHeightChange
}: StickyEditOverlayProps) {
	const { x, y, width, height, style } = object
	const bgColor = colorToCss(style.fillColor)

	const { box, baseStyle, padding } = objectTextLayout(object)

	// Generate organic rotation (same as StickyNote)
	const organicRotation = React.useMemo(() => {
		const hash = object.id.charCodeAt(0) + object.id.charCodeAt(1)
		return ((hash % 3) - 1) * 0.5
	}, [object.id])

	const pivotX = object.pivotX ?? 0.5
	const pivotY = object.pivotY ?? 0.5
	const cx = x + width * pivotX
	const cy = y + height * pivotY

	// The organic tilt goes on the <g> below and the object's own rotation on ObjectRenderer's
	// wrapper. RichTextEditor's <foreignObject> is IN the tree, under both, so it inherits them -
	// no rotationTransform of its own, which used to apply each of the two a second time.
	const organicTransform =
		organicRotation !== 0 ? `rotate(${organicRotation} ${cx} ${cy})` : undefined

	if (yText) {
		return (
			<g transform={organicTransform}>
				{/* Shadow effect */}
				<rect
					x={x + 2}
					y={y + 3}
					width={width}
					height={height}
					fill="rgba(0,0,0,0.08)"
					rx={STICKY_CORNER_RADIUS}
				/>

				<RichTextEditor
					x={box.x}
					y={box.y}
					width={box.width}
					height={box.height}
					yText={yText}
					baseStyle={baseStyle}
					onSave={onSave}
					caretPoint={caretPoint}
					shouldIgnoreBlur={shouldIgnoreBlur}
					quillRef={quillRef}
					containerStyle={{
						padding,
						background: bgColor,
						borderRadius: STICKY_CORNER_RADIUS
					}}
					onDragStart={onDragStart ? (e) => onDragStart(e) : undefined}
					onHeightChange={onHeightChange}
				/>
			</g>
		)
	}

	// Fallback: if no yText, render nothing (shouldn't happen)
	return null
}

// vim: ts=4
