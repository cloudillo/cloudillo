// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `useDocumentSync` debounces content writes per block, and the debounce is the
 * one place where the editor and RTDB can silently disagree: the patch a timer
 * carries was built when the change fired, and the echo of whatever it writes is
 * suppressed as a local update. A write that no longer matches the editor
 * therefore survives until the next edit to that block, and comes back on reload.
 *
 * The regression pinned here is a revert inside the debounce window (type and
 * immediately delete), which used to persist the intermediate text.
 */

import { jest } from '@jest/globals'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import type { BlockNoteEditor } from '@blocknote/core'
import type { RtdbClient } from '@cloudillo/rtdb'

import { useDocumentSync } from '../hooks/useEditorSync.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PAGE_ID = 'page1'
const USER_ID = 'me.tld'
const BLOCK_ID = 'b1'

type FakeBlock = {
	id: string
	type: string
	props: Record<string, unknown>
	content: Array<{ type: 'text'; text: string; styles: Record<string, unknown> }>
	children: FakeBlock[]
}

function textBlock(id: string, text: string): FakeBlock {
	return {
		id,
		type: 'paragraph',
		props: {},
		content: text ? [{ type: 'text', text, styles: {} }] : [],
		children: []
	}
}

/**
 * The slice of BlockNote the hook touches: a document to walk, block lookup, and
 * an `onChange` it can drive. `setText` rewrites the block in place, so the
 * change callback re-reads it exactly as the real editor would.
 */
function makeEditor(blocks: FakeBlock[]) {
	let onChange: ((editor: unknown, context: { getChanges: () => unknown[] }) => void) | undefined
	const editor = {
		document: blocks,
		getBlock: (id: string) => blocks.find((b) => b.id === id),
		getParentBlock: () => undefined,
		onChange: (cb: typeof onChange) => {
			onChange = cb
			return () => {
				onChange = undefined
			}
		}
	} as unknown as BlockNoteEditor

	function setText(id: string, text: string) {
		const block = blocks.find((b) => b.id === id)
		if (!block) throw new Error(`no block ${id}`)
		block.content = text ? [{ type: 'text', text, styles: {} }] : []
		return block
	}

	return {
		editor,
		/** Rewrite a block's text and fire the `update` change for it. */
		type(id: string, text: string) {
			const block = setText(id, text)
			act(() => {
				onChange?.(editor, { getChanges: () => [{ type: 'update', block }] })
			})
		},
		/**
		 * Rewrite a block's text *without* firing `onChange` — what a remote change
		 * applied through `editor.transact` with the `y-sync$` meta looks like from
		 * here, since `onChange(cb, false)` deliberately does not deliver those.
		 */
		setText
	}
}

/** Records the writes the hook makes; nothing here needs to come back. */
function makeClient() {
	const updates: Array<{ id: string; patch: Record<string, unknown> }> = []
	const sets: string[] = []
	const client = {
		collection: () => ({
			doc: (id: string) => ({
				set: (data: unknown) => {
					sets.push(id)
					void data
					return Promise.resolve()
				},
				update: (patch: Record<string, unknown>) => {
					updates.push({ id, patch })
					return Promise.resolve()
				},
				delete: () => Promise.resolve()
			})
		})
	} as unknown as RtdbClient
	return { client, updates, sets }
}

function render(editor: BlockNoteEditor, client: RtdbClient) {
	const root = createRoot(document.createElement('div'))
	function Probe() {
		useDocumentSync(
			editor,
			client,
			PAGE_ID,
			USER_ID,
			undefined,
			false,
			// The block already exists server-side, so the mount does not push it.
			new Set([BLOCK_ID]),
			new Map([[BLOCK_ID, 1]])
		)
		return null
	}
	act(() => {
		root.render(<Probe />)
	})
	return {
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

describe('useDocumentSync content debounce', () => {
	it('writes the text once the debounce elapses', async () => {
		const { editor, type } = makeEditor([textBlock(BLOCK_ID, '')])
		const { client, updates } = makeClient()
		const view = render(editor, client)

		type(BLOCK_ID, 'hello')
		expect(updates).toHaveLength(0)

		await act(async () => {
			jest.advanceTimersByTime(400)
		})

		expect(updates).toHaveLength(1)
		expect(updates[0].patch.c).toEqual(['hello'])

		view.unmount()
	})

	it('writes nothing when an edit is reverted inside the debounce window', async () => {
		// The revert produces no diff against what was last persisted, so
		// `syncBlock` returns early. The timer armed by the previous keystroke must
		// go with it — otherwise it fires with that keystroke's patch and RTDB ends
		// up holding text the editor no longer shows, with the echo suppressed.
		const { editor, type } = makeEditor([textBlock(BLOCK_ID, '')])
		const { client, updates } = makeClient()
		const view = render(editor, client)

		type(BLOCK_ID, 'h')
		type(BLOCK_ID, '')

		await act(async () => {
			jest.advanceTimersByTime(400)
		})

		expect(updates).toEqual([])

		view.unmount()
	})

	it('writes what the editor holds when a remote change lands inside the window', async () => {
		// A collaborator's change arrives through `editor.transact` with the `y-sync$`
		// meta, which `onChange(cb, false)` does not deliver, so nothing clears the
		// timer this keystroke armed. Re-reading the block on commit keeps the two in
		// step: it must send the *current* text, not the text the timer was armed
		// with. (The revert case is covered end-to-end in `useRtdbToEditor.test.tsx`,
		// driven by a real snapshot event rather than a direct `setText`.)
		const { editor, type, setText } = makeEditor([textBlock(BLOCK_ID, '')])
		const { client, updates } = makeClient()
		const view = render(editor, client)

		type(BLOCK_ID, 'h')
		setText(BLOCK_ID, 'remote')

		await act(async () => {
			jest.advanceTimersByTime(400)
		})

		expect(updates).toHaveLength(1)
		expect(updates[0].patch.c).toEqual(['remote'])

		view.unmount()
	})

	it('flushes a pending write when the tab goes away', async () => {
		// `pagehide` is the only notice a closing tab gives. Without it, typing with
		// no 300 ms pause and then hitting reload discarded the timer with the page.
		const { editor, type } = makeEditor([textBlock(BLOCK_ID, '')])
		const { client, updates } = makeClient()
		const view = render(editor, client)

		type(BLOCK_ID, 'unsaved')
		expect(updates).toHaveLength(0)

		act(() => {
			window.dispatchEvent(new Event('pagehide'))
		})

		expect(updates).toHaveLength(1)
		expect(updates[0].patch.c).toEqual(['unsaved'])

		// And the flush is idempotent — unmount must not write it a second time.
		view.unmount()
		expect(updates).toHaveLength(1)
	})
})

// vim: ts=4
