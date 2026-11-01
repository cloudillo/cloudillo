// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Hook for canvas event handlers: click, double-click, keyboard, context menu, delete, document check
 */

import { cycleIndex, selectionCycleIndex } from '@cloudillo/canvas-tools'
import type { useDialog } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import type { ObjectId, PrezilloObject } from '../crdt'
import {
	checkDocumentConsistency,
	deleteObject,
	deletePrototypeWithInstances,
	fixDocumentIssues,
	getInstancesOfPrototype,
	getObject,
	getTemplateIdForPrototype,
	isInstance,
	isPropertyGroupLocked,
	updateObjectPosition
} from '../crdt'
import { isEditableTarget, POPOVER_TARGET_SELECTOR } from '../utils/editable-target'
import type { UsePrezilloDocumentResult } from './usePrezilloDocument'

type CanvasObject = PrezilloObject & { _templateId?: string; _isPrototype?: boolean }

export interface UseCanvasEventHandlersOptions {
	prezillo: UsePrezilloDocumentResult
	canvasObjects: CanvasObject[]
	/** The active view's objects in z-order, the Tab cycle (canvasObjects adds prototypes) */
	viewObjects: PrezilloObject[]
	isReadOnly: boolean
	dialog: ReturnType<typeof useDialog>
	handleDuplicate: () => void
	setEditingTextId: (id: ObjectId | null) => void
	setActiveDocumentId?: (id: ObjectId | null) => void
	justFinishedInteractionRef: React.MutableRefObject<boolean>
	objectMenuRef: React.RefObject<HTMLDivElement | null>
	/** PageUp on the focused canvas */
	onPrevView?: () => void
	/** PageDown on the focused canvas */
	onNextView?: () => void
}

export interface UseCanvasEventHandlersResult {
	handleObjectClick: (e: React.MouseEvent, objectId: ObjectId) => void
	handleObjectDoubleClick: (e: React.MouseEvent, objectId: ObjectId) => void
	handleCanvasClick: (e: React.MouseEvent) => void
	handleDelete: () => Promise<void>
	handleCheckDocument: () => Promise<void>
	handleKeyDown: (evt: KeyboardEvent) => void
	handleObjectContextMenu: (evt: React.MouseEvent, objectId?: ObjectId) => void
	objectMenu: { x: number; y: number } | null
	setObjectMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>
}

