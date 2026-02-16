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
 * Layout engine for rich text
 *
 * Performs word wrapping with mixed font sizes, computing positioned runs
 * and lines for rendering. Supports horizontal/vertical alignment and list indentation.
 */

import type {
	TextLine,
	TextRun,
	TextBounds,
	BaseTextStyle,
	PositionedRun,
	PositionedLine,
	RichTextLayout
} from './types'
import { resolveRunStyle, measureRunWidth, type ResolvedRunStyle } from './measure'

/** Bullet/list indent width as a factor of base font size */
const LIST_INDENT_FACTOR = 1.5

/**
 * Break a single TextLine into wrapped lines that fit within maxWidth.
 * Each line retains run-level formatting.
 */
function wrapLine(line: TextLine, maxWidth: number, baseStyle: BaseTextStyle): TextLine[] {
	// Calculate total text content to check if wrapping is needed
	const fullText = line.runs.map((r) => r.text).join('')
	if (fullText === '') {
		return [line]
	}

	const result: TextLine[] = []
	let currentRuns: TextRun[] = []
	let currentWidth = 0
	let isFirstLine = true

	for (const run of line.runs) {
		const resolved = resolveRunStyle(run.style, baseStyle)
		const words = run.text.split(/( +)/) // Split keeping spaces

		for (const word of words) {
			if (word === '') continue

			const wordWidth = measureRunWidth(word, resolved)

			// Check if adding this word exceeds the line width
			if (
				currentWidth + wordWidth > maxWidth &&
				currentRuns.length > 0 &&
				word.trim() !== ''
			) {
				// Finalize current line
				result.push({
					runs: currentRuns,
					// Only first wrapped line gets the list attributes
					listType: isFirstLine ? line.listType : undefined,
					listIndex: isFirstLine ? line.listIndex : undefined
				})
				isFirstLine = false
				currentRuns = []
				currentWidth = 0

				// Skip leading spaces on new line
				if (word.trim() === '') continue
			}

			// Add word to current line
			if (currentRuns.length > 0) {
				const lastRun = currentRuns[currentRuns.length - 1]
				if (JSON.stringify(lastRun.style) === JSON.stringify(run.style)) {
					// Same style — merge into last run
					lastRun.text += word
				} else {
					currentRuns.push({ text: word, style: run.style })
				}
			} else {
				currentRuns.push({ text: word, style: run.style })
			}
			currentWidth += wordWidth
		}
	}

	// Remaining runs
	if (currentRuns.length > 0) {
		result.push({
			runs: currentRuns,
			listType: isFirstLine ? line.listType : undefined,
			listIndex: isFirstLine ? line.listIndex : undefined
		})
	}

	if (result.length === 0) {
		result.push(line)
	}

	return result
}

/**
 * Calculate the complete layout for rich text content.
 *
 * @param lines - Parsed text lines from deltaToLines()
 * @param bounds - The bounding box for the text
 * @param baseStyle - Object-level default text style
 * @returns Positioned layout ready for rendering
 */
export function calculateRichTextLayout(
	lines: TextLine[],
	bounds: TextBounds,
	baseStyle: BaseTextStyle
): RichTextLayout {
	const listIndent = baseStyle.fontSize * LIST_INDENT_FACTOR
	const hasLists = lines.some((l) => l.listType)

	// Apply list indent to effective width
	const effectiveWidth = hasLists ? bounds.width - listIndent : bounds.width

	// Word-wrap all lines
	const wrappedLines: TextLine[] = []
	let orderedIndex = 0
	for (const line of lines) {
		// Track ordered list numbering
		if (line.listType === 'ordered') {
			orderedIndex++
			line.listIndex = orderedIndex
		} else if (line.listType !== 'bullet') {
			orderedIndex = 0
		}

		const wrapped = wrapLine(line, effectiveWidth, baseStyle)
		wrappedLines.push(...wrapped)
	}

	// Calculate line heights (max font size in each line * lineHeight)
	const lineMetrics: { height: number; maxFontSize: number }[] = wrappedLines.map((line) => {
		let maxFontSize = baseStyle.fontSize
		for (const run of line.runs) {
			const resolved = resolveRunStyle(run.style, baseStyle)
			if (resolved.fontSize > maxFontSize) {
				maxFontSize = resolved.fontSize
			}
		}
		return {
			height: maxFontSize * baseStyle.lineHeight,
			maxFontSize
		}
	})

	// Calculate total height
	const totalHeight = lineMetrics.reduce((sum, m) => sum + m.height, 0)

	// Vertical alignment offset
	let yOffset: number
	switch (baseStyle.verticalAlign) {
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

	// Position each line
	const positionedLines: PositionedLine[] = []
	let currentY = bounds.y + yOffset

	for (let i = 0; i < wrappedLines.length; i++) {
		const line = wrappedLines[i]
		const metrics = lineMetrics[i]
		const isListItem = line.listType !== undefined
		const indent = (hasLists ? listIndent : 0) + (isListItem ? 0 : 0)

		// Calculate line width for alignment
		let lineWidth = 0
		const positionedRuns: PositionedRun[] = []

		for (const run of line.runs) {
			const resolved = resolveRunStyle(run.style, baseStyle)
			const width = measureRunWidth(run.text, resolved)
			positionedRuns.push({
				text: run.text,
				style: run.style,
				x: 0, // Will be adjusted for alignment below
				y: currentY + metrics.maxFontSize * 0.8, // Baseline position
				width
			})
			lineWidth += width
		}

		// Horizontal alignment
		let xStart: number
		switch (baseStyle.textAlign) {
			case 'center':
				xStart = bounds.x + indent + (effectiveWidth - lineWidth) / 2
				break
			case 'right':
				xStart = bounds.x + indent + effectiveWidth - lineWidth
				break
			case 'left':
			default:
				xStart = bounds.x + indent
		}

		// Assign x positions
		let runX = xStart
		for (const run of positionedRuns) {
			run.x = runX
			runX += run.width
		}

		positionedLines.push({
			runs: positionedRuns,
			y: currentY,
			height: metrics.height,
			lineWidth,
			listType: line.listType,
			listIndex: line.listIndex
		})

		currentY += metrics.height
	}

	return {
		lines: positionedLines,
		totalHeight
	}
}

// vim: ts=4
