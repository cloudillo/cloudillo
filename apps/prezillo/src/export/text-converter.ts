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
 * Text converter - converts foreignObject text to native SVG text elements
 *
 * This module handles the conversion of HTML-based text (used for word wrapping)
 * to native SVG <text> elements with <tspan> for multi-line support.
 */

import type { ResolvedTextStyle } from '../crdt'
import type { Bounds, TextLayout, TextLineMetrics } from './types'

/**
 * Map text alignment to SVG text-anchor attribute
 */
const TEXT_ANCHOR_MAP: Record<string, string> = {
	left: 'start',
	center: 'middle',
	right: 'end'
}

/**
 * Measure text width using Canvas API
 * This creates a temporary canvas to accurately measure text dimensions
 */
function measureTextWidth(text: string, style: ResolvedTextStyle): number {
	const canvas = document.createElement('canvas')
	const ctx = canvas.getContext('2d')
	if (!ctx) return 0

	// Build font string matching CSS font shorthand
	const fontStyle = style.fontItalic ? 'italic' : 'normal'
	const fontWeight = style.fontWeight || 'normal'
	const fontSize = style.fontSize || 64
	const fontFamily = style.fontFamily || 'system-ui, sans-serif'

	ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`

	// Apply letter spacing if set
	if (style.letterSpacing && style.letterSpacing !== 0) {
		// Canvas doesn't support letter-spacing directly, so we measure char by char
		let width = 0
		for (const char of text) {
			width += ctx.measureText(char).width + style.letterSpacing
		}
		return width - style.letterSpacing // Remove extra spacing after last char
	}

	return ctx.measureText(text).width
}

/**
 * Word-wrap text to fit within a given width
 * Returns an array of lines that fit the width constraint
 */
function wrapText(text: string, maxWidth: number, style: ResolvedTextStyle): string[] {
	const lines: string[] = []

	// Handle explicit line breaks first
	const paragraphs = text.split('\n')

	for (const paragraph of paragraphs) {
		if (paragraph === '') {
			lines.push('')
			continue
		}

		const words = paragraph.split(/\s+/)
		let currentLine = ''

		for (const word of words) {
			const testLine = currentLine ? `${currentLine} ${word}` : word
			const testWidth = measureTextWidth(testLine, style)

			if (testWidth <= maxWidth || currentLine === '') {
				currentLine = testLine
			} else {
				lines.push(currentLine)
				currentLine = word
			}
		}

		if (currentLine) {
			lines.push(currentLine)
		}
	}

	return lines
}

/**
 * Calculate text layout with word wrapping and alignment
 */
export function calculateTextLayout(
	text: string,
	bounds: Bounds,
	style: ResolvedTextStyle
): TextLayout {
	const fontSize = style.fontSize || 64
	const lineHeight = style.lineHeight || 1.2
	const lineSpacing = fontSize * lineHeight
	const textAlign = style.textAlign || 'left'
	const verticalAlign = style.verticalAlign || 'top'

	// Apply list bullets if set
	const displayText = style.listBullet
		? text
				.split('\n')
				.map((line) => `${style.listBullet} ${line}`)
				.join('\n')
		: text

	// Word wrap the text
	const wrappedLines = wrapText(displayText, bounds.width, style)
	const totalHeight = wrappedLines.length * lineSpacing

	// Calculate vertical offset based on vertical alignment
	let yOffset: number
	switch (verticalAlign) {
		case 'middle':
			yOffset = (bounds.height - totalHeight) / 2
			break
		case 'bottom':
			yOffset = bounds.height - totalHeight
			break
		case 'top':
		default:
			yOffset = 0
	}

	// Calculate x position based on text alignment
	let xBase: number
	switch (textAlign) {
		case 'center':
			xBase = bounds.x + bounds.width / 2
			break
		case 'right':
			xBase = bounds.x + bounds.width
			break
		case 'left':
		default:
			xBase = bounds.x
	}

	// Build line metrics
	const lines: TextLineMetrics[] = wrappedLines.map((line, index) => ({
		text: line,
		width: measureTextWidth(line, style),
		x: xBase,
		// SVG text y is baseline position, add ascent approximation (~0.8 of fontSize)
		y: bounds.y + yOffset + index * lineSpacing + fontSize * 0.8
	}))

	return { lines, totalHeight }
}

/**
 * Generate SVG text element string for a text object
 * This creates native SVG text that can be converted to PDF
 */
export function generateSVGText(text: string, bounds: Bounds, style: ResolvedTextStyle): string {
	if (!text || text.trim() === '') {
		return ''
	}

	const layout = calculateTextLayout(text, bounds, style)
	const textAnchor = TEXT_ANCHOR_MAP[style.textAlign || 'left'] || 'start'

	// Build style attributes
	const fontFamily = style.fontFamily || 'system-ui, sans-serif'
	const fontSize = style.fontSize || 64
	const fontWeight = style.fontWeight || 'normal'
	const fontStyle = style.fontItalic ? 'italic' : 'normal'
	const fill = style.fill || '#333333'
	const letterSpacing = style.letterSpacing || 0

	// Build text-decoration
	let textDecoration = 'none'
	if (style.textDecoration) {
		const decorations: string[] = []
		if (style.textDecoration.includes('underline')) decorations.push('underline')
		if (style.textDecoration.includes('line-through')) decorations.push('line-through')
		if (decorations.length > 0) textDecoration = decorations.join(' ')
	}

	// Generate tspan elements for each line
	const tspans = layout.lines
		.map(
			(line, index) =>
				`<tspan x="${line.x}" dy="${index === 0 ? 0 : fontSize * (style.lineHeight || 1.2)}">${escapeXML(line.text)}</tspan>`
		)
		.join('')

	// Build the text element
	return `<text
		font-family="${escapeXML(fontFamily)}"
		font-size="${fontSize}"
		font-weight="${fontWeight}"
		font-style="${fontStyle}"
		fill="${fill}"
		text-anchor="${textAnchor}"
		text-decoration="${textDecoration}"
		letter-spacing="${letterSpacing}"
	>${tspans}</text>`
}

/**
 * Create an SVG text DOM element for a text object
 * This creates a native SVG element that can be added to the document
 */
export function createSVGTextElement(
	text: string,
	bounds: Bounds,
	style: ResolvedTextStyle
): SVGTextElement | null {
	if (!text || text.trim() === '') {
		return null
	}

	const layout = calculateTextLayout(text, bounds, style)
	const textAnchor = TEXT_ANCHOR_MAP[style.textAlign || 'left'] || 'start'

	// Create text element
	const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text')

	// Apply style attributes
	textEl.setAttribute('font-family', style.fontFamily || 'system-ui, sans-serif')
	textEl.setAttribute('font-size', String(style.fontSize || 64))
	textEl.setAttribute('font-weight', String(style.fontWeight || 'normal'))
	textEl.setAttribute('font-style', style.fontItalic ? 'italic' : 'normal')
	textEl.setAttribute('fill', style.fill || '#333333')
	textEl.setAttribute('text-anchor', textAnchor)

	if (style.letterSpacing && style.letterSpacing !== 0) {
		textEl.setAttribute('letter-spacing', String(style.letterSpacing))
	}

	// Handle text decoration
	if (style.textDecoration) {
		const decorations: string[] = []
		if (style.textDecoration.includes('underline')) decorations.push('underline')
		if (style.textDecoration.includes('line-through')) decorations.push('line-through')
		if (decorations.length > 0) {
			textEl.setAttribute('text-decoration', decorations.join(' '))
		}
	}

	// Create tspan elements for each line
	const fontSize = style.fontSize || 64
	const lineHeight = style.lineHeight || 1.2

	layout.lines.forEach((line, index) => {
		const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')
		tspan.setAttribute('x', String(line.x))

		if (index === 0) {
			// First line: position at calculated y
			tspan.setAttribute('y', String(line.y))
		} else {
			// Subsequent lines: use dy for relative positioning
			tspan.setAttribute('dy', String(fontSize * lineHeight))
		}

		tspan.textContent = line.text
		textEl.appendChild(tspan)
	})

	return textEl
}

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

// vim: ts=4
