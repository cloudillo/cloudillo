// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { FX, type LineGeom } from '@cloudillo/typeset'
import { describe, expect, it } from '@jest/globals'
import * as Y from 'yjs'

import { openPublication } from '../crdt/document'
import { FULL_CROP, newFrameMap, newSectionMap } from '../crdt/entities'
import type { StoredFrame, StoredSection } from '../crdt/stored-types'
import type { PlacedLine } from '../editor/caret'
import { type EmbedKind, type MarksCtx, marksCtx, pageMarks } from '../editor/marks'

/** Clusters 10 pt wide from x 0; offsets [from, to) of paragraph `bid` starting at `start`. */
const line = (
	y: number,
	from: number,
	to: number,
	opt: { bid?: string; start?: number; page?: number; extra?: Partial<LineGeom> } = {}
): PlacedLine => {
	const start = opt.start ?? 0
	return {
		line: {
			story: 'main',
			bid: opt.bid ?? 'p',
			from: from - start,
			to: to - start,
			row: y,
			x: 0,
			y: y * FX,
			ascent: 10 * FX,
			descent: 2 * FX,
			carets: Int32Array.from({ length: to - from + 1 }, (_, i) => i * 10 * FX),
			...opt.extra
		},
		page: opt.page ?? 0,
		from,
		to
	}
}

const ctx = (
	text: string,
	lines: PlacedLine[],
	o: { end?: 'end' | 'section' | 'none'; embeds?: [number, EmbedKind][] } = {}
): MarksCtx => ({
	text: () => text,
	embeds: () => new Map(o.embeds),
	storyLines: () => lines,
	storyEnd: () => o.end ?? 'end',
	colRight: () => 200 * FX
})

const kinds = (ms: { k: string }[]) => ms.map((m) => m.k)

