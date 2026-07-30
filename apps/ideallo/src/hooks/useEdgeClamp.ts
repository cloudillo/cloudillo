// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Keeps an absolutely-positioned popover inside the viewport.
 *
 * Clamping the BAR that owns the trigger is not enough: a ~300px palette opened from the leftmost
 * trigger of a bar already hard against the left edge still hangs off screen. So measure once
 * mounted and push it back with a custom property the CSS folds into the existing translateX(-50%),
 * flip it to the other side of its anchor when that side has more room, and cap its height so it
 * scrolls internally rather than overflowing when neither side is tall enough.
 *
 * `computeEdgeClamp` is idempotent (see `utils/edge-clamp.ts`), which is what makes the array-less
 * layout effect safe - it can run on every render, picking up anchor movement (the property bar is
 * repositioned on every selection change) without a dependency list that would have to enumerate it.
 *
 * Idempotent is not the same as free: each pass forces three layout reads, and while a popover is
 * open EVERY canvas re-render runs it - once per pointermove during a drag. So the reads are
 * coalesced to one per animation frame after the first pass, which stays synchronous or the
 * popover would paint unclamped for a frame on open.
 *
 * The anchor is the element's `offsetParent`: `.ideallo-tool-group` for ToolPopover and
 * `.ideallo-color-picker` for BarPopover, both already `position: relative`.
 */

import * as React from 'react'

import { computeEdgeClamp } from '../utils/edge-clamp.js'
import { useLatestRef } from './useLatestRef.js'

export interface EdgeClampOptions {
	/** Side of the anchor the CSS opens on by default */
	side?: 'above' | 'below'
	/** May the popover move to the other side when the preferred one is tighter? */
	flip?: boolean
	/** Gap between anchor and popover, matching the CSS margin */
	gap?: number
}

export interface EdgeClamp {
	ref: React.RefObject<HTMLDivElement | null>
	/** Horizontal correction in px, to be written as `--popover-shift` */
	shift: number
	placement: 'above' | 'below'
	/** null when the popover fits without scrolling */
	maxHeight: number | null
}

/** Sub-pixel jitter must not trigger a re-render, or the array-less effect below never settles */
const EPSILON = 0.5

export function useEdgeClamp({
	side = 'below',
	flip = false,
	gap = 8
}: EdgeClampOptions = {}): EdgeClamp {
	const ref = React.useRef<HTMLDivElement>(null)
	const [state, setState] = React.useState<Omit<EdgeClamp, 'ref'>>({
		shift: 0,
		placement: side,
		maxHeight: null
	})
	// Only the re-render matters, not the value: the layout effect below has no dependency array
	const [, setTick] = React.useState(0)
	// The measurement runs asynchronously now, so it must not read `state.shift` off a closure
	// captured a frame ago - computeEdgeClamp subtracts it back out and a stale one would drift.
	//
	// useLatestRef, not a write during render: it writes in useInsertionEffect, which React runs
	// BEFORE layout effects, so both readers - the synchronous first `measure()` in the layout
	// effect below and the later rAF callback - already see the committed value.
	const stateRef = useLatestRef(state)

	const measure = React.useCallback(() => {
		const el = ref.current
		if (!el) return
		const anchor = el.offsetParent
		if (!anchor) return
		const next = computeEdgeClamp({
			anchorRect: anchor.getBoundingClientRect(),
			popoverRect: el.getBoundingClientRect(),
			// scrollHeight, not offsetHeight: an applied maxHeight must not feed back into the
			// placement decision, or the popover would stop flipping as soon as it was clamped
			contentHeight: el.scrollHeight,
			currentShift: stateRef.current.shift,
			viewportWidth: window.innerWidth,
			viewportHeight: window.innerHeight,
			side,
			flip,
			gap
		})
		setState((prev) =>
			Math.abs(next.shift - prev.shift) <= EPSILON &&
			next.placement === prev.placement &&
			sameHeight(next.maxHeight, prev.maxHeight)
				? prev
				: next
		)
	}, [side, flip, gap])

	const rafRef = React.useRef<number | null>(null)
	const measuredRef = React.useRef(false)

	// Still no dependency array, the same pattern as `usePropertyBarPosition`: the anchor moves
	// without anything this hook could depend on changing. Safe because the computation is
	// idempotent and the guard above only sets state on a real change. The forced reflow is
	// coalesced to one per frame, except the FIRST pass - that one stays synchronous, or the
	// popover paints unclamped for a frame on open.
	React.useLayoutEffect(() => {
		if (!ref.current) {
			measuredRef.current = false
			return
		}
		if (!measuredRef.current) {
			measuredRef.current = true
			measure()
			return
		}
		if (rafRef.current !== null) return
		rafRef.current = requestAnimationFrame(() => {
			rafRef.current = null
			measure()
		})
	})

	// The element's own size can change without a render of its own (a font list loading, say).
	//
	// No dependency array, and the observed element is tracked by ref: a popover that renders null
	// while closed (ToolPopover) has no element at mount, so a `[]`-dep effect would bail once and
	// never retry when it opened. Re-observing is a no-op when the element has not changed.
	const observerRef = React.useRef<ResizeObserver | null>(null)
	const observedRef = React.useRef<Element | null>(null)

	React.useLayoutEffect(() => {
		const el = ref.current
		if (observedRef.current === el) return
		observerRef.current?.disconnect()
		observedRef.current = el
		if (!el) return
		if (!observerRef.current) {
			observerRef.current = new ResizeObserver(() => setTick((t) => t + 1))
		}
		observerRef.current.observe(el)
	})

	React.useEffect(
		() => () => {
			if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
			observerRef.current?.disconnect()
			observerRef.current = null
			observedRef.current = null
		},
		[]
	)

	// A window resize changes the clamp without changing anything measured above
	React.useEffect(() => {
		const onResize = () => setTick((t) => t + 1)
		window.addEventListener('resize', onResize)
		return () => window.removeEventListener('resize', onResize)
	}, [])

	return { ref, ...state }
}

function sameHeight(a: number | null, b: number | null): boolean {
	if (a === null || b === null) return a === b
	return Math.abs(a - b) <= EPSILON
}

// vim: ts=4
