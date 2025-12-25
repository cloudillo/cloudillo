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
 * Hook for handling eraser tool interactions
 * Deletes whole objects when the eraser brush touches them
 * Brush size is defined in screen space for consistent visual size
 */

import * as React from 'react'
import type { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'

import type {
	YIdealloDocument,
	ObjectId,
	StoredObject,
	IdealloObject,
	Bounds
} from '../crdt/index.js'
import { deleteObjects, getObject, expandObject, toObjectId } from '../crdt/index.js'
import { circleIntersectsBounds, getBoundsFromPoints } from '../utils/geometry.js'

// Default brush size in screen pixels
const DEFAULT_BRUSH_SIZE = 32

// Throttle awareness broadcasts
const BROADCAST_THROTTLE_MS = 50

export interface UseEraserHandlerOptions {
	yDoc: Y.Doc
	doc: YIdealloDocument
	awareness: Awareness | null
	objects: Record<string, StoredObject> | null
	enabled?: boolean
	brushSize?: number // Screen-space pixels (default 32)
	scale: number // Current canvas scale for screen→canvas conversion
}

export interface EraserPosition {
	x: number
	y: number
}

/**
 * Get bounds for an object (same logic as app.tsx getObjectBounds)
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

export function useEraserHandler(options: UseEraserHandlerOptions) {
	const {
		yDoc,
		doc,
		awareness,
		objects,
		enabled = true,
		brushSize = DEFAULT_BRUSH_SIZE,
		scale
	} = options

	// State
	const [isErasing, setIsErasing] = React.useState(false)
	const [eraserPosition, setEraserPosition] = React.useState<EraserPosition | null>(null)
	const [highlightedIds, setHighlightedIds] = React.useState<Set<ObjectId>>(new Set())

	// Refs for accumulated objects to delete (avoids re-renders during drag)
	const objectsToDeleteRef = React.useRef<Set<ObjectId>>(new Set())
	const throttleRef = React.useRef<number | null>(null)

	// Compute canvas-space radius from screen-space brush size
	const canvasRadius = React.useMemo(() => {
		return brushSize / 2 / scale
	}, [brushSize, scale])

	/**
	 * Find all objects that intersect with the eraser circle at given position
	 */
	const findObjectsAtPosition = React.useCallback(
		(x: number, y: number): Set<ObjectId> => {
			if (!objects) return new Set()

			const hitIds = new Set<ObjectId>()

			Object.entries(objects).forEach(([id, stored]) => {
				const objectId = toObjectId(id)
				const obj = expandObject(objectId, stored, doc)

				// Skip locked objects
				if (obj.locked) return

				const bounds = getObjectBounds(obj)

				// Check if eraser circle intersects object bounds
				if (circleIntersectsBounds(x, y, canvasRadius, bounds)) {
					hitIds.add(objectId)
				}
			})

			return hitIds
		},
		[objects, canvasRadius]
	)

	/**
	 * Broadcast eraser state to remote users
	 */
	const broadcastEraserState = React.useCallback(
		(x: number, y: number) => {
			if (!awareness || throttleRef.current) return

			throttleRef.current = window.setTimeout(() => {
				throttleRef.current = null
				awareness.setLocalStateField('erasing', {
					x,
					y,
					radius: canvasRadius
				})
			}, BROADCAST_THROTTLE_MS)
		},
		[awareness, canvasRadius]
	)

	const clearEraserState = React.useCallback(() => {
		if (awareness) {
			awareness.setLocalStateField('erasing', undefined)
		}
	}, [awareness])

	/**
	 * Handle pointer down - start erasing
	 */
	const handlePointerDown = React.useCallback(
		(x: number, y: number) => {
			if (!enabled) return

			setIsErasing(true)
			setEraserPosition({ x, y })
			objectsToDeleteRef.current = new Set()

			// Find objects at initial position
			const hits = findObjectsAtPosition(x, y)
			hits.forEach((id) => objectsToDeleteRef.current.add(id))
			setHighlightedIds(new Set(objectsToDeleteRef.current))

			broadcastEraserState(x, y)
		},
		[enabled, findObjectsAtPosition, broadcastEraserState]
	)

	/**
	 * Handle pointer move - detect objects under eraser
	 */
	const handlePointerMove = React.useCallback(
		(x: number, y: number) => {
			if (!enabled) return

			// Always update eraser position for cursor rendering
			setEraserPosition({ x, y })

			if (!isErasing) return

			// Find objects at current position
			const hits = findObjectsAtPosition(x, y)
			hits.forEach((id) => objectsToDeleteRef.current.add(id))
			setHighlightedIds(new Set(objectsToDeleteRef.current))

			broadcastEraserState(x, y)
		},
		[enabled, isErasing, findObjectsAtPosition, broadcastEraserState]
	)

	/**
	 * Handle pointer up - commit deletions
	 */
	const handlePointerUp = React.useCallback(() => {
		if (!enabled) return

		setIsErasing(false)

		// Commit all accumulated deletions in a single transaction
		if (objectsToDeleteRef.current.size > 0 && yDoc && doc) {
			deleteObjects(yDoc, doc, Array.from(objectsToDeleteRef.current))
		}

		// Clear state
		objectsToDeleteRef.current = new Set()
		setHighlightedIds(new Set())
		clearEraserState()

		// Clear any pending throttle
		if (throttleRef.current) {
			clearTimeout(throttleRef.current)
			throttleRef.current = null
		}
	}, [enabled, yDoc, doc, clearEraserState])

	/**
	 * Handle cancel (e.g., Escape key)
	 */
	const handleCancel = React.useCallback(() => {
		setIsErasing(false)
		objectsToDeleteRef.current = new Set()
		setHighlightedIds(new Set())
		clearEraserState()

		if (throttleRef.current) {
			clearTimeout(throttleRef.current)
			throttleRef.current = null
		}
	}, [clearEraserState])

	/**
	 * Handle pointer leaving the canvas area
	 */
	const handlePointerLeave = React.useCallback(() => {
		setEraserPosition(null)
		// If actively erasing, commit what we have so far
		if (isErasing && objectsToDeleteRef.current.size > 0 && yDoc && doc) {
			deleteObjects(yDoc, doc, Array.from(objectsToDeleteRef.current))
		}
		setIsErasing(false)
		objectsToDeleteRef.current = new Set()
		setHighlightedIds(new Set())
		clearEraserState()
	}, [isErasing, yDoc, doc, clearEraserState])

	// Clear eraser position when tool is disabled
	React.useEffect(() => {
		if (!enabled) {
			setEraserPosition(null)
			setHighlightedIds(new Set())
			if (isErasing) {
				handleCancel()
			}
		}
	}, [enabled, isErasing, handleCancel])

	// Cleanup on unmount
	React.useEffect(() => {
		return () => {
			if (throttleRef.current) {
				clearTimeout(throttleRef.current)
			}
		}
	}, [])

	// Memoize return value to prevent infinite re-render loops
	return React.useMemo(
		() => ({
			isErasing,
			eraserPosition,
			highlightedIds,
			brushSize,
			canvasRadius,
			handlePointerDown,
			handlePointerMove,
			handlePointerUp,
			handlePointerLeave,
			handleCancel
		}),
		[
			isErasing,
			eraserPosition,
			highlightedIds,
			brushSize,
			canvasRadius,
			handlePointerDown,
			handlePointerMove,
			handlePointerUp,
			handlePointerLeave,
			handleCancel
		]
	)
}

// vim: ts=4
