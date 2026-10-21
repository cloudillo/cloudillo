// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

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
	baseStyle: BaseTextStyle,
	bulletIcon?: { pathData: string; viewBox: [number, number, number, number] }
): SVGGElement | null {
	const lines = deltaToLines(delta)
	const layout = calculateRichTextLayout(lines, bounds, baseStyle)

	if (layout.lines.length === 0) return null

	const groupEl = document.createElementNS(SVG_NS, 'g')

	for (const line of layout.lines) {
		if (line.runs.length === 0) continue

		// List marker: inline, 0.3em before the text (matches .rt-list-bullet::before)
		const fs = baseStyle.fontSize
		const gap = fs * 0.3
		const textX = line.runs[0].x
		const baselineY = line.runs[0].y
		if (line.listType === 'bullet') {
			if (bulletIcon) {
				const size = fs * 0.5
				const [vx, vy, vw] = bulletIcon.viewBox
				const k = size / vw
				const path = document.createElementNS(SVG_NS, 'path')
				path.setAttribute('d', bulletIcon.pathData)
				path.setAttribute(
					'transform',
					`translate(${textX - gap - size - vx * k} ${baselineY - fs * 0.3 - size / 2 - vy * k}) scale(${k})`
				)
				path.setAttribute('fill', baseStyle.fill)
				groupEl.appendChild(path)
			} else {
				const r = fs * 0.15
				const circle = document.createElementNS(SVG_NS, 'circle')
				circle.setAttribute('cx', String(textX - gap - r))
				circle.setAttribute('cy', String(baselineY - fs * 0.3))
				circle.setAttribute('r', String(r))
				circle.setAttribute('fill', baseStyle.fill)
				groupEl.appendChild(circle)
			}
		} else if (line.listType === 'ordered' && line.listIndex !== undefined) {
			const numEl = document.createElementNS(SVG_NS, 'text')
			const resolved = resolveRunStyle({}, baseStyle)
			applyResolvedStyleToElement(numEl, resolved)
			numEl.setAttribute('text-anchor', 'end')
			numEl.setAttribute('x', String(textX - gap))
			numEl.setAttribute('y', String(baselineY))
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
			// Characters XML forbids would make the serialized SVG unparseable
			tspan.textContent =
				// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point
				run.text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, ' ') ||
				'\u00A0'
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
