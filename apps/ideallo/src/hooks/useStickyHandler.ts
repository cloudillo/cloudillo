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
 * Hook for handling sticky note creation and editing
 *
 * Miro/FigJam-style UX:
 * - Click creates note at default size and immediately enters edit mode
 * - If user clicks away without typing, empty note is deleted
 */

import * as React from 'react'
import * as Y from 'yjs'

import type { YIdealloDocument, ObjectId, StickyObject, NewStickyInput } from '../crdt/index.js'
import { addObject, getObjectYText, DEFAULT_STYLE } from '../crdt/index.js'
import type { StickyInputState } from '../tools/types.js'
import { applyTextDiff } from '../utils/text-diff.js'

export interface UseStickyHandlerOptions {
	yDoc: Y.Doc
	doc: YIdealloDocument
	currentStyle: {
		strokeColor: string
		fillColor: string
		strokeWidth: number
	}
	enabled: boolean
	onObjectCreated?: (id: ObjectId) => void
	onEditStart?: (id: ObjectId) => void
	onEditEnd?: () => void
}

// Default sticky note size (as per UX design)
const DEFAULT_STICKY_WIDTH = 200
const DEFAULT_STICKY_HEIGHT = 200

// Default sticky background if fill is transparent
const DEFAULT_STICKY_FILL = 'yellow-p' // Pastel yellow from palette

export function useStickyHandler(options: UseStickyHandlerOptions) {
	const { yDoc, doc, currentStyle, enabled, onObjectCreated, onEditStart, onEditEnd } = options

	// Currently editing sticky note
	const [editingSticky, setEditingSticky] = React.useState<StickyInputState | null>(null)

	/**
	 * Handle pointer down on canvas - create new sticky and enter edit mode
	 */
	const handlePointerDown = React.useCallback(
		(x: number, y: number) => {
			if (!enabled) return

			// If already editing, commit first
			if (editingSticky) {
				commitSticky()
			}

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

			// Enter edit mode immediately
			setEditingSticky({
				id: objectId,
				x: obj.x,
				y: obj.y,
				width: DEFAULT_STICKY_WIDTH,
				height: DEFAULT_STICKY_HEIGHT,
				text: ''
			})

			onObjectCreated?.(objectId)
			onEditStart?.(objectId)
		},
		[enabled, editingSticky, yDoc, doc, currentStyle, onObjectCreated, onEditStart]
	)

	// Ref to track the current editing sticky ID (avoids stale closure issues)
	const editingStickyRef = React.useRef<StickyInputState | null>(null)
	React.useEffect(() => {
		editingStickyRef.current = editingSticky
	}, [editingSticky])

	/**
	 * Update the Y.Text content for a sticky note using minimal diff
	 */
	const updateStickyText = React.useCallback(
		(objectId: ObjectId, text: string) => {
			const yText = getObjectYText(doc, objectId)
			if (!yText) return

			// Use diff-based update for proper CRDT collaborative editing
			applyTextDiff(yDoc, yText, text)
		},
		[yDoc, doc]
	)

	/**
	 * Handle text change during editing
	 */
	const handleTextChange = React.useCallback(
		(text: string) => {
			// Use ref to get current value, avoiding stale closure
			const current = editingStickyRef.current
			if (!current?.id) return

			// Update local state
			setEditingSticky((prev) => (prev ? { ...prev, text } : null))

			// Update Y.Text in CRDT
			updateStickyText(current.id, text)
		},
		[updateStickyText]
	)

	/**
	 * Save and commit editing (on blur or escape)
	 * Takes text as parameter to ensure final text is saved
	 */
	const saveSticky = React.useCallback(
		(text: string) => {
			const current = editingStickyRef.current
			if (current?.id) {
				// Ensure text is saved to CRDT before closing
				updateStickyText(current.id, text)
			}
			setEditingSticky(null)
			onEditEnd?.()
		},
		[updateStickyText, onEditEnd]
	)

	/**
	 * Commit editing without saving (legacy, use saveSticky instead)
	 */
	const commitSticky = React.useCallback(() => {
		setEditingSticky(null)
		onEditEnd?.()
	}, [onEditEnd])

	/**
	 * Cancel editing (escape key)
	 */
	const cancelSticky = React.useCallback(() => {
		setEditingSticky(null)
		onEditEnd?.()
	}, [onEditEnd])

	/**
	 * Start editing an existing sticky note (for double-click)
	 */
	const startEditing = React.useCallback(
		(object: StickyObject) => {
			setEditingSticky({
				id: object.id,
				x: object.x,
				y: object.y,
				width: object.width,
				height: object.height,
				text: object.text
			})
			onEditStart?.(object.id)
		},
		[onEditStart]
	)

	/**
	 * Check if a specific sticky is being edited
	 */
	const isEditing = React.useCallback(
		(objectId: ObjectId) => {
			return editingSticky?.id === objectId
		},
		[editingSticky]
	)

	// Memoize return value to prevent infinite re-render loops
	return React.useMemo(
		() => ({
			editingSticky,
			handlePointerDown,
			handleTextChange,
			saveSticky,
			commitSticky,
			cancelSticky,
			startEditing,
			isEditing
		}),
		[
			editingSticky,
			handlePointerDown,
			handleTextChange,
			saveSticky,
			commitSticky,
			cancelSticky,
			startEditing,
			isEditing
		]
	)
}

// vim: ts=4
