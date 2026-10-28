// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import * as React from 'react'

// Shared touch-gesture tuning (message bubbles, inbox rows, profile menus).
export const LONG_PRESS_MS = 500
// Touch travel that cancels a long press and decides swipe vs. scroll.
export const MOVE_TOLERANCE_PX = 10
// Horizontal travel that commits a swipe action, and how far the row follows the finger.
export const SWIPE_PX = 64
export const SWIPE_MAX_PX = 80

export function exceedsTolerance(dx: number, dy: number): boolean {
	return Math.abs(dx) > MOVE_TOLERANCE_PX || Math.abs(dy) > MOVE_TOLERANCE_PX
}

export interface TouchGestureOptions {
	enabled: boolean
	/** Long-press point / right-click */
	onMenu: (at: { x: number; y: number }) => void
	/** Committed on release, |dx| >= SWIPE_PX */
	onSwipeLeft?: () => void
	onSwipeRight?: () => void
}

interface Gesture {
	x: number
	y: number
	dx: number
	timer?: number
	mode?: 'swipe' | 'scroll'
	fired?: boolean
}

/**
 * Right-click and long-press open a menu at the point; a horizontal swipe follows the
 * finger (`swipeX`) and commits on release. The first move past the tolerance locks
 * swipe vs. scroll. The click that follows a long-press or swipe is swallowed.
 */
export function useTouchGestures(o: TouchGestureOptions): {
	handlers: Pick<
		React.DOMAttributes<HTMLElement>,
		| 'onContextMenu'
		| 'onTouchStart'
		| 'onTouchMove'
		| 'onTouchEnd'
		| 'onTouchCancel'
		| 'onClickCapture'
	>
	swipeX: number
} {
	const g = React.useRef<Gesture | undefined>(undefined)
	const swallowUntil = React.useRef(0)
	const [swipeX, setSwipeX] = React.useState(0)
	// The long-press timer outlives the render that started it.
	const opts = React.useRef(o)
	opts.current = o

	React.useEffect(() => () => window.clearTimeout(g.current?.timer), [])

	function finish(apply: boolean) {
		const s = g.current
		g.current = undefined
		if (!s) return
		window.clearTimeout(s.timer)
		setSwipeX(0)
		if (s.fired || s.mode === 'swipe') swallowUntil.current = Date.now() + 500
		if (apply && s.mode === 'swipe' && Math.abs(s.dx) >= SWIPE_PX) {
			if (s.dx < 0) opts.current.onSwipeLeft?.()
			else opts.current.onSwipeRight?.()
		}
	}

	const handlers = {
		onContextMenu(e: React.MouseEvent) {
			if (!o.enabled) return
			e.preventDefault()
			window.clearTimeout(g.current?.timer)
			swallowUntil.current = Date.now() + 500
			o.onMenu({ x: e.clientX, y: e.clientY })
		},
		onTouchStart(e: React.TouchEvent) {
			const touch = e.touches[0]
			if (!o.enabled || !touch || e.touches.length > 1) return
			window.clearTimeout(g.current?.timer)
			const s: Gesture = { x: touch.clientX, y: touch.clientY, dx: 0 }
			s.timer = window.setTimeout(() => {
				s.fired = true
				opts.current.onMenu({ x: s.x, y: s.y })
			}, LONG_PRESS_MS)
			g.current = s
		},
		onTouchMove(e: React.TouchEvent) {
			const s = g.current
			const touch = e.touches[0]
			if (!s || !touch || s.fired) return
			const dx = touch.clientX - s.x
			const dy = touch.clientY - s.y
			if (!s.mode && exceedsTolerance(dx, dy)) {
				window.clearTimeout(s.timer)
				s.mode = Math.abs(dx) > Math.abs(dy) ? 'swipe' : 'scroll'
			}
			if (s.mode === 'swipe') {
				s.dx = Math.max(
					o.onSwipeLeft ? -SWIPE_MAX_PX : 0,
					Math.min(dx, o.onSwipeRight ? SWIPE_MAX_PX : 0)
				)
				setSwipeX(s.dx)
			}
		},
		onTouchEnd: () => finish(true),
		onTouchCancel: () => finish(false),
		onClickCapture(e: React.MouseEvent) {
			if (Date.now() < swallowUntil.current) e.preventDefault()
		}
	}

	return { handlers, swipeX }
}

// vim: ts=4
