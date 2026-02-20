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
import { computeGrabPoint, type SvgCanvasContext } from 'react-svg-canvas'

import type { ObjectId, ViewId, TemplateId, PrezilloObject } from '../crdt'
import {
	updateObjectPosition,
	updateObjectPageAssociation,
	addObjectToTemplate,
	removeObjectFromTemplate,
	findViewAtPoint,
	isInstance,
	isPropertyGroupLocked,
	getStackedObjects,
	getAbsoluteBounds,
	getTemplateIdForPrototype,
	detachInstance
} from '../crdt'
import { setEditingState, clearEditingState } from '../awareness'
import type { TemplateLayout } from './useTemplateLayout'
import type { UsePrezilloDocumentResult } from './usePrezilloDocument'

type CanvasObject = PrezilloObject & {
	_templateId?: TemplateId
	_isPrototype?: boolean
}

export interface StackedObjectInfo {
	id: ObjectId
	startX: number
	startY: number
	width: number
	height: number
	pageOffset?: { x: number; y: number }
}

export interface DragState {
	objectId: ObjectId
	startX: number
	startY: number
	objectStartX: number
	objectStartY: number
	// Stacked objects that should move together with the primary object
	stackedObjects?: StackedObjectInfo[]
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
	// Additional objects being dragged together (stacked objects)
	stackedObjects?: Array<{
		objectId: ObjectId
		x: number
		y: number
		width: number
		height: number
	}>
}

export interface UseObjectDragOptions {
	prezillo: UsePrezilloDocumentResult
	isReadOnly: boolean
	canvasObjects: CanvasObject[]
	canvasContextRef: React.RefObject<SvgCanvasContext | null>
	templateLayouts: Map<TemplateId, TemplateLayout>
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
	handleObjectPointerDown: (
		e: React.PointerEvent,
		objectId: ObjectId,
		options?: {
			grabPointOverride?: { x: number; y: number }
			/** Skip the "select first" check and force start dragging immediately */
			forceStartDrag?: boolean
		}
	) => void
}

