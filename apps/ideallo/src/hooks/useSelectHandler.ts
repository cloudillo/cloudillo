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
 * Hook for handling object selection and dragging
 *
 * IMPORTANT: CRDT is only updated on pointer up (mouse release).
 * During drag, we use local state + awareness for real-time preview.
 */

import * as React from 'react'
import * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'

import type { YIdealloDocument, ObjectId, IdealloObject, Bounds } from '../crdt/index.js'
import { updateObject, getObject, getAllObjects } from '../crdt/index.js'
import { pointInBounds, getBoundsFromPoints, perpendicularDistance } from '../utils/geometry.js'
import type { Point } from '../utils/geometry.js'

const HIT_TOLERANCE = 8

export interface UseSelectHandlerOptions {
	yDoc: Y.Doc
	doc: YIdealloDocument
	awareness: Awareness | null
	selectedIds: Set<ObjectId>
	selectObject: (id: ObjectId, addToSelection?: boolean) => void
	clearSelection: () => void
	enabled: boolean
}

export interface DragOffset {
	dx: number
	dy: number
	objectIds: Set<ObjectId>
}

interface DragState {
	startX: number
	startY: number
	currentX: number
	currentY: number
	objectIds: Set<ObjectId>
	// Store original object data for committing on release
	originalObjects: Map<ObjectId, IdealloObject>
}

/**
 * Get bounds for an object (for hit testing)
 */
function getObjectBounds(obj: IdealloObject): Bounds {
	switch (obj.type) {
		case 'freehand':
		case 'rect':
		case 'ellipse':
		case 'text':
		case 'sticky':
		case 'image':
			return { x: obj.x, y: obj.y, width: obj.width, height: obj.height }
		case 'polygon':
			return getBoundsFromPoints(obj.vertices)
		case 'line':
		case 'arrow':
			return {
				x: Math.min(obj.startX, obj.endX),
				y: Math.min(obj.startY, obj.endY),
				width: Math.abs(obj.endX - obj.startX),
				height: Math.abs(obj.endY - obj.startY)
			}
	}
}

/**
 * Hit test a point against an object
 */
function hitTestObject(obj: IdealloObject, point: Point): boolean {
	const bounds = getObjectBounds(obj)
	const expandedBounds = {
		x: bounds.x - HIT_TOLERANCE,
		y: bounds.y - HIT_TOLERANCE,
		width: bounds.width + HIT_TOLERANCE * 2,
		height: bounds.height + HIT_TOLERANCE * 2
	}

	// Quick bounds check first
	if (!pointInBounds(point, expandedBounds)) {
		return false
	}

	// For lines/arrows, do more precise hit testing
	if (obj.type === 'line' || obj.type === 'arrow') {
		const dist = perpendicularDistance(point, [obj.startX, obj.startY], [obj.endX, obj.endY])
		return dist <= HIT_TOLERANCE
	}

	// For freehand, use bounds-based hit testing
	// (precise path hit testing would require parsing SVG path data)
	if (obj.type === 'freehand') {
		return pointInBounds(point, expandedBounds)
	}

	// For shapes with fill, point in bounds is enough
	return pointInBounds(point, bounds)
}

