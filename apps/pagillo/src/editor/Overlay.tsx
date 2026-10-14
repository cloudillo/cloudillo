// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Local caret + selection rectangles of one page, an SVG laid over the page box (viewBox in pt,
 * like `PageSvgOverlay`). Not part of `PageCanvas` / `PageSvgOverlay`, so caret moves never redraw
 * the page.
 */

import { FX } from '@cloudillo/typeset'
import * as React from 'react'

import { type CaretBox, type Rect, rotAttr } from './caret'

export interface OverlayProps {
	/** Page size, Fx. */
	w: number
	h: number
	rects: Rect[]
	caret?: CaretBox
	/** Writers' caret blinks; readers' is static. */
	blink: boolean
	/** Bumped when the caret should be scrolled into view. */
	reveal: number
	/** Caret box in client px after every render (IME window placement). */
	onCaretRect?(r: DOMRect): void
}

const pt = (fx: number) => fx / FX

export function Overlay({ w, h, rects, caret, blink, reveal, onCaretRect }: OverlayProps) {
	const caretRef = React.useRef<SVGLineElement>(null)
	// Read the caret rect on the next frame, not right after DOM writes (forced reflow).
	const raf = React.useRef(0)
	React.useLayoutEffect(() => {
		if (!onCaretRect || raf.current) return
		raf.current = requestAnimationFrame(() => {
			raf.current = 0
			if (caretRef.current) onCaretRect(caretRef.current.getBoundingClientRect())
		})
	})
	React.useEffect(() => () => cancelAnimationFrame(raf.current), [])
	React.useEffect(() => {
		caretRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
	}, [reveal])

	return (
		<svg
			className="pagillo-overlay"
			viewBox={`0 0 ${pt(w)} ${pt(h)}`}
			preserveAspectRatio="none"
			aria-hidden="true"
			style={{
				position: 'absolute',
				inset: 0,
				width: '100%',
				height: '100%',
				pointerEvents: 'none'
			}}
		>
			{rects.map((r) => (
				<rect
					key={`${r.x}:${r.y}`}
					x={pt(r.x)}
					y={pt(r.y)}
					width={pt(r.w)}
					height={pt(r.h)}
					transform={rotAttr(r.rot)}
					fill="var(--col-primary)"
					fillOpacity={0.25}
				/>
			))}
			{caret && (
				<line
					ref={caretRef}
					key={`${caret.x}:${caret.top}`}
					x1={pt(caret.x)}
					x2={pt(caret.x)}
					y1={pt(caret.top)}
					y2={pt(caret.bottom)}
					transform={rotAttr(caret.rot)}
					stroke="#000"
					strokeWidth={1.5}
					vectorEffect="non-scaling-stroke"
				>
					{blink && (
						<animate
							attributeName="opacity"
							values="1;0"
							dur="1.06s"
							calcMode="discrete"
							repeatCount="indefinite"
						/>
					)}
				</line>
			)}
		</svg>
	)
}

// vim: ts=4
