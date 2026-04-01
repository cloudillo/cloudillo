// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import MarkdownIt from 'markdown-it'
import Delta from 'quill-delta'
import type Quill from 'quill'

const md = new MarkdownIt({ html: false, linkify: true })

export function importMarkdown(quill: Quill, markdown: string): void {
	const html = md.render(markdown)
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
	// setContents drops table cell content, so use delete + updateContents instead
	// (updateContents is the same path that insertTable uses)
	const length = quill.getLength()
	quill.updateContents(new Delta().delete(length - 1).concat(new Delta(ops)), 'api')
}

// vim: ts=4
