// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Measures the property bar and places it.
 *
 * The bar's size is not a constant: it wraps to two rows on a narrow viewport, and its width
 * depends on which controls the selection earns. Both numbers are inputs to the clamp, so they
 * have to be measured rather than assumed.
 */

import * as React from 'react'

import type { Bounds } from '../crdt/runtime-types.js'
import type { BarPosition } from '../utils/property-bar-position.js'
import { computeBarPosition } from '../utils/property-bar-position.js'

/** First-frame guess, only used until the ResizeObserver reports. Width 0 disables the clamp. */
const INITIAL_SIZE = { width: 0, height: 48 }

export function usePropertyBarPosition(
	barRef: React.RefObject<HTMLDivElement | null>,
	screenBounds: Bounds | null,
	rotation: number
): { position: BarPosition | null; measured: boolean } {
	const [size, setSize] = React.useState(INITIAL_SIZE)
	const [resizeTick, setResizeTick] = React.useState(0)
	const observedRef = React.useRef<Element | null>(null)
	const observerRef = React.useRef<ResizeObserver | null>(null)

	// Deliberately no dependency array: the bar unmounts every time the selection empties and
	// comes back as a NEW node, and a ref change does not re-fire an effect. The body only acts
	// on an identity change, so running it per render is cheap.
	React.useEffect(() => {
		const el = barRef.current
		if (el === observedRef.current) return
		observerRef.current?.disconnect()
		observerRef.current = null
		observedRef.current = el
		if (!el) {
			// Back to unmeasured, so the next mount stays hidden until its real size is known
			setSize((prev) =>
				prev.width === INITIAL_SIZE.width && prev.height === INITIAL_SIZE.height
					? prev
					: INITIAL_SIZE
			)
			return
		}
		const observer = new ResizeObserver((entries) => {
			// The BORDER box, not `contentRect`: the bar's 6px 8px padding and 1px border are part
			// of what has to fit the viewport (18px wide and 14px tall, in total).
			const box = entries[0]?.borderBoxSize?.[0]
			const width = box ? box.inlineSize : el.offsetWidth
			const height = box ? box.blockSize : el.offsetHeight
			// Compare before setting: measure -> position -> measure terminates anyway (position
			// writes top/left, never size), but the extra render is waste on every pointer move
			// that changes the selection bounds.
			setSize((prev) =>
				prev.width === width && prev.height === height ? prev : { width, height }
			)
		})
		observer.observe(el)
		observerRef.current = observer
	})

	React.useEffect(
		() => () => {
			observerRef.current?.disconnect()
			observerRef.current = null
		},
		[]
	)

	// A window resize changes the clamp without changing anything the memo below reads
	React.useEffect(() => {
		const onResize = () => setResizeTick((t) => t + 1)
		window.addEventListener('resize', onResize)
		return () => window.removeEventListener('resize', onResize)
	}, [])

	const position = React.useMemo(() => {
		if (!screenBounds) return null
		return computeBarPosition({
			screenBounds,
			rotation,
			barWidth: size.width,
			barHeight: size.height,
			viewportWidth: window.innerWidth,
			viewportHeight: window.innerHeight
		})
		// resizeTick is a dependency on purpose: window.innerWidth/Height are read, not passed in
	}, [screenBounds, rotation, size.width, size.height, resizeTick])

	return { position, measured: size.width > 0 }
}

// vim: ts=4
