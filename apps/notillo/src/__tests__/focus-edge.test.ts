// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { jest } from '@jest/globals'

import { focusDocumentEdge } from '../editor/focus-edge.js'
import type { NotilloEditor } from '../editor/schema.js'

interface FakeBlock {
	id: string
	type?: string
	props?: Record<string, unknown>
	content?: unknown[]
	children: FakeBlock[]
}

const text = (id: string, children: FakeBlock[] = []): FakeBlock => ({
	id,
	props: {},
	content: [],
	children
})
const image = (id: string): FakeBlock => ({ id, content: undefined, children: [] })

function fakeEditor(document: FakeBlock[]) {
	const inserted = { id: 'inserted', content: [] }
	const editor = {
		document,
		insertBlocks: jest.fn(() => [inserted]),
		setTextCursorPosition: jest.fn(),
		focus: jest.fn()
	}
	return {
		editor,
		inserted,
		run: (edge: 'start' | 'end') => focusDocumentEdge(editor as unknown as NotilloEditor, edge)
	}
}

describe('focusDocumentEdge', () => {
	it.each([
		['start', 'a'],
		['end', 'b']
	] as const)('puts the caret straight into a text block at the %s', (edge, id) => {
		const blocks = [text('a'), text('b')]
		const { editor, run } = fakeEditor(blocks)

		run(edge)

		expect(editor.insertBlocks).not.toHaveBeenCalled()
		expect(editor.setTextCursorPosition).toHaveBeenCalledWith(
			blocks.find((b) => b.id === id),
			edge
		)
		expect(editor.focus).toHaveBeenCalledTimes(1)
	})

	it.each([
		['start', 'before'],
		['end', 'after']
	] as const)('opens a paragraph next to a non-text block at the %s', (edge, placement) => {
		const block = image('img')
		const { editor, inserted, run } = fakeEditor([block])

		run(edge)

		expect(editor.insertBlocks).toHaveBeenCalledWith([{ type: 'paragraph' }], block, placement)
		expect(editor.setTextCursorPosition).toHaveBeenCalledWith(inserted, edge)
		expect(editor.focus).toHaveBeenCalledTimes(1)
	})

	it('puts the caret in the deepest last child of a nested list', () => {
		const deepest = text('c')
		const { editor, run } = fakeEditor([text('a', [text('b'), text('b2', [deepest])])])

		run('end')

		expect(editor.setTextCursorPosition).toHaveBeenCalledWith(deepest, 'end')
	})

	it('opens a paragraph after a non-text deepest block', () => {
		const block = image('img')
		const { editor, inserted, run } = fakeEditor([text('a', [block])])

		run('end')

		expect(editor.insertBlocks).toHaveBeenCalledWith([{ type: 'paragraph' }], block, 'after')
		expect(editor.setTextCursorPosition).toHaveBeenCalledWith(inserted, 'end')
	})

	it.each([
		['a toggle list item', { type: 'toggleListItem' }],
		['a toggleable heading', { type: 'heading', props: { isToggleable: true } }]
	])('stops at %s, whose children may be hidden', (_name, overrides) => {
		const toggle = { ...text('a', [text('hidden')]), ...overrides }
		const { editor, run } = fakeEditor([toggle])

		run('end')

		expect(editor.setTextCursorPosition).toHaveBeenCalledWith(toggle, 'end')
	})

	it('does not descend for the start edge', () => {
		const block = text('a', [text('b')])
		const { editor, run } = fakeEditor([block])

		run('start')

		expect(editor.setTextCursorPosition).toHaveBeenCalledWith(block, 'start')
	})

	it('does nothing on an empty document', () => {
		const { editor, run } = fakeEditor([])

		run('end')

		expect(editor.setTextCursorPosition).not.toHaveBeenCalled()
		expect(editor.focus).not.toHaveBeenCalled()
	})
})

// vim: ts=4
