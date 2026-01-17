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
 * Bullets are rendered as SVG <path> elements for consistent PDF export.
 */

import type { ResolvedTextStyle } from '../crdt'
import type { Bounds, TextLayout, TextLineMetrics } from './types'
import { getBulletIcon, migrateBullet } from '../data/bullet-icons'

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
 * Result of text wrapping with paragraph boundary info
 */
interface WrapTextResult {
	lines: string[]
	isParagraphStart: boolean[] // true for lines that start a new paragraph
}

/**
 * Word-wrap text to fit within a given width
 * Returns an array of lines that fit the width constraint
 * Also returns which lines are paragraph starts (for bullet placement)
 * Preserves leading whitespace (indentation) on each line
 */
function wrapText(text: string, maxWidth: number, style: ResolvedTextStyle): WrapTextResult {
	const lines: string[] = []
	const isParagraphStart: boolean[] = []

	// Handle explicit line breaks first
	const paragraphs = text.split('\n')

	for (const paragraph of paragraphs) {
		if (paragraph === '') {
			lines.push('')
			isParagraphStart.push(true) // Empty line is still a paragraph start
			continue
		}

		// Detect and preserve leading whitespace (indentation)
		// Convert to non-breaking spaces to prevent collapsing in SVG/PDF
		const leadingMatch = paragraph.match(/^(\s*)/)
		const leadingWhitespace = leadingMatch ? leadingMatch[1].replace(/ /g, '\u00A0') : ''
		const contentPart = paragraph.slice(leadingMatch ? leadingMatch[1].length : 0)

		if (contentPart === '') {
			// Line with only whitespace - treat as empty for display
			lines.push('')
			isParagraphStart.push(true)
			continue
		}

		const words = contentPart.split(/\s+/).filter((w) => w !== '')
		if (words.length === 0) {
			lines.push('')
			isParagraphStart.push(true)
			continue
		}

		// First word gets the leading whitespace
		let currentLine = leadingWhitespace + words[0]
		let isFirstLineOfParagraph = true

		for (let i = 1; i < words.length; i++) {
			const word = words[i]
			const testLine = `${currentLine} ${word}`
			const testWidth = measureTextWidth(testLine, style)

			if (testWidth <= maxWidth || currentLine === leadingWhitespace + words[0]) {
				currentLine = testLine
			} else {
				lines.push(currentLine)
				isParagraphStart.push(isFirstLineOfParagraph)
				isFirstLineOfParagraph = false // Subsequent wrapped lines are not paragraph starts
				currentLine = word // Continuation lines don't get indentation
			}
		}

		if (currentLine) {
			lines.push(currentLine)
			isParagraphStart.push(isFirstLineOfParagraph)
		}
	}

	return { lines, isParagraphStart }
}

/**
 * Extended line metrics with bullet info
 */
interface TextLineMetricsWithBullet extends TextLineMetrics {
	hasBullet?: boolean
	bulletX?: number
	bulletY?: number
}

/**
 * Extended text layout with bullet info
 */
interface TextLayoutWithBullets extends TextLayout {
	lines: TextLineMetricsWithBullet[]
	bulletSize?: number
	bulletId?: string
}

/**
 * Calculate text layout with word wrapping and alignment
 * Now includes bullet positioning information
 */
export function calculateTextLayout(
	text: string,
	bounds: Bounds,
	style: ResolvedTextStyle
): TextLayoutWithBullets {
	const fontSize = style.fontSize || 64
	const lineHeight = style.lineHeight || 1.2
	const lineSpacing = fontSize * lineHeight
	const textAlign = style.textAlign || 'left'
	const verticalAlign = style.verticalAlign || 'top'

	// Migrate bullet ID if needed
	const bulletId = migrateBullet(style.listBullet)
	const bulletIcon = bulletId ? getBulletIcon(bulletId) : null

	// Calculate bullet dimensions (60% of font size for good visibility)
	const bulletSize = fontSize * 0.6
	const bulletGap = fontSize * 0.3
	const bulletIndent = bulletIcon ? bulletSize + bulletGap : 0

	// Adjust effective width for bullet space
	const effectiveWidth = bounds.width - bulletIndent

	// Word wrap the text and get paragraph boundary info
	const wrapResult = wrapText(text, effectiveWidth, style)
	const { lines: wrappedLines, isParagraphStart } = wrapResult

	// Use visual height for centering: (n-1) gaps between lines + fontSize for last line
	// This matches how CSS flexbox calculates vertical centering
	const totalHeight =
		wrappedLines.length > 0 ? (wrappedLines.length - 1) * lineSpacing + fontSize : 0

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

	// Calculate x position based on text alignment (accounting for bullet indent)
	let xBase: number
	switch (textAlign) {
		case 'center':
			xBase = bounds.x + bulletIndent + effectiveWidth / 2
			break
		case 'right':
			xBase = bounds.x + bounds.width
			break
		case 'left':
		default:
			xBase = bounds.x + bulletIndent
	}

	// Build line metrics
	// A line gets a bullet if:
	// 1. Bullet mode is enabled AND
	// 2. The line is non-empty AND
	// 3. It's a paragraph start (first line of a paragraph, not a wrapped continuation)
	const lines: TextLineMetricsWithBullet[] = wrappedLines.map((line, index) => {
		// Calculate y position (baseline)
		const y = bounds.y + yOffset + index * lineSpacing + fontSize * 0.8

		// Determine if this line should have a bullet
		const isNonEmpty = line.trim() !== ''
		const hasBullet = bulletIcon && isNonEmpty && isParagraphStart[index]

		const lineMetrics: TextLineMetricsWithBullet = {
			text: line,
			width: measureTextWidth(line, style),
			x: xBase,
			y
		}

		if (hasBullet) {
			lineMetrics.hasBullet = true
			// Measure leading whitespace (includes \u00A0 from wrapText conversion)
			// to position bullet correctly for indented lines
			const leadingMatch = line.match(/^([\s\u00A0]*)/)
			const leadingSpace = leadingMatch ? leadingMatch[1] : ''
			const leadingWidth = leadingSpace ? measureTextWidth(leadingSpace, style) : 0
			// Position bullet to the left of the text, accounting for indentation
			lineMetrics.bulletX = bounds.x + leadingWidth
			// Center bullet on x-height center (approx 0.25 * fontSize above baseline)
			// bulletY is TOP of bullet, bullet size is 0.6 * fontSize (so center at +0.3)
			// bulletY = baseline - 0.25 - 0.3 = baseline - 0.55
			lineMetrics.bulletY = y - fontSize * 0.55
		}

		return lineMetrics
	})

	return {
		lines,
		totalHeight,
		bulletSize: bulletIcon ? bulletSize : undefined,
		bulletId: bulletIcon ? bulletId : undefined
	}
}

