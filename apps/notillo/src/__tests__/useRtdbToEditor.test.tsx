// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The RTDB → editor direction of the notillo sync, and where it meets the other.
 *
 * Three behaviours carry the risk. Echo suppression decides whether a write this
 * client just made comes back and re-applies itself, and hinges on `ub` being
 * omitted when the writer *is* the document owner, so `updatedBy` then resolves
 * from `ownerTag` rather than from the record. The `added` fallback covers a
 * document with nothing to anchor an insert against, where a dropped block is
 * dropped for good — `added` never repeats. And a remote change landing while a
 * local debounce is armed is the one case both directions touch at once.
 */

import type { Block, BlockNoteEditor } from '@blocknote/core'
import type { RtdbClient } from '@cloudillo/rtdb'
import { jest } from '@jest/globals'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { useDocumentSync, useRtdbToEditor } from '../hooks/useEditorSync.js'
import type { StoredBlockRecord } from '../rtdb/types.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PAGE_ID = 'page1'
const USER_ID = 'me.tld'
const OTHER_ID = 'you.tld'
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

function textOf(block: FakeBlock | undefined): string {
	return (block?.content ?? []).map((c) => c.text).join('')
}

/** A stored record as the server would hand it back. */
function storedBlock(text: string, updatedBy?: string): StoredBlockRecord {
	return {
		p: PAGE_ID,
		t: 'p',
		...(text && { c: [text] }),
		o: 1,
		ua: '2026-01-01T00:00:00.000Z',
		// Omitted when the writer is the owner — exactly what `toStoredBlock` does,
		// and what makes `ownerTag` load-bearing for echo suppression.
		...(updatedBy !== undefined && { ub: updatedBy })
	}
}

/**
 * The slice of BlockNote both hooks touch. Mutating in place is what the real
 * editor does, so `getBlock` and `document` stay in step with the writes.
 */
function makeEditor(blocks: FakeBlock[]) {
	let onChange: ((editor: unknown, context: { getChanges: () => unknown[] }) => void) | undefined
	const editor = {
		get document() {
			return blocks
		},
		getBlock: (id: string) => blocks.find((b) => b.id === id),
		getParentBlock: () => undefined,
		// Remote changes go through here with the `y-sync$` meta, and
		// `onChange(cb, false)` deliberately does not deliver them — so this
		// intentionally does *not* fire the change callback.
		transact: (fn: (tr: { setMeta: (k: string, v: unknown) => void }) => void) =>
			fn({ setMeta: () => {} }),
		updateBlock: (id: string, update: { type?: string; content?: unknown }) => {
			const block = blocks.find((b) => b.id === id)
			if (!block) return
			if (update.type) block.type = update.type
			block.content = (update.content ?? []) as FakeBlock['content']
		},
		insertBlocks: (newBlocks: FakeBlock[], anchor: Block, placement: string) => {
			const idx = blocks.findIndex((b) => b.id === anchor.id)
			blocks.splice(placement === 'after' ? idx + 1 : idx, 0, ...newBlocks)
		},
		replaceBlocks: (target: unknown, newBlocks: FakeBlock[]) => {
			void target
			blocks.splice(0, blocks.length, ...newBlocks)
		},
		removeBlocks: (ids: string[]) => {
			for (const id of ids) {
				const idx = blocks.findIndex((b) => b.id === id)
				if (idx >= 0) blocks.splice(idx, 1)
			}
		},
		onChange: (cb: typeof onChange) => {
			onChange = cb
			return () => {
				onChange = undefined
			}
		}
	} as unknown as BlockNoteEditor

	return {
		editor,
		blocks,
		/** Rewrite a block's text and fire the `update` change for it. */
		type(id: string, text: string) {
			const block = blocks.find((b) => b.id === id)
			if (!block) throw new Error(`no block ${id}`)
			block.content = text ? [{ type: 'text', text, styles: {} }] : []
			act(() => {
				onChange?.(editor, { getChanges: () => [{ type: 'update', block }] })
			})
		}
	}
}

type Change = { type: 'added' | 'modified' | 'removed'; id: string; data: StoredBlockRecord }

/** Records the writes, and hands back the subscription so a test can push events. */
function makeClient() {
	const updates: Array<{ id: string; patch: Record<string, unknown> }> = []
	let listener: ((snapshot: unknown) => void) | undefined

	const client = {
		collection: () => ({
			where: () => ({
				onSnapshot: (cb: (snapshot: unknown) => void) => {
					listener = cb
					return () => {
						listener = undefined
					}
				}
			}),
			doc: (id: string) => ({
				set: () => Promise.resolve(),
				update: (patch: Record<string, unknown>) => {
					updates.push({ id, patch })
					return Promise.resolve()
				},
				delete: () => Promise.resolve()
			})
		})
	} as unknown as RtdbClient

	return {
		client,
		updates,
		/** Deliver one server snapshot to the subscription. */
		push(changes: Change[]) {
			act(() => {
				listener?.({
					docChanges: () =>
						changes.map((c) => ({
							type: c.type,
							doc: { id: c.id, data: () => c.data }
						}))
				})
			})
		}
	}
}

