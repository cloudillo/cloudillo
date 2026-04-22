// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

export interface PointerDragDelta {
	dx: number
	dy: number
}

export interface PointerDragOptions<T> {
	/** Build the per-drag context (original coordinates etc.), or return null
	 *  to skip. Not called on non-primary buttons. */
	onStart: (e: React.PointerEvent) => T | null
	/** Called on every move past the threshold. */
	onMove: (e: PointerEvent, ctx: T, delta: PointerDragDelta) => void
	/** Called on pointerup. `wasDrag` is true iff the threshold was ever
	 *  crossed — so onClick semantics can be implemented by checking this. */
	onEnd: (e: PointerEvent, ctx: T, delta: PointerDragDelta, wasDrag: boolean) => void
	/** Minimum pixel distance before a press is considered a drag. Default 5. */
	threshold?: number
}

/** Unified pointer handling for mouse, touch, and pen input. Uses
 *  `setPointerCapture` so drags that leave the element still deliver events
 *  to the origin. Consumers own snap math — we just deliver raw deltas. */
export function usePointerDrag<T>(opts: PointerDragOptions<T>) {
	const optsRef = React.useRef(opts)
	optsRef.current = opts
	const stateRef = React.useRef<{
		ctx: T
		target: Element
		pointerId: number
		startX: number
		startY: number
		dragging: boolean
	} | null>(null)

	// Stable handlers so we can addEventListener/removeEventListener cleanly.
	const handleMove = React.useCallback((e: Event) => {
		const ev = e as PointerEvent
		const s = stateRef.current
		if (!s || ev.pointerId !== s.pointerId) return
		const dx = ev.clientX - s.startX
		const dy = ev.clientY - s.startY
		const threshold = optsRef.current.threshold ?? 5
		if (!s.dragging && Math.hypot(dx, dy) < threshold) return
		s.dragging = true
		optsRef.current.onMove(ev, s.ctx, { dx, dy })
	}, [])

	const handleEnd = React.useCallback(
		(e: Event) => {
			const ev = e as PointerEvent
			const s = stateRef.current
			if (!s || ev.pointerId !== s.pointerId) return
			const dx = ev.clientX - s.startX
			const dy = ev.clientY - s.startY
			optsRef.current.onEnd(ev, s.ctx, { dx, dy }, s.dragging)
			window.removeEventListener('pointermove', handleMove)
			window.removeEventListener('pointerup', handleEnd)
			window.removeEventListener('pointercancel', handleEnd)
			stateRef.current = null
		},
		[handleMove]
	)

	const onPointerDown = React.useCallback(
		(e: React.PointerEvent) => {
			// Primary button only for mouse; touch/pen always have button=0.
			if (e.button !== 0) return
			// Ignore a second pointer press while a drag is already in flight
			// (e.g. second finger touches down on touch). Overwriting state
			// would leak the first captured pointer.
			if (stateRef.current) return
			const ctx = optsRef.current.onStart(e)
			if (ctx == null) return
			const target = e.currentTarget as Element
			try {
				target.setPointerCapture(e.pointerId)
			} catch {
				// setPointerCapture can reject (stale pointerId, detached element).
				// Bail without attaching listeners so we don't leak state.
				return
			}
			stateRef.current = {
				ctx,
				target,
				pointerId: e.pointerId,
				startX: e.clientX,
				startY: e.clientY,
				dragging: false
			}
			// Listeners go on window rather than `target` because the drag consumer
			// may remount the origin element mid-drag (e.g. TimeGrid re-parents an
			// event chip into a different day column as the preview crosses a day
			// boundary). If the listeners lived on the element, the unmount would
			// sever the drag — pointermove stops firing and pointerup never commits.
			window.addEventListener('pointermove', handleMove)
			window.addEventListener('pointerup', handleEnd)
			window.addEventListener('pointercancel', handleEnd)
		},
		[handleMove, handleEnd]
	)

	// Clean up in-flight drag state and listeners on unmount so a component
	// torn down mid-drag doesn't leak captured pointers or window listeners.
	React.useEffect(() => {
		return () => {
			const s = stateRef.current
			if (s) {
				try {
					s.target.releasePointerCapture(s.pointerId)
				} catch {
					// ignore — target may already be detached
				}
				stateRef.current = null
			}
			window.removeEventListener('pointermove', handleMove)
			window.removeEventListener('pointerup', handleEnd)
			window.removeEventListener('pointercancel', handleEnd)
		}
	}, [handleMove, handleEnd])

	return { onPointerDown }
}

// vim: ts=4
