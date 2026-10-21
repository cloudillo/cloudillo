// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import * as Y from 'yjs'

import { openPublication } from '../crdt/document.js'
import { newFrameMap, newSectionMap } from '../crdt/entities.js'
import type { StoredFrame, StoredSection } from '../crdt/stored-types.js'
import { findHits } from '../editor/FindReplace.js'
import { handleKey, IS_MAC, type KeymapCtx, undoRedoKey } from '../editor/keymap.js'
import type { Editor } from '../editor/useEditor.js'

describe('findHits', () => {
	it('matches literally, by case, across section and frame stories', () => {
		const doc = openPublication(new Y.Doc())
		const text = (id: string, s: string) => {
			const t = new Y.Text()
			doc.tx.set(id, t)
			t.insert(0, s)
		}
		text('A', 'Foo foo.\n')
		text('B', 'a.FOO\n')
		text('orphan', 'foo\n')
		doc.s.set('s1', newSectionMap({ story: 'A' } as StoredSection))
		doc.secs.push(['s1'])
		const f1: StoredFrame = {
			t: 'txt',
			anchor: { sec: 's1', page: 0 },
			x: 0,
			y: 0,
			w: 100,
			h: 100,
			rot: 0,
			z: 0,
			wrap: { mode: 'none', off: 0 },
			data: { story: 'B' }
		}
		doc.f.set('f1', newFrameMap(f1))

		expect(findHits(doc, 'foo', true)).toEqual([{ story: 'A', from: 4, to: 7 }])
		expect(findHits(doc, 'foo', false).map((h) => `${h.story}${h.from}`)).toEqual([
			'A0',
			'A4',
			'B2'
		])
		expect(findHits(doc, '.', true)).toEqual([
			{ story: 'A', from: 7, to: 8 },
			{ story: 'B', from: 1, to: 2 }
		])
		expect(findHits(doc, '', false)).toEqual([])
	})
})

describe('handleKey', () => {
	const setup = (canEdit = true) => {
		const calls = { run: 0, undo: 0, redo: 0 }
		const run = () => {
			calls.run++
			return true
		}
		const undo = {
			undo: () => {
				calls.undo++
			},
			redo: () => {
				calls.redo++
			}
		}
		const ctx = {
			yDoc: new Y.Doc(),
			doc: openPublication(new Y.Doc()),
			editor: { sel: { story: 'S', anchor: 0, head: 1 }, run } as unknown as Editor,
			undo,
			canEdit
		} as unknown as KeymapCtx
		return { ctx, calls }
	}
	const key = (k: string, mods: Partial<KeyboardEvent> = {}) =>
		({ key: k, code: '', ctrlKey: true, metaKey: true, ...mods }) as KeyboardEvent

	it('dispatches bold, undo and redo', () => {
		const { ctx, calls } = setup()
		expect(handleKey(key('b'), ctx)).toBe(true)
		expect(handleKey(key('z'), ctx)).toBe(true)
		expect(handleKey(key('Z', { shiftKey: true }), ctx)).toBe(true)
		expect(calls).toEqual({ run: 1, undo: 1, redo: 1 })
	})

	it('leaves select-all to the editor and does nothing for readers', () => {
		const { ctx } = setup()
		expect(handleKey(key('a'), ctx)).toBe(false)
		const ro = setup(false)
		expect(handleKey(key('b'), ro.ctx)).toBe(false)
		expect(ro.calls.run).toBe(0)
	})

	it('lets AltGr (ctrl+alt on Windows) through instead of applying a heading', () => {
		const { ctx, calls } = setup()
		const altGr = key('1', {
			code: 'Digit1',
			altKey: true,
			getModifierState: (k: string) => k === 'AltGraph'
		})
		expect(handleKey(altGr, ctx)).toBe(false)
		expect(calls.run).toBe(0)
	})
})

describe('undoRedoKey', () => {
	const mod = IS_MAC ? 'metaKey' : 'ctrlKey'
	it.each([
		['z', {}, 'undo'],
		['Z', { shiftKey: true }, 'redo'],
		['y', {}, IS_MAC ? undefined : 'redo'],
		['z', { altKey: true }, undefined],
		['z', { [mod]: false }, undefined],
		['b', {}, undefined]
	] as const)('%s %j → %s', (k, mods, want) => {
		const e = { key: k, [mod]: true, ...mods } as unknown as KeyboardEvent
		expect(undoRedoKey(e)).toBe(want)
	})
})

// vim: ts=4
