// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import Quill from 'quill'

import { importMarkdown } from '../import-markdown.js'

// jsdom has no Range#getBoundingClientRect; Quill's focus() scrolls the caret into view with it.
if (!Range.prototype.getBoundingClientRect) {
	Range.prototype.getBoundingClientRect = () => document.body.getBoundingClientRect()
}

describe('importMarkdown', () => {
	it('inserts at the cursor without deleting, and one undo reverts it', () => {
		const div = document.createElement('div')
		document.body.appendChild(div)
		const quill = new Quill(div, { modules: { history: { userOnly: true } } })

		quill.setText('First\nSecond\n', 'user')
		quill.history.cutoff()
		const before = quill.getContents()
		quill.setSelection(6, 0, 'silent') // start of "Second"

		importMarkdown(quill, '# Title\n\nbody', 'user')

		const text = quill.getText()
		expect(text.startsWith('First\nTitle\n')).toBe(true)
		expect(text).toContain('body')
		expect(text).toContain('Second')
		expect(quill.getFormat(6, 1).header).toBe(1)

		quill.history.undo()
		expect(quill.getContents()).toEqual(before)
	})

	it("'user' inserts at the last cursor position after the editor lost focus", () => {
		const div = document.createElement('div')
		document.body.appendChild(div)
		const quill = new Quill(div)
		quill.setText('First\nSecond\n', 'user')
		quill.setSelection(6, 0, 'user') // start of "Second"
		quill.blur()

		importMarkdown(quill, 'body', 'user')

		expect(quill.getText()).toBe('First\nbodySecond\n')
	})

	it("'api' replaces the existing content", () => {
		const div = document.createElement('div')
		document.body.appendChild(div)
		const quill = new Quill(div)
		quill.setText('Old text\n', 'user')

		importMarkdown(quill, '# Title', 'api')

		expect(quill.getText().trim()).toBe('Title')
		expect(quill.getFormat(0, 1).header).toBe(1)
	})
})

// vim: ts=4
