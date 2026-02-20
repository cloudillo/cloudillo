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
 * Hook for canvas event handlers: click, double-click, keyboard, context menu, delete, document check
 */

import * as React from 'react'

import type { ObjectId, PrezilloObject } from '../crdt'
import {
	deleteObject,
	deletePrototypeWithInstances,
	getInstancesOfPrototype,
	getTemplateIdForPrototype,
	checkDocumentConsistency,
	fixDocumentIssues
} from '../crdt'
import type { UsePrezilloDocumentResult } from './usePrezilloDocument'
import type { useDialog } from '@cloudillo/react'

type CanvasObject = PrezilloObject & { _templateId?: string; _isPrototype?: boolean }

export interface UseCanvasEventHandlersOptions {
	prezillo: UsePrezilloDocumentResult
	canvasObjects: CanvasObject[]
	isReadOnly: boolean
	dialog: ReturnType<typeof useDialog>
	handleDuplicate: () => void
	setEditingTextId: (id: ObjectId | null) => void
	justFinishedInteractionRef: React.MutableRefObject<boolean>
	objectMenuRef: React.RefObject<HTMLDivElement | null>
}

export interface UseCanvasEventHandlersResult {
	handleObjectClick: (e: React.MouseEvent, objectId: ObjectId) => void
	handleObjectDoubleClick: (e: React.MouseEvent, objectId: ObjectId) => void
	handleCanvasClick: (e: React.MouseEvent) => void
	handleDelete: () => Promise<void>
	handleCheckDocument: () => Promise<void>
	handleKeyDown: (evt: React.KeyboardEvent) => void
	handleObjectContextMenu: (evt: React.MouseEvent, objectId?: ObjectId) => void
	objectMenu: { x: number; y: number } | null
	setObjectMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>
}

