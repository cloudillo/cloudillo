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
 * Text measurement using Canvas API
 *
 * Provides accurate text measurement for layout calculations,
 * supporting per-run fonts and letter-spacing.
 */

import type { RichTextRunStyle, BaseTextStyle } from './types'

/** Resolved style for a single run — all values filled in */
export interface ResolvedRunStyle {
	fontFamily: string
	fontSize: number
	fontWeight: 'normal' | 'bold' | number
	fontItalic: boolean
	underline: boolean
	strikethrough: boolean
	color: string
	letterSpacing: number
	link?: string
}

// Lazily created canvas for measurement
let measureCanvas: HTMLCanvasElement | null = null
let measureCtx: CanvasRenderingContext2D | null = null

function getContext(): CanvasRenderingContext2D | null {
	if (!measureCtx) {
		if (typeof document === 'undefined') return null
		measureCanvas = document.createElement('canvas')
		measureCtx = measureCanvas.getContext('2d')
	}
	return measureCtx
}

/**
 * Resolve a run's style by merging Delta attributes onto the base style.
 * Attributes not set in the run inherit from the base.
 */
export function resolveRunStyle(
	runStyle: RichTextRunStyle,
	baseStyle: BaseTextStyle
): ResolvedRunStyle {
	const fontSize = runStyle.size ? parseFloat(runStyle.size) : baseStyle.fontSize

	return {
		fontFamily: runStyle.font || baseStyle.fontFamily,
		fontSize,
		fontWeight: runStyle.bold ? 'bold' : baseStyle.fontWeight,
		fontItalic: runStyle.italic ?? baseStyle.fontItalic,
		underline: runStyle.underline ?? baseStyle.textDecoration === 'underline',
		strikethrough: runStyle.strike ?? baseStyle.textDecoration === 'line-through',
		color: runStyle.color || baseStyle.fill,
		letterSpacing: baseStyle.letterSpacing,
		link: runStyle.link
	}
}

/**
 * Build CSS font string from resolved run style
 */
export function buildFontString(resolved: ResolvedRunStyle): string {
	const fontStyle = resolved.fontItalic ? 'italic' : 'normal'
	const fontWeight = resolved.fontWeight || 'normal'
	return `${fontStyle} ${fontWeight} ${resolved.fontSize}px ${resolved.fontFamily}`
}

/**
 * Measure the width of a text string with the given resolved style
 */
export function measureRunWidth(text: string, resolved: ResolvedRunStyle): number {
	const ctx = getContext()
	if (!ctx) {
		// Fallback: rough estimate (0.6 * fontSize per character)
		return text.length * resolved.fontSize * 0.6
	}

	ctx.font = buildFontString(resolved)

	if (resolved.letterSpacing && resolved.letterSpacing !== 0) {
		let width = 0
		for (const char of text) {
			width += ctx.measureText(char).width + resolved.letterSpacing
		}
		return width - resolved.letterSpacing
	}

	return ctx.measureText(text).width
}

/**
 * Measure text width with a base style (convenience for plain text)
 */
export function measureTextWidth(text: string, baseStyle: BaseTextStyle): number {
	return measureRunWidth(text, resolveRunStyle({}, baseStyle))
}

// vim: ts=4
