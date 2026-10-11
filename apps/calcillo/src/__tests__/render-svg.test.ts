// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { MAX_RENDER_SVG_ELEMENTS, MAX_RENDER_SVG_SIZE } from '@cloudillo/core'
import { resolveFontFamily } from '@cloudillo/fonts'
import type { Cell } from '@fortune-sheet/core'
import * as Y from 'yjs'

import { naturalSize } from '../embed-view'
import { generateSheetId } from '../id-generator'
import { CALC_FONTS, editorFontName, fontFamily, legacyFontName } from '../fonts'
import { renderRangeSvg, safeColor } from '../render-svg'
import { transformOp } from '../transform-ops'
import {
	ensureSheetDimensions,
	getOrCreateSheet,
	hideRow,
	indexToColId,
	indexToRowId,
	setBorder,
	setCell,
	setMerge,
	transformSheetToCelldata
} from '../ydoc-helpers'
import type { SheetId, YSheetStructure } from '../yjs-types'

describe('render-svg', () => {
	let doc: Y.Doc
	let sheetId: SheetId
	let sheet: YSheetStructure

	beforeEach(() => {
		doc = new Y.Doc()
		sheetId = generateSheetId()
		sheet = getOrCreateSheet(doc, sheetId)
		doc.getArray<SheetId>('sheetOrder').push([sheetId])
		ensureSheetDimensions(sheet, 20, 10)
	})

	const put = (r: number, c: number, cell: Cell) => setCell(sheet, r, c, cell)
	const range = (bottom: number, right: number) => ({ sheetId, top: 0, left: 0, bottom, right })
	const quadrants = () => {
		put(0, 0, { v: 'TL' })
		put(2, 0, { v: 'BL' })
		put(0, 2, { v: 'TR' })
		put(2, 2, { v: 'BR' })
	}

	describe('with a tall and a hidden row', () => {
		beforeEach(() => {
			sheet.rowHeights.set(indexToRowId(sheet, 1)!, 30)
			hideRow(sheet, 2)
			put(2, 0, { v: 'Hidden' })
			put(3, 0, { v: 'Visible' })
		})

		it('paginates between rows and columns, never through one', () => {
			// Rows 20 + 31 + 20 px (row 2 hidden), columns 74 + 74 px
			expect(naturalSize(doc, range(3, 1))).toEqual({ w: 148, h: 71 })
			put(0, 0, { v: 'R0C0' })
			put(1, 0, { v: 'R1C0' })
			put(0, 1, { v: 'R0C1' })
			const pages = renderRangeSvg(doc, range(3, 1), { w: 100, h: 60 })
			// Rows 0–1 fit 60 px, row 3 doesn't; each column needs its own 100 px page
			expect(pages).toHaveLength(4)
			for (const p of pages) expect(p).toContain('width="100" height="60"')
			const on = (label: string) =>
				pages.flatMap((p, i) => (p.includes(`>${label}<`) ? [i] : []))
			expect(on('R0C0')).toEqual([0])
			expect(on('R1C0')).toEqual([0])
			expect(on('Visible')).toEqual([1])
			expect(on('R0C1')).toEqual([2])
		})

		it('renders one page at the natural size without hidden rows', () => {
			const pages = renderRangeSvg(doc, range(3, 1))
			expect(pages).toHaveLength(1)
			expect(pages[0]).toContain('width="148" height="71" viewBox="0 0 148 71"')
			expect(pages[0]).toContain('>Visible<')
			expect(pages[0]).not.toContain('Hidden')
			expect(pages[0]).not.toMatch(/foreignObject|<script/)
		})
	})

	it('draws a merge once, spanning its cells', () => {
		setMerge(
			sheet,
			indexToRowId(sheet, 0)!,
			indexToRowId(sheet, 1)!,
			indexToColId(sheet, 0)!,
			indexToColId(sheet, 1)!
		)
		put(0, 0, { v: 'M', bg: '#ff0000' })
		put(1, 1, { v: 'covered' })
		const [svg] = renderRangeSvg(doc, range(2, 2))
		expect(svg).toContain('width="147" height="39" fill="#ff0000"')
		expect(svg.match(/>M</g)).toHaveLength(1)
		// No `ff`: the editor's default, Lato
		expect(svg).toContain('font-family="Lato"')
		expect(svg).not.toContain('covered')
	})

	it('clamps a merge split by a page break to each page', () => {
		setMerge(
			sheet,
			indexToRowId(sheet, 0)!,
			indexToRowId(sheet, 3)!,
			indexToColId(sheet, 0)!,
			indexToColId(sheet, 0)!
		)
		put(0, 0, { v: 'M', bg: '#ff0000' })
		const pages = renderRangeSvg(doc, range(3, 0), { w: 150, h: 45 })
		expect(pages).toHaveLength(2)
		// Two 20px rows per page, not the merge's full 80px
		for (const p of pages) expect(p).toMatch(/height="39" fill="#ff0000"/)
	})

	it('stays within the host element budget for a large range of short values', () => {
		ensureSheetDimensions(sheet, 150, 150)
		for (let r = 0; r < 150; r++) for (let c = 0; c < 150; c++) put(r, c, { v: String(r + c) })
		const [svg] = renderRangeSvg(doc, range(149, 149))
		expect(svg.length).toBeLessThanOrEqual(MAX_RENDER_SVG_SIZE)
		// Opening tags = elements; sanitizeSvg needs a DOM, absent in this node environment
		expect(svg.match(/<[^/]/g)?.length).toBeLessThanOrEqual(MAX_RENDER_SVG_ELEMENTS)
	})

	it('tiles pages down first, then across', () => {
		quadrants()
		const pages = renderRangeSvg(doc, range(3, 3), { w: 150, h: 45 })
		expect(pages).toHaveLength(4)
		const order = ['TL', 'BL', 'TR', 'BR']
		pages.forEach((p, i) => {
			for (const label of order) {
				if (label === order[i]) expect(p).toContain(`>${label}<`)
				else expect(p).not.toContain(`>${label}<`)
			}
		})
	})

	it('repeats the first row on following pages', () => {
		quadrants()
		const pages = renderRangeSvg(doc, range(3, 3), { w: 150, h: 45, repeatHead: true })
		// The head takes room, so each column strip needs three pages
		expect(pages).toHaveLength(6)
		expect(pages[1]).toContain('>TL<')
		expect(pages[1]).toContain('>BL<')
		expect(pages[4]).toContain('>TR<')
	})

	it('fits the range to the page width', () => {
		quadrants()
		const pages = renderRangeSvg(doc, range(3, 3), { w: 74, h: 1000, fitWidth: true })
		expect(pages).toHaveLength(1)
		expect(pages[0]).toContain('scale(0.25)')
		for (const label of ['TL', 'BL', 'TR', 'BR']) expect(pages[0]).toContain(`>${label}<`)
	})

	it('scales an oversized column down instead of cutting it', () => {
		sheet.colWidths.set(indexToColId(sheet, 0)!, 499)
		const pages = renderRangeSvg(doc, range(0, 1), { w: 100, h: 1000 })
		expect(pages).toHaveLength(2)
		expect(pages[0]).toContain('scale(0.2)')
		expect(pages[1]).toContain('scale(1)')
	})

	it('keeps the leading grid line and top/left borders inside the clip', () => {
		setBorder(sheet, 0, 0, {
			top: { style: 1, color: '#ff0000' },
			left: { style: 1, color: '#ff0000' }
		})
		const [svg] = renderRangeSvg(doc, range(1, 1))
		expect(svg).toMatch(/<line x1="0" y1="0\.5" x2="\d+" y2="0\.5" stroke="#[0-9a-f]+"/)
		const red = svg.match(/<line [^>]*stroke="#ff0000"/g) ?? []
		expect(red).toHaveLength(2)
		expect(svg).not.toMatch(/="-0\.5"/)
	})

	it('replaces a control character, which would make the SVG unparseable', () => {
		put(0, 0, { v: 'a\u0001b' })
		const [svg] = renderRangeSvg(doc, range(0, 0))
		expect(svg).not.toContain('\u0001')
		expect(svg).toContain('>a b</text>')
	})

	it('falls back to the default for colors outside the allow-list', () => {
		expect(safeColor('#ff0000', '#000')).toBe('#ff0000')
		expect(safeColor('rgba(1, 2, 3, 0.5)', '#000')).toBe('rgba(1, 2, 3, 0.5)')
		expect(safeColor('red', '#000')).toBe('red')
		expect(safeColor('url(#x)', '#000')).toBe('#000')
		expect(safeColor('red;stroke:blue', '#000')).toBe('#000')
		put(0, 0, { v: 'x', fc: 'url(https://evil)' })
		const [svg] = renderRangeSvg(doc, range(0, 0))
		expect(svg).toContain('fill="#000000"')
		expect(svg).not.toContain('evil')
	})

	it('maps a legacy numeric font index to its name', () => {
		expect(legacyFontName(1)).toBe('Arial')
		expect(legacyFontName('3')).toBe('Verdana')
		expect(legacyFontName(0)).toBeUndefined()
		expect(legacyFontName('Lato')).toBeUndefined()
		expect(fontFamily(1)).toBe(resolveFontFamily('Arial'))
		expect(fontFamily(undefined)).toBe('Lato')
	})

	it('stores the editor font name, and reads a stored index as the legacy name', () => {
		expect(editorFontName(2)).toBe(CALC_FONTS[2])
		expect(editorFontName('3')).toBe(CALC_FONTS[3])
		expect(editorFontName(0)).toBe(0)
		expect(editorFontName('Lato')).toBe('Lato')
		const op = (path: (string | number)[], value: unknown) =>
			transformOp(sheet, {
				op: 'replace',
				id: sheetId,
				path: ['data', 0, 0, ...path],
				value
			} as never)
		const stored = () =>
			sheet.rows.get(indexToRowId(sheet, 0)!)?.get(indexToColId(sheet, 0)!)?.ff
		op([], { v: 'x', ff: 2 })
		expect(stored()).toBe(CALC_FONTS[2])
		op(['ff'], 3)
		expect(stored()).toBe(CALC_FONTS[3])
		// A stored legacy index survives an unrelated property edit
		put(0, 0, { v: 'x', ff: 2 })
		op(['bl'], 1)
		expect(stored()).toBe(2)
		// Legacy data written straight to the CRDT, bypassing setCell
		sheet.rows.get(indexToRowId(sheet, 0)!)?.set(indexToColId(sheet, 0)!, { v: 'x', ff: 1 })
		const { celldata } = transformSheetToCelldata(sheet)
		expect(celldata[0].v.ff).toBe('Arial')
	})
})

// vim: ts=4
