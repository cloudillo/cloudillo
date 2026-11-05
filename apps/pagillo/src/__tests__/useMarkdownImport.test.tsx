// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * The Markdown import hook: the file the shell pushes, held until there is a section to put it
 * in, and the file picked at the caret.
 */

import { jest } from '@jest/globals'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import * as Y from 'yjs'

import { openPublication, setMeta } from '../crdt/document.js'
import { newSectionMap } from '../crdt/entities.js'
import type { StoredSection } from '../crdt/stored-types.js'
import { addStyle } from '../crdt/style-ops.js'
import type { MarkdownImport, MarkdownImportOptions } from '../editor/useMarkdownImport.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface Push {
	sourceMimeType: string
	fileName: string
	data: string
}

const bus = {
	access: 'write',
	push: undefined as ((payload: Push) => void) | undefined,
	onImportData(handler: (payload: Push) => void) {
		bus.push = handler
		return () => {
			bus.push = undefined
		}
	},
	notifyImportComplete: jest.fn<(success: boolean, error?: string) => void>()
}

const core = await import('@cloudillo/core')
const i18next = await import('react-i18next')

jest.unstable_mockModule('@cloudillo/core', () => ({ ...core, getAppBus: () => bus }))
jest.unstable_mockModule('react-i18next', () => ({
	...i18next,
	useTranslation: () => ({ t: (key: string) => key })
}))

const { useMarkdownImport } = await import('../editor/useMarkdownImport.js')

const FAILED = 'Could not import the file'

function setup({ sections = 1, canEdit = true } = {}) {
	const yDoc = new Y.Doc()
	const doc = openPublication(yDoc)
	const t = new Y.Text()
	doc.tx.set('S', t)
	const addSection = () => {
		doc.s.set('s1', newSectionMap({ story: 'S' } as StoredSection))
		doc.secs.push(['s1'])
	}
	if (sections) addSection()
	const p = addStyle(yDoc, doc, { k: 'p', name: 'Body', props: {} })
	setMeta(yDoc, doc, { styleMap: { p } })

	const editor = {
		sel: {},
		canEdit: () => canEdit,
		focus: jest.fn(),
		run: jest.fn((fn: (t: Y.Text, from: number, to: number) => number | undefined) => {
			yDoc.transact(() => fn(t, 0, 0), yDoc.clientID)
			return true
		})
	}
	const toast = { error: jest.fn(), warning: jest.fn() }
	const onGo = jest.fn()
	const opts = {
		yDoc,
		doc,
		editor,
		toast,
		onGo,
		undo: { mark: () => {} },
		empty: !sections
	} as unknown as MarkdownImportOptions

	const out: { current?: MarkdownImport } = {}
	function Host() {
		out.current = useMarkdownImport(opts)
		return <div>{out.current.input}</div>
	}
	const container = document.createElement('div')
	const root = createRoot(container)
	act(() => root.render(<Host />))

	return {
		doc,
		t,
		editor,
		toast,
		onGo,
		addSection,
		hook: () => out.current as MarkdownImport,
		push: (md: string, sourceMimeType = 'text/markdown') =>
			act(async () => {
				bus.push?.({ sourceMimeType, fileName: 'a.md', data: btoa(md) })
			}),
		pushRaw: (data: string) =>
			act(async () => {
				bus.push?.({ sourceMimeType: 'text/markdown', fileName: 'a.md', data })
			}),
		/** Pick a file; `open` is the action that opens the picker, by default the caret's. */
		pick: (md: string, open = (hook: MarkdownImport) => hook.insertAtCaret()) => {
			const input = container.querySelector('input') as HTMLInputElement
			// A stand-in: jsdom's `File` may lack `text()`.
			const file = { name: 'a.md', type: '', text: async () => md }
			Object.defineProperty(input, 'files', { value: [file], configurable: true })
			return act(async () => {
				open(out.current as MarkdownImport)
				input.dispatchEvent(new Event('change', { bubbles: true }))
			})
		},
		unmount: () => act(() => root.unmount())
	}
}

