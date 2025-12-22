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
 * Hook for managing active stroke and undo stack during freehand drawing
 */

import * as React from 'react'
import type { ObjectId } from '../crdt/index.js'

export interface TimedPoint {
	x: number
	y: number
	timestamp: number
}

export interface ActiveStroke {
	id: string // Temporary client-generated ID
	points: [number, number][] // Full resolution (60fps capture)
	timedPoints: TimedPoint[] // Points with timestamps for Smart Ink
	style: {
		color: string
		width: number
	}
	startTime: number
}

export interface UndoableStroke {
	objectId: ObjectId // CRDT ObjectId after commit
	originalPoints: [number, number][] // Pre-simplification points
	timedPoints: TimedPoint[] // Original timed points (for re-processing)
	style: {
		color: string
		width: number
	}
	snapped: boolean // Was this auto-converted by Smart Ink?
	resultType: 'freehand' | 'line' | 'ellipse' | 'rect' | 'arrow' | 'polygon' // What type of object was created
}

const MAX_UNDO_STACK_SIZE = 50

export function useDrawingState() {
	const [activeStroke, setActiveStroke] = React.useState<ActiveStroke | null>(null)
	const [undoStack, setUndoStack] = React.useState<UndoableStroke[]>([])
	const [redoStack, setRedoStack] = React.useState<UndoableStroke[]>([])

	// Use a ref to store the stroke for synchronous access
	const activeStrokeRef = React.useRef<ActiveStroke | null>(null)

	const startStroke = React.useCallback(
		(x: number, y: number, style: { color: string; width: number }) => {
			const now = Date.now()
			const newStroke: ActiveStroke = {
				id: crypto.randomUUID(),
				points: [[x, y]],
				timedPoints: [{ x, y, timestamp: now }],
				style,
				startTime: now
			}
			activeStrokeRef.current = newStroke
			setActiveStroke(newStroke)
		},
		[]
	)

	const addPoint = React.useCallback((x: number, y: number) => {
		const prev = activeStrokeRef.current
		if (!prev) return

		const timestamp = Date.now()
		const updated: ActiveStroke = {
			...prev,
			points: [...prev.points, [x, y]],
			timedPoints: [...prev.timedPoints, { x, y, timestamp }]
		}
		activeStrokeRef.current = updated
		setActiveStroke(updated)
	}, [])

	const endStroke = React.useCallback((): ActiveStroke | null => {
		const stroke = activeStrokeRef.current
		activeStrokeRef.current = null
		setActiveStroke(null)
		return stroke
	}, [])

	const getActiveStroke = React.useCallback((): ActiveStroke | null => {
		return activeStroke
	}, [activeStroke])

	const pushToUndoStack = React.useCallback((stroke: UndoableStroke) => {
		setUndoStack((prev) => {
			const next = [...prev, stroke]
			if (next.length > MAX_UNDO_STACK_SIZE) {
				next.shift()
			}
			return next
		})
		// Clear redo stack on new action
		setRedoStack([])
	}, [])

	const popFromUndoStack = React.useCallback((): UndoableStroke | undefined => {
		let popped: UndoableStroke | undefined
		setUndoStack((prev) => {
			if (prev.length === 0) return prev
			popped = prev[prev.length - 1]
			return prev.slice(0, -1)
		})
		return popped
	}, [])

	const pushToRedoStack = React.useCallback((stroke: UndoableStroke) => {
		setRedoStack((prev) => [...prev, stroke])
	}, [])

	const popFromRedoStack = React.useCallback((): UndoableStroke | undefined => {
		let popped: UndoableStroke | undefined
		setRedoStack((prev) => {
			if (prev.length === 0) return prev
			popped = prev[prev.length - 1]
			return prev.slice(0, -1)
		})
		return popped
	}, [])

	const canUndoStroke = undoStack.length > 0
	const canRedoStroke = redoStack.length > 0

	// Memoize return value to prevent infinite re-render loops
	return React.useMemo(
		() => ({
			activeStroke,
			startStroke,
			addPoint,
			endStroke,
			getActiveStroke,
			undoStack,
			redoStack,
			pushToUndoStack,
			popFromUndoStack,
			pushToRedoStack,
			popFromRedoStack,
			canUndoStroke,
			canRedoStroke
		}),
		[
			activeStroke,
			startStroke,
			addPoint,
			endStroke,
			getActiveStroke,
			undoStack,
			redoStack,
			pushToUndoStack,
			popFromUndoStack,
			pushToRedoStack,
			popFromRedoStack,
			canUndoStroke,
			canRedoStroke
		]
	)
}

// vim: ts=4
