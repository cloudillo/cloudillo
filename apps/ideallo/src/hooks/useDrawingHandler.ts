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
 * Hook for handling pointer events during freehand drawing
 * Manages broadcast via awareness and commits to CRDT
 */

import * as React from 'react'
import type { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'

import type {
	YIdealloDocument,
	ObjectId,
	FreehandObject,
	LineObject,
	EllipseObject,
	RectObject,
	ArrowObject,
	PolygonObject
} from '../crdt/index.js'
import { addObject, deleteObject, DEFAULT_STYLE } from '../crdt/index.js'
import { streamSimplify } from '../utils/index.js'
import { getBoundsFromPoints } from '../utils/geometry.js'
import { useDrawingState, type ActiveStroke, type UndoableStroke } from './useDrawingState.js'
import {
	processSmartInk,
	createLineMorphAnimation,
	createEllipseMorphAnimation,
	createRectangleMorphAnimation,
	createPolygonMorphAnimation,
	createArrowMorphAnimation,
	MorphAnimationManager,
	type MorphAnimationState,
	type SmartInkResult
} from '../smart-ink/index.js'

// Constants
const BROADCAST_THROTTLE_MS = 50
const BROADCAST_MIN_DISTANCE = 8
const BROADCAST_MAX_POINTS = 100

export interface UseDrawingHandlerOptions {
	yDoc: Y.Doc
	doc: YIdealloDocument
	awareness: Awareness | null
	currentStyle: {
		strokeColor: string
		fillColor: string
		strokeWidth: number
	}
	enabled?: boolean
	onObjectCreated?: (id: ObjectId, snapped: boolean) => void
	onMorphAnimationUpdate?: (states: Map<string, MorphAnimationState>) => void
}

export function useDrawingHandler(options: UseDrawingHandlerOptions) {
	const {
		yDoc,
		doc,
		awareness,
		currentStyle,
		enabled = true,
		onObjectCreated,
		onMorphAnimationUpdate
	} = options
	const drawingState = useDrawingState()
	const throttleRef = React.useRef<number | null>(null)
	const activeStrokeRef = React.useRef<ActiveStroke | null>(null)

	// Morph animation manager for Smart Ink shape transitions
	const morphManagerRef = React.useRef<MorphAnimationManager | null>(null)
	if (!morphManagerRef.current && onMorphAnimationUpdate) {
		morphManagerRef.current = new MorphAnimationManager(onMorphAnimationUpdate)
	}

	// Keep ref in sync with state for use in callbacks
	React.useEffect(() => {
		activeStrokeRef.current = drawingState.activeStroke
	}, [drawingState.activeStroke])

	const setDrawingState = React.useCallback(
		(strokeId: string, points: [number, number][], style: { color: string; width: number }) => {
			if (awareness) {
				awareness.setLocalStateField('drawing', { strokeId, points, style })
			}
		},
		[awareness]
	)

	const clearDrawingState = React.useCallback(() => {
		if (awareness) {
			awareness.setLocalStateField('drawing', undefined)
		}
	}, [awareness])

	const handlePointerDown = React.useCallback(
		(x: number, y: number) => {
			if (!enabled) return

			drawingState.startStroke(x, y, {
				color: currentStyle.strokeColor,
				width: currentStyle.strokeWidth
			})
		},
		[enabled, drawingState, currentStyle]
	)

	const handlePointerMove = React.useCallback(
		(x: number, y: number) => {
			if (!enabled || !activeStrokeRef.current) return

			drawingState.addPoint(x, y)

			// Throttled broadcast via awareness
			if (awareness && !throttleRef.current) {
				throttleRef.current = window.setTimeout(() => {
					throttleRef.current = null

					const stroke = activeStrokeRef.current
					if (stroke) {
						const simplified = streamSimplify(
							stroke.points,
							BROADCAST_MIN_DISTANCE,
							BROADCAST_MAX_POINTS
						)
						setDrawingState(stroke.id, simplified, stroke.style)
					}
				}, BROADCAST_THROTTLE_MS)
			}
		},
		[enabled, drawingState, awareness, setDrawingState]
	)

	const handlePointerUp = React.useCallback(() => {
		if (!enabled) return

		const stroke = drawingState.endStroke()
		if (!stroke || stroke.timedPoints.length < 2) {
			clearDrawingState()
			return
		}

		// Clear broadcast
		clearDrawingState()

		// Clear any pending throttle
		if (throttleRef.current) {
			clearTimeout(throttleRef.current)
			throttleRef.current = null
		}

		// Process with Smart Ink
		const result = processSmartInk(stroke.timedPoints)

		// Helper function to commit the result to CRDT
		const commitResult = (smartInkResult: SmartInkResult) => {
			let objectId: ObjectId

			const baseStyle = {
				strokeColor: stroke.style.color,
				fillColor: DEFAULT_STYLE.fillColor,
				strokeWidth: stroke.style.width,
				strokeStyle: DEFAULT_STYLE.strokeStyle,
				opacity: DEFAULT_STYLE.opacity
			}

			switch (smartInkResult.type) {
				case 'line': {
					const line = smartInkResult.lineCandidate!
					const lineObject: Omit<LineObject, 'id'> = {
						type: 'line',
						x: Math.min(line.start[0], line.end[0]),
						y: Math.min(line.start[1], line.end[1]),
						startX: line.start[0],
						startY: line.start[1],
						endX: line.end[0],
						endY: line.end[1],
						rotation: 0,
						pivotX: 0.5,
						pivotY: 0.5,
						locked: false,
						snapped: true,
						style: baseStyle
					}
					objectId = addObject(yDoc, doc, lineObject)
					break
				}

				case 'ellipse': {
					const ellipse = smartInkResult.ellipseCandidate!
					const ellipseObject: Omit<EllipseObject, 'id'> = {
						type: 'ellipse',
						x: ellipse.center[0] - ellipse.radiusX,
						y: ellipse.center[1] - ellipse.radiusY,
						width: ellipse.radiusX * 2,
						height: ellipse.radiusY * 2,
						rotation: ellipse.rotation,
						pivotX: 0.5,
						pivotY: 0.5,
						locked: false,
						snapped: true,
						style: baseStyle
					}
					objectId = addObject(yDoc, doc, ellipseObject)
					break
				}

				case 'rect': {
					const rect = smartInkResult.rectangleCandidate!
					const rectObject: Omit<RectObject, 'id'> = {
						type: 'rect',
						x: rect.bounds.x,
						y: rect.bounds.y,
						width: rect.bounds.width,
						height: rect.bounds.height,
						rotation: rect.rotation,
						pivotX: 0.5,
						pivotY: 0.5,
						locked: false,
						snapped: true,
						style: baseStyle
					}
					objectId = addObject(yDoc, doc, rectObject)
					break
				}

				case 'polygon': {
					const polygon = smartInkResult.polygonCandidate!
					const bounds = getBoundsFromPoints(polygon.vertices)
					const polygonObject: Omit<PolygonObject, 'id'> = {
						type: 'polygon',
						x: bounds.x,
						y: bounds.y,
						vertices: polygon.vertices as [number, number][],
						rotation: 0,
						pivotX: 0.5,
						pivotY: 0.5,
						locked: false,
						snapped: true,
						style: baseStyle
					}
					objectId = addObject(yDoc, doc, polygonObject)
					break
				}

				case 'arrow': {
					const arrow = smartInkResult.arrowCandidate!
					const arrowObject: Omit<ArrowObject, 'id'> = {
						type: 'arrow',
						x: Math.min(arrow.start[0], arrow.end[0]),
						y: Math.min(arrow.start[1], arrow.end[1]),
						startX: arrow.start[0],
						startY: arrow.start[1],
						endX: arrow.end[0],
						endY: arrow.end[1],
						arrowheadPosition: arrow.arrowheadPosition,
						rotation: 0,
						pivotX: 0.5,
						pivotY: 0.5,
						locked: false,
						snapped: true,
						style: baseStyle
					}
					objectId = addObject(yDoc, doc, arrowObject)
					break
				}

				default: {
					// Freehand (possibly smoothed)
					const points = smartInkResult.points
					const bounds = getBoundsFromPoints(points)

					const freehandObject: Omit<FreehandObject, 'id'> = {
						type: 'freehand',
						x: bounds.x,
						y: bounds.y,
						points: points as [number, number][],
						rotation: 0,
						pivotX: 0.5,
						pivotY: 0.5,
						locked: false,
						style: baseStyle
					}
					objectId = addObject(yDoc, doc, freehandObject)
				}
			}

			// Push to client-side undo stack
			drawingState.pushToUndoStack({
				objectId,
				originalPoints: stroke.points,
				timedPoints: stroke.timedPoints,
				style: stroke.style,
				snapped: smartInkResult.snapped,
				resultType: smartInkResult.type
			})

			onObjectCreated?.(objectId, smartInkResult.snapped)
		}

		// Create morph animation for snapped shapes
		if (result.snapped && morphManagerRef.current) {
			let animation = null

			switch (result.type) {
				case 'line':
					if (result.lineCandidate) {
						animation = createLineMorphAnimation(
							stroke.id,
							result.originalPoints,
							result.lineCandidate,
							stroke.style,
							() => commitResult(result)
						)
					}
					break
				case 'ellipse':
					if (result.ellipseCandidate) {
						animation = createEllipseMorphAnimation(
							stroke.id,
							result.originalPoints,
							result.ellipseCandidate,
							stroke.style,
							() => commitResult(result)
						)
					}
					break
				case 'rect':
					if (result.rectangleCandidate) {
						animation = createRectangleMorphAnimation(
							stroke.id,
							result.originalPoints,
							result.rectangleCandidate,
							stroke.style,
							() => commitResult(result)
						)
					}
					break
				case 'polygon':
					if (result.polygonCandidate) {
						animation = createPolygonMorphAnimation(
							stroke.id,
							result.originalPoints,
							result.polygonCandidate,
							stroke.style,
							() => commitResult(result)
						)
					}
					break
				case 'arrow':
					if (result.arrowCandidate) {
						animation = createArrowMorphAnimation(
							stroke.id,
							result.originalPoints,
							result.arrowCandidate,
							stroke.style,
							() => commitResult(result)
						)
					}
					break
			}

			if (animation) {
				morphManagerRef.current.start(animation)
			} else {
				// Fallback: commit immediately
				commitResult(result)
			}
		} else {
			// No animation needed for freehand, commit immediately
			commitResult(result)
		}
	}, [enabled, drawingState, yDoc, doc, clearDrawingState, onObjectCreated])

	// Client-side undo (for strokes only)
	const undoStroke = React.useCallback(() => {
		const stroke = drawingState.popFromUndoStack()
		if (stroke) {
			deleteObject(yDoc, doc, stroke.objectId)
			drawingState.pushToRedoStack(stroke)
		}
	}, [drawingState, yDoc, doc])

	const redoStroke = React.useCallback(() => {
		const stroke = drawingState.popFromRedoStack()
		if (stroke) {
			// Re-process with Smart Ink to recreate the same result
			const result = processSmartInk(stroke.timedPoints)
			let objectId: ObjectId

			const baseStyle = {
				strokeColor: stroke.style.color,
				fillColor: DEFAULT_STYLE.fillColor,
				strokeWidth: stroke.style.width,
				strokeStyle: DEFAULT_STYLE.strokeStyle,
				opacity: DEFAULT_STYLE.opacity
			}

			switch (result.type) {
				case 'line': {
					const line = result.lineCandidate!
					const lineObject: Omit<LineObject, 'id'> = {
						type: 'line',
						x: Math.min(line.start[0], line.end[0]),
						y: Math.min(line.start[1], line.end[1]),
						startX: line.start[0],
						startY: line.start[1],
						endX: line.end[0],
						endY: line.end[1],
						rotation: 0,
						pivotX: 0.5,
						pivotY: 0.5,
						locked: false,
						snapped: true,
						style: baseStyle
					}
					objectId = addObject(yDoc, doc, lineObject)
					break
				}

				case 'ellipse': {
					const ellipse = result.ellipseCandidate!
					const ellipseObject: Omit<EllipseObject, 'id'> = {
						type: 'ellipse',
						x: ellipse.center[0] - ellipse.radiusX,
						y: ellipse.center[1] - ellipse.radiusY,
						width: ellipse.radiusX * 2,
						height: ellipse.radiusY * 2,
						rotation: ellipse.rotation,
						pivotX: 0.5,
						pivotY: 0.5,
						locked: false,
						snapped: true,
						style: baseStyle
					}
					objectId = addObject(yDoc, doc, ellipseObject)
					break
				}

				case 'rect': {
					const rect = result.rectangleCandidate!
					const rectObject: Omit<RectObject, 'id'> = {
						type: 'rect',
						x: rect.bounds.x,
						y: rect.bounds.y,
						width: rect.bounds.width,
						height: rect.bounds.height,
						rotation: rect.rotation,
						pivotX: 0.5,
						pivotY: 0.5,
						locked: false,
						snapped: true,
						style: baseStyle
					}
					objectId = addObject(yDoc, doc, rectObject)
					break
				}

				case 'polygon': {
					const polygon = result.polygonCandidate!
					const bounds = getBoundsFromPoints(polygon.vertices)
					const polygonObject: Omit<PolygonObject, 'id'> = {
						type: 'polygon',
						x: bounds.x,
						y: bounds.y,
						vertices: polygon.vertices as [number, number][],
						rotation: 0,
						pivotX: 0.5,
						pivotY: 0.5,
						locked: false,
						snapped: true,
						style: baseStyle
					}
					objectId = addObject(yDoc, doc, polygonObject)
					break
				}

				case 'arrow': {
					const arrow = result.arrowCandidate!
					const arrowObject: Omit<ArrowObject, 'id'> = {
						type: 'arrow',
						x: Math.min(arrow.start[0], arrow.end[0]),
						y: Math.min(arrow.start[1], arrow.end[1]),
						startX: arrow.start[0],
						startY: arrow.start[1],
						endX: arrow.end[0],
						endY: arrow.end[1],
						arrowheadPosition: arrow.arrowheadPosition,
						rotation: 0,
						pivotX: 0.5,
						pivotY: 0.5,
						locked: false,
						snapped: true,
						style: baseStyle
					}
					objectId = addObject(yDoc, doc, arrowObject)
					break
				}

				default: {
					// Freehand
					const points = result.points
					const bounds = getBoundsFromPoints(points)
					const freehandObject: Omit<FreehandObject, 'id'> = {
						type: 'freehand',
						x: bounds.x,
						y: bounds.y,
						points: points as [number, number][],
						rotation: 0,
						pivotX: 0.5,
						pivotY: 0.5,
						locked: false,
						style: baseStyle
					}
					objectId = addObject(yDoc, doc, freehandObject)
				}
			}

			drawingState.pushToUndoStack({
				...stroke,
				objectId
			})
		}
	}, [drawingState, yDoc, doc])

	// Cleanup on unmount
	React.useEffect(() => {
		return () => {
			if (throttleRef.current) {
				clearTimeout(throttleRef.current)
			}
			if (morphManagerRef.current) {
				morphManagerRef.current.destroy()
			}
		}
	}, [])

	// Memoize return value to prevent infinite re-render loops
	return React.useMemo(
		() => ({
			activeStroke: drawingState.activeStroke,
			handlePointerDown,
			handlePointerMove,
			handlePointerUp,
			undoStroke,
			redoStroke,
			canUndoStroke: drawingState.canUndoStroke,
			canRedoStroke: drawingState.canRedoStroke
		}),
		[
			drawingState.activeStroke,
			drawingState.canUndoStroke,
			drawingState.canRedoStroke,
			handlePointerDown,
			handlePointerMove,
			handlePointerUp,
			undoStroke,
			redoStroke
		]
	)
}

// vim: ts=4
