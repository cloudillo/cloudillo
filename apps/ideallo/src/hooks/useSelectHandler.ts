// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Hook for handling object selection and dragging
 *
 * IMPORTANT: CRDT is only updated on pointer up (mouse release).
 * During drag, we use local state + awareness for real-time preview.
 */

import {
	findStackedObjects,
	findStackedObjectsForSelection,
	type StackableObject
} from '@cloudillo/canvas-tools'
import * as React from 'react'
import type { Awareness } from 'y-protocols/awareness'
import type * as Y from 'yjs'

import type { IdealloObject, ObjectId, StoredObject, YIdealloDocument } from '../crdt/index.js'
import { getAllObjects, getAllResolvedObjects, getObject, translateObject } from '../crdt/index.js'
import { takePending } from '../tools/lifecycle.js'
import { getObjectBounds } from '../utils/bounds.js'
import type { Point } from '../utils/geometry.js'
import { hitTestObject } from '../utils/hit-testing.js'

const HIT_TOLERANCE = 8

export interface UseSelectHandlerOptions {
	yDoc: Y.Doc
	doc: YIdealloDocument
	awareness: Awareness | null
	selectedIds: Set<ObjectId>
	selectObject: (id: ObjectId, addToSelection?: boolean) => void
	clearSelection: () => void
	enabled: boolean
	/** Pass objects state to trigger stacked-highlight recomputation on changes */
	objects?: Record<string, StoredObject> | null
	/**
	 * Shared, already-resolved objects for hit testing.
	 *
	 * Resolving expands every stored object and rebuilds a ShapeGeometry per object, which is far
	 * too much to redo on every pointermove. app.tsx memoises one pass per document revision and
	 * injects it here. Standalone callers can omit it and pay the per-call cost.
	 */
	getResolvedObjects?: () => IdealloObject[]
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
 * Find the topmost object at a given point
 */
function findObjectAtPoint(objects: IdealloObject[], point: Point): IdealloObject | null {
	// Hit test in reverse order (top objects first)
	for (let i = objects.length - 1; i >= 0; i--) {
		if (hitTestObject(objects[i], point, HIT_TOLERANCE)) {
			return objects[i]
		}
	}
	return null
}

/**
 * Build a StackableObject[] from the document for use with shared stacking utilities.
 * Pre-filters out locked objects. Array is in z-order (lowest index = backmost).
 */
function buildStackableArray(doc: YIdealloDocument): StackableObject[] {
	const allObjs = getAllObjects(doc)
	const result: StackableObject[] = []
	for (const obj of allObjs) {
		if (obj.locked) continue
		// A bound connector already follows its shapes; stacking it as well would offset it twice
		if (obj.type === 'connector' && (obj.startObjectId || obj.endObjectId)) continue
		result.push({ id: obj.id, bounds: getObjectBounds(obj) })
	}
	return result
}

export function useSelectHandler(options: UseSelectHandlerOptions) {
	const {
		yDoc,
		doc,
		awareness,
		selectedIds,
		selectObject,
		clearSelection,
		enabled,
		objects,
		getResolvedObjects
	} = options
	// Resolved: a bound connector is hit along its route, not along its stored endpoints
	const resolveAll = React.useCallback(
		() => getResolvedObjects?.() ?? getAllResolvedObjects(doc),
		[doc, getResolvedObjects]
	)
	const [dragState, setDragState] = React.useState<DragState | null>(null)
	const [hoveredId, setHoveredId] = React.useState<ObjectId | null>(null)
	const [stackedHighlightIds, setStackedHighlightIds] = React.useState<Set<ObjectId>>(new Set())
	const dragStateRef = React.useRef<DragState | null>(null)

	// NOT useLatestRef: takePending clears this eagerly, and a later insertion-effect write would
	// resurrect the drag it just consumed.
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

	// Recompute stacked highlight IDs when hover/selection/objects change
	React.useEffect(() => {
		if (!enabled || !doc) {
			setStackedHighlightIds(new Set())
			return
		}

		// During drag, don't recompute highlights (they're baked into dragState)
		if (dragStateRef.current) return

		const stackable = buildStackableArray(doc)

		if (selectedIds.size > 0) {
			const stacked = findStackedObjectsForSelection(stackable, Array.from(selectedIds))
			setStackedHighlightIds(new Set(stacked as ObjectId[]))
		} else if (hoveredId) {
			const stacked = findStackedObjects(stackable, hoveredId)
			setStackedHighlightIds(new Set(stacked as ObjectId[]))
		} else {
			setStackedHighlightIds(new Set())
		}
	}, [enabled, doc, objects, hoveredId, selectedIds])

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
		(x: number, y: number, shiftKey: boolean = false, altKey: boolean = false) => {
			if (!enabled) return

			const point: Point = [x, y]
			const hitObject = findObjectAtPoint(resolveAll(), point)

			if (hitObject) {
				// Check if object was already selected BEFORE any selection changes
				// Only allow drag if object was already selected (industry standard UX pattern)
				const wasAlreadySelected = selectedIds.has(hitObject.id)

				// Select the object
				selectObject(hitObject.id, shiftKey)

				/*
				 * A locked object is SELECTABLE but not movable.
				 *
				 * Selectable, because unlocking is a property-bar button and ideallo has no
				 * context menu and no marquee select: a locked object that could not be picked up
				 * again would be locked forever. Not movable, because that is what the lock means
				 * - Canvas withholds the resize, rotate and pivot handles for the same reason,
				 * and the eraser already skips it.
				 */
				if (hitObject.locked) {
					return
				}

				// Don't start drag if we just selected it
				if (!wasAlreadySelected) {
					return
				}

				// Determine which objects to drag (base selection)
				const baseDragIds = shiftKey
					? new Set([...selectedIds, hitObject.id])
					: new Set([hitObject.id])

				// Find stacked objects (unless Alt is held to suppress stacking)
				let idsToTrack: Set<ObjectId>
				if (altKey) {
					idsToTrack = baseDragIds
				} else {
					const stackable = buildStackableArray(doc)
					const stackedIds = findStackedObjectsForSelection(
						stackable,
						Array.from(baseDragIds)
					)
					idsToTrack = new Set([...baseDragIds, ...(stackedIds as ObjectId[])])
				}

				// The originals the release commits against. A locked object caught up in a
				// shift-selection or a stack is dropped here rather than dragged along.
				const originalObjects = new Map<ObjectId, IdealloObject>()
				idsToTrack.forEach((id) => {
					const obj = getObject(doc, id)
					if (obj && !obj.locked) {
						originalObjects.set(id, obj)
					}
				})

				// Drive the preview off the same set that will be committed, so a locked object
				// never slides under the pointer and then snaps back on release
				const dragIds = new Set(originalObjects.keys())
				if (!dragIds.size) return

				setDragState({
					startX: x,
					startY: y,
					currentX: x,
					currentY: y,
					objectIds: dragIds,
					originalObjects
				})

				// Broadcast initial state (no offset yet)
				broadcastEditing(dragIds, 'drag', 0, 0)
			} else {
				// Click on empty space - clear selection
				clearSelection()
			}
		},
		[enabled, doc, resolveAll, selectedIds, selectObject, clearSelection, broadcastEditing]
	)