export function useCanvasEventHandlers({
	prezillo,
	canvasObjects,
	isReadOnly,
	dialog,
	handleDuplicate,
	setEditingTextId,
	justFinishedInteractionRef,
	objectMenuRef
}: UseCanvasEventHandlersOptions): UseCanvasEventHandlersResult {
	// Context menu state for object actions (Duplicate/Delete)
	const [objectMenu, setObjectMenu] = React.useState<{ x: number; y: number } | null>(null)

	// Close object context menu on click outside or Escape key
	React.useEffect(() => {
		if (!objectMenu) return
		const handlePointerDown = (e: PointerEvent) => {
			// Don't close if clicking inside the menu
			if (objectMenuRef.current?.contains(e.target as Node)) return
			// Close menu and consume the click (don't let it select another object)
			e.stopPropagation()
			e.preventDefault()
			setObjectMenu(null)
		}
		const handleContextMenu = (e: MouseEvent) => {
			// Prevent new context menu from opening while closing this one
			if (objectMenuRef.current?.contains(e.target as Node)) return
			e.stopPropagation()
			e.preventDefault()
			setObjectMenu(null)
		}
		const handleEscapeKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setObjectMenu(null)
		}
		// Use capture phase to catch events before they reach other elements
		// pointerdown is what triggers selection in ObjectShape
		document.addEventListener('pointerdown', handlePointerDown, true)
		document.addEventListener('contextmenu', handleContextMenu, true)
		document.addEventListener('keydown', handleEscapeKey)
		return () => {
			document.removeEventListener('pointerdown', handlePointerDown, true)
			document.removeEventListener('contextmenu', handleContextMenu, true)
			document.removeEventListener('keydown', handleEscapeKey)
		}
	}, [objectMenu, objectMenuRef])

	// Handle object click
	function handleObjectClick(e: React.MouseEvent, objectId: ObjectId) {
		e.stopPropagation()
		const addToSelection = e.shiftKey || e.ctrlKey || e.metaKey

		// Single-click to edit: if clicking an already-selected text object, enter edit mode
		const obj = prezillo.doc.o.get(objectId)
		if (!isReadOnly && !addToSelection && prezillo.selectedIds.has(objectId)) {
			if (obj?.t === 'T') {
				setEditingTextId(objectId)
				return
			}
		}

		// selectObject automatically handles template/page selection based on the object
		prezillo.selectObject(objectId, addToSelection)
		prezillo.setActiveTool(null)
	}

	// Handle object double-click (edit text)
	function handleObjectDoubleClick(e: React.MouseEvent, objectId: ObjectId) {
		if (isReadOnly) return
		e.stopPropagation()

		// Auto-switch to object's page if clicking on an object from a different page
		prezillo.autoSwitchToObjectPage(objectId)

		// Only text objects are editable
		const obj = prezillo.doc.o.get(objectId)
		if (obj?.t === 'T') {
			setEditingTextId(objectId)
		}
	}

	// Handle canvas click (deselect)
	function handleCanvasClick(e: React.MouseEvent) {
		// Skip if click originated from inside the SVG (e.g., pivot handle, rotation handle)
		// These clicks should be handled by their own handlers, not trigger deselection
		const target = e.target as HTMLElement
		if (target.tagName === 'circle' || target.tagName === 'line' || target.tagName === 'path') {
			return
		}
		// Skip if we just finished a resize/rotate/pivot interaction or object selection
		if (justFinishedInteractionRef.current) {
			justFinishedInteractionRef.current = false
			return
		}
		if (!prezillo.activeTool) {
			prezillo.clearSelection()
			// Also clear template selection when clicking canvas background
			if (prezillo.selectedTemplateId) {
				prezillo.clearTemplateSelection()
			}
		}
	}

	// Handle delete
	async function handleDelete() {
		console.log('[handleDelete] called, selectedIds:', [...prezillo.selectedIds])
		if (isReadOnly) return

		// Check if any selected objects are prototypes (in a template's tpo array)
		let totalInstances = 0
		const prototypesToDelete: ObjectId[] = []

		for (const id of prezillo.selectedIds) {
			// Check if this object is a prototype (belongs to a template)
			const templateId = getTemplateIdForPrototype(prezillo.doc, id)
			console.log('[handleDelete] checking id:', id, 'templateId:', templateId)
			if (templateId) {
				// It's a prototype - count its instances
				const instances = getInstancesOfPrototype(prezillo.doc, id)
				totalInstances += instances.length
				prototypesToDelete.push(id)
			}
		}

		console.log(
			'[handleDelete] prototypesToDelete:',
			prototypesToDelete,
			'totalInstances:',
			totalInstances
		)

		// Show confirmation dialog if deleting prototypes with instances
		if (totalInstances > 0) {
			console.log('[handleDelete] showing dialog for prototypes with instances')
			const confirmed = await dialog.confirm(
				'Delete Prototype Objects?',
				`This will also delete ${totalInstances} instance(s) that depend on these prototypes. Continue?`
			)
			if (!confirmed) return
		} else if (prototypesToDelete.length > 0) {
			// Prototypes without instances - still confirm
			console.log('[handleDelete] showing dialog for prototypes without instances')
			const confirmed = await dialog.confirm(
				'Delete Prototype Objects?',
				'Delete these prototype objects from the template?'
			)
			if (!confirmed) return
		}

		console.log('[handleDelete] proceeding with deletion')
		// Proceed with deletion
		prezillo.selectedIds.forEach((id) => {
			if (prototypesToDelete.includes(id)) {
				deletePrototypeWithInstances(prezillo.yDoc, prezillo.doc, id, 'delete-instances')
			} else {
				deleteObject(prezillo.yDoc, prezillo.doc, id)
			}
		})
		prezillo.clearSelection()
	}

	// Handle document consistency check
	async function handleCheckDocument() {
		const report = checkDocumentConsistency(prezillo.doc)

		if (report.summary.total === 0) {
			await dialog.tell('Document Check', 'No issues found. The document is consistent.')
			return
		}

		// Build summary message
		const lines: string[] = [`Found ${report.summary.total} issue(s):`]
		if (report.summary.orphanedInstances > 0) {
			lines.push(
				`• ${report.summary.orphanedInstances} orphaned instance(s) (missing prototype)`
			)
		}
		if (report.summary.orphanedChildRefs > 0) {
			lines.push(`• ${report.summary.orphanedChildRefs} orphaned child reference(s)`)
		}
		if (report.summary.missingViewRefs > 0) {
			lines.push(`• ${report.summary.missingViewRefs} invalid view reference(s)`)
		}
		lines.push('')
		lines.push('Would you like to fix these issues?')

		const confirmed = await dialog.confirm('Document Check', lines.join('\n'))
		if (confirmed) {
			const result = fixDocumentIssues(prezillo.yDoc, prezillo.doc, report)
			await dialog.tell('Document Fixed', `Fixed ${result.fixed} issue(s).`)
		}
	}

	// Handle keyboard
	function handleKeyDown(evt: React.KeyboardEvent) {
		const hasModifier = evt.ctrlKey || evt.metaKey
		// Allow modifier key combinations from any element (Ctrl+D, Ctrl+Z, etc.)
		// but block regular keys (Delete, Escape) when focus is on child elements
		if (!hasModifier && evt.target !== evt.currentTarget) return

		if (!evt.altKey && !evt.shiftKey && !evt.ctrlKey && !evt.metaKey) {
			switch (evt.key) {
				case 'Delete':
				case 'Backspace':
					if (!isReadOnly && prezillo.selectedIds.size > 0) {
						handleDelete()
					}
					break
				case 'Escape':
					prezillo.clearSelection()
					prezillo.setActiveTool(null)
					setEditingTextId(null)
					break
			}
		} else if (!evt.altKey && !evt.shiftKey && (evt.ctrlKey || evt.metaKey)) {
			switch (evt.key) {
				case 'z':
					if (!isReadOnly) prezillo.undo()
					evt.preventDefault()
					break
				case 'y':
					if (!isReadOnly) prezillo.redo()
					evt.preventDefault()
					break
				case 'a':
					// Select all objects in the active view
					if (prezillo.activeViewId) {
						const ids = canvasObjects.map((o) => o.id)
						prezillo.selectObjects(ids)
					}
					evt.preventDefault()
					break
				case 'd':
					// Duplicate selected objects
					if (!isReadOnly && prezillo.selectedIds.size > 0) {
						handleDuplicate()
					}
					evt.preventDefault()
					break
			}
		}
	}

	// Handle context menu on canvas or object
	// If objectId is provided, select that object first (standard UX: right-click selects)
	function handleObjectContextMenu(evt: React.MouseEvent, objectId?: ObjectId) {
		evt.preventDefault()
		evt.stopPropagation() // Prevent canvas handler from firing
		if (isReadOnly) return

		// If clicking on an object, select it first (unless already in selection)
		if (objectId) {
			if (!prezillo.isSelected(objectId)) {
				// Object not selected - select it (replacing current selection)
				// Use Shift to add to selection instead
				const addToSelection = evt.shiftKey || evt.ctrlKey || evt.metaKey
				prezillo.selectObject(objectId, addToSelection)
			}
			// If already selected, keep current selection (might be multi-select)
		}

		// Only show menu if we have a selection now
		if (objectId || prezillo.selectedIds.size > 0) {
			setObjectMenu({ x: evt.clientX, y: evt.clientY })
		}
	}

	return {
		handleObjectClick,
		handleObjectDoubleClick,
		handleCanvasClick,
		handleDelete,
		handleCheckDocument,
		handleKeyDown,
		handleObjectContextMenu,
		objectMenu,
		setObjectMenu
	}
}

// vim: ts=4
