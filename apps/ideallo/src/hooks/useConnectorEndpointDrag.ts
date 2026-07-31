// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Dragging a connector terminal to bind, rebind or unbind it.
 *
 * Mirrors usePivotDrag's shape: onDragStart fires immediately on pointer-down so the caller can
 * gate the select handler before it starts moving the object underneath, window listeners drive
 * the drag, and every option is read through a ref so nothing is stale inside them.
 *
 * The gesture is pointer-captured and single-pointer: only the pointer that started it can move or
 * end it, and cancellation - Escape, pointercancel, a lost capture - always drops the drag without
 * committing.
 */

import * as React from 'react'

import type { BindTarget, ShapeGeometry } from '../connectors/index.js'
import { anchorForPoint, findBindTargetShape } from '../connectors/index.js'
import type { IdealloObject, ObjectId } from '../crdt/index.js'
import { DRAG_THRESHOLD_PX } from '../tools/lifecycle.js'
import { useLatestRef } from './useLatestRef.js'

type Pt = [number, number]

export type Terminal = 'start' | 'end'

export interface ConnectorDragState {
	terminal: Terminal
	/** Current pointer position in world space */
	point: Pt
	/** Shape that would be bound on release, for the drop-target affordance */
	target: ShapeGeometry | null
	bind: BindTarget | null
}

export interface UseConnectorEndpointDragOptions {
	arrowId: ObjectId | null
	/** Screen to world. Read through a ref, so pan/zoom mid-drag stays correct. */
	translateTo: (screenX: number, screenY: number) => Pt
	/** Current document objects in z-order, for target lookup */
	getObjects: () => IdealloObject[]
	scale: number
	/**
	 * Shape bound to the terminal that is NOT being dragged. Excluded from target lookup: a
	 * self-loop needs waypoints and is out of scope, so the invitation is never offered rather
	 * than being refused on drop - the same rule the draw gesture applies.
	 *
	 * A callback, not a value: which terminal is being dragged is only known at pointer time.
	 */
	getOppositeBoundId?: (terminal: Terminal) => ObjectId | undefined
	disabled?: boolean
	onDragStart?: (terminal: Terminal) => void
	onDrag?: (state: ConnectorDragState) => void
	/** Commit. `bind` is null when dropped on empty canvas, which unbinds the terminal. */
	onDragEnd?: (terminal: Terminal, bind: BindTarget | null, point: Pt) => void
	onCancel?: () => void
}