	const handlePointerMove = React.useCallback(
		(x: number, y: number) => {
			if (!enabled) return

			// If dragging, handle drag movement
			if (dragStateRef.current) {
				const drag = dragStateRef.current
				const dx = x - drag.startX
				const dy = y - drag.startY

				// Update local drag state (NOT CRDT)
				setDragState((prev) => (prev ? { ...prev, currentX: x, currentY: y } : null))

				// Broadcast offset via awareness for other clients
				broadcastEditing(drag.objectIds, 'drag', dx, dy)

				// Clear hover during drag
				setHoveredId(null)
			} else {
				// Not dragging - update hover state
				const point: Point = [x, y]
				const hitObj = findObjectAtPoint(resolveAll(), point)
				setHoveredId(hitObj?.id ?? null)
			}
		},
		[enabled, resolveAll, broadcastEditing]
	)

	const handlePointerUp = React.useCallback(() => {
		if (!enabled) return

		// Consumed, not just read: the effect that mirrors dragState into this ref does not run
		// until the next render, so a second release in the same frame would find the same drag
		// still pending and apply its delta twice - the object ends up jumping twice as far as it
		// was dragged.
		const drag = takePending(dragStateRef)
		if (!drag) return

		const dx = drag.currentX - drag.startX
		const dy = drag.currentY - drag.startY

		// Only commit to CRDT if there was actual movement
		if (dx !== 0 || dy !== 0) {
			// The origin has to be on THIS transaction: Yjs discards a nested one's origin, so
			// without it the object and geometry writes inside land untracked and the whole move
			// is missing from the undo stack. With it they undo together, as one step.
			yDoc.transact(() => {
				drag.originalObjects.forEach((origObj, objectId) => {
					translateObject(yDoc, doc, objectId, origObj, dx, dy)
				})
			}, yDoc.clientID)
		}

		// Clear drag state and awareness
		setDragState(null)
		broadcastEditing(null, null)
	}, [enabled, yDoc, doc, broadcastEditing])

	// Clear hover on pointer leave
	const handlePointerLeave = React.useCallback(() => {
		setHoveredId(null)
	}, [])

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
			hoveredId,
			stackedHighlightIds,
			handlePointerDown,
			handlePointerMove,
			handlePointerUp,
			handlePointerLeave
		}),
		[
			dragOffset,
			hoveredId,
			stackedHighlightIds,
			handlePointerDown,
			handlePointerMove,
			handlePointerUp,
			handlePointerLeave
		]
	)
}

// vim: ts=4