export function useObjectDrag({
	prezillo,
	isReadOnly,
	canvasObjects,
	canvasContextRef,
	templateLayouts,
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
		(
			e: React.PointerEvent,
			objectId: ObjectId,
			options?: {
				grabPointOverride?: { x: number; y: number }
				forceStartDrag?: boolean
			}
		) => {
			const { grabPointOverride, forceStartDrag } = options ?? {}
			// Don't allow drag in read-only mode
			if (isReadOnly) return

			// Only handle primary button (left mouse or touch)
			if (e.button !== 0) return

			// Don't start drag if using a tool
			if (prezillo.activeTool) return

			e.stopPropagation()
			e.preventDefault()

			// Auto-switch to object's page if clicking on an object from a different page
			prezillo.autoSwitchToObjectPage(objectId)

			const obj = prezillo.doc.o.get(objectId)
			if (!obj) return

			// Block drag for locked template instance position
			if (
				isInstance(prezillo.doc, objectId) &&
				isPropertyGroupLocked(prezillo.doc, objectId, 'position')
			) {
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
			let originalTemplateId: TemplateId | undefined

			// Check if this is a prototype object on a template frame
			if (canvasObj._isPrototype && canvasObj._templateId) {
				originalTemplateId = canvasObj._templateId
				const layout = templateLayouts.get(canvasObj._templateId)
				if (layout) {
					prototypeTemplateOffset = { x: layout.x, y: layout.y }
				}
			}

			// Check if this is a page-relative object (needs offset conversion when saving)
			if (obj.vi) {
				const view = prezillo.doc.v.get(obj.vi)
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
			const wasAlreadySelected = prezillo.selectedIds.has(objectId)

			// Select the object if not already selected
			// selectObject automatically handles template/page selection
			// Skip this check if forceStartDrag is true (e.g., dragging from edit mode)
			if (!wasAlreadySelected && !forceStartDrag) {
				const addToSelection = e.shiftKey || e.ctrlKey || e.metaKey
				prezillo.selectObject(objectId, addToSelection)
				// Set flag to prevent canvas click from immediately clearing selection
				justFinishedInteractionRef.current = true
				// Don't start drag - just selected the object
				return
			}

			// Calculate stacked objects (unless Alt key is held to bypass)
			let stackedObjects: StackedObjectInfo[] = []
			if (!e.altKey) {
				const stackedIds = getStackedObjects(prezillo.doc, objectId)
				for (const id of stackedIds) {
					const bounds = getAbsoluteBounds(prezillo.doc, id)
					if (!bounds) continue
					const stackedObj = prezillo.doc.o.get(id)
					// Calculate page offset for stacked object if it's page-relative
					let stackedPageOffset: { x: number; y: number } | undefined
					if (stackedObj?.vi) {
						const view = prezillo.doc.v.get(stackedObj.vi)
						if (view) {
							stackedPageOffset = { x: view.x, y: view.y }
						}
					}
					stackedObjects.push({
						id,
						startX: bounds.x,
						startY: bounds.y,
						width: bounds.width,
						height: bounds.height,
						pageOffset: stackedPageOffset
					})
				}
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
				originalTemplateId,
				pageOffset,
				stackedObjects
			}

			// Calculate grab point for snap weighting (normalized 0-1)
			// Use override if provided, otherwise compute from click position
			if (grabPointOverride) {
				grabPointRef.current = grabPointOverride
			} else {
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
			}

			// Track current position for final commit (mutable to avoid stale closure)
			let currentX = xy[0]
			let currentY = xy[1]

			setDragState(initialDragState)

			// Initialize temp state (including stacked objects)
			setTempObjectState({
				objectId,
				x: xy[0],
				y: xy[1],
				width: wh[0],
				height: wh[1],
				stackedObjects: stackedObjects.map((so) => ({
					objectId: so.id,
					x: so.startX,
					y: so.startY,
					width: so.width,
					height: so.height
				}))
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

				// Calculate delta from start position
				const deltaX = currentX - initialDragState.objectStartX
				const deltaY = currentY - initialDragState.objectStartY

				// Update local temp state (visual only) - including stacked objects
				setTempObjectState({
					objectId: initialDragState.objectId,
					x: currentX,
					y: currentY,
					width: initialDragState.objectWidth,
					height: initialDragState.objectHeight,
					stackedObjects: initialDragState.stackedObjects?.map((so) => ({
						objectId: so.id,
						x: so.startX + deltaX,
						y: so.startY + deltaY,
						width: so.width,
						height: so.height
					}))
				})

				// Broadcast to other clients via awareness
				if (prezillo.awareness) {
					setEditingState(
						prezillo.awareness,
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
					// Calculate delta for stacked objects
					const deltaX = currentX - initialDragState.objectStartX
					const deltaY = currentY - initialDragState.objectStartY

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

					// Update all positions in a single transaction for atomicity
					// Note: yDoc.clientID origin is required for UndoManager to track this change
					prezillo.yDoc.transact(() => {
						// Update primary object
						updateObjectPosition(
							prezillo.yDoc,
							prezillo.doc,
							initialDragState.objectId,
							saveX,
							saveY
						)

						// Update all stacked objects
						if (initialDragState.stackedObjects) {
							for (const stackedObj of initialDragState.stackedObjects) {
								let stackedSaveX = stackedObj.startX + deltaX
								let stackedSaveY = stackedObj.startY + deltaY

								// Subtract page offset if stacked object is page-relative
								if (stackedObj.pageOffset) {
									stackedSaveX -= stackedObj.pageOffset.x
									stackedSaveY -= stackedObj.pageOffset.y
								}

								updateObjectPosition(
									prezillo.yDoc,
									prezillo.doc,
									stackedObj.id,
									stackedSaveX,
									stackedSaveY
								)
							}
						}
					}, prezillo.yDoc.clientID)

					// Check if object should transfer to a template or different page
					const obj = prezillo.doc.o.get(initialDragState.objectId)
					if (obj) {
						const currentPageId = obj.vi as ViewId | undefined
						// Resolve dimensions from prototype if needed
						let objWh: [number, number] | undefined = obj.wh
						if (!objWh && obj.proto) {
							const proto = prezillo.doc.o.get(obj.proto)
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
							if (templateAtDrop) {
								// Check if this is the same template we started from
								if (initialDragState.originalTemplateId === templateAtDrop) {
									// Same template - position already updated, nothing more to do
								} else {
									// Moving to a different template (or from non-template to template)

									// If object was a prototype on another template, remove it first
									if (initialDragState.originalTemplateId) {
										removeObjectFromTemplate(
											prezillo.yDoc,
											prezillo.doc,
											initialDragState.originalTemplateId,
											initialDragState.objectId,
											{ deleteObject: false, deleteInstances: true }
										)
									}

									// If object is an instance, detach it first
									if (obj.proto) {
										detachInstance(
											prezillo.yDoc,
											prezillo.doc,
											initialDragState.objectId
										)
									}

									// Convert to template-relative coordinates
									const layout = templateLayouts.get(templateAtDrop)!
									const relX = currentX - layout.x
									const relY = currentY - layout.y

									// Update position to template-relative
									updateObjectPosition(
										prezillo.yDoc,
										prezillo.doc,
										initialDragState.objectId,
										relX,
										relY
									)

									// Add to new template (converts to prototype)
									addObjectToTemplate(
										prezillo.yDoc,
										prezillo.doc,
										templateAtDrop,
										initialDragState.objectId
									)
								}
							} else {
								// Dropped outside any template frame
								// If this was a prototype, remove it from its template
								if (initialDragState.originalTemplateId) {
									console.log(
										'[useObjectDrag] Removing prototype from template:',
										{
											objectId: initialDragState.objectId,
											templateId: initialDragState.originalTemplateId,
											currentX,
											currentY
										}
									)
									// Delete all instances and remove prototype from template
									removeObjectFromTemplate(
										prezillo.yDoc,
										prezillo.doc,
										initialDragState.originalTemplateId,
										initialDragState.objectId,
										{ deleteObject: false, deleteInstances: true }
									)

									// 2. Then update prototype position to global coords
									updateObjectPosition(
										prezillo.yDoc,
										prezillo.doc,
										initialDragState.objectId,
										currentX,
										currentY
									)
									console.log(
										'[useObjectDrag] After removal, object:',
										prezillo.doc.o.get(initialDragState.objectId)
									)
								}

								// Find which page the center is now in
								const newPageId = findViewAtPoint(prezillo.doc, centerX, centerY)
								console.log(
									'[useObjectDrag] newPageId:',
									newPageId,
									'currentPageId:',
									currentPageId
								)

								// If page changed, update association
								if (newPageId !== currentPageId) {
									console.log('[useObjectDrag] Updating page association')
									updateObjectPageAssociation(
										prezillo.yDoc,
										prezillo.doc,
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
				if (prezillo.awareness) {
					clearEditingState(prezillo.awareness)
				}

				// Clear snapping state
				clearSnaps()

				// Clear local state
				setDragState(null)
				setTempObjectState(null)
				window.removeEventListener('pointermove', handlePointerMove)
				window.removeEventListener('pointerup', handlePointerUp)

				// Re-enable text selection after drag
				document.body.style.userSelect = ''

				// Prevent canvas click from clearing selection immediately after drag
				justFinishedInteractionRef.current = true
			}

			// Prevent text selection during drag
			document.body.style.userSelect = 'none'

			window.addEventListener('pointermove', handlePointerMove)
			window.addEventListener('pointerup', handlePointerUp)
		},
		[
			isReadOnly,
			prezillo.activeTool,
			prezillo.autoSwitchToObjectPage,
			prezillo.doc,
			canvasObjects,
			canvasContextRef,
			templateLayouts,
			prezillo.selectedIds,
			prezillo.selectObject,
			grabPointRef,
			snapDragRef,
			prezillo.awareness,
			prezillo.yDoc,
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
