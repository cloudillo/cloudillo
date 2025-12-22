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
 * Text auto-scaling utilities for sticky notes
 * Calculates optimal font size to fit text within a container
 */

// Constants
export const MIN_FONT_SIZE = 12 // Accessibility minimum
export const MAX_FONT_SIZE = 24
export const DEFAULT_FONT_SIZE = 18
export const DEFAULT_LINE_HEIGHT = 1.4
export const DEFAULT_PADDING = 16

// Measurement element cache
let measureElement: HTMLDivElement | null = null

/**
 * Get or create the measurement element
 * Uses a hidden offscreen div for text measurement
 */
function getMeasureElement(): HTMLDivElement {
	if (!measureElement) {
		measureElement = document.createElement('div')
		measureElement.style.cssText = `
			position: fixed;
			top: -9999px;
			left: -9999px;
			visibility: hidden;
			pointer-events: none;
			white-space: pre-wrap;
			overflow-wrap: break-word;
			font-family: system-ui, -apple-system, sans-serif;
		`
		document.body.appendChild(measureElement)
	}
	return measureElement
}

/**
 * Measure text dimensions at a given font size
 */
function measureText(
	text: string,
	fontSize: number,
	maxWidth: number,
	lineHeight: number
): { width: number; height: number } {
	const el = getMeasureElement()
	el.style.fontSize = `${fontSize}px`
	el.style.lineHeight = `${lineHeight}`
	el.style.width = `${maxWidth}px`
	el.textContent = text || ' ' // Use space if empty to get minimum height

	return {
		width: el.scrollWidth,
		height: el.scrollHeight
	}
}

/**
 * Calculate the optimal font size for text to fit within a container
 *
 * Uses binary search to efficiently find the largest font size
 * that allows the text to fit within the container.
 *
 * @param text - The text content to measure
 * @param containerWidth - Container width in pixels
 * @param containerHeight - Container height in pixels
 * @param options - Optional configuration
 * @returns The optimal font size in pixels
 */
export function calculateOptimalFontSize(
	text: string,
	containerWidth: number,
	containerHeight: number,
	options: {
		padding?: number
		minFontSize?: number
		maxFontSize?: number
		lineHeight?: number
	} = {}
): number {
	const {
		padding = DEFAULT_PADDING,
		minFontSize = MIN_FONT_SIZE,
		maxFontSize = MAX_FONT_SIZE,
		lineHeight = DEFAULT_LINE_HEIGHT
	} = options

	// Handle empty text - return max font size
	if (!text || text.trim() === '') {
		return maxFontSize
	}

	const availableWidth = containerWidth - padding * 2
	const availableHeight = containerHeight - padding * 2

	// Binary search for optimal font size
	let low = minFontSize
	let high = maxFontSize
	let result = minFontSize

	while (low <= high) {
		const mid = Math.floor((low + high) / 2)
		const { height } = measureText(text, mid, availableWidth, lineHeight)

		if (height <= availableHeight) {
			result = mid
			low = mid + 1
		} else {
			high = mid - 1
		}
	}

	return result
}

/**
 * Hook-friendly memoized font size calculator
 * Returns a stable function reference that can be used in useEffect deps
 */
export function createFontSizeCalculator(
	options: {
		padding?: number
		minFontSize?: number
		maxFontSize?: number
		lineHeight?: number
	} = {}
) {
	return (text: string, width: number, height: number) =>
		calculateOptimalFontSize(text, width, height, options)
}

/**
 * Cleanup the measurement element (call on unmount if needed)
 */
export function cleanupMeasureElement(): void {
	if (measureElement && measureElement.parentNode) {
		measureElement.parentNode.removeChild(measureElement)
		measureElement = null
	}
}

// vim: ts=4
