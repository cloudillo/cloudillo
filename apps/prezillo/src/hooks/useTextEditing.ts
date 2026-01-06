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
 * Hook for managing text editing state and operations
 */

import * as React from 'react'
import * as Y from 'yjs'

import type { ObjectId, YPrezilloDocument } from '../crdt'
import { updateObject, updateObjectSize, resolveObject, resolveTextStyle } from '../crdt'
import { measureTextHeight } from '../utils'

export interface UseTextEditingOptions {
	yDoc: Y.Doc
	doc: YPrezilloDocument
	selectedIds: Set<ObjectId>
}

export interface UseTextEditingResult {
	// State
	editingTextId: ObjectId | null
	setEditingTextId: React.Dispatch<React.SetStateAction<ObjectId | null>>
	editingTextRef: React.MutableRefObject<string>

	// Computed
	selectedTextObject: { id: string; obj: any } | null
	selectedTextStyle: ReturnType<typeof resolveTextStyle> | null

	// Handlers
	handleTextEditSave: (text: string) => void
	handleTextEditCancel: () => void
}

export function useTextEditing({
	yDoc,
	doc,
	selectedIds
}: UseTextEditingOptions): UseTextEditingResult {
	// Text editing state - which object is being text-edited
	const [editingTextId, setEditingTextId] = React.useState<ObjectId | null>(null)
	// Ref to store current editing text for save-on-click-outside
	const editingTextRef = React.useRef<string>('')

	// Check if selection is a text object
	// doc.o in deps ensures this recalculates when any object updates
	const selectedTextObject = React.useMemo(() => {
		if (selectedIds.size !== 1) return null
		const id = Array.from(selectedIds)[0]
		const obj = doc.o.get(id)
		if (!obj || (obj.t !== 'T' && obj.t !== 'B')) return null
		return { id, obj }
	}, [selectedIds, doc.o])

	// Get current text style for selected text object
	const selectedTextStyle = React.useMemo(() => {
		if (!selectedTextObject) return null
		// Re-fetch fresh object to get latest style
		const freshObj = doc.o.get(selectedTextObject.id)
		if (!freshObj) return null
		return resolveTextStyle(doc, freshObj)
	}, [selectedTextObject, doc.o, doc])

	// Handle text edit save
	const handleTextEditSave = React.useCallback(
		(text: string) => {
			if (!editingTextId) return

			const storedObj = doc.o.get(editingTextId)
			if (!storedObj || storedObj.t !== 'T') {
				setEditingTextId(null)
				return
			}

			// Check if this is a template instance
			const isInstanceObj = storedObj.proto !== undefined
			const hasLocalText = storedObj.tx !== undefined

			// Get the resolved object (handles prototype inheritance) and text style
			const obj = resolveObject(doc, editingTextId)
			if (!obj) {
				setEditingTextId(null)
				return
			}
			const originalText = (obj as any).text ?? ''

			// For instances: empty text means "inherit from prototype" (clear local override)
			// For non-instances or instances with local text that hasn't changed: check if text changed
			if (isInstanceObj && text === '' && !hasLocalText) {
				// Instance was inheriting and user didn't type anything - no change needed
				setEditingTextId(null)
				return
			}

			// Skip update if text hasn't changed
			if (text === originalText) {
				setEditingTextId(null)
				return
			}

			const textStyle = resolveTextStyle(doc, storedObj)

			// For height calculation, use new text or prototype text if clearing to inherit
			let displayText = text
			if (isInstanceObj && text === '') {
				// Clearing local text - will inherit from prototype
				const protoObj = doc.o.get(storedObj.proto!)
				displayText = protoObj && 'tx' in protoObj ? (protoObj.tx as string) : ''
			}

			// Measure the text height with current width and style
			const measuredHeight = measureTextHeight(displayText, obj.width, textStyle)

			// Use minHeight if set, otherwise use current height as minimum
			const minHeight = (obj as any).minHeight ?? obj.height
			const newHeight = Math.max(measuredHeight, minHeight)

			// Update text content
			// For instances with empty text, clear local override by setting text to undefined
			if (isInstanceObj && text === '') {
				// Clear local text to inherit from prototype
				yDoc.transact(() => {
					const currentObj = doc.o.get(editingTextId)
					if (currentObj) {
						const updated = { ...currentObj }
						delete (updated as any).tx
						doc.o.set(editingTextId, updated)
					}
				}, yDoc.clientID)
			} else {
				updateObject(yDoc, doc, editingTextId, { text } as any)
			}

			// Update height if it changed
			if (newHeight !== obj.height) {
				updateObjectSize(yDoc, doc, editingTextId, obj.width, newHeight)
			}

			setEditingTextId(null)
		},
		[editingTextId, yDoc, doc]
	)

	// Handle text edit cancel
	const handleTextEditCancel = React.useCallback(() => {
		setEditingTextId(null)
	}, [])

	return {
		editingTextId,
		setEditingTextId,
		editingTextRef,
		selectedTextObject,
		selectedTextStyle,
		handleTextEditSave,
		handleTextEditCancel
	}
}

// vim: ts=4