/**
 * Generate SVG bullet path element
 */
function generateBulletSVG(
	bulletId: string,
	x: number,
	y: number,
	size: number,
	fill: string
): string {
	const icon = getBulletIcon(bulletId)
	if (!icon) return ''

	const [vbX, vbY, vbW, vbH] = icon.viewBox
	const scale = size / Math.max(vbW, vbH)

	// Create a group with transform for positioning and scaling
	return `<g transform="translate(${x}, ${y})">
		<svg width="${size}" height="${size}" viewBox="${vbX} ${vbY} ${vbW} ${vbH}">
			<path d="${escapeXML(icon.pathData)}" fill="${fill}"/>
		</svg>
	</g>`
}

/**
 * Generate SVG text element string for a text object
 * This creates native SVG text that can be converted to PDF
 */
export function generateSVGText(text: string, bounds: Bounds, style: ResolvedTextStyle): string {
	if (!text || text.trim() === '') {
		return ''
	}

	const layout = calculateTextLayout(text, bounds, style) as TextLayoutWithBullets
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

	// Generate bullet elements
	const bulletElements: string[] = []
	if (layout.bulletId && layout.bulletSize) {
		for (const line of layout.lines) {
			if (line.hasBullet && line.bulletX !== undefined && line.bulletY !== undefined) {
				bulletElements.push(
					generateBulletSVG(
						layout.bulletId,
						line.bulletX,
						line.bulletY,
						layout.bulletSize,
						fill
					)
				)
			}
		}
	}

	// Generate tspan elements for each line
	// Use non-breaking space (&#160;) for empty lines to ensure proper rendering in PDF
	const tspans = layout.lines
		.map(
			(line, index) =>
				`<tspan x="${line.x}" dy="${index === 0 ? 0 : fontSize * (style.lineHeight || 1.2)}">${line.text ? escapeXML(line.text) : '&#160;'}</tspan>`
		)
		.join('')

	// Build the text element
	const textElement = `<text
		font-family="${escapeXML(fontFamily)}"
		font-size="${fontSize}"
		font-weight="${fontWeight}"
		font-style="${fontStyle}"
		fill="${fill}"
		text-anchor="${textAnchor}"
		text-decoration="${textDecoration}"
		letter-spacing="${letterSpacing}"
	>${tspans}</text>`

	// Combine bullets and text in a group
	if (bulletElements.length > 0) {
		return `<g>${bulletElements.join('')}${textElement}</g>`
	}

	return textElement
}

/**
 * Create an SVG text DOM element for a text object
 * This creates a native SVG element that can be added to the document
 */
export function createSVGTextElement(
	text: string,
	bounds: Bounds,
	style: ResolvedTextStyle
): SVGGElement | SVGTextElement | null {
	if (!text || text.trim() === '') {
		return null
	}

	const layout = calculateTextLayout(text, bounds, style) as TextLayoutWithBullets
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

		// Use non-breaking space for empty lines to ensure proper rendering in PDF
		tspan.textContent = line.text || '\u00A0'
		textEl.appendChild(tspan)
	})

	// If we have bullets, wrap everything in a group
	if (layout.bulletId && layout.bulletSize) {
		const groupEl = document.createElementNS('http://www.w3.org/2000/svg', 'g')

		// Add bullet elements
		for (const line of layout.lines) {
			if (line.hasBullet && line.bulletX !== undefined && line.bulletY !== undefined) {
				const bulletEl = createBulletElement(
					layout.bulletId,
					line.bulletX,
					line.bulletY,
					layout.bulletSize,
					style.fill || '#333333'
				)
				if (bulletEl) {
					groupEl.appendChild(bulletEl)
				}
			}
		}

		// Add text element
		groupEl.appendChild(textEl)
		return groupEl
	}

	return textEl
}

/**
 * Create an SVG bullet DOM element
 */
function createBulletElement(
	bulletId: string,
	x: number,
	y: number,
	size: number,
	fill: string
): SVGGElement | null {
	const icon = getBulletIcon(bulletId)
	if (!icon) return null

	const [vbX, vbY, vbW, vbH] = icon.viewBox

	// Create group for positioning
	const groupEl = document.createElementNS('http://www.w3.org/2000/svg', 'g')
	groupEl.setAttribute('transform', `translate(${x}, ${y})`)

	// Create nested SVG for viewBox handling
	const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
	svgEl.setAttribute('width', String(size))
	svgEl.setAttribute('height', String(size))
	svgEl.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`)

	// Create path element
	const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path')
	pathEl.setAttribute('d', icon.pathData)
	pathEl.setAttribute('fill', fill)

	svgEl.appendChild(pathEl)
	groupEl.appendChild(svgEl)

	return groupEl
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
