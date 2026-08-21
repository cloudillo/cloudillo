// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { compactBlockContent, expandBlockContent, normalizeSiteInline } from '../rtdb/transform.js'
import {
	type CompactInlineContent,
	isCompactTableCellArray,
	isTableCellArray,
	type TableContent
} from '../rtdb/types.js'

// Blocks written before `7def7bc feat(notillo): compact block serialization for RTDB
// wire format` still hold BlockNote's verbose inline items. Notillo reads both shapes;
// the publisher did not, and every un-retyped block published as an empty element.

describe('normalizeSiteInline', () => {
	it('should return already-compact items untouched', () => {
		expect(normalizeSiteInline('plain')).toBe('plain')
		const tuple: CompactInlineContent = ['x', 'bi']
		expect(normalizeSiteInline(tuple)).toBe(tuple)
		const link: CompactInlineContent = { l: 'https://example.com', c: ['x'] }
		expect(normalizeSiteInline(link)).toBe(link)
		const wl: CompactInlineContent = { wl: 'pg1', wt: 'Page' }
		expect(normalizeSiteInline(wl)).toBe(wl)
		const tag: CompactInlineContent = { tg: 'notes' }
		expect(normalizeSiteInline(tag)).toBe(tag)
	})

	it('should reduce unstyled legacy text to a bare string', () => {
		expect(normalizeSiteInline({ type: 'text', text: 'hello' })).toBe('hello')
		expect(normalizeSiteInline({ type: 'text', text: 'hello', styles: {} })).toBe('hello')
	})

	it('should encode legacy style flags in `STYLE_FLAG_MAP` order', () => {
		expect(
			normalizeSiteInline({
				type: 'text',
				text: 'hello',
				styles: { code: true, bold: true, italic: true }
			})
		).toEqual(['hello', 'bic'])
		expect(
			normalizeSiteInline({
				type: 'text',
				text: 'hello',
				styles: { underline: true, strikethrough: true }
			})
		).toEqual(['hello', 'us'])
	})

	it('should carry legacy colours across but drop the literal `default`', () => {
		expect(
			normalizeSiteInline({
				type: 'text',
				text: 'hello',
				styles: { textColor: 'red', backgroundColor: 'blue' }
			})
		).toEqual(['hello', '', { tc: 'red', bg: 'blue' }])
		expect(
			normalizeSiteInline({
				type: 'text',
				text: 'hello',
				styles: { bold: true, textColor: 'default', backgroundColor: 'default' }
			})
		).toEqual(['hello', 'b'])
	})

	it('should convert a legacy link and normalize its content recursively', () => {
		expect(
			normalizeSiteInline({
				type: 'link',
				href: 'https://example.com',
				content: [{ type: 'text', text: 'site', styles: { bold: true } }]
			})
		).toEqual({ l: 'https://example.com', c: [['site', 'b']] })
	})

	it('should convert a legacy wikiLink and tag', () => {
		expect(
			normalizeSiteInline({
				type: 'wikiLink',
				props: { pageId: 'pg1', pageTitle: 'Other page' }
			})
		).toEqual({ wl: 'pg1', wt: 'Other page' })
		expect(normalizeSiteInline({ type: 'tag', props: { tag: 'notes' } })).toEqual({
			tg: 'notes'
		})
	})

	it('should hand an unrecognised type back for the caller to drop', () => {
		const exotic = { type: 'somethingNewer', props: {} } as unknown as CompactInlineContent
		expect(normalizeSiteInline(exotic)).toBe(exotic)
	})
})

// A table is the one block whose content is not a plain run list, and it makes the
// same round trip on every edit: RTDB -> editor -> RTDB. Anything the trip does not
// carry both ways is lost the first time the author touches the block.

describe('table content round trip', () => {
	const text = (value: string) => ({ type: 'text' as const, text: value, styles: {} })

	const table: TableContent = {
		type: 'tableContent',
		columnWidths: [120, 200],
		headerRows: 1,
		headerCols: 1,
		rows: [
			{
				cells: [
					{ type: 'tableCell', props: { colspan: 2 }, content: [text('head')] },
					{ type: 'tableCell', props: {}, content: [] }
				]
			},
			{ cells: [[text('a')], []] }
		]
	}

	it('should carry widths, headers and cell props both ways', () => {
		const compact = compactBlockContent(table)
		const back = expandBlockContent(compact) as TableContent

		expect(back.columnWidths).toEqual([120, 200])
		expect(back.headerRows).toBe(1)
		expect(back.headerCols).toBe(1)
		expect(back.rows[0].cells).toEqual([
			{ type: 'tableCell', props: { colspan: 2 }, content: [text('head')] },
			{ type: 'tableCell', props: {}, content: [] }
		])
		expect(back.rows[1].cells).toEqual([[text('a')], []])
	})

	it('should read a legacy verbose cell instead of throwing on it', () => {
		// Written before content compaction: the cell is an object, not a run array.
		// With no branch for it, `cell.map(…)` threw, the page-load promise rejected,
		// and the whole page rendered its error state — it could not be opened at all.
		const stored = {
			type: 'tableContent',
			rows: [
				{
					cells: [
						{ type: 'tableCell', props: { colspan: 2 }, content: ['a'] },
						{ type: 'tableCell', content: [{ type: 'text', text: 'b', styles: {} }] }
					]
				}
			]
		}

		const back = expandBlockContent(stored) as TableContent
		expect(back.rows[0].cells).toEqual([
			{ type: 'tableCell', props: { colspan: 2 }, content: [text('a')] },
			{ type: 'tableCell', props: {}, content: [text('b')] }
		])
	})

	it('should keep a legacy table geometry written in the verbose spelling', () => {
		// Same vintage as the cell above: `columnWidths`/`headerRows`/`headerCols`
		// rather than `cw`/`hr`/`hc`. Reading only the compact keys returned an empty
		// `columnWidths` and no header rows, and the next edit wrote that loss back.
		const stored = {
			type: 'tableContent',
			columnWidths: [120, 80],
			headerRows: 1,
			headerCols: 1,
			rows: [
				{
					cells: [
						{
							type: 'tableCell',
							props: {},
							content: [{ type: 'text', text: 'a', styles: {} }]
						}
					]
				}
			]
		}

		const back = expandBlockContent(stored) as TableContent
		expect(back.columnWidths).toEqual([120, 80])
		expect(back.headerRows).toBe(1)
		expect(back.headerCols).toBe(1)
		expect(back.rows[0].cells).toEqual([{ type: 'tableCell', props: {}, content: [text('a')] }])
	})
})

// The guards ask `every`, never `some`: a row holding one of each spelling would
// otherwise be mapped wholesale as whichever came first, and `cell.map(…)` over the
// object spelling throws out of the publish. That property is what these hold — it
// survived the switch from a runtype decode per cell to a structural check.
describe('mixed-spelling table rows', () => {
	const objectCell = { type: 'tableCell', props: {}, content: ['a'] }
	const compactCell = { pr: {}, c: ['a'] }
	const bareRun = ['b']

	it('should refuse a verbose row that also holds a bare run', () => {
		expect(isTableCellArray([objectCell, bareRun] as never)).toBe(false)
		expect(isTableCellArray([objectCell] as never)).toBe(true)
	})

	it('should refuse a compact row that also holds a bare run', () => {
		expect(isCompactTableCellArray([compactCell, bareRun] as never)).toBe(false)
		expect(isCompactTableCellArray([compactCell] as never)).toBe(true)
	})
})

// vim: ts=4
