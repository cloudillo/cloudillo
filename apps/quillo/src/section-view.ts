// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * section-view - the `sec:<bid>` embed view: a heading line up to the line
 * before the next heading of the same or higher level (or the document end).
 */

import type Quill from 'quill'

import { BID_FORMAT } from './block-ids.js'

export interface Section {
	/** Document index of the heading line. */
	start: number
	/** Document index just past the section (exclusive). */
	end: number
	heading: string
}

function headerLevel(formats: Record<string, unknown>): number {
	return typeof formats.header === 'number' ? formats.header : 0
}

/** The section headed by the line with this `bid`; null if missing or not a heading. */
export function findSection(editor: Quill, bid: string): Section | null {
	const lines = editor.getLines()
	const i = lines.findIndex((line) => line.formats()[BID_FORMAT] === bid)
	if (i < 0) return null
	const level = headerLevel(lines[i].formats())
	if (!level) return null
	const start = editor.getIndex(lines[i])
	let end = editor.getLength()
	for (const line of lines.slice(i + 1)) {
		const l = headerLevel(line.formats())
		if (l && l <= level) {
			end = editor.getIndex(line)
			break
		}
	}
	return { start, end, heading: editor.getText(start, lines[i].length() - 1).trim() }
}

/**
 * Hide every top-level block outside `section` (`.cl-embed-hidden`); null shows
 * everything. Top-level blots, so a list or table is hidden whole, never in part.
 */
export function applySectionVisibility(editor: Quill, section: Section | null): void {
	let offset = 0
	editor.scroll.children.forEach((blot) => {
		const len = blot.length()
		const hidden = !!section && (offset + len <= section.start || offset >= section.end)
		;(blot.domNode as HTMLElement).classList.toggle('cl-embed-hidden', hidden)
		offset += len
	})
}

/**
 * `bid` of the nearest heading at or before the cursor (the last known selection,
 * so it still works after focus moved to a menu); null when there is none or that
 * heading has no id yet (legacy document opened read-only).
 */
export function currentSectionBid(editor: Quill): string | null {
	const { index } = editor.selection.savedRange
	let bid: string | null = null
	for (const line of editor.getLines()) {
		if (editor.getIndex(line) > index) break
		const formats = line.formats()
		if (headerLevel(formats)) {
			const b = formats[BID_FORMAT]
			bid = typeof b === 'string' ? b : null
		}
	}
	return bid
}

// vim: ts=4
