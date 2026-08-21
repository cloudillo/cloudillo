// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `usePageTagSync` writes `tg` on the page record a second after the last edit, and
 * publishing reads that field straight out of RTDB — it feeds the tag listings, the
 * per-tag fragments, the feed `<category>` terms and `manifest.pages[].tags`. At a
 * second it is the likelier of Notillo's two debounces to still be pending when the
 * author hits Publish, so the hook has to expose a flush and honour it on teardown.
 */

import type { BlockNoteEditor } from '@blocknote/core'
import type { RtdbClient } from '@cloudillo/rtdb'
import { jest } from '@jest/globals'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { usePageTagSync } from '../hooks/usePageTagSync.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PAGE_ID = 'page1'

type FakeBlock = {
	id: string
	type: string
	props: Record<string, unknown>
	content: Array<{ type: 'tag'; props: { tag: string } }>
	children: FakeBlock[]
}

function tagBlock(id: string, tags: string[]): FakeBlock {
	return {
		id,
		type: 'paragraph',
		props: {},
		content: tags.map((tag) => ({ type: 'tag' as const, props: { tag } })),
		children: []
	}
}

/** The slice of BlockNote the hook touches: a document to walk and an `onChange`. */
function makeEditor(blocks: FakeBlock[]) {
	let onChange: (() => void) | undefined
	const editor = {
		document: blocks,
		onChange: (cb: () => void) => {
			onChange = cb
			return () => {
				onChange = undefined
			}
		}
	} as unknown as BlockNoteEditor

	return {
		editor,
		/** Retag the block and fire the change, as typing a `#tag` would. */
		retag(id: string, tags: string[]) {
			const block = blocks.find((b) => b.id === id)
			if (!block) throw new Error(`no block ${id}`)
			block.content = tags.map((tag) => ({ type: 'tag' as const, props: { tag } }))
			act(() => {
				onChange?.()
			})
		},
		/** What a BlockNote editor being torn down looks like: an empty document. */
		tearDown() {
			blocks.length = 0
		}
	}
}

/** Records the `p/<pageId>` patches the hook makes. */
function makeClient() {
	const updates: Record<string, unknown>[] = []
	const client = {
		collection: () => ({
			doc: () => ({
				update: (patch: Record<string, unknown>) => {
					updates.push(patch)
					return Promise.resolve()
				}
			})
		})
	} as unknown as RtdbClient
	return { client, updates }
}

function render(editor: BlockNoteEditor, client: RtdbClient, pageTags: string[]) {
	const root = createRoot(document.createElement('div'))
	const flushRef: { current: () => void } = { current: () => {} }
	function Probe() {
		const { flush } = usePageTagSync(editor, client, PAGE_ID, pageTags, false)
		flushRef.current = () => flush.current()
		return null
	}
	act(() => {
		root.render(<Probe />)
	})
	return {
		flush: () => flushRef.current(),
		unmount() {
			act(() => {
				root.unmount()
			})
		}
	}
}

beforeEach(() => {
	jest.useFakeTimers()
})

afterEach(() => {
	jest.clearAllTimers()
	jest.useRealTimers()
})

describe('usePageTagSync', () => {
	it('should write the tags once the debounce elapses', async () => {
		const { editor, retag } = makeEditor([tagBlock('b1', [])])
		const { client, updates } = makeClient()
		const view = render(editor, client, [])

		retag('b1', ['alpha'])
		expect(updates).toEqual([])

		await act(async () => {
			jest.advanceTimersByTime(1000)
		})
		expect(updates).toEqual([{ tg: ['alpha'] }])

		view.unmount()
	})

	it('should write the newest tags when flushed inside the debounce window', async () => {
		// The case `publishSite` depends on: type a tag, hit Publish within the second.
		const { editor, retag } = makeEditor([tagBlock('b1', [])])
		const { client, updates } = makeClient()
		const view = render(editor, client, [])

		retag('b1', ['alpha'])
		act(() => {
			view.flush()
		})
		expect(updates).toEqual([{ tg: ['alpha'] }])

		// The armed timer has nothing left to write.
		await act(async () => {
			jest.advanceTimersByTime(1000)
		})
		expect(updates).toEqual([{ tg: ['alpha'] }])

		view.unmount()
	})

	it('should flush the pending write on teardown rather than dropping it', async () => {
		const { editor, retag } = makeEditor([tagBlock('b1', [])])
		const { client, updates } = makeClient()
		const view = render(editor, client, [])

		retag('b1', ['alpha'])
		view.unmount()

		expect(updates).toEqual([{ tg: ['alpha'] }])
	})

	it('should not write tags read from an editor that is tearing down', async () => {
		// The teardown runs on every page switch — `NotilloEditor` is keyed by the
		// active page — and by then the editor may already be empty. Flushing a *live*
		// read there wrote `tg: []` over the page just left, emptying it out of every
		// tag listing and every feed term.
		const { editor, retag, tearDown } = makeEditor([tagBlock('b1', [])])
		const { client, updates } = makeClient()
		const view = render(editor, client, [])

		retag('b1', ['alpha'])
		await act(async () => {
			jest.advanceTimersByTime(1000)
		})
		expect(updates).toEqual([{ tg: ['alpha'] }])

		tearDown()
		view.unmount()

		expect(updates).toEqual([{ tg: ['alpha'] }])
	})

	it('should write nothing when the tags never changed', async () => {
		const { editor, retag } = makeEditor([tagBlock('b1', ['alpha'])])
		const { client, updates } = makeClient()
		const view = render(editor, client, ['alpha'])

		retag('b1', ['alpha'])
		act(() => {
			view.flush()
		})
		expect(updates).toEqual([])

		view.unmount()
		expect(updates).toEqual([])
	})

	it('should correct stale stored tags on mount', async () => {
		// Self-healing: the record says one thing, the blocks another.
		const { editor } = makeEditor([tagBlock('b1', ['alpha', 'beta'])])
		const { client, updates } = makeClient()
		const view = render(editor, client, ['alpha'])

		expect(updates).toEqual([{ tg: ['alpha', 'beta'] }])

		view.unmount()
	})
})
