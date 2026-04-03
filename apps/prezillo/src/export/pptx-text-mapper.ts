// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Converts Quill delta (from Y.Text) to PptxGenJS text runs
 */

import type PptxGenJS from 'pptxgenjs'
import type { DeltaOp } from '@cloudillo/canvas-text'
import { hexToColor } from './pptx-style-mapper'

/**
 * Convert Quill delta operations to PptxGenJS TextProps array
 *
 * Each delta op becomes one or more text runs. Line breaks (\n) create
 * new paragraphs via `breakLine: true`.
 */
export function deltaToTextProps(delta: DeltaOp[]): PptxGenJS.TextProps[] {
	const runs: PptxGenJS.TextProps[] = []

	for (const op of delta) {
		if (typeof op.insert !== 'string') continue

		const text = op.insert
		const attrs = op.attributes || {}

		// Split on newlines to handle paragraph breaks
		const segments = text.split('\n')

		for (let i = 0; i < segments.length; i++) {
			const segment = segments[i]

			// Add the text run (if non-empty)
			if (segment.length > 0) {
				const runOpts: Partial<PptxGenJS.TextPropsOptions> = {}

				// Bold
				if (attrs.bold) {
					runOpts.bold = true
				}

				// Italic
				if (attrs.italic) {
					runOpts.italic = true
				}

				// Underline
				if (attrs.underline) {
					runOpts.underline = { style: 'sng' }
				}

				// Strikethrough
				if (attrs.strike) {
					runOpts.strike = 'sngStrike'
				}

				// Font family override
				if (attrs.font && typeof attrs.font === 'string') {
					runOpts.fontFace = attrs.font
				}

				// Font size override (Quill uses px-like units)
				if (attrs.size && typeof attrs.size === 'string') {
					const px = parseFloat(attrs.size)
					if (!Number.isNaN(px)) {
						runOpts.fontSize = Math.round(px * 0.75) // px to pt
					}
				}

				// Color override
				if (attrs.color && typeof attrs.color === 'string') {
					runOpts.color = hexToColor(attrs.color)
				}

				// Background highlight
				if (attrs.background && typeof attrs.background === 'string') {
					runOpts.highlight = hexToColor(attrs.background)
				}

				// Link
				if (attrs.link && typeof attrs.link === 'string') {
					runOpts.hyperlink = { url: attrs.link }
				}

				// Alignment (paragraph-level in Quill, applied per run in PptxGenJS)
				if (attrs.align && typeof attrs.align === 'string') {
					runOpts.align = attrs.align as PptxGenJS.HAlign
				}

				// List bullets
				if (attrs.list === 'bullet') {
					runOpts.bullet = true
				} else if (attrs.list === 'ordered') {
					runOpts.bullet = { type: 'number' }
				}

				runs.push({
					text: segment,
					options: Object.keys(runOpts).length > 0 ? runOpts : undefined
				})
			}

			// Add line break between segments (not after the last one)
			if (i < segments.length - 1) {
				runs.push({ text: '', options: { breakLine: true } })
			}
		}
	}

	// If no runs were generated, add empty text
	if (runs.length === 0) {
		runs.push({ text: '' })
	}

	return runs
}

// vim: ts=4
