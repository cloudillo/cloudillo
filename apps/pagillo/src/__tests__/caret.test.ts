// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { LineGeom, PageDL } from '@cloudillo/typeset'
import * as Y from 'yjs'

import { openPublication } from '../crdt/document.js'
import {
	charMove,
	indexGeom,
	paragraphAt,
	paragraphMove,
	wordAt,
	wordMove
} from '../editor/caret.js'

const txt = 'one two\nthree\n'
const end = txt.length - 1

describe('charMove', () => {
	it('steps one grapheme and stops at the story edges', () => {
		expect(charMove(txt, 3, 1, end)).toBe(4)
		expect(charMove(txt, 0, -1, end)).toBe(0)
		expect(charMove(txt, end, 1, end)).toBe(end)
		expect(charMove('a👍b', 1, 1, 4)).toBe(3)
		expect(charMove('a👍b', 3, -1, 4)).toBe(1)
	})
})

describe('wordMove', () => {
	it('moves to word edges and crosses a paragraph edge once', () => {
		expect(wordMove(txt, 0, 1)).toBe(3)
		expect(wordMove(txt, 3, 1)).toBe(7)
		expect(wordMove(txt, 7, 1)).toBe(8)
		expect(wordMove(txt, 8, -1)).toBe(7)
		expect(wordMove(txt, 7, -1)).toBe(4)
		expect(wordMove(txt, 0, -1)).toBe(0)
		expect(wordMove(txt, txt.length, 1)).toBe(txt.length)
	})
})

describe('wordAt / paragraphAt', () => {
	it('selects the word and paragraph around an offset', () => {
		expect(wordAt(txt, 5)).toEqual([4, 7])
		expect(wordAt(txt, 7)).toEqual([4, 7])
		expect(wordAt('a\n\nb', 2)).toEqual([2, 2])
		expect(paragraphAt(txt, 2)).toEqual([0, 7])
		expect(paragraphAt(txt, 10)).toEqual([8, 13])
	})
})

describe('paragraphMove', () => {
	it('goes to this / previous / next paragraph start, clamped', () => {
		expect(paragraphMove(txt, 2, 1)).toBe(8)
		expect(paragraphMove(txt, 10, -1)).toBe(8)
		expect(paragraphMove(txt, 8, -1)).toBe(0)
		expect(paragraphMove(txt, 0, -1)).toBe(0)
		expect(paragraphMove(txt, 10, 1)).toBe(txt.length)
	})
})

describe('indexGeom', () => {
	it("adds each paragraph's Y.Text start to its paragraph-relative line offsets", () => {
		const doc = openPublication(new Y.Doc())
		const t = new Y.Text()
		doc.tx.set('main', t)
		// 'ab\n' [0], image + '\n' [3] (no line), duplicate bid [5] → '~2', no bid [8] → '~3',
		// unterminated tail [11] → '~4'.
		t.applyDelta([
			{ insert: 'ab\n', attributes: { bid: 'p1' } },
			{ insert: { img: { fileId: 'f1', w: 10, h: 10, alt: '' } } },
			{ insert: '\n', attributes: { bid: 'im' } },
			{ insert: 'cd\n', attributes: { bid: 'p1' } },
			{ insert: 'ef\n' },
			{ insert: 'gh' }
		])
		const line = (bid: string, from: number, to: number): LineGeom => ({
			story: 'main',
			bid,
			from,
			to,
			x: 0,
			y: 0,
			ascent: 0,
			descent: 0,
			carets: new Int32Array(to - from + 1)
		})
		const dl: PageDL = {
			page: { sec: 's1', index: 0, w: 0, h: 0, master: 'm' },
			items: [],
			lines: [
				line('p1', 0, 2),
				line('~2', 0, 1),
				line('~2', 1, 2),
				line('~3', 0, 2),
				line('~4', 0, 2),
				line('gone', 0, 2)
			],
			tags: [],
			rev: 0
		}
		const index = indexGeom(new Map([['k', dl]]), ['k'], doc)
		const got = (index.stories.get('main') ?? []).map((pl) => [pl.from, pl.to])
		expect(got).toEqual([
			[0, 2],
			[5, 6],
			[6, 7],
			[8, 10],
			[11, 13]
		])
		expect(index.pages.get(0)).toHaveLength(5)
	})
})

// vim: ts=4
