// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Misspelling squiggles of one page: an SVG over the page box (viewBox in pt, like
 * `Overlay`), x from the lines' cluster carets. Editor-only, never in the PDF.
 */

import { FX } from '@cloudillo/typeset'
import * as React from 'react'

import type { SpellRange } from '../worker/protocol'
import { type PlacedLine, rotAttr } from './caret'

export interface SpellOverlayProps {
	/** Page size, Fx. */
	w: number
	h: number
	/** The page's lines (`GeomIndex.pages`). */
	lines: PlacedLine[] | undefined
	/** `LayoutState.spell`: story → bid → ranges. */
	spell: Map<string, Map<string, SpellRange[]>>
}

const pt = (fx: number) => fx / FX
/** Squiggle half period and amplitude, pt. */
const STEP = 1.5
const AMP = 1.2

export function SpellOverlay({ w, h, lines, spell }: SpellOverlayProps) {
	const paths: { d: string; rot?: string }[] = []
	for (const pl of lines ?? []) {
		const l = pl.line
		const ranges = spell.get(l.story)?.get(l.bid)
		if (!ranges) continue
		for (const r of ranges) {
			const a = Math.max(r.from, l.from)
			const b = Math.min(r.to, l.to)
			if (a >= b) continue
			const x0 = pt(l.carets[a - l.from])
			const x1 = pt(l.carets[b - l.from])
			const y = pt(l.y + l.descent / 2)
			let d = `M${x0} ${y}`
			let up = true
			for (let x = Math.min(x0, x1) + STEP; x < Math.max(x0, x1); x += STEP, up = !up)
				d += `L${x} ${up ? y + AMP : y}`
			paths.push({ d, rot: rotAttr(l.rot) })
		}
	}
	if (!paths.length) return null
	return (
		<svg
			className="pagillo-spell"
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
			{paths.map((p, i) => (
				<path
					key={`${i}:${p.d}`}
					d={p.d}
					transform={p.rot}
					fill="none"
					stroke="var(--col-error, #d00)"
					strokeWidth={0.8}
				/>
			))}
		</svg>
	)
}

// vim: ts=4
