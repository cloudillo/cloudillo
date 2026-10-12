// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as Y from 'yjs'

import { openPublication } from '../crdt/document.js'
import {
	findInlineImage,
	inlineImageBid,
	insertImageParagraph,
	setInlineImage,
	soleInlineImage
} from '../crdt/frame-ops.js'
import { type GeomIndex, mapOffset, type PlacedLine } from '../editor/caret.js'
import { sliceDelta } from '../editor/clipboard.js'
import { containsPoint } from '../editor/frames.js'
import { hitText, type TextArea } from '../editor/hit-test.js'
import { deleteRange, insertText } from '../editor/text-edit.js'

describe('mapOffset', () => {
	it('shifts past inserts and clamps into deletes', () => {
		expect(mapOffset([{ retain: 2 }, { insert: 'abc' }], 5)).toBe(8)
		expect(mapOffset([{ retain: 5 }, { insert: 'abc' }], 2)).toBe(2)
		expect(mapOffset([{ retain: 1 }, { delete: 4 }], 3)).toBe(1)
	})
})

describe('sliceDelta', () => {
	it('cuts text ops and keeps embeds whole', () => {
		const ops = [
			{ insert: 'ab', attributes: { bold: true } },
			{ insert: { img: 1 } },
			{ insert: 'cd' }
		]
		expect(sliceDelta(ops, 1, 4)).toEqual([
			{ insert: 'b', attributes: { bold: true } },
			{ insert: { img: 1 } },
			{ insert: 'c' }
		])
	})
})

describe('containsPoint', () => {
	it('honours rotation', () => {
		const box = { x: 0, y: 0, w: 100, h: 10, rot: 90 }
		expect(containsPoint(box, 50, 40)).toBe(true)
		expect(containsPoint(box, 5, 5)).toBe(false)
	})
})

describe('insertText / deleteRange', () => {
	it('splits with a fresh bid and merges keeping the first bid', () => {
		const t = new Y.Doc().getText('t')
		t.insert(0, 'abcd')
		t.insert(4, '\n', { bid: 'A' })
		expect(insertText(t, 2, '\n')).toBe(3)
		const bids = t
			.toDelta()
			.filter((op: { insert: unknown }) => op.insert === '\n')
			.map((op: { attributes?: { bid?: string } }) => op.attributes?.bid)
		expect(bids).toHaveLength(2)
		expect(new Set(bids).size).toBe(2)
		expect(bids).toContain('A')
		const first = bids[0]
		deleteRange(t, 2, 3)
		expect(t.toString()).toBe('abcd\n')
		expect(t.toDelta().at(-1).attributes.bid).toBe(first)
	})
})

describe('inline images', () => {
	it('maps a paragraph bid to its embed and back', () => {
		const doc = openPublication(new Y.Doc())
		const t = new Y.Text()
		doc.tx.set('main', t)
		t.insert(0, 'ab\n', { bid: 'p1' })
		const img = { fileId: 'f1', w: 10, h: 10, alt: '' }
		insertImageParagraph(t, 3, img)
		t.insert(5, 'cd\n', { bid: 'p3' })
		const bid = inlineImageBid(t, 3)
		expect(bid).toBeDefined()
		expect(findInlineImage(doc, bid as string)).toEqual({ story: 'main', offset: 3 })
		expect(findInlineImage(doc, 'p1')).toBeUndefined()
		expect(inlineImageBid(t, 0)).toBeUndefined()
		// Shift+→ from the paragraph above selects '\n' + embed.
		expect(soleInlineImage(t, 2, 4)).toBe(3)
		expect(soleInlineImage(t, 0, 2)).toBeUndefined()
		setInlineImage(t, 3, { ...img, alt: 'cat' })
		expect(inlineImageBid(t, 3)).toBe(bid)
		expect(t.toDelta()[1]).toEqual({ insert: { img: { ...img, alt: 'cat' } } })
	})
})

