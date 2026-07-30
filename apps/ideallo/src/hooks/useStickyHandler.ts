// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Hook for handling sticky note CREATION.
 *
 * Miro/FigJam-style UX: a click creates a note at the default size and hands it straight to the
 * shared editor (useObjectTextEditor), which owns the editing state and the one close rule.
 *
 * An empty note is KEPT. A blank sticky is still a visible 200x200 coloured card and a legitimate
 * thing to place; only an object that draws nothing without text is cleaned up on close - see
 * shouldRemoveOnEditEnd.
 */

import * as React from 'react'
import type * as Y from 'yjs'

import type { NewStickyInput, ObjectId, StickyObject, YIdealloDocument } from '../crdt/index.js'
import { addObject, DEFAULT_STYLE, getObject } from '../crdt/index.js'
import { DEFAULT_STICKY_FONT_SIZE } from '../utils/text-styles.js'
import type { CurrentStyle } from './useIdealloDocument.js'

export interface UseStickyHandlerOptions {
	yDoc: Y.Doc
	doc: YIdealloDocument
	currentStyle: CurrentStyle
	enabled: boolean
	/** The shared editor's startEditing - the new note is typed into immediately */
	startEditing: (object: StickyObject) => void
	onObjectCreated?: (id: ObjectId) => void
}

// Default sticky note size (as per UX design)
const DEFAULT_STICKY_WIDTH = 200
const DEFAULT_STICKY_HEIGHT = 200

// Default sticky background if fill is transparent
const DEFAULT_STICKY_FILL = 'yellow-p' // Pastel yellow from palette

export function useStickyHandler(options: UseStickyHandlerOptions) {
	const { yDoc, doc, currentStyle, enabled, startEditing, onObjectCreated } = options

	/**
	 * Handle pointer down on canvas - create new sticky and enter edit mode
	 *
	 * Any open editor was already closed by app.tsx before this dispatch, so there is nothing to
	 * finish here.
	 */
	const handlePointerDown = React.useCallback(
		(x: number, y: number) => {
			if (!enabled) return

			// Create sticky object in CRDT immediately
			// Use default yellow fill if current fill is transparent (sticky needs visible background)
			const stickyFill =
				currentStyle.fillColor === 'transparent' || currentStyle.fillColor === 'none'
					? DEFAULT_STICKY_FILL
					: currentStyle.fillColor

			const obj: NewStickyInput = {
				type: 'sticky',
				x: x - DEFAULT_STICKY_WIDTH / 2, // Center on click point
				y: y - DEFAULT_STICKY_HEIGHT / 2,
				width: DEFAULT_STICKY_WIDTH,
				height: DEFAULT_STICKY_HEIGHT,
				text: '',
				// Last-used text settings carry to the next note, like the colours do
				fontSize: currentStyle.fontSize ?? DEFAULT_STICKY_FONT_SIZE,
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
					fillColor: stickyFill,
					strokeWidth: currentStyle.strokeWidth,
					strokeStyle: DEFAULT_STYLE.strokeStyle,
					opacity: DEFAULT_STYLE.opacity
				}
			}

			const objectId = addObject(yDoc, doc, obj)

			// Enter edit mode immediately, through the shared slot
			const created = getObject(doc, objectId)
			if (created?.type === 'sticky') startEditing(created)

			onObjectCreated?.(objectId)
		},
		[enabled, yDoc, doc, currentStyle, startEditing, onObjectCreated]
	)

	// Memoize return value to prevent infinite re-render loops
	return React.useMemo(() => ({ handlePointerDown }), [handlePointerDown])
}

// vim: ts=4
