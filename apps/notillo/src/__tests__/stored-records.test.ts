// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// What an RTDB document is allowed to be missing, and what costs it its place.
//
// Every read of `p` and `b` goes through `decodeStoredPage` / `decodeStoredBlock`,
// and the unit of failure is the **document**: a page with no `ti` has no usable
// title, and `fromStoredPage` used to hand that `undefined` through a `string`-typed
// field straight into `escapeHtml()` in the publisher.

import { expandTableContent, fromStoredPage, toStoredPage } from '../rtdb/transform.js'
import {
	decodeSiteInline,
	decodeStoredBlock,
	decodeStoredPage,
	isCompactTableCellArray,
	type TableContent
} from '../rtdb/types.js'

// The projection `PAGE_FIELDS` in `hooks/useAllPages.ts` selects. One validator has
// to serve both this and the unprojected read in `publish/container.ts`, which is
// only true while every *required* field is in here.
const PROJECTED = {
	ti: 'Home',
	ic: '📄',
	pp: '__root__',
	o: 10,
	tg: ['news'],
	slug: 'home',
	draft: false,
	kind: 'post',
	childKind: 'post',
	noNav: null,
	pubAt: '2026-01-01T00:00:00Z'
}

describe('decodeStoredPage', () => {
	it('should accept a page read through the page-map projection', () => {
		expect(decodeStoredPage(PROJECTED, 'p1')).toEqual(PROJECTED)
	})

	it('should accept the unprojected read the publisher does', () => {
		const full = {
			...PROJECTED,
			ca: '2026-01-01T00:00:00Z',
			ua: '2026-01-02T00:00:00Z',
			cb: 'alice.tld',
			author: '@alice.tld',
			desc: 'A description',
			image: 'file1',
			// Dead denormalised child indicator that older documents still carry.
			hc: true
		}
		expect(decodeStoredPage(full, 'p1')).toEqual(full)
	})

	it('should keep a cleared site field as the null it is stored as', () => {
		// `updatePage` clears a field by writing `null`, and every consumer treats
		// that exactly as an absent field — but the two must stay distinguishable
		// from a projected read that never fetched it at all.
		const page = decodeStoredPage(
			{ ...PROJECTED, slug: null, draft: null, childKind: null },
			'p1'
		)
		expect(page).toMatchObject({ slug: null, draft: null, childKind: null })
	})

	it('should round-trip childKind through the readable record and back', () => {
		// The creation scaffold and the publisher both read it, so it has to survive
		// both directions — and a page that never set it must stay without the field
		// rather than gaining an explicit `page`.
		const { childKind, ...without } = PROJECTED
		const stored = decodeStoredPage({ ...without, ca: 'c', ua: 'u', cb: 'x' }, 'p1')
		expect(stored).toBeDefined()
		const record = fromStoredPage(stored!)
		expect(record.childKind).toBeUndefined()
		expect(
			toStoredPage({ ...record, createdAt: 'c', updatedAt: 'u', createdBy: 'x' })
		).not.toHaveProperty('childKind')

		const withKind = fromStoredPage(decodeStoredPage(PROJECTED, 'p1')!)
		expect(withKind.childKind).toBe('post')
		expect(
			toStoredPage({ ...withKind, createdAt: 'c', updatedAt: 'u', createdBy: 'x' }).childKind
		).toBe('post')
	})

	it('should skip a page with no title rather than publish an undefined one', () => {
		const { ti, ...noTitle } = PROJECTED
		expect(decodeStoredPage(noTitle, 'p1')).toBeUndefined()
		expect(decodeStoredPage({ ...PROJECTED, ti: 42 }, 'p1')).toBeUndefined()
	})

	it('should keep a page a newer Notillo added a field to', () => {
		const page = decodeStoredPage({ ...PROJECTED, somethingNewer: 'x' }, 'p1')
		expect(page).toEqual(PROJECTED)
	})
})

