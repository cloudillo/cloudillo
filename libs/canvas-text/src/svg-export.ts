// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * SVG export for rich text
 *
 * Generates native SVG <text> elements with <tspan> children for each run.
 * This produces SVG that can be converted to PDF via svg2pdf.js.
 */

import type { DeltaOp, TextBounds, BaseTextStyle } from './types'
import { deltaToLines } from './delta-parser'
import { calculateRichTextLayout } from './layout'
import { resolveRunStyle, buildFontString, type ResolvedRunStyle } from './measure'

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Escape special XML characters
 */
function escapeXML(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
}

/**
 * Build SVG style attributes for a resolved run
 */
function runStyleToSVGAttrs(resolved: ResolvedRunStyle): string {
	const attrs: string[] = []
	attrs.push(`font-family="${escapeXML(resolved.fontFamily)}"`)
	attrs.push(`font-size="${resolved.fontSize}"`)
	attrs.push(`font-weight="${resolved.fontWeight}"`)
	attrs.push(`font-style="${resolved.fontItalic ? 'italic' : 'normal'}"`)
	attrs.push(`fill="${resolved.color}"`)

	// Text decoration
	const decorations: string[] = []
	if (resolved.underline) decorations.push('underline')
	if (resolved.strikethrough) decorations.push('line-through')
	if (decorations.length > 0) {
		attrs.push(`text-decoration="${decorations.join(' ')}"`)
	}

	if (resolved.letterSpacing && resolved.letterSpacing !== 0) {
		attrs.push(`letter-spacing="${resolved.letterSpacing}"`)
	}

	return attrs.join(' ')
}

/**
 * Generate SVG text string for rich text content
 */
export function richTextToSVG(
	delta: DeltaOp[],
	bounds: TextBounds,
	baseStyle: BaseTextStyle
): string {
	const lines = deltaToLines(delta)
	const layout = calculateRichTextLayout(lines, bounds, baseStyle)

	if (layout.lines.length === 0) return ''

	const elements: string[] = []

	for (const line of layout.lines) {
		if (line.runs.length === 0) continue

		// Build list marker if needed
		if (line.listType === 'bullet') {
			const bulletSize = baseStyle.fontSize * 0.3
			const bulletY = line.y + line.height * 0.5
			const bulletX = bounds.x + baseStyle.fontSize * 0.5
			elements.push(
				`<circle cx="${bulletX}" cy="${bulletY}" r="${bulletSize}" fill="${baseStyle.fill}"/>`
			)
		} else if (line.listType === 'ordered' && line.listIndex !== undefined) {
			const numText = `${line.listIndex}.`
			const resolved = resolveRunStyle({}, baseStyle)
			elements.push(
				`<text ${runStyleToSVGAttrs(resolved)} x="${bounds.x + baseStyle.fontSize * 0.2}" y="${line.runs[0]?.y ?? line.y}">${numText}</text>`
			)
		}

		// Each line is a <text> with <tspan> children
		const tspans = line.runs
			.map((run) => {
				const resolved = resolveRunStyle(run.style, baseStyle)
				const text = run.text || '\u00A0'
				return `<tspan x="${run.x}" y="${run.y}" ${runStyleToSVGAttrs(resolved)}>${escapeXML(text)}</tspan>`
			})
			.join('')

		// Wrap in a text element (no global attrs since each tspan has its own)
		elements.push(`<text>${tspans}</text>`)
	}

	return `<g>${elements.join('')}</g>`
}

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