export function useSelectHandler(options: UseSelectHandlerOptions) {
	const { yDoc, doc, awareness, selectedIds, selectObject, clearSelection, enabled } = options
	const [dragState, setDragState] = React.useState<DragState | null>(null)
	const dragStateRef = React.useRef<DragState | null>(null)

	React.useEffect(() => {
		dragStateRef.current = dragState
	}, [dragState])

	// Compute drag offset for rendering
	const dragOffset = React.useMemo<DragOffset | null>(() => {
		if (!dragState) return null
		return {
			dx: dragState.currentX - dragState.startX,
			dy: dragState.currentY - dragState.startY,
			objectIds: dragState.objectIds
		}
	}, [dragState])

	// Broadcast editing state via awareness
	const broadcastEditing = React.useCallback(
		(
			objectIds: Set<ObjectId> | null,
			action: 'drag' | 'resize' | 'rotate' | null,
			dx?: number,
			dy?: number
		) => {
			if (!awareness) return

			if (objectIds && objectIds.size > 0 && action && dx !== undefined && dy !== undefined) {
				awareness.setLocalStateField('editing', {
					objectIds: Array.from(objectIds),
					action,
					dx,
					dy
				})
			} else {
				awareness.setLocalStateField('editing', undefined)
			}
		},
		[awareness]
	)

	const handlePointerDown = React.useCallback(
		(x: number, y: number, shiftKey: boolean = false) => {
			if (!enabled) return

			const point: Point = [x, y]
			const objects = getAllObjects(doc)

			// Hit test in reverse order (top objects first)
			let hitObject: IdealloObject | null = null
			for (let i = objects.length - 1; i >= 0; i--) {
				if (hitTestObject(objects[i], point)) {
					hitObject = objects[i]
					break
				}
			}

			if (hitObject) {
				// Check if object was already selected BEFORE any selection changes
				// Only allow drag if object was already selected (industry standard UX pattern)
				const wasAlreadySelected = selectedIds.has(hitObject.id)

				// Select the object
				selectObject(hitObject.id, shiftKey)

				// Don't start drag if we just selected it
				if (!wasAlreadySelected) {
					return
				}

				// Determine which objects to drag
				const idsToTrack = shiftKey
					? new Set([...selectedIds, hitObject.id])
					: new Set([hitObject.id])

				// Store original object data for committing on release
				const originalObjects = new Map<ObjectId, IdealloObject>()
				idsToTrack.forEach((id) => {
					const obj = getObject(doc, id)
					if (obj) {
						originalObjects.set(id, obj)
					}
				})

				setDragState({
					startX: x,
					startY: y,
					currentX: x,
					currentY: y,
					objectIds: idsToTrack,
					originalObjects
				})

				// Broadcast initial state (no offset yet)
				broadcastEditing(idsToTrack, 'drag', 0, 0)
			} else {
				// Click on empty space - clear selection
				clearSelection()
			}
		},
		[enabled, doc, selectedIds, selectObject, clearSelection, broadcastEditing]
	)

	const handlePointerMove = React.useCallback(
		(x: number, y: number) => {
			if (!enabled || !dragStateRef.current) return

			const drag = dragStateRef.current
			const dx = x - drag.startX
			const dy = y - drag.startY

			// Update local drag state (NOT CRDT)
			setDragState((prev) => (prev ? { ...prev, currentX: x, currentY: y } : null))

			// Broadcast offset via awareness for other clients
			broadcastEditing(drag.objectIds, 'drag', dx, dy)
		},
		[enabled, broadcastEditing]
	)

	const handlePointerUp = React.useCallback(() => {
		if (!enabled || !dragStateRef.current) return

		const drag = dragStateRef.current
		const dx = drag.currentX - drag.startX
		const dy = drag.currentY - drag.startY

		// Only commit to CRDT if there was actual movement
		if (dx !== 0 || dy !== 0) {
			// Commit all object updates to CRDT
			yDoc.transact(() => {
				drag.originalObjects.forEach((origObj, objectId) => {
					if (origObj.type === 'line' || origObj.type === 'arrow') {
						updateObject(yDoc, doc, objectId, {
							x: origObj.x + dx,
							y: origObj.y + dy,
							startX: origObj.startX + dx,
							startY: origObj.startY + dy,
							endX: origObj.endX + dx,
							endY: origObj.endY + dy
						} as any)
					} else {
						// For freehand and shapes, just update position
						// (freehand pathData uses absolute coords, handled by transform)
						updateObject(yDoc, doc, objectId, {
							x: origObj.x + dx,
							y: origObj.y + dy
						})
					}
				})
			})
		}

		// Clear drag state and awareness
		setDragState(null)
		broadcastEditing(null, null)
	}, [enabled, yDoc, doc, broadcastEditing])

	// Memoize return value to prevent infinite re-render loops
	// Without this, the returned object changes on every render, causing
	// callbacks in app.tsx that depend on selectHandler to recreate,
	// which can trigger cascading re-renders
	//
	// IMPORTANT: We intentionally do NOT include dragState in dependencies.
	// - isDragging is derived from dragOffset !== null (which already depends on dragState internally)
	// - The handlers use dragStateRef (ref) to avoid recreating on every dragState change
	// - Including dragState here would cause the return object to change on every mouse move
	//   during drag, triggering cascading re-renders (Maximum update depth exceeded)
	return React.useMemo(
		() => ({
			isDragging: dragOffset !== null,
			dragOffset,
			handlePointerDown,
			handlePointerMove,
			handlePointerUp
		}),
		[dragOffset, handlePointerDown, handlePointerMove, handlePointerUp]
	)
}

// vim: ts=4
