// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Hook for handling text label CREATION.
 *
 * Creation and re-edit are the SAME path: a click places an empty text object and hands it to the
 * shared editor (useObjectTextEditor), exactly as the sticky tool does. There is no separate
 * "pending placement" state, so the text tool and a double-click can never end up with two editors
 * on screen.
 *
 * An empty text object is deleted when the editor closes - that rule lives with the editor, in
 * shouldRemoveOnEditEnd. Unlike a sticky (a visible card even when blank) a text object with no
 * text draws nothing but a transparent hit rect, so keeping it would leave an invisible click trap.
 */

import * as React from 'react'
import type * as Y from 'yjs'

import type { NewTextInput, ObjectId, TextObject, YIdealloDocument } from '../crdt/index.js'
import { addObject, DEFAULT_STYLE, getObject } from '../crdt/index.js'
import { DEFAULT_TEXT_FONT_SIZE } from '../utils/text-styles.js'
import type { CurrentStyle } from './useIdealloDocument.js'

export interface UseTextHandlerOptions {
	yDoc: Y.Doc
	doc: YIdealloDocument
	currentStyle: CurrentStyle
	enabled: boolean
	/** The shared editor's startEditing - the new label is typed into immediately */
	startEditing: (object: TextObject) => void
	onObjectCreated?: (id: ObjectId) => void
}

const DEFAULT_TEXT_WIDTH = 200
const DEFAULT_TEXT_HEIGHT = 32

export function useTextHandler(options: UseTextHandlerOptions) {
	const { yDoc, doc, currentStyle, enabled, startEditing, onObjectCreated } = options

	/**
	 * Handle pointer down on canvas - create an empty text object and enter edit mode.
	 *
	 * Placed top-left at the click point, not centred on it like a sticky: a text object grows
	 * down and to the right from where the caret appears.
	 *
	 * Any open editor was already closed by app.tsx before this dispatch, so there is nothing to
	 * finish here.
	 */
	const handlePointerDown = React.useCallback(
		(x: number, y: number) => {
			if (!enabled) return

			const obj: NewTextInput = {
				type: 'text',
				x,
				y,
				width: DEFAULT_TEXT_WIDTH,
				height: DEFAULT_TEXT_HEIGHT,
				text: '',
				// Last-used text settings carry to the next label, like the colours do
				fontSize: currentStyle.fontSize ?? DEFAULT_TEXT_FONT_SIZE,
				...(currentStyle.fontFamily ? { fontFamily: currentStyle.fontFamily } : {}),
				...(currentStyle.textAlign ? { textAlign: currentStyle.textAlign } : {}),
				...(currentStyle.verticalAlign
					? { verticalAlign: currentStyle.verticalAlign }
					: {}),
				rotation: 0,
				pivotX: 0.5,
				pivotY: 0.5,
				locked: false,
				style: {
					strokeColor: currentStyle.strokeColor,
					fillColor: 'transparent',
					strokeWidth: 0,
					strokeStyle: DEFAULT_STYLE.strokeStyle,
					opacity: DEFAULT_STYLE.opacity
				}
			}

			const objectId = addObject(yDoc, doc, obj)

			const created = getObject(doc, objectId)
			if (created?.type === 'text') startEditing(created)

			onObjectCreated?.(objectId)
		},
		[enabled, yDoc, doc, currentStyle, startEditing, onObjectCreated]
	)

	// Memoize return value to prevent infinite re-render loops
	return React.useMemo(() => ({ handlePointerDown }), [handlePointerDown])
}

// vim: ts=4