describe('pageMarks', () => {
	it('centres spacing marks between carets', () => {
		const text = 'a b\u00a0c\td\n'
		const ls = [line(20, 0, 7)]
		const ms = pageMarks(ls, ctx(text, ls))
		expect(ms.filter((m) => m.k !== 'end').map((m) => [m.k, m.x])).toEqual([
			['space', 15],
			['nbsp', 35],
			['tab', 55]
		])
		expect(ms[0].y).toBe(20)
		expect(ms[0].size).toBe(8)
	})

	it('skips a soft hyphen ending a hyphenated line, marks it mid-line', () => {
		const text = 'ab\u00adcd\u00ad\nx'
		const ls = [line(20, 0, 3), line(40, 3, 6)]
		const ms = pageMarks(ls, ctx(text, ls, { end: 'none' }))
		expect(ms.filter((m) => m.k === 'shy')).toHaveLength(1)
		expect(ms.find((m) => m.k === 'shy')?.x).toBe(25)
	})

	it('draws a tick for zero-width characters and ↵ for forced breaks', () => {
		const text = 'a\u200bb\vc\n'
		const ls = [line(20, 0, 5)]
		const ms = pageMarks(ls, ctx(text, ls))
		expect(ms.find((m) => m.k === 'zw')?.x).toBe(10)
		expect(ms.find((m) => m.k === 'lbr')?.x).toBe(30)
	})

	it('puts ¶ only on the last line of a paragraph', () => {
		// Paragraph p (0..10) wraps onto page 1; paragraph q (11..13) ends the story.
		const text = 'aaaaabbbbb\ncc\n'
		const ls = [
			line(20, 0, 5),
			line(20, 5, 10, { page: 1 }),
			line(40, 11, 13, { bid: 'q', start: 11, page: 1 })
		]
		const c = ctx(text, ls, { end: 'none' })
		expect(kinds(pageMarks([ls[0]], c))).toEqual([])
		const ms = pageMarks(ls.slice(1), c)
		expect(kinds(ms)).toEqual(['para', 'para'])
		expect(ms[0].x).toBe(50)
	})

	it('ends a story with # or a section break rule', () => {
		const text = 'ab\n'
		const ls = [line(20, 0, 2)]
		expect(kinds(pageMarks(ls, ctx(text, ls, { end: 'end' })))).toEqual(['end'])
		const sec = pageMarks(ls, ctx(text, ls, { end: 'section' }))
		expect(kinds(sec)).toEqual(['para', 'section'])
		expect(sec[1].label).toBe('Section break')
		expect(sec[1].x2).toBe(200)
		const cell = { ...ls[0], cell: { row: 'r', cell: 'c' } }
		expect(kinds(pageMarks([cell], ctx(text, [cell], { end: 'end' })))).toEqual(['para'])
	})

	it('anchors a break rule to the previous paragraph, else above the first line', () => {
		const text = 'ab\ncd\n'
		const ls = [line(20, 0, 2), line(40, 3, 5, { bid: 'q', start: 3, extra: { brk: 'page' } })]
		const ms = pageMarks(ls, ctx(text, ls, { end: 'none' }))
		expect(kinds(ms)).toEqual(['para', 'page', 'para'])
		expect(ms[1]).toMatchObject({ y: 20 - 0.3 * 8, label: 'Page break', x2: 200 })
		expect(ms[1].x).toBeCloseTo(20 + 0.7 * 8)

		const only = [line(20, 0, 2, { extra: { brk: 'column' } })]
		const top = pageMarks(only, ctx('ab\n', only, { end: 'none' }))
		expect(top[0]).toMatchObject({ k: 'column', x: 0, y: 10 - 0.3 * 8, label: 'Column break' })
	})

	it('tints field and footnote embeds, marks anchors', () => {
		const text = 'a\ufffc\ufffc\ufffc\ufffc\n'
		const ls = [line(20, 0, 5)]
		const ms = pageMarks(
			ls,
			ctx(text, ls, {
				embeds: [
					[1, 'field'],
					[2, 'fn'],
					[3, 'frame'],
					[4, 'frame-unused']
				],
				end: 'none'
			})
		)
		expect(ms[0]).toEqual({ k: 'field', x: 10, x2: 20, y: 10, size: 12 })
		expect(ms[1].k).toBe('fn')
		expect(ms[2]).toMatchObject({ k: 'frame', x: 30 })
		expect(ms[3]).toMatchObject({ k: 'frame-unused', label: 'Unused anchor' })
	})

	it('skips the marker the selected frame draws, on its page only', () => {
		const text = 'a\ufffc\ufffc\n'
		const ls = [line(20, 0, 3)]
		const c = ctx(text, ls, {
			embeds: [
				[1, 'frame'],
				[2, 'frame']
			],
			end: 'none'
		})
		const at = (page: number) =>
			pageMarks(ls, c, { story: 'main', at: 1, page }).filter((m) => m.k === 'frame')
		expect(at(0).map((m) => m.x)).toEqual([20])
		expect(at(1).map((m) => m.x)).toEqual([10, 20])
	})

	it('propagates the line rotation', () => {
		const text = 'a b\n'
		const ls = [line(20, 0, 3, { extra: { rot: { deg: 90, cx: 10 * FX, cy: 20 * FX } } })]
		for (const m of pageMarks(ls, ctx(text, ls))) expect(m.rot).toBe('rotate(90 10 20)')
	})
})

describe('marksCtx anchors', () => {
	const img = (story: string): StoredFrame => ({
		t: 'img',
		anchor: { txt: story, rel: 'text' },
		x: 0,
		y: 0,
		w: 100,
		h: 50,
		rot: 0,
		z: 0,
		wrap: { mode: 'box', off: 0 },
		data: { fileId: 'file', crop: FULL_CROP, fit: 'contain', alt: '' }
	})

	it('marks only the winning section-story markers as used', () => {
		const doc = openPublication(new Y.Doc())
		const s = new Y.Text()
		const box = new Y.Text()
		doc.tx.set('S', s)
		doc.tx.set('T', box)
		doc.s.set('s1', newSectionMap({ story: 'S' } as StoredSection))
		doc.secs.push(['s1'])
		doc.f.set('A', newFrameMap(img('S')))
		const m = (id: string) => ({ insert: { frame: id } })
		// A wins at 0; its second marker, an ignored '' and a frameless id are unused.
		s.applyDelta([m('A'), m('A'), m(''), m('Z'), { insert: '\n' }])
		box.applyDelta([m('A'), { insert: '\n' }])
		const c = marksCtx(doc, { stories: new Map(), pages: new Map() }, () => undefined)
		expect([...c.embeds('S')]).toEqual([
			[0, 'frame'],
			[1, 'frame-unused'],
			[2, 'frame-unused'],
			[3, 'frame-unused']
		])
		expect([...c.embeds('T')]).toEqual([[0, 'frame-unused']])
	})
})

// vim: ts=4
