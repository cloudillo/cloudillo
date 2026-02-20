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
 * Hook for tool start/move/end handlers (shape creation via drawing tools)
 */

import * as React from 'react'
import type { ToolEvent } from 'react-svg-canvas'

import type { ObjectId, TemplateId, SymbolObject } from '../crdt'
import {
	addObject,
	createObject,
	getView,
	findViewAtPoint,
	addObjectToTemplate,
	generateObjectId
} from '../crdt'
import type { UsePrezilloDocumentResult } from './usePrezilloDocument'
import type { DragState } from './useObjectDrag'
import type { TemplateLayout } from './useTemplateLayout'

export interface UseToolHandlersOptions {
	prezillo: UsePrezilloDocumentResult
	templateLayouts: Map<TemplateId, TemplateLayout>
	isResizing: boolean
	dragState: DragState | null
	setDragState: React.Dispatch<React.SetStateAction<DragState | null>>
	selectedContainerId: string | null
	selectedSymbolId: string | null
	isReadOnly: boolean
	setEditingTextId: (id: ObjectId | null) => void
}

export interface UseToolHandlersResult {
	toolEvent: ToolEvent | undefined
	handleToolStart: (evt: ToolEvent) => void
	handleToolMove: (evt: ToolEvent) => void
	handleToolEnd: () => void
}

