// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { FX } from '@cloudillo/typeset'
import * as Y from 'yjs'

import { openPublication } from '../crdt/document.js'
import { newSectionMap } from '../crdt/entities.js'
import { sanitizeOverrides } from '../crdt/overrides.js'
import type { StoredSection } from '../crdt/stored-types.js'
import type { DeltaOp } from '../crdt/type-converters.js'
import { deltaToHtml, deltaToPlain, pasteDelta, readDelta } from '../editor/clipboard.js'
import { deleteRange } from '../editor/text-edit.js'

function setup() {
	const yDoc = new Y.Doc()
	const doc = openPublication(yDoc)
	const t = new Y.Text()
	doc.s.set('s1', newSectionMap({ story: 'S' } as StoredSection))
	doc.tx.set('S', t)
	doc.tx.set('fn1', new Y.Text())
	doc.f.set(
		'fn1',
		new Y.Map<unknown>([
			['t', 'fn'],
			['story', 'fn1']
		])
	)
	doc.tx.set('T', new Y.Text())
	return { doc, t }
}

const CELL = { 'table-cell': { 'data-row': 'r1' }, 'table-cell-block': 'c1' }

const paste = (ops: DeltaOp[]) => {
	const { doc, t } = setup()
	pasteDelta(doc, t, 0, ops)
	return t.toDelta() as DeltaOp[]
}

describe('pasteDelta', () => {
	it('drops unknown cs, unsafe links and missing footnotes; keeps cl: links', () => {
		const out = paste([
			{ insert: 'a', attributes: { cs: 'nope' } },
			{ insert: 'b', attributes: { link: 'javascript:alert(1)' } },
			{ insert: 'c', attributes: { link: 'https://x.org/\tevil' } },
			{ insert: 'd', attributes: { link: 'cl:abc' } },
			{ insert: { fn: 'missing' } },
			{ insert: { fn: 'fn1' } }
		])
		expect(out[0]).toEqual({ insert: 'abc' })
		expect(out[1]).toEqual({ insert: 'd', attributes: { link: 'cl:abc' } })
		// The ref gets a copy of the body (`copyStory`).
		const fn = (out[2].insert as { fn: string }).fn
		expect(fn).not.toBe('fn1')
		expect(out).toHaveLength(3)
	})

	it('keeps footnote refs only for footnotes, outside tables', () => {
		const embeds = (out: DeltaOp[]) => out.filter((o) => typeof o.insert !== 'string')
		// A non-footnote story, and a ref on a pasted table line.
		expect(embeds(paste([{ insert: { fn: 'T' } }]))).toEqual([])
		expect(
			embeds(paste([{ insert: { fn: 'fn1' } }, { insert: '\n', attributes: CELL }]))
		).toEqual([])
		// Pasted into a cell.
		const { doc, t } = setup()
		t.insert(0, 'x\n', CELL)
		pasteDelta(doc, t, 0, [{ insert: { fn: 'fn1' } }])
		expect(embeds(t.toDelta() as DeltaOp[])).toEqual([])
	})

	it('pastes a table into a cell without its end line', () => {
		const { doc, t } = setup()
		t.insert(0, 'x\n', CELL)
		pasteDelta(doc, t, 0, [
			{ insert: 'a' },
			{
				insert: '\n',
				attributes: { 'table-cell': { 'data-row': 'r9' }, 'table-cell-block': 'c9' }
			},
			{ insert: 'b' },
			{
				insert: '\n',
				attributes: { 'table-cell': { 'data-row': 'r9' }, 'table-cell-block': 'c8' }
			},
			{ insert: '\n', attributes: { 'table-temporary': {} } }
		])
		expect(t.toString()).toBe('a\nb\nx\n')
	})

	it('sanitizes po and clamps indent', () => {
		const out = paste([
			{
				insert: 'x\n',
				attributes: {
					po: { size: 1e12, align: 'left', evil: 1 },
					list: 'bullet',
					indent: 99
				}
			}
		])
		const a = out[1].attributes as Record<string, unknown>
		expect(a.po).toEqual({ align: 'left' })
		expect(a.indent).toBe(8)
		expect(a.list).toBe('bullet')
		expect(typeof a.bid).toBe('string')
	})
})

describe('readDelta', () => {
	it('keeps known embed shapes only', () => {
		const ops = readDelta(
			JSON.stringify({
				ops: [
					{ insert: { evil: 1 } },
					{ insert: { emb: {} } },
					{ insert: { img: { fileId: 'f', w: 1, h: 1, alt: '' } } },
					{ insert: { fn: 'fn1' } },
					{ insert: { toc: { levels: 3 } } },
					{ insert: { fn: 'a', field: 'page' } },
					{ insert: 'x' }
				]
			})
		)
		const kinds = ops?.map((o) =>
			typeof o.insert === 'string' ? o.insert : Object.keys(o.insert ?? {})[0]
		)
		expect(kinds).toEqual(['img', 'fn', 'toc', 'x'])
		expect(readDelta('not json')).toBeUndefined()
	})
})

describe('deltaToHtml / deltaToPlain', () => {
	it('escapes text and attributes, drops unsafe links', () => {
		const { doc } = setup()
		const html = deltaToHtml(doc, [
			{ insert: '<b>&', attributes: { link: 'https://x.org/"q' } },
			{ insert: 'y', attributes: { link: 'javascript:1' } },
			{ insert: '\n' }
		])
		expect(html).toBe('<p><a href="https://x.org/&quot;q">&lt;b&gt;&amp;</a>y</p>')
	})

	it('plain text drops embeds', () => {
		expect(deltaToPlain([{ insert: 'a' }, { insert: { fn: 'x' } }, { insert: 'b\n' }])).toBe(
			'ab\n'
		)
	})
})

describe('sanitizeOverrides', () => {
	it('keeps valid known keys only', () => {
		expect(
			sanitizeOverrides({
				size: 12 * FX,
				leading: -1,
				indentFirst: -10 * FX,
				spaceAfter: 2000 * FX,
				widows: 2.5,
				orphans: 3,
				tocLevel: 7,
				breakBefore: 'page',
				font: 'x'.repeat(101),
				hyphenate: 'yes',
				list: { kind: 'bullet', format: '', level: 0 },
				evil: 1
			})
		).toEqual({ size: 12 * FX, indentFirst: -10 * FX, orphans: 3, breakBefore: 'page' })
		expect(sanitizeOverrides({ size: 0.5 * FX })).toBeUndefined()
		expect(sanitizeOverrides([1])).toBeUndefined()
		expect(sanitizeOverrides('x')).toBeUndefined()
	})
})

describe('deleteRange', () => {
	it('keeps the first paragraph nh across a merge', () => {
		const t = new Y.Doc().getText('t')
		t.insert(0, 'ab')
		t.insert(2, '\n', { bid: 'A', nh: 1 })
		t.insert(3, 'cd')
		t.insert(5, '\n', { bid: 'B' })
		deleteRange(t, 1, 4)
		expect(t.toDelta().at(-1).attributes).toEqual({ bid: 'A', nh: 1 })
	})
})

// vim: ts=4
