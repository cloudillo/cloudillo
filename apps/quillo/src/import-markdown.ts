// This file is part of the Cloudillo Platform.
// Copyright (C) 2026  Szilárd Hajba
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
