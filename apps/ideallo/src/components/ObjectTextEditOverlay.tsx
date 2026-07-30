// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The editor for a shape's label.
 *
 * Layered over the shape rather than replacing it - unlike StickyEditOverlay, which swaps the
 * whole note out and therefore has to redraw its card. Same objectTextLayout call as
 * ObjectTextDisplay, so the glyphs cannot jump on entering edit mode.
 */

import type { CaretPoint } from '@cloudillo/canvas-text'
import { RichTextEditor } from '@cloudillo/canvas-text'
import type Quill from 'quill'
import * as React from 'react'
import type * as Y from 'yjs'

import type { TextBearingObject } from '../crdt/index.js'
import { objectTextLayout } from '../utils/object-text.js'

export interface ObjectTextEditOverlayProps {
	object: TextBearingObject
	yText?: Y.Text
	onSave: () => void
	/** Where the pointer was when editing started, so the caret lands there */
	caretPoint?: CaretPoint
	/** Blur into the property bar is the user styling what they are editing, not leaving it */
	shouldIgnoreBlur?: () => boolean
	quillRef?: React.MutableRefObject<Quill | null>
}

export function ObjectTextEditOverlay({
	object,
	yText,
	onSave,
	caretPoint,
	shouldIgnoreBlur,
	quillRef
}: ObjectTextEditOverlayProps) {
	const { box, baseStyle, padding } = objectTextLayout(object)

	// No rotationTransform: RichTextEditor's <foreignObject> is IN the tree, under ObjectRenderer's
	// rotating <g>, so it already turns with the shape. Passing the rotation here applied it twice.
	if (!yText) return null

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
			containerStyle={{ padding, background: 'transparent', borderRadius: 0 }}
		/>
	)
}

// vim: ts=4
