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
 * StickyEditOverlay component - Rich text editor for sticky notes
 *
 * Uses RichTextEditor from @cloudillo/canvas-text for collaborative editing.
 * Includes 8px border drag zone for moving while editing.
 */

import * as React from 'react'
import * as Y from 'yjs'
import type Quill from 'quill'
import type { StickyObject } from '../crdt/index.js'
import { DEFAULT_PADDING, DEFAULT_LINE_HEIGHT } from '../utils/text-scaling.js'

const STICKY_FONT_SIZE = 18
import { colorToCss } from '../utils/palette.js'
import { RichTextEditor } from '@cloudillo/canvas-text'
import type { BaseTextStyle } from '@cloudillo/canvas-text'

// Sticky note text uses theme variable for proper theming support (same as StickyNote)
const STICKY_TEXT_COLOR = 'var(--palette-n0, #1e1e1e)'

export interface StickyEditOverlayProps {
	object: StickyObject
	yText?: Y.Text
	onSave: (text: string) => void
	onCancel: () => void
	onTextChange?: (text: string) => void
	onDragStart?: (e: React.PointerEvent) => void
	quillRef?: React.MutableRefObject<Quill | null>
	onHeightChange?: (height: number) => void
}

export function StickyEditOverlay({
	object,
	yText,
	onSave,
	onCancel,
	onDragStart,
	quillRef,
	onHeightChange
}: StickyEditOverlayProps) {
	const { x, y, width, height, style } = object
	const bgColor = colorToCss(style.fillColor)

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

	const baseStyle: BaseTextStyle = {
		fontFamily: 'system-ui, -apple-system, sans-serif',
		fontSize: STICKY_FONT_SIZE,
		fontWeight: 'normal',
		fontItalic: false,
		textDecoration: 'none',
		fill: STICKY_TEXT_COLOR,
		textAlign: 'left',
		verticalAlign: 'top',
		lineHeight: DEFAULT_LINE_HEIGHT,
		letterSpacing: 0
	}

	const handleSave = React.useCallback(() => {
		// For sticky notes, we still call onSave with the text for backwards compatibility
		onSave(yText?.toString() ?? object.text)
	}, [onSave, yText, object.text])

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
					rx={2}
				/>

				<RichTextEditor
					x={x}
					y={y}
					width={width}
					height={height}
					yText={yText}
					baseStyle={baseStyle}
					onSave={handleSave}
					onCancel={onCancel}
					quillRef={quillRef}
					containerStyle={{
						padding: DEFAULT_PADDING,
						background: bgColor,
						borderRadius: 2
					}}
					onDragStart={onDragStart ? (e) => onDragStart(e) : undefined}
					rotationTransform={organicTransform}
					onHeightChange={onHeightChange}
				/>
			</g>
		)
	}

	// Fallback: if no yText, render nothing (shouldn't happen)
	return null
}

// vim: ts=4