export function useCanvasEventHandlers({
	prezillo,
	canvasObjects,
	viewObjects,
	isReadOnly,
	dialog,
	handleDuplicate,
	setEditingTextId,
	setActiveDocumentId,
	justFinishedInteractionRef,
	objectMenuRef,
	onPrevView,
	onNextView
}: UseCanvasEventHandlersOptions): UseCanvasEventHandlersResult {
	const { t } = useTranslation()
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

	// Handle object double-click (edit text or activate document)
	function handleObjectDoubleClick(e: React.MouseEvent, objectId: ObjectId) {
		const obj = prezillo.doc.o.get(objectId)
		// Readers may still activate embedded documents
		if (isReadOnly && obj?.t !== 'D') return
		e.stopPropagation()

		// Auto-switch to object's page if clicking on an object from a different page
		prezillo.autoSwitchToObjectPage(objectId)

		if (obj?.t === 'T') {
			setEditingTextId(objectId)
		} else if (obj?.t === 'D') {
			setActiveDocumentId?.(objectId)
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
			setActiveDocumentId?.(null)
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
				t('Delete Prototype Objects?'),
				t(
					'This will also delete {{count}} instances that depend on these prototypes. Continue?',
					{ count: totalInstances }
				)
			)
			if (!confirmed) return
		} else if (prototypesToDelete.length > 0) {
			// Prototypes without instances - still confirm
			console.log('[handleDelete] showing dialog for prototypes without instances')
			const confirmed = await dialog.confirm(
				t('Delete Prototype Objects?'),
				t('Delete these prototype objects from the template?')
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
			await dialog.tell(
				t('Document Check'),
				t('No issues found. The document is consistent.')
			)
			return
		}

		// Build summary message
		const lines: string[] = [t('Found {{count}} issues:', { count: report.summary.total })]
		if (report.summary.orphanedInstances > 0) {
			lines.push(
				`• ${t('{{count}} orphaned instances (missing prototype)', { count: report.summary.orphanedInstances })}`
			)
		}
		if (report.summary.orphanedChildRefs > 0) {
			lines.push(
				`• ${t('{{count}} orphaned child references', { count: report.summary.orphanedChildRefs })}`
			)
		}
		if (report.summary.missingViewRefs > 0) {
			lines.push(
				`• ${t('{{count}} invalid view references', { count: report.summary.missingViewRefs })}`
			)
		}
		lines.push('')
		lines.push(t('Would you like to fix these issues?'))

		const confirmed = await dialog.confirm(t('Document Check'), lines.join('\n'))
		if (confirmed) {
			const result = fixDocumentIssues(prezillo.yDoc, prezillo.doc, report)
			await dialog.tell(
				t('Document Fixed'),
				t('Fixed {{count}} issues.', { count: result.fixed })
			)
		}
	}

	// Handle keyboard
	// Registered on `window` (bubble phase) by app.tsx, so it works whatever holds focus
	function handleKeyDown(evt: KeyboardEvent) {
		if (evt.defaultPrevented || isEditableTarget(evt.target)) return
		const hasModifier = evt.ctrlKey || evt.metaKey
		// Modifier chords (Ctrl+D, Ctrl+Z, ...) stay live on buttons; plain keys (Delete,
		// Enter, arrows) belong to the focused button / listbox
		if (
			!hasModifier &&
			(evt.target as HTMLElement | null)?.closest?.('button, [role="listbox"]')
		)
			return

		// Object navigation, only while the canvas svg itself holds focus (app.tsx gives it
		// tabIndex 0) and no popover is open. Tab past either end is left alone, so focus walks
		// out of the canvas - no keyboard trap (WCAG 2.1.2).
		const onCanvas =
			!hasModifier &&
			!evt.altKey &&
			((evt.target as Element | null)?.matches?.('.prezillo-canvas > svg') ?? false) &&
			!document.querySelector(POPOVER_TARGET_SELECTOR)
		if (onCanvas && evt.key === 'Tab') {
			const dir = evt.shiftKey ? -1 : 1
			const order = viewObjects.map((o) => o.id)
			const next = cycleIndex(
				order.length,
				selectionCycleIndex(order, prezillo.selectedIds, dir),
				dir
			)
			if (next !== null) {
				prezillo.selectObject(order[next])
				evt.preventDefault()
			}
			return
		}
		if (onCanvas && evt.key.startsWith('Arrow')) {
			if (!isReadOnly && prezillo.selectedIds.size > 0) {
				const step = evt.shiftKey ? 10 : 1
				const dx = evt.key === 'ArrowLeft' ? -step : evt.key === 'ArrowRight' ? step : 0
				const dy = evt.key === 'ArrowUp' ? -step : evt.key === 'ArrowDown' ? step : 0
				const { yDoc, doc } = prezillo
				// One transaction, so one undo step. Locked objects and position-locked template
				// instances stay put, as they do for a drag (useObjectDrag). Runtime x/y are the
				// stored (page-relative) coordinates updateObjectPosition takes.
				yDoc.transact(() => {
					for (const id of prezillo.selectedIds) {
						if (doc.o.get(id)?.k) continue
						if (isInstance(doc, id) && isPropertyGroupLocked(doc, id, 'position'))
							continue
						const obj = getObject(doc, id)
						if (obj) updateObjectPosition(yDoc, doc, id, obj.x + dx, obj.y + dy)
					}
				}, yDoc.clientID)
			}
			evt.preventDefault()
			return
		}

		if (!evt.altKey && !evt.shiftKey && !evt.ctrlKey && !evt.metaKey) {
			switch (evt.key) {
				case 'Delete':
				case 'Backspace':
					if (!isReadOnly && prezillo.selectedIds.size > 0) {
						handleDelete()
					}
					break
				case 'Enter': {
					// Enter on a single selected embed activates it; on a text object it edits it
					const [id] = prezillo.selectedIds
					const code =
						prezillo.selectedIds.size === 1 ? prezillo.doc.o.get(id)?.t : undefined
					if (code === 'D') {
						setActiveDocumentId?.(id)
						evt.preventDefault()
					} else if (code === 'T' && !isReadOnly) {
						setEditingTextId(id)
						evt.preventDefault()
					}
					break
				}
				case 'Escape':
					prezillo.clearSelection()
					prezillo.setActiveTool(null)
					setEditingTextId(null)
					setActiveDocumentId?.(null)
					break
				case 'PageUp':
					onPrevView?.()
					evt.preventDefault()
					break
				case 'PageDown':
					onNextView?.()
					evt.preventDefault()
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
