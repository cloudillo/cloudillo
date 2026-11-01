// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

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
	// Smart Ink's recogniser vocabulary, not the object model - 'line' and 'arrow' both commit as
	// connectors (see SmartInkResultType)
	resultType: 'freehand' | 'line' | 'ellipse' | 'rect' | 'arrow' | 'polygon'
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

	// The stacks live in refs, mirrored to state for re-render: a pop must return its stroke
	// synchronously, and a setState updater is not guaranteed to run before setState returns
	const undoRef = React.useRef<UndoableStroke[]>([])
	const redoRef = React.useRef<UndoableStroke[]>([])
	const setUndo = React.useCallback((next: UndoableStroke[]) => {
		undoRef.current = next
		setUndoStack(next)
	}, [])
	const setRedo = React.useCallback((next: UndoableStroke[]) => {
		redoRef.current = next
		setRedoStack(next)
	}, [])

	const pushToUndoStack = React.useCallback(
		(stroke: UndoableStroke, { keepRedo = false }: { keepRedo?: boolean } = {}) => {
			setUndo([...undoRef.current, stroke].slice(-MAX_UNDO_STACK_SIZE))
			// A new action clears the redo stack; a redo keeps the strokes still after it
			if (!keepRedo) setRedo([])
		},
		[setUndo, setRedo]
	)

	const popFromUndoStack = React.useCallback((): UndoableStroke | undefined => {
		const popped = undoRef.current.at(-1)
		if (popped) setUndo(undoRef.current.slice(0, -1))
		return popped
	}, [setUndo])

	const pushToRedoStack = React.useCallback(
		(stroke: UndoableStroke) => {
			setRedo([...redoRef.current, stroke])
		},
		[setRedo]
	)

	const popFromRedoStack = React.useCallback((): UndoableStroke | undefined => {
		const popped = redoRef.current.at(-1)
		if (popped) setRedo(redoRef.current.slice(0, -1))
		return popped
	}, [setRedo])

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