describe('useMarkdownImport', () => {
	let logged: ReturnType<typeof jest.spyOn>

	beforeEach(() => {
		bus.access = 'write'
		bus.notifyImportComplete.mockClear()
		sessionStorage.clear()
		logged = jest.spyOn(console, 'error').mockImplementation(() => {})
	})

	afterEach(() => {
		logged.mockRestore()
	})

	it('holds a push while empty, and applied() fills the first section', async () => {
		const s = setup({ sections: 0 })

		await s.push('# a\n')
		expect(s.hook().pendingName).toBe('a.md')
		expect(bus.notifyImportComplete).not.toHaveBeenCalled()

		s.addSection()
		await act(async () => s.hook().applied())

		expect(s.t.toString()).toBe('a\n')
		expect(s.hook().pendingName).toBeUndefined()
		expect(bus.notifyImportComplete.mock.calls).toEqual([[true]])
		s.unmount()
	})

	it('appends a section for a push on a document with sections', async () => {
		const s = setup()

		await s.push('# a\n')

		expect(s.doc.secs.length).toBe(2)
		expect(s.onGo).toHaveBeenCalledTimes(1)
		expect(bus.notifyImportComplete.mock.calls).toEqual([[true]])
		s.unmount()
	})

	it('refuses a wrong MIME type', async () => {
		const s = setup()

		await s.push('a', 'text/plain')

		expect(s.doc.secs.length).toBe(1)
		expect(bus.notifyImportComplete.mock.calls).toEqual([
			[false, 'Unsupported import type: {{type}}']
		])
		s.unmount()
	})

	it('refuses a push on a read-only bus', async () => {
		const s = setup()
		bus.access = 'read'

		await s.push('# a\n')

		expect(s.doc.secs.length).toBe(1)
		expect(bus.notifyImportComplete.mock.calls).toEqual([[false, 'Read-only document']])
		s.unmount()
	})

	it('refuses a push when a newer engine wrote the document', async () => {
		const s = setup()
		s.doc.m.set('engine', '999.0.0')

		await s.push('# a\n')

		expect(s.doc.secs.length).toBe(1)
		expect(bus.notifyImportComplete.mock.calls).toEqual([[false, 'Read-only document']])
		s.unmount()
	})

	it('writes nothing from a restored push on a read-only bus', async () => {
		const before = setup({ sections: 0 })
		await before.push('# a\n')
		before.unmount()
		bus.access = 'read'

		const s = setup()

		expect(s.doc.secs.length).toBe(1)
		expect(s.t.toString()).toBe('')
		expect(s.toast.error).toHaveBeenCalledWith('Read-only document')
		expect(bus.notifyImportComplete.mock.calls).toEqual([[false, 'Read-only document']])
		expect(sessionStorage.length).toBe(0)
		s.unmount()
	})

	it('writes nothing from a restored push once a newer engine wrote the document', async () => {
		const before = setup({ sections: 0 })
		await before.push('# a\n')
		before.unmount()

		const s = setup({ sections: 0 })
		s.doc.m.set('engine', '999.0.0')
		s.addSection()
		await act(async () => s.hook().applied())

		expect(s.t.toString()).toBe('')
		expect(s.hook().pendingName).toBeUndefined()
		expect(bus.notifyImportComplete.mock.calls).toEqual([[false, 'Read-only document']])
		s.unmount()
	})

	it('keeps a held push across a reload, and forgets it once applied', async () => {
		const before = setup({ sections: 0 })
		await before.push('# a\n')
		before.unmount()
		expect(sessionStorage.length).toBe(1)

		const s = setup({ sections: 0 })
		expect(s.hook().pendingName).toBe('a.md')

		s.addSection()
		await act(async () => s.hook().applied())

		expect(s.t.toString()).toBe('a\n')
		expect(s.hook().pendingName).toBeUndefined()
		expect(bus.notifyImportComplete.mock.calls).toEqual([[true]])
		expect(sessionStorage.length).toBe(0)
		s.unmount()
	})

	it.each([
		['a wrong shape', '{"fileName":"a.md","data":1}'],
		['a non-object', '5'],
		['null', 'null']
	])('ignores a stored entry with %s', (_name, stored) => {
		sessionStorage.setItem(`pagillo:md-import:${location.hash.slice(1)}`, stored)

		const s = setup({ sections: 0 })

		expect(s.hook().pendingName).toBeUndefined()
		expect(bus.notifyImportComplete).not.toHaveBeenCalled()
		s.unmount()
	})

	it('still holds a push when storage throws', async () => {
		const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('quota')
		})
		const warned = jest.spyOn(console, 'warn').mockImplementation(() => {})
		const s = setup({ sections: 0 })

		await s.push('# a\n')
		s.addSection()
		await act(async () => s.hook().applied())

		expect(s.t.toString()).toBe('a\n')
		s.unmount()
		setItem.mockRestore()
		warned.mockRestore()
	})

	it('refuses a second push once, and keeps the first', async () => {
		const s = setup({ sections: 0 })

		await s.push('# first\n')
		await s.push('# second\n')
		expect(bus.notifyImportComplete.mock.calls).toEqual([[false, FAILED]])

		s.addSection()
		await act(async () => s.hook().applied())

		expect(s.t.toString()).toBe('first\n')
		expect(bus.notifyImportComplete.mock.calls).toEqual([[false, FAILED], [true]])
		s.unmount()
	})

	it('shows a toast and notifies false for invalid base64', async () => {
		const s = setup()

		await s.pushRaw('***')

		expect(s.toast.error).toHaveBeenCalledWith(FAILED)
		expect(bus.notifyImportComplete.mock.calls).toEqual([[false, FAILED]])
		s.unmount()
	})

	it('inserts a picked file at the caret', async () => {
		const s = setup()

		await s.pick('a\n')

		expect(s.t.toString()).toBe('a\n')
		expect(s.editor.focus).toHaveBeenCalledTimes(1)
		expect(s.toast.error).not.toHaveBeenCalled()
		s.unmount()
	})

	it('puts a picked file in a new section and goes there', async () => {
		const s = setup()

		await s.pick('# a\n', (hook) => hook.importSection('s1', 1))

		expect(s.doc.secs.length).toBe(2)
		expect(s.onGo).toHaveBeenCalledTimes(1)
		expect(s.toast.error).not.toHaveBeenCalled()
		s.unmount()
	})

	it('shows the error toast when the section cannot be edited', async () => {
		const s = setup({ canEdit: false })

		await s.pick('# a\n', (hook) => hook.importSection('s1', 1))

		expect(s.toast.error).toHaveBeenCalledWith(FAILED)
		expect(s.doc.secs.length).toBe(1)
		expect(s.onGo).not.toHaveBeenCalled()
		s.unmount()
	})

	it('shows the error toast when the caret insert is refused', async () => {
		const s = setup()
		s.editor.run.mockReturnValueOnce(false)

		await s.pick('a\n')

		expect(s.toast.error).toHaveBeenCalledWith(FAILED)
		expect(s.editor.focus).not.toHaveBeenCalled()
		s.unmount()
	})
})

// vim: ts=4