describe('decodeStoredBlock', () => {
	const BLOCK = { p: 'p1', t: 'p', o: 1, ua: '2026-01-01T00:00:00Z' }

	it('should leave a block content undecoded so one bad run cannot cost the block', () => {
		// The runs are decoded where they are rendered — `tSiteInline` — precisely so
		// that a paragraph does not vanish from a document over one unreadable word.
		const block = decodeStoredBlock({ ...BLOCK, c: ['fine', { nonsense: true }] }, 'b1')
		expect(block?.c).toEqual(['fine', { nonsense: true }])
	})

	it('should skip a block that names no page', () => {
		const { p, ...noPage } = BLOCK
		expect(decodeStoredBlock(noPage, 'b1')).toBeUndefined()
	})

	it('should keep a table’s column widths and header rows', () => {
		// `DECODE_OPTS` drops unknown fields and `T.struct` rebuilds the object, so a
		// field the table envelope does not declare is discarded on the way in. The
		// table then renders with no widths and no headers, and the next edit writes
		// that loss straight back into RTDB.
		const block = decodeStoredBlock(
			{
				...BLOCK,
				t: 'tb',
				c: {
					type: 'tableContent',
					cw: [120, 200],
					hr: 1,
					hc: 1,
					rows: [{ cells: [[['a']], [['b']]] }]
				}
			},
			'b1'
		)
		expect(block?.c).toMatchObject({ cw: [120, 200], hr: 1, hc: 1 })
	})

	it('should keep a table whose column widths have holes in them', () => {
		// BlockNote's `columnWidths` is `(number | undefined)[]`, and a hole arrives
		// from the wire as `null`. Refusing one would fail the whole block's decode
		// and lose the table, which is worse than the loss above.
		const block = decodeStoredBlock(
			{ ...BLOCK, t: 'tb', c: { type: 'tableContent', cw: [null, 200], rows: [] } },
			'b1'
		)
		expect(block?.c).toMatchObject({ cw: [null, 200] })
	})

	it('should carry a legacy table’s geometry all the way through the expander', () => {
		// The *composed* read path, which is the one the editor takes. Asserting on
		// `decodeStoredBlock` alone, or on `expandTableContent` alone, passes while
		// the pair loses the geometry between them: a block not retyped since content
		// compaction still spells its dimensions the way BlockNote does, and the
		// expander's fallback for those cannot fire if the decode already dropped them.
		const block = decodeStoredBlock(
			{
				...BLOCK,
				t: 'tb',
				c: {
					type: 'tableContent',
					columnWidths: [100, 200],
					headerRows: 1,
					headerCols: 1,
					rows: []
				}
			},
			'b1'
		)
		const table = expandTableContent(block?.c as TableContent)
		expect(table).toMatchObject({ columnWidths: [100, 200], headerRows: 1, headerCols: 1 })
	})
})

describe('decodeSiteInline', () => {
	it('should read a tuple as a tuple and not as an object', () => {
		// `T.union` returns the first member that decodes and `T.struct` does not
		// check `Array.isArray`, so the tuple members have to come first — otherwise
		// an all-optional struct swallows every styled run in the document.
		expect(decodeSiteInline(['x', 'bi'])).toEqual(['x', 'bi'])
		expect(decodeSiteInline(['x', 'b', { tc: 'red' }])).toEqual(['x', 'b', { tc: 'red' }])
	})
})

describe('isCompactTableCellArray', () => {
	it('should refuse a row that mixes the two cell spellings', () => {
		// Sampling `cells[0]` typed the whole row by its first element, and
		// `cell.map(…)` over the object spelling throws out of the publish.
		const mixed = [[['run']], { c: ['cell'] }] as never
		expect(isCompactTableCellArray(mixed)).toBe(false)
	})

	it('should accept a row of object cells and refuse a row of bare runs', () => {
		expect(isCompactTableCellArray([{ c: ['a'] }, { c: ['b'] }])).toBe(true)
		expect(isCompactTableCellArray([['a'], ['b']])).toBe(false)
	})

	it('should expand a mixed row per cell rather than throwing', () => {
		// Refusing the row is only half of it: the fallback used to be
		// `cell.map(…)` over every cell, which is exactly what the object spelling
		// has no method for — one malformed row cost the reader the whole page.
		const table = expandTableContent({
			type: 'tableContent',
			rows: [{ cells: [[['run']], { c: [['cell']] }] }]
		} as never)
		expect(table.rows[0].cells).toHaveLength(2)
		expect(table.rows[0].cells[1]).toMatchObject({ type: 'tableCell' })
	})
})

// vim: ts=4
