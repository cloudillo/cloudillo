// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { stripFrontMatter } from '@cloudillo/core'
import { marked } from 'marked'
import type Quill from 'quill'
import Delta from 'quill-delta'

marked.use({ async: false })

/**
 * Converts Markdown to Quill content. With source `'api'` (shell import into a
 * fresh document) it replaces the whole document and leaves no undo step. With
 * `'user'` it inserts at the last cursor position (the saved range, since the
 * file dialog took focus), deleting nothing, as its own undo step (history is
 * `userOnly`, and it is bracketed by cutoffs so it merges with neither the
 * typing before nor after), and puts the caret after the inserted content.
 */
export function importMarkdown(quill: Quill, markdown: string, source: 'user' | 'api'): void {
	const html = marked.parse(stripFrontMatter(markdown)) as string
	const delta = quill.clipboard.convert({ html })
	// Trim the trailing newline that clipboard.convert always appends,
	// otherwise each import adds an extra blank line at the end.
	const ops = delta.ops ?? []
	if (ops.length > 0) {
		const last = ops[ops.length - 1]
		if (typeof last.insert === 'string' && last.insert.endsWith('\n') && !last.attributes) {
			last.insert = last.insert.slice(0, -1)
			if (last.insert === '') ops.pop()
		}
	}
	const insert = new Delta(ops)
	// setContents drops table cell content, so use updateContents instead
	// (updateContents is the same path that insertTable uses)
	if (source === 'api') {
		quill.updateContents(new Delta().delete(quill.getLength() - 1).concat(insert), 'api')
		return
	}
	const index = Math.min(quill.selection.savedRange.index, quill.getLength() - 1)
	quill.history.cutoff()
	quill.updateContents(new Delta().retain(index).concat(insert), source)
	quill.history.cutoff()
	quill.setSelection(index + insert.length(), 'silent')
}

// vim: ts=4