export function useConnectorEndpointDrag(options: UseConnectorEndpointDragOptions) {
	const [dragState, setDragState] = React.useState<ConnectorDragState | null>(null)

	// Fresh values inside window handlers, which outlive any single render. Every reader is a
	// pointer/key handler or a useCallback body, all of which run after commit, so the
	// insertion-effect write lands in time.
	const optionsRef = useLatestRef(options)
	const dragRef = React.useRef<ConnectorDragState | null>(null)
	const altHeldRef = React.useRef(false)
	const startScreenRef = React.useRef<Pt | null>(null)
	const movedRef = React.useRef(false)
	const pointerIdRef = React.useRef<number | null>(null)

	const setDrag = React.useCallback((next: ConnectorDragState | null) => {
		dragRef.current = next
		setDragState(next)
	}, [])

	/** A second touch must not move or end a drag the first one owns */
	const isOurPointer = React.useCallback(
		(event: PointerEvent) =>
			pointerIdRef.current === null || event.pointerId === pointerIdRef.current,
		[]
	)

	/** Drop the gesture without committing. Every abort path goes through here. */
	const cancelDrag = React.useCallback(() => {
		pointerIdRef.current = null
		movedRef.current = false
		startScreenRef.current = null
		setDrag(null)
		optionsRef.current.onCancel?.()
	}, [setDrag])

	/**
	 * Runs on every pointermove, unthrottled (see findBindTargetShape). Deliberately NOT
	 * `resolveBindTarget`: that returns the id and drops the ShapeGeometry it just built, so the
	 * shape had to be looked up and re-derived a third time here - and nothing guaranteed the
	 * lookup found the same object the hit test matched.
	 */
	const resolveAt = React.useCallback((world: Pt, terminal: Terminal) => {
		const opts = optionsRef.current
		const lookup = {
			scale: opts.scale,
			precise: altHeldRef.current,
			// Connectors are never bindable, so the arrow itself needs no excluding; what must be
			// kept out of reach is the shape the OTHER terminal already sits on
			excludeId: opts.getOppositeBoundId?.(terminal)
		}
		const shape = findBindTargetShape(opts.getObjects(), world, lookup)
		if (!shape) return { target: null, bind: null }
		return {
			target: shape,
			bind: { objectId: shape.id, anchor: anchorForPoint(shape, world, lookup) }
		}
	}, [])

	const handlePointerDown = React.useCallback(
		(terminal: Terminal, event: React.PointerEvent) => {
			const opts = optionsRef.current
			if (opts.disabled || !opts.arrowId) return
			// A drag already owns the gesture. Restarting here would swap `terminal` and
			// pointerIdRef underneath it - a second finger on the other handle orphans the first
			// drag with neither onDragEnd nor onCancel - and the single-pointer contract in this
			// module's docstring rests on this guard. `dragRef`, not `dragState`: the ref is
			// current within the same event, the state may not be.
			if (dragRef.current) return
			event.stopPropagation()
			event.preventDefault()
			altHeldRef.current = event.altKey
			startScreenRef.current = [event.clientX, event.clientY]
			movedRef.current = false
			pointerIdRef.current = event.pointerId
			try {
				// Capture, so a release OUTSIDE the iframe still reaches these listeners. ideallo
				// runs sandboxed, and without capture that pointerup is simply never delivered - the
				// drag then stays pending and the NEXT tap anywhere commits a bind at that unrelated
				// position.
				const handle = event.currentTarget as Element
				handle.setPointerCapture?.(event.pointerId)
			} catch {
				// Pointer already gone; the window listeners still cover the ordinary case
			}

			const world = opts.translateTo(event.clientX, event.clientY)
			const { target, bind } = resolveAt(world, terminal)
			setDrag({ terminal, point: world, target, bind })
			// Immediately, so the caller can stop the select handler grabbing the object below
			opts.onDragStart?.(terminal)
		},
		[resolveAt, setDrag]
	)

	const isDragging = dragState !== null

	React.useEffect(() => {
		// The BOOLEAN, not `dragState`: handleMove allocates a new state object every frame, and
		// depending on its identity tore down and re-added all three listeners per pointermove.
		// Everything the handlers read comes from dragRef/optionsRef, so they never go stale.
		if (!isDragging) return

		const handleMove = (event: PointerEvent) => {
			const current = dragRef.current
			if (!current || !isOurPointer(event)) return
			if (!movedRef.current) {
				const origin = startScreenRef.current
				if (!origin) return
				if (
					// Math.hypot is fine here: a screen-space threshold on ONE client, never
					// cross-peer geometry. Routes use utils/geometry's deterministic `hypot`.
					Math.hypot(event.clientX - origin[0], event.clientY - origin[1]) <
					DRAG_THRESHOLD_PX
				)
					return
				movedRef.current = true
			}
			altHeldRef.current = event.altKey
			const world = optionsRef.current.translateTo(event.clientX, event.clientY)
			const { target, bind } = resolveAt(world, current.terminal)
			const next: ConnectorDragState = {
				terminal: current.terminal,
				point: world,
				target,
				bind
			}
			setDrag(next)
			optionsRef.current.onDrag?.(next)
		}

		const handleUp = (event: PointerEvent) => {
			const current = dragRef.current
			if (current && !isOurPointer(event)) return
			const moved = movedRef.current
			pointerIdRef.current = null
			movedRef.current = false
			startScreenRef.current = null
			setDrag(null)
			if (!current) return
			if (!moved) {
				// A click, not a drag. Committing here resolved `bind` at the terminal point, which
				// sits standoffGap OUTSIDE the outline and can fall past bindToleranceWorld at zoom -
				// so a plain click silently unbound the connector.
				optionsRef.current.onCancel?.()
				return
			}
			const world = optionsRef.current.translateTo(event.clientX, event.clientY)
			const { bind } = resolveAt(world, current.terminal)
			// Dropped on empty canvas: `bind` is null, which unbinds and freezes at `world`.
			// That is the entire unbind gesture - there is no menu for it.
			optionsRef.current.onDragEnd?.(current.terminal, bind, world)
		}

		const handleKey = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return
			cancelDrag()
		}

		const handlePointerCancel = (event: PointerEvent) => {
			// A browser-cancelled gesture - a two-finger scroll taking over the touch, say. No
			// pointerup follows, so without this the drag stays pending and the next tap commits it.
			if (!dragRef.current || !isOurPointer(event)) return
			cancelDrag()
		}

		const handleLostCapture = (event: PointerEvent) => {
			// Capture taken away mid-drag. Same reasoning as pointercancel: never commit.
			//
			// The `dragRef` guard is load-bearing: a normal release fires lostpointercapture right
			// after pointerup, synchronously, well before the effect cleanup can unhook this - and
			// without the guard every committed drag would be followed by a spurious onCancel.
			if (!dragRef.current || !isOurPointer(event)) return
			cancelDrag()
		}

		window.addEventListener('pointermove', handleMove)
		window.addEventListener('pointerup', handleUp)
		window.addEventListener('pointercancel', handlePointerCancel)
		window.addEventListener('lostpointercapture', handleLostCapture)
		window.addEventListener('keydown', handleKey)
		return () => {
			window.removeEventListener('pointermove', handleMove)
			window.removeEventListener('pointerup', handleUp)
			window.removeEventListener('pointercancel', handlePointerCancel)
			window.removeEventListener('lostpointercapture', handleLostCapture)
			window.removeEventListener('keydown', handleKey)
		}
	}, [isDragging, resolveAt, setDrag, isOurPointer, cancelDrag])

	return React.useMemo(
		() => ({ dragState, handlePointerDown, isDragging }),
		[dragState, handlePointerDown, isDragging]
	)
}

// vim: ts=4
