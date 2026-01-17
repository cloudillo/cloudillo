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
 * Text measurement utilities for auto-sizing text boxes
 */

import type { ResolvedTextStyle } from '../crdt'
import { getBulletIcon, migrateBullet } from '../data/bullet-icons'

// Cached measurement element to avoid repeated DOM creation
let measureElement: HTMLDivElement | null = null

/**
 * Get or create the measurement element
 * Uses a hidden div with matching text styles to measure text height
 */
function getMeasureElement(): HTMLDivElement {
	if (!measureElement) {
		measureElement = document.createElement('div')
		measureElement.style.position = 'absolute'
		measureElement.style.visibility = 'hidden'
		measureElement.style.left = '-9999px'
		measureElement.style.top = '-9999px'
		measureElement.style.whiteSpace = 'pre-wrap'
		measureElement.style.wordWrap = 'break-word'
		measureElement.style.overflowWrap = 'break-word'
		document.body.appendChild(measureElement)
	}
	return measureElement
}

/**
 * Calculate the bullet indent width (bullet size + gap)
 */
function getBulletIndent(textStyle: ResolvedTextStyle): number {
	const bulletId = migrateBullet(textStyle.listBullet)
	if (!bulletId || !getBulletIcon(bulletId)) return 0

	const bulletSize = textStyle.fontSize * 0.6
	const bulletGap = textStyle.fontSize * 0.3
	return bulletSize + bulletGap
}

/**
 * Measure the height required to render text with given styles and width
 *
 * @param text - The text content to measure
 * @param width - The width constraint (in pixels)
 * @param textStyle - The text style properties
 * @returns The required height in pixels
 */
export function measureTextHeight(
	text: string,
	width: number,
	textStyle: ResolvedTextStyle
): number {
	const element = getMeasureElement()

	// Calculate effective width accounting for bullet indent
	const bulletIndent = getBulletIndent(textStyle)
	const effectiveWidth = width - bulletIndent

	// Apply text styles to match WrappedText rendering
	element.style.width = `${effectiveWidth}px`
	element.style.fontFamily = textStyle.fontFamily
	element.style.fontSize = `${textStyle.fontSize}px`
	element.style.fontWeight = String(textStyle.fontWeight)
	element.style.fontStyle = textStyle.fontItalic ? 'italic' : 'normal'
	element.style.lineHeight = String(textStyle.lineHeight)
	element.style.letterSpacing = `${textStyle.letterSpacing}px`

	// No longer prepend bullet characters - they're rendered as separate SVG elements
	// Just use the text content as-is
	element.textContent = text || ' ' // Use space for empty text to get minimum line height

	return element.offsetHeight
}

// vim: ts=4