/** Both hooks over one editor, wired the way `NotilloEditor` wires them. */
function render(editor: BlockNoteEditor, client: RtdbClient, ownerTag?: string) {
	const root = createRoot(document.createElement('div'))
	function Probe() {
		const { recentLocalUpdates, blockStates } = useDocumentSync(
			editor,
			client,
			PAGE_ID,
			USER_ID,
			ownerTag,
			false,
			// The block already exists server-side, so the mount does not push it.
			new Set([BLOCK_ID]),
			new Map([[BLOCK_ID, 1]])
		)
		useRtdbToEditor(editor, client, PAGE_ID, USER_ID, ownerTag, recentLocalUpdates, blockStates)
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

describe('useRtdbToEditor echo suppression', () => {
	it('ignores the round-trip of a write this client just made', async () => {
		const { editor, blocks, type } = makeEditor([textBlock(BLOCK_ID, '')])
		const { client, updates, push } = makeClient()
		const view = render(editor, client)

		type(BLOCK_ID, 'hel')
		await act(async () => {
			jest.advanceTimersByTime(400)
		})
		expect(updates).toHaveLength(1)

		// Typed on while that write was in flight, so the echo is already behind the
		// editor. Applying it would rewind the block under the cursor.
		blocks[0].content = [{ type: 'text', text: 'hello', styles: {} }]
		push([{ type: 'modified', id: BLOCK_ID, data: storedBlock('hel', USER_ID) }])

		expect(textOf(blocks[0])).toBe('hello')
		view.unmount()
	})

	it('ignores its own echo when the writer is the document owner', async () => {
		// The owner's patch carries no `ub` — `toStoredBlock` omits it — so
		// `updatedBy` resolves from `ownerTag`. Without that fallback the echo would
		// look like a foreign change and be applied.
		const { editor, blocks, type } = makeEditor([textBlock(BLOCK_ID, '')])
		const { client, push } = makeClient()
		const view = render(editor, client, USER_ID)

		type(BLOCK_ID, 'hello')
		await act(async () => {
			jest.advanceTimersByTime(400)
		})

		// No `ub`, and `ownerTag` is this user: still our own write.
		push([{ type: 'modified', id: BLOCK_ID, data: storedBlock('stale') }])

		expect(textOf(blocks[0])).toBe('hello')
		view.unmount()
	})

	it('applies a collaborator’s change even while our own write is in flight', async () => {
		// Suppression is keyed on the writer as well as on the block: dropping every
		// event for a recently-written block would swallow the collaborator too.
		const { editor, blocks, type } = makeEditor([textBlock(BLOCK_ID, '')])
		const { client, push } = makeClient()
		const view = render(editor, client)

		type(BLOCK_ID, 'hello')
		await act(async () => {
			jest.advanceTimersByTime(400)
		})

		push([{ type: 'modified', id: BLOCK_ID, data: storedBlock('theirs', OTHER_ID) }])

		expect(textOf(blocks[0])).toBe('theirs')
		view.unmount()
	})
})

describe('useRtdbToEditor added blocks', () => {
	it('seeds an empty document through the replace path', () => {
		// `added` never repeats, so a block with nothing to anchor an insert against
		// used to be lost for good.
		const { editor, blocks } = makeEditor([])
		const { client, push } = makeClient()
		const view = render(editor, client)

		push([{ type: 'added', id: 'b2', data: storedBlock('remote', OTHER_ID) }])

		expect(blocks.map((b) => b.id)).toEqual(['b2'])
		expect(textOf(blocks[0])).toBe('remote')
		view.unmount()
	})

	it('appends after the last block when the document is not empty', () => {
		const { editor, blocks } = makeEditor([textBlock(BLOCK_ID, 'first')])
		const { client, push } = makeClient()
		const view = render(editor, client)

		push([{ type: 'added', id: 'b2', data: storedBlock('second', OTHER_ID) }])

		expect(blocks.map((b) => b.id)).toEqual([BLOCK_ID, 'b2'])
		view.unmount()
	})
})

describe('the two directions meeting on one block', () => {
	it('does not re-persist typed text a remote revert has removed', async () => {
		// The cross-hook form of the debounce bug: the remote revert is applied
		// through `editor.transact`, which does not fire `onChange`, so the timer the
		// keystroke armed survives it. Re-reading the block on commit catches it —
		// the block is back at the last-persisted state, so there is nothing to
		// write. Sending the arm-time patch would put the character back into RTDB
		// *and* suppress its own echo, leaving editor and record disagreeing until
		// the next edit to that block.
		const { editor, blocks, type } = makeEditor([textBlock(BLOCK_ID, '')])
		const { client, updates, push } = makeClient()
		const view = render(editor, client)

		type(BLOCK_ID, 'h')
		push([{ type: 'modified', id: BLOCK_ID, data: storedBlock('', OTHER_ID) }])
		expect(textOf(blocks[0])).toBe('')

		await act(async () => {
			jest.advanceTimersByTime(400)
		})

		expect(updates).toEqual([])
		expect(textOf(blocks[0])).toBe('')
		view.unmount()
	})
})

// vim: ts=4
