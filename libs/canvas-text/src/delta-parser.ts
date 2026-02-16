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
 * Delta parser - converts Quill Delta operations to TextLine arrays
 *
 * Quill's Delta format stores text as a series of insert operations with optional
 * formatting attributes. Newlines may carry line-level attributes (e.g., list type).
 * This module parses Delta ops into structured TextLine arrays for layout and rendering.
 */

import type { DeltaOp, TextLine, TextRun, RichTextRunStyle, BaseTextStyle } from './types'

/**
 * Extract RichTextRunStyle from Delta attributes
 */
function extractRunStyle(attrs: Record<string, unknown> | undefined): RichTextRunStyle {
	if (!attrs) return {}

	const style: RichTextRunStyle = {}
	if (attrs.bold) style.bold = true
	if (attrs.italic) style.italic = true
	if (attrs.underline) style.underline = true
	if (attrs.strike) style.strike = true
	if (typeof attrs.font === 'string') style.font = attrs.font
	if (typeof attrs.size === 'string') style.size = attrs.size
	if (typeof attrs.color === 'string') style.color = attrs.color
	if (typeof attrs.link === 'string') style.link = attrs.link

	return style
}

/**
 * Extract line-level attributes from a newline's Delta attributes
 */
function extractLineAttrs(attrs: Record<string, unknown> | undefined): {
	listType?: 'bullet' | 'ordered'
} {
	if (!attrs) return {}

	const result: { listType?: 'bullet' | 'ordered' } = {}
	if (attrs.list === 'bullet') result.listType = 'bullet'
	else if (attrs.list === 'ordered') result.listType = 'ordered'

	return result
}

/**
 * Convert Delta operations to an array of TextLines.
 *
 * Quill Delta convention:
 * - Text runs are {insert: "text", attributes: {...}}
 * - Newlines split text into lines
 * - A newline with {attributes: {list: "bullet"}} marks its line as a list item
 * - The last op always ends with \n (Quill guarantee)
 */
export function deltaToLines(ops: DeltaOp[]): TextLine[] {
	if (!ops || ops.length === 0) {
		return [{ runs: [{ text: '', style: {} }] }]
	}

	const lines: TextLine[] = []
	let currentRuns: TextRun[] = []

	for (const op of ops) {
		if (typeof op.insert !== 'string') continue

		const style = extractRunStyle(op.attributes)
		const text = op.insert
		const parts = text.split('\n')

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i]

			// Add text run if non-empty
			if (part.length > 0) {
				currentRuns.push({ text: part, style })
			}

			// If this isn't the last part, we hit a \n — finalize this line
			if (i < parts.length - 1) {
				// Line-level attributes come from the newline character's attributes
				// In Quill, a \n at the end of an op that has list attributes marks the line
				const lineAttrs =
					i === parts.length - 2 && part.length === 0
						? extractLineAttrs(op.attributes)
						: i < parts.length - 1
							? extractLineAttrs(
									parts.slice(i + 1).join('').length === 0
										? op.attributes
										: undefined
								)
							: {}

				// Ensure at least one empty run per line for proper rendering
				if (currentRuns.length === 0) {
					currentRuns.push({ text: '', style: {} })
				}

				lines.push({
					runs: currentRuns,
					...lineAttrs
				})
				currentRuns = []
			}
		}
	}

	// If there are remaining runs (shouldn't happen with valid Quill Delta that ends with \n)
	if (currentRuns.length > 0) {
		lines.push({ runs: currentRuns })
	}

	// Ensure at least one line
	if (lines.length === 0) {
		lines.push({ runs: [{ text: '', style: {} }] })
	}

	return lines
}

/**
 * Convert Y.Text content to Delta ops.
 * Y.Text.toDelta() returns Delta-compatible operations.
 */
export function yTextToDelta(yText: { toDelta(): DeltaOp[] }): DeltaOp[] {
	return yText.toDelta()
}

/**
 * Convert plain text string to Delta ops (for migration from plain text)
 */
export function plainTextToDelta(text: string): DeltaOp[] {
	if (!text) return [{ insert: '\n' }]
	// Ensure text ends with newline (Quill convention)
	const normalized = text.endsWith('\n') ? text : text + '\n'
	return [{ insert: normalized }]
}

/**
 * Get plain text from Delta ops (for display/measurement fallback)
 */
export function deltaToPlainText(ops: DeltaOp[]): string {
	return ops
		.map((op) => (typeof op.insert === 'string' ? op.insert : ''))
		.join('')
		.replace(/\n$/, '') // Remove trailing newline
}

// vim: ts=4
