// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * SVG export for rich text
 *
 * Generates native SVG <text> elements with <tspan> children for each run.
 * This produces SVG that can be converted to PDF via svg2pdf.js.
 */

import { deltaToLines } from './delta-parser'
import { calculateRichTextLayout } from './layout'
import { type ResolvedRunStyle, resolveRunStyle } from './measure'
import type { BaseTextStyle, DeltaOp, TextBounds } from './types'

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Create SVG DOM elements for rich text content (for svg2pdf.js)
 */
export function createRichTextSVGElement(
	delta: DeltaOp[],
	bounds: TextBounds,
	baseStyle: BaseTextStyle
): SVGGElement | null {
	const lines = deltaToLines(delta)
	const layout = calculateRichTextLayout(lines, bounds, baseStyle)

	if (layout.lines.length === 0) return null

	const groupEl = document.createElementNS(SVG_NS, 'g')

	for (const line of layout.lines) {
		if (line.runs.length === 0) continue

		// List marker
		if (line.listType === 'bullet') {
			const bulletSize = baseStyle.fontSize * 0.3
			const bulletY = line.y + line.height * 0.5
			const bulletX = bounds.x + baseStyle.fontSize * 0.5
			const circle = document.createElementNS(SVG_NS, 'circle')
			circle.setAttribute('cx', String(bulletX))
			circle.setAttribute('cy', String(bulletY))
			circle.setAttribute('r', String(bulletSize))
			circle.setAttribute('fill', baseStyle.fill)
			groupEl.appendChild(circle)
		} else if (line.listType === 'ordered' && line.listIndex !== undefined) {
			const numEl = document.createElementNS(SVG_NS, 'text')
			const resolved = resolveRunStyle({}, baseStyle)
			applyResolvedStyleToElement(numEl, resolved)
			numEl.setAttribute('x', String(bounds.x + baseStyle.fontSize * 0.2))
			numEl.setAttribute('y', String(line.runs[0]?.y ?? line.y))
			numEl.textContent = `${line.listIndex}.`
			groupEl.appendChild(numEl)
		}

		// Text element with tspan children
		const textEl = document.createElementNS(SVG_NS, 'text')

		for (const run of line.runs) {
			const resolved = resolveRunStyle(run.style, baseStyle)
			const tspan = document.createElementNS(SVG_NS, 'tspan')
			tspan.setAttribute('x', String(run.x))
			tspan.setAttribute('y', String(run.y))
			applyResolvedStyleToElement(tspan, resolved)
			tspan.textContent = run.text || '\u00A0'
			textEl.appendChild(tspan)
		}

		groupEl.appendChild(textEl)
	}

	return groupEl
}

/**
 * Apply resolved style to an SVG element
 */
function applyResolvedStyleToElement(el: SVGElement, resolved: ResolvedRunStyle): void {
	el.setAttribute('font-family', resolved.fontFamily)
	el.setAttribute('font-size', String(resolved.fontSize))
	el.setAttribute('font-weight', String(resolved.fontWeight))
	el.setAttribute('font-style', resolved.fontItalic ? 'italic' : 'normal')
	el.setAttribute('fill', resolved.color)

	const decorations: string[] = []
	if (resolved.underline) decorations.push('underline')
	if (resolved.strikethrough) decorations.push('line-through')
	if (decorations.length > 0) {
		el.setAttribute('text-decoration', decorations.join(' '))
	}

	if (resolved.letterSpacing && resolved.letterSpacing !== 0) {
		el.setAttribute('letter-spacing', String(resolved.letterSpacing))
	}
}

// vim: ts=4
