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
 * Hook for object drag interaction (pointer-based drag with snapping and page transfer)
 */

import * as React from 'react'
import * as Y from 'yjs'
import { computeGrabPoint, type SvgCanvasContext } from 'react-svg-canvas'
import type { Awareness } from 'y-protocols/awareness'

import type { ObjectId, ViewId, TemplateId, YPrezilloDocument, PrezilloObject } from '../crdt'
import {
	updateObjectPosition,
	updateObjectPageAssociation,
	addObjectToTemplate,
	findViewAtPoint,
	isInstance,
	isPropertyGroupLocked
} from '../crdt'
import { setEditingState, clearEditingState } from '../awareness'
import type { TemplateLayout } from './useTemplateLayout'

type CanvasObject = PrezilloObject & {
	_templateId?: TemplateId
	_isPrototype?: boolean
}

export interface DragState {
	objectId: ObjectId
	startX: number
	startY: number
	objectStartX: number
	objectStartY: number
}

export interface TempObjectState {
	objectId: ObjectId
	x: number
	y: number
	width: number
	height: number
	rotation?: number
	pivotX?: number
	pivotY?: number
}

export interface UseObjectDragOptions {
	yDoc: Y.Doc
	doc: YPrezilloDocument
	isReadOnly: boolean
	activeTool: string | null
	selectedIds: Set<ObjectId>
	selectObject: (id: ObjectId, addToSelection?: boolean) => void
	autoSwitchToObjectPage: (id: ObjectId) => void
	canvasObjects: CanvasObject[]
	canvasContextRef: React.RefObject<SvgCanvasContext | null>
	templateLayouts: Map<TemplateId, TemplateLayout>
	awareness: Awareness | null
	// Snapping
	snapDragRef: React.RefObject<(params: any) => any>
	clearSnaps: () => void
	grabPointRef: React.MutableRefObject<{ x: number; y: number }>
	// Interaction tracking
	justFinishedInteractionRef: React.MutableRefObject<boolean>
	// Shared temp state (for visual feedback during interactions)
	setTempObjectState: React.Dispatch<React.SetStateAction<TempObjectState | null>>
}

export interface UseObjectDragResult {
	dragState: DragState | null
	setDragState: React.Dispatch<React.SetStateAction<DragState | null>>
	handleObjectPointerDown: (e: React.PointerEvent, objectId: ObjectId) => void
}

