// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * TextEditOverlay component - Rich text editor for text label objects
 *
 * Uses RichTextEditor from @cloudillo/canvas-text for collaborative editing.
 * Same layout as TextLabel, from the same objectTextLayout call, without any container chrome.
 */

import type { CaretPoint } from '@cloudillo/canvas-text'
import { RichTextEditor } from '@cloudillo/canvas-text'
import type Quill from 'quill'
import * as React from 'react'
import type * as Y from 'yjs'

import type { TextObject } from '../crdt/index.js'
import { objectTextLayout } from '../utils/object-text.js'

export interface TextEditOverlayProps {
	object: TextObject
	yText?: Y.Text
	onSave: () => void
	/** Where the pointer was when editing started, so the caret lands there */
	caretPoint?: CaretPoint
	/** Blur into the property bar is the user styling what they are editing, not leaving it */
	shouldIgnoreBlur?: () => boolean
	quillRef?: React.MutableRefObject<Quill | null>
	onHeightChange?: (height: number) => void
}

export function TextEditOverlay({
	object,
	yText,
	onSave,
	caretPoint,
	shouldIgnoreBlur,
	quillRef,
	onHeightChange
}: TextEditOverlayProps) {
	const { box, baseStyle, padding } = objectTextLayout(object)

	// No rotationTransform: RichTextEditor's <foreignObject> is IN the tree, under ObjectRenderer's
	// rotating <g>, so it already turns with the object. Passing the rotation here applied it twice.
	if (yText) {
		return (
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