describe('image paragraphs stay intact', () => {
	/** 'ab\n' + image paragraph at 3 + 'cd\n'. */
	const setup = () => {
		const t = new Y.Doc().getText('t')
		t.insert(0, 'ab\n', { bid: 'p1' })
		insertImageParagraph(t, 3, { fileId: 'f1', w: 10, h: 10, alt: '' })
		t.insert(5, 'cd\n', { bid: 'p3' })
		return t
	}
	const text = (t: Y.Text) =>
		(t.toDelta() as { insert: unknown }[])
			.map((op) => (typeof op.insert === 'string' ? op.insert : '#'))
			.join('')
	/** Each embed alone in its paragraph. */
	const intact = (t: Y.Text) => {
		for (const p of text(t).split('\n')) if (p.includes('#')) expect(p).toBe('#')
	}

	it.each([
		['Backspace after it', 4, 5],
		['selected image', 3, 4],
		['Delete at the end of the paragraph before it', 2, 3],
		['Shift+→ twice', 2, 4]
	])('%s deletes the whole image paragraph', (_n, from, to) => {
		const t = setup()
		deleteRange(t, from, to)
		expect(text(t)).toBe('ab\ncd\n')
		const nl = (t.toDelta() as { insert: unknown; attributes?: { bid?: string } }[])
			.filter((op) => typeof op.insert === 'string' && op.insert.includes('\n'))
			.map((op) => op.attributes?.bid)
		expect(nl).toEqual(['p1', 'p3'])
	})

	it('a range ending before the image keeps its paragraph break', () => {
		const t = setup()
		deleteRange(t, 1, 3)
		expect(text(t)).toBe('a\n#\ncd\n')
	})

	it('typing beside the image opens a paragraph of its own', () => {
		const t = setup()
		expect(insertText(t, 3, 'x')).toBe(4)
		expect(text(t)).toBe('ab\nx\n#\ncd\n')
		intact(t)
		const u = setup()
		expect(insertText(u, 4, 'x')).toBe(6)
		expect(text(u)).toBe('ab\n#\nx\ncd\n')
		intact(u)
	})
})

describe('hitText', () => {
	const line = (y: number, w: number, from: number): PlacedLine => ({
		line: {
			story: 's',
			x: 0,
			y,
			ascent: 8,
			descent: 2,
			carets: Array.from({ length: 11 }, (_, i) => (i * w) / 10)
		} as unknown as PlacedLine['line'],
		page: 0,
		from,
		to: from + 10
	})
	const lines = [line(10, 100, 0), line(30, 20, 11), line(50, 100, 22)]
	const index: GeomIndex = { stories: new Map([['s', lines]]), pages: new Map([[0, lines]]) }

	it('picks the line by y within the column and clamps x to its end', () => {
		expect(hitText(index, 0, 80, 28)).toEqual({ story: 's', offset: 21 })
		expect(hitText(index, 0, 80, 34)).toEqual({ story: 's', offset: 21 })
	})
})

describe('hitText with text areas (UX-22)', () => {
	const L = (story: string, y: number, w: number, from: number, page = 0): PlacedLine => ({
		line: {
			story,
			x: 0,
			y,
			ascent: 8,
			descent: 2,
			carets: Array.from({ length: 11 }, (_, i) => (i * w) / 10)
		} as unknown as PlacedLine['line'],
		page,
		from,
		to: from + 10
	})
	const s = [L('s', 10, 100, 0), L('s', 30, 20, 11), L('s', 50, 100, 22)]
	const b = [L('b', 45, 40, 0)]
	const areas: TextArea[] = [
		{ x: 0, y: 0, w: 100, h: 60 },
		{ x: 0, y: 40, w: 50, h: 20, story: 'b' }
	]
	const idx = (more: PlacedLine[] = []): GeomIndex => ({
		stories: new Map([
			['s', [...s, ...more]],
			['b', b]
		]),
		pages: new Map([[0, [...s, ...b]]])
	})

	it('misses outside every area', () => {
		expect(hitText(idx(), 0, 150, 100, undefined, areas)).toBeUndefined()
	})

	it('accepts a point within slop of an area', () => {
		expect(hitText(idx(), 0, 105, 10, undefined, areas, 0)).toBeUndefined()
		expect(hitText(idx(), 0, 105, 10, undefined, areas, 8)).toEqual({ story: 's', offset: 10 })
	})

	it('a text box takes only its own story, a flow area never a box story', () => {
		expect(hitText(idx(), 0, 10, 45, undefined, areas)).toMatchObject({ story: 'b' })
		expect(hitText(idx(), 0, 80, 45, undefined, areas)).toEqual({ story: 's', offset: 30 })
	})

	it('below the last line goes to the story end only when that line ends the story', () => {
		expect(hitText(idx(), 0, 80, 58, undefined, areas)).toEqual({ story: 's', offset: 32 })
		const more = [L('s', 10, 100, 33, 1)]
		expect(hitText(idx(more), 0, 80, 58, undefined, areas)).toEqual({ story: 's', offset: 30 })
	})
})
