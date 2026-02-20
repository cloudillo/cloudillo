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
 * Hook for managing text editing state and operations.
 *
 * With rich text, Quill edits Y.Text directly via y-quill binding.
 * Save/cancel just close the editor; text content is already persisted in CRDT.
 */

import * as React from 'react'
import type Quill from 'quill'

import type { ObjectId } from '../crdt'
import { updateObjectSize, resolveObject, resolveTextStyle, getOrCreateRichText } from '../crdt'
import { measureTextHeight } from '../utils'
import type { UsePrezilloDocumentResult } from './usePrezilloDocument'

export interface UseTextEditingOptions {
	prezillo: UsePrezilloDocumentResult
}

export interface UseTextEditingResult {
	// State
	editingTextId: ObjectId | null
	setEditingTextId: React.Dispatch<React.SetStateAction<ObjectId | null>>
	/** Ref to access the Quill instance for formatting from properties panel */
	quillRef: React.MutableRefObject<Quill | null>

	// Computed
	selectedTextObject: { id: string; obj: any } | null
	selectedTextStyle: ReturnType<typeof resolveTextStyle> | null

	// Handlers
	handleTextEditSave: () => void
	handleTextEditCancel: () => void
}

export function useTextEditing({ prezillo }: UseTextEditingOptions): UseTextEditingResult {
	// Text editing state - which object is being text-edited
	const [editingTextId, setEditingTextId] = React.useState<ObjectId | null>(null)
	// Ref to access Quill instance for inline formatting from properties panel
	const quillRef = React.useRef<Quill | null>(null)

	// Check if selection is a text object
	const selectedTextObject = React.useMemo(() => {
		if (prezillo.selectedIds.size !== 1) return null
		const id = Array.from(prezillo.selectedIds)[0]
		const obj = prezillo.doc.o.get(id)
		if (!obj || obj.t !== 'T') return null
		return { id, obj }
	}, [prezillo.selectedIds, prezillo.doc.o])

	// Get current text style for selected text object
	const selectedTextStyle = React.useMemo(() => {
		if (!selectedTextObject) return null
		const freshObj = prezillo.doc.o.get(selectedTextObject.id)
		if (!freshObj) return null
		return resolveTextStyle(prezillo.doc, freshObj)
	}, [selectedTextObject, prezillo.doc.o, prezillo.doc])

	// Handle text edit save (close editor, adjust height)
	// Text content is already saved in Y.Text by Quill via y-quill binding
	const handleTextEditSave = React.useCallback(() => {
		if (!editingTextId) return

		const storedObj = prezillo.doc.o.get(editingTextId)
		if (!storedObj || storedObj.t !== 'T') {
			setEditingTextId(null)
			return
		}

		const obj = resolveObject(prezillo.doc, editingTextId)
		if (!obj) {
			setEditingTextId(null)
			return
		}

		// Get the Y.Text to measure content
		const yText = prezillo.doc.rt.get(editingTextId)
		if (yText) {
			const plainText = yText.toString()
			const textStyle = resolveTextStyle(prezillo.doc, storedObj)

			// Measure the text height with current width and style
			const measuredHeight = measureTextHeight(plainText, obj.width, textStyle)

			// Use minHeight if set, otherwise use current height as minimum
			const minHeight = (obj as any).minHeight ?? obj.height
			const newHeight = Math.max(measuredHeight, minHeight)

			// Update height if it changed
			if (newHeight !== obj.height) {
				updateObjectSize(prezillo.yDoc, prezillo.doc, editingTextId, obj.width, newHeight)
			}
		}

		setEditingTextId(null)
	}, [editingTextId, prezillo.yDoc, prezillo.doc])

	// Handle text edit cancel
	const handleTextEditCancel = React.useCallback(() => {
		setEditingTextId(null)
	}, [])

	return {
		editingTextId,
		setEditingTextId,
		quillRef,
		selectedTextObject,
		selectedTextStyle,
		handleTextEditSave,
		handleTextEditCancel
	}
}

// vim: ts=4