export function useToolHandlers({
	prezillo,
	templateLayouts,
	isResizing,
	dragState,
	setDragState,
	selectedContainerId,
	selectedSymbolId,
	isReadOnly,
	setEditingTextId
}: UseToolHandlersOptions): UseToolHandlersResult {
	const [toolEvent, setToolEvent] = React.useState<ToolEvent | undefined>()

	// Find template at canvas point (for direct template editing)
	function findTemplateAtPoint(canvasX: number, canvasY: number): TemplateId | null {
		for (const [templateId, layout] of templateLayouts) {
			if (
				canvasX >= layout.x &&
				canvasX <= layout.x + layout.width &&
				canvasY >= layout.y &&
				canvasY <= layout.y + layout.height
			) {
				return templateId
			}
		}
		return null
	}

	// Handle tool start
	function handleToolStart(evt: ToolEvent) {
		if (isReadOnly) return // Don't allow tools in read-only mode
		if (isResizing) return // Don't start drag while resizing

		if (prezillo.activeTool) {
			// Start drawing a new shape
			setToolEvent(evt)
		}
		// Note: Dragging selected objects is now handled by ObjectShape's onPointerDown
		// via handleObjectPointerDown, not here
	}

	// Handle tool move
	function handleToolMove(evt: ToolEvent) {
		if (isResizing) return // Resize is handled by window events
		if (dragState) return // Drag is handled by window events

		if (prezillo.activeTool) {
			setToolEvent(evt)
		}
	}

	// Handle tool end
	function handleToolEnd() {
		if (isResizing) return // Resize is handled by window events

		if (dragState) {
			setDragState(null)
			return
		}

		if (!toolEvent || !prezillo.activeTool) return

		let x = Math.min(toolEvent.startX, toolEvent.x)
		let y = Math.min(toolEvent.startY, toolEvent.y)
		let width = Math.abs(toolEvent.x - toolEvent.startX)
		let height = Math.abs(toolEvent.y - toolEvent.startY)

		const isTextTool = prezillo.activeTool === 'text'
		const isSymbolTool = prezillo.activeTool === 'symbol'
		const isQRCodeTool = prezillo.activeTool === 'qrcode'

		// Enforce 1:1 aspect ratio for symbol and qrcode tools during drag
		if (isSymbolTool || isQRCodeTool) {
			const maxDim = Math.max(width, height)
			width = maxDim
			height = maxDim
		}

		if (width < 5 || height < 5) {
			if (isTextTool) {
				// Click-to-create: use default size at click point
				x = toolEvent.startX
				y = toolEvent.startY
				width = 800
				height = 80
			} else if (isSymbolTool) {
				// Click-to-create: 80x80 symbol centered on click
				x = toolEvent.startX - 40
				y = toolEvent.startY - 40
				width = 80
				height = 80
			} else if (isQRCodeTool) {
				// Click-to-create: 200x200 QR code centered on click
				x = toolEvent.startX - 100
				y = toolEvent.startY - 100
				width = 200
				height = 200
			} else {
				setToolEvent(undefined)
				return
			}
		}

		// Check if creating on a template frame (direct template editing)
		const templateAtPoint = findTemplateAtPoint(toolEvent.startX, toolEvent.startY)
		if (templateAtPoint) {
			// Convert to template-relative coordinates
			const layout = templateLayouts.get(templateAtPoint)!
			const relX = x - layout.x
			const relY = y - layout.y

			let objectId: ObjectId

			// Handle symbol tool specially
			if (prezillo.activeTool === 'symbol' && selectedSymbolId) {
				objectId = generateObjectId()
				const symbolObject: SymbolObject = {
					id: objectId,
					type: 'symbol',
					x: relX,
					y: relY,
					width,
					height,
					rotation: 0,
					pivotX: 0.5,
					pivotY: 0.5,
					opacity: 1,
					visible: true,
					locked: false,
					hidden: false,
					symbolId: selectedSymbolId
				}
				addObject(
					prezillo.yDoc,
					prezillo.doc,
					symbolObject,
					undefined, // No parent (template prototypes go to root)
					undefined,
					undefined // No pageId - prototype is not bound to any page
				)
			} else {
				// Create object without page association (prototype)
				objectId = createObject(
					prezillo.yDoc,
					prezillo.doc,
					prezillo.activeTool as any,
					relX,
					relY,
					width,
					height,
					undefined, // No parent (template prototypes go to root)
					undefined,
					undefined // No pageId - prototype is not bound to any page
				)
			}

			// Add to template's prototype tracking
			addObjectToTemplate(prezillo.yDoc, prezillo.doc, templateAtPoint, objectId)

			prezillo.setActiveTool(null)
			setToolEvent(undefined)
			// selectObject automatically handles template/page selection
			prezillo.selectObject(objectId)

			// Start editing immediately for text objects
			if (isTextTool) {
				setEditingTextId(objectId)
			}
			return
		}

		// Normal mode: use selected container, or first layer if none selected
		let parentId = selectedContainerId
		if (!parentId) {
			const layers = prezillo.doc.r.toArray().filter((ref) => ref[0] === 1)
			parentId = layers.length > 0 ? layers[0][1] : null
		}

		// Determine which page the object should be created on (page-relative coords)
		const targetPageId = findViewAtPoint(prezillo.doc, toolEvent.startX, toolEvent.startY)

		// If creating on a page, convert to page-relative coordinates
		let createX = x
		let createY = y
		if (targetPageId) {
			const view = getView(prezillo.doc, targetPageId)
			if (view) {
				createX = x - view.x
				createY = y - view.y
			}
		}

		let objectId: ObjectId

		// Handle symbol tool specially
		if (prezillo.activeTool === 'symbol' && selectedSymbolId) {
			objectId = generateObjectId()
			const symbolObject: SymbolObject = {
				id: objectId,
				type: 'symbol',
				x: createX,
				y: createY,
				width,
				height,
				rotation: 0,
				pivotX: 0.5,
				pivotY: 0.5,
				opacity: 1,
				visible: true,
				locked: false,
				hidden: false,
				symbolId: selectedSymbolId
			}
			addObject(
				prezillo.yDoc,
				prezillo.doc,
				symbolObject,
				parentId as any,
				undefined, // insertIndex
				targetPageId ?? undefined // pageId - page-relative if on a page
			)
		} else {
			// Create object based on tool
			objectId = createObject(
				prezillo.yDoc,
				prezillo.doc,
				prezillo.activeTool as any,
				createX,
				createY,
				width,
				height,
				parentId as any,
				undefined, // insertIndex
				targetPageId ?? undefined // pageId - page-relative if on a page
			)
		}

		prezillo.setActiveTool(null)
		setToolEvent(undefined)
		prezillo.selectObject(objectId)

		// Start editing immediately for text objects (better UX - no double-click needed)
		if (isTextTool) {
			setEditingTextId(objectId)
		}
	}

	return {
		toolEvent,
		handleToolStart,
		handleToolMove,
		handleToolEnd
	}
}

// vim: ts=4
