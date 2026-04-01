// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * TextEditOverlay component - Rich text editor for text label objects
 *
 * Uses RichTextEditor from @cloudillo/canvas-text for collaborative editing.
 * Similar to StickyEditOverlay but without container background/padding.
 */

import * as React from 'react'
import type * as Y from 'yjs'
import type Quill from 'quill'
import type { TextObject } from '../crdt/index.js'
import { colorToCss } from '../utils/palette.js'
import { RichTextEditor } from '@cloudillo/canvas-text'
import type { BaseTextStyle } from '@cloudillo/canvas-text'

export interface TextEditOverlayProps {
	object: TextObject
	yText?: Y.Text
	onSave: () => void
	onCancel: () => void
	quillRef?: React.MutableRefObject<Quill | null>
	onHeightChange?: (height: number) => void
}

export function TextEditOverlay({
	object,
	yText,
	onSave,
	onCancel,
	quillRef,
	onHeightChange
}: TextEditOverlayProps) {
	const { x, y, width, height, fontSize = 16, fontFamily, style } = object
	const textColor = colorToCss(style.strokeColor)

	const baseStyle: BaseTextStyle = {
		fontFamily: fontFamily || 'system-ui, sans-serif',
		fontSize: fontSize ?? 16,
		fontWeight: 'normal',
		fontItalic: false,
		textDecoration: 'none',
		fill: textColor,
		textAlign: 'left',
		verticalAlign: 'top',
		lineHeight: 1.2,
		letterSpacing: 0
	}

	if (yText) {
		return (
			<RichTextEditor
				x={x}
				y={y}
				width={width}
				height={height}
				yText={yText}
				baseStyle={baseStyle}
				onSave={onSave}
				onCancel={onCancel}
				quillRef={quillRef}
				containerStyle={{
					background: 'transparent',
					borderRadius: 0
				}}
				onHeightChange={onHeightChange}
			/>
		)
	}

	return null
}

// vim: ts=4