export function useObjectDrag({
	yDoc,
	doc,
	isReadOnly,
	activeTool,
	selectedIds,
	selectObject,
	autoSwitchToObjectPage,
	canvasObjects,
	canvasContextRef,
	templateLayouts,
	awareness,
	snapDragRef,
	clearSnaps,
	grabPointRef,
	justFinishedInteractionRef,
	setTempObjectState
}: UseObjectDragOptions): UseObjectDragResult {
	// Find template at canvas point (for direct template editing)
	const findTemplateAtPoint = React.useCallback(
		(canvasX: number, canvasY: number): TemplateId | null => {
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
		},
		[templateLayouts]
	)
	const [dragState, setDragState] = React.useState<DragState | null>(null)

	const handleObjectPointerDown = React.useCallback(
		(e: React.PointerEvent, objectId: ObjectId) => {
			// Don't allow drag in read-only mode
			if (isReadOnly) return

			// Only handle primary button (left mouse or touch)
			if (e.button !== 0) return

			// Don't start drag if using a tool
			if (activeTool) return

			e.stopPropagation()
			e.preventDefault()

			// Auto-switch to object's page if clicking on an object from a different page
			autoSwitchToObjectPage(objectId)

			const obj = doc.o.get(objectId)
			if (!obj) return

			// Block drag for locked template instance position
			if (isInstance(doc, objectId) && isPropertyGroupLocked(doc, objectId, 'position')) {
				return
			}

			// Get object from canvasObjects which has global canvas coordinates
			const canvasObj = canvasObjects.find((o) => o.id === objectId)
			if (!canvasObj) return

			// Use global canvas coordinates from canvasObjects
			const xy: [number, number] = [canvasObj.x, canvasObj.y]
			const wh: [number, number] = [canvasObj.width, canvasObj.height]

			// Track offsets for converting back to stored coords when saving
			let prototypeTemplateOffset: { x: number; y: number } | undefined
			let pageOffset: { x: number; y: number } | undefined

			// Check if this is a prototype object on a template frame
			if (canvasObj._isPrototype && canvasObj._templateId) {
				const layout = templateLayouts.get(canvasObj._templateId)
				if (layout) {
					prototypeTemplateOffset = { x: layout.x, y: layout.y }
				}
			}

			// Check if this is a page-relative object (needs offset conversion when saving)
			if (obj.vi) {
				const view = doc.v.get(obj.vi)
				if (view) {
					pageOffset = { x: view.x, y: view.y }
				}
			}

			// Get SVG element and canvas context for zoom-aware coordinate transformation
			const svgElement = (e.target as SVGElement).ownerSVGElement
			if (!svgElement) return

			const canvasCtx = canvasContextRef.current
			if (!canvasCtx?.translateTo) return

			// Get SVG-relative client coordinates, then transform through canvas zoom
			const rect = svgElement.getBoundingClientRect()
			const [svgX, svgY] = canvasCtx.translateTo(e.clientX - rect.left, e.clientY - rect.top)
			const svgPoint = { x: svgX, y: svgY }

			// Check if object was already selected BEFORE any selection changes
			const wasAlreadySelected = selectedIds.has(objectId)

			// Select the object if not already selected
			if (!wasAlreadySelected) {
				const addToSelection = e.shiftKey || e.ctrlKey || e.metaKey
				selectObject(objectId, addToSelection)
				// Don't start drag - just selected the object
				return
			}

			const initialDragState = {
				objectId,
				startX: svgPoint.x,
				startY: svgPoint.y,
				objectStartX: xy[0],
				objectStartY: xy[1],
				objectWidth: wh[0],
				objectHeight: wh[1],
				prototypeTemplateOffset,
				pageOffset
			}

			// Calculate grab point for snap weighting (normalized 0-1)
			grabPointRef.current = computeGrabPoint(
				{ x: svgPoint.x, y: svgPoint.y },
				{
					x: xy[0],
					y: xy[1],
					width: wh[0],
					height: wh[1],
					rotation: obj.r || 0
				}
			)

			// Track current position for final commit (mutable to avoid stale closure)
			let currentX = xy[0]
			let currentY = xy[1]

			setDragState(initialDragState)

			// Initialize temp state
			setTempObjectState({
				objectId,
				x: xy[0],
				y: xy[1],
				width: wh[0],
				height: wh[1]
			})

			// Handle drag with window events for smooth dragging
			const handlePointerMove = (moveEvent: PointerEvent) => {
				const ctx = canvasContextRef.current
				if (!ctx?.translateTo) return

				// Transform screen coords to canvas coords (zoom-aware)
				const rect = svgElement.getBoundingClientRect()
				const [moveX, moveY] = ctx.translateTo(
					moveEvent.clientX - rect.left,
					moveEvent.clientY - rect.top
				)

				const dx = moveX - initialDragState.startX
				const dy = moveY - initialDragState.startY

				// Calculate proposed position before snapping
				const proposedX = initialDragState.objectStartX + dx
				const proposedY = initialDragState.objectStartY + dy

				// Apply snapping (use ref to get latest config)
				const snapResult = snapDragRef.current?.({
					bounds: {
						x: proposedX,
						y: proposedY,
						width: initialDragState.objectWidth,
						height: initialDragState.objectHeight,
						rotation: obj.r || 0,
						pivotX: obj.pv?.[0] ?? 0.5,
						pivotY: obj.pv?.[1] ?? 0.5
					},
					objectId: initialDragState.objectId,
					delta: { x: dx, y: dy },
					grabPoint: grabPointRef.current,
					excludeIds: new Set([initialDragState.objectId])
				})

				currentX = snapResult?.position.x ?? proposedX
				currentY = snapResult?.position.y ?? proposedY

				// Update local temp state (visual only)
				setTempObjectState({
					objectId: initialDragState.objectId,
					x: currentX,
					y: currentY,
					width: initialDragState.objectWidth,
					height: initialDragState.objectHeight
				})

				// Broadcast to other clients via awareness
				if (awareness) {
					setEditingState(
						awareness,
						initialDragState.objectId,
						'drag',
						currentX,
						currentY,
						initialDragState.objectWidth,
						initialDragState.objectHeight
					)
				}
			}

			const handlePointerUp = () => {
				// Only commit to CRDT if position actually changed
				if (
					currentX !== initialDragState.objectStartX ||
					currentY !== initialDragState.objectStartY
				) {
					// Convert global canvas coords back to stored coords for CRDT
					let saveX = currentX
					let saveY = currentY

					// For prototypes on template frames, subtract template offset
					if (initialDragState.prototypeTemplateOffset) {
						saveX -= initialDragState.prototypeTemplateOffset.x
						saveY -= initialDragState.prototypeTemplateOffset.y
					}

					// For page-relative objects, subtract page offset
					if (initialDragState.pageOffset) {
						saveX -= initialDragState.pageOffset.x
						saveY -= initialDragState.pageOffset.y
					}

					updateObjectPosition(yDoc, doc, initialDragState.objectId, saveX, saveY)

					// Check if object should transfer to a template or different page
					const obj = doc.o.get(initialDragState.objectId)
					if (obj) {
						const currentPageId = obj.vi as ViewId | undefined
						// Resolve dimensions from prototype if needed
						let objWh: [number, number] | undefined = obj.wh
						if (!objWh && obj.proto) {
							const proto = doc.o.get(obj.proto)
							objWh = proto?.wh
						}
						if (objWh) {
							const objWidth = objWh[0]
							const objHeight = objWh[1]

							// Calculate object center in global coords
							const centerX = currentX + objWidth / 2
							const centerY = currentY + objHeight / 2

							// Check if dropped on a template frame (convert to prototype)
							const templateAtDrop = findTemplateAtPoint(centerX, centerY)
							if (templateAtDrop && !obj.proto) {
								// Convert to template-relative coordinates
								const layout = templateLayouts.get(templateAtDrop)!
								const relX = currentX - layout.x
								const relY = currentY - layout.y

								// Update position to template-relative
								updateObjectPosition(
									yDoc,
									doc,
									initialDragState.objectId,
									relX,
									relY
								)

								// Add to template (converts to prototype)
								addObjectToTemplate(
									yDoc,
									doc,
									templateAtDrop,
									initialDragState.objectId
								)
							} else {
								// Find which page the center is now in
								const newPageId = findViewAtPoint(doc, centerX, centerY)

								// If page changed, update association
								if (newPageId !== currentPageId) {
									updateObjectPageAssociation(
										yDoc,
										doc,
										initialDragState.objectId,
										newPageId,
										{
											preserveGlobalPosition: true
										}
									)
								}
							}
						}
					}
				}

				// Clear awareness
				if (awareness) {
					clearEditingState(awareness)
				}

				// Clear snapping state
				clearSnaps()

				// Clear local state
				setDragState(null)
				setTempObjectState(null)
				window.removeEventListener('pointermove', handlePointerMove)
				window.removeEventListener('pointerup', handlePointerUp)

				// Prevent canvas click from clearing selection immediately after drag
				justFinishedInteractionRef.current = true
			}

			window.addEventListener('pointermove', handlePointerMove)
			window.addEventListener('pointerup', handlePointerUp)
		},
		[
			isReadOnly,
			activeTool,
			autoSwitchToObjectPage,
			doc,
			canvasObjects,
			canvasContextRef,
			templateLayouts,
			selectedIds,
			selectObject,
			grabPointRef,
			snapDragRef,
			awareness,
			yDoc,
			findTemplateAtPoint,
			clearSnaps,
			justFinishedInteractionRef,
			setTempObjectState
		]
	)

	return {
		dragState,
		setDragState,
		handleObjectPointerDown
	}
}

// vim: ts=4
