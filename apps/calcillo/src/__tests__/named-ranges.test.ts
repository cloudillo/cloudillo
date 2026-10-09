// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as Y from 'yjs'

import { generateSheetId } from '../id-generator'
import {
	anchorFromIndices,
	createNamedRange,
	deleteNamedRange,
	formatA1,
	formatNameNav,
	formatRangeNav,
	getNamesMap,
	isNameTaken,
	listNamedRanges,
	NAME_EMPTY,
	NAME_TAKEN,
	parseRangeNav,
	redefineNamedRange,
	renameNamedRange,
	resolveAnchor
} from '../named-ranges'
import {
	deleteColumns,
	deleteRows,
	ensureSheetDimensions,
	getOrCreateSheet,
	insertColumns,
	insertRows
} from '../ydoc-helpers'
import type { SheetId, YSheetStructure } from '../yjs-types'

describe('named ranges', () => {
	let doc: Y.Doc
	let sheetId: SheetId
	let sheet: YSheetStructure

	beforeEach(() => {
		doc = new Y.Doc()
		sheetId = generateSheetId()
		sheet = getOrCreateSheet(doc, sheetId)
		ensureSheetDimensions(sheet, 20, 10)
	})

	const resolved = (id: string) => {
		const r = getNamesMap(doc).get(id)
		return r ? resolveAnchor(doc, r) : undefined
	}

	it('anchors and resolves indices in any corner order', () => {
		const a = anchorFromIndices(doc, sheetId, 4, 2, 1, 0)
		expect(resolveAnchor(doc, a)).toEqual({ sheetId, top: 1, left: 0, bottom: 4, right: 2 })
	})

	it('throws on out-of-bounds indices', () => {
		expect(() => anchorFromIndices(doc, sheetId, 0, 0, 99, 0)).toThrow()
	})

	it('resolves to null when a boundary or the sheet is gone', () => {
		const a = anchorFromIndices(doc, sheetId, 1, 1, 3, 3)
		expect(resolveAnchor(doc, { ...a, sheetId: generateSheetId() })).toBeNull()
		deleteRows(sheet, 3, 3)
		expect(resolveAnchor(doc, a)).toBeNull()
	})

	it('formats A1', () => {
		expect(formatA1({ sheetId, top: 0, left: 0, bottom: 0, right: 0 })).toBe('A1')
		expect(formatA1({ sheetId, top: 1, left: 1, bottom: 9, right: 27 })).toBe('B2:AB10')
	})

	it('round-trips navs', () => {
		const a = anchorFromIndices(doc, sheetId, 1, 1, 3, 3)
		expect(parseRangeNav(formatRangeNav(a))).toEqual({ kind: 'range', anchor: a })
		expect(parseRangeNav(formatNameNav('abc'))).toEqual({ kind: 'name', id: 'abc' })
		expect(parseRangeNav('range:bad')).toBeNull()
		expect(parseRangeNav(`${formatRangeNav(a)}:extra`)).toBeNull()
		expect(parseRangeNav('page:x')).toBeNull()
	})

	it('creates, renames, redefines and deletes', () => {
		const id = createNamedRange(doc, ' Sales ', anchorFromIndices(doc, sheetId, 0, 0, 1, 1))
		expect(listNamedRanges(doc)).toMatchObject([{ id, name: 'Sales' }])
		expect(isNameTaken(doc, 'SALES')).toBe(true)
		expect(isNameTaken(doc, 'sales', id)).toBe(false)
		expect(() =>
			createNamedRange(doc, 'sales', anchorFromIndices(doc, sheetId, 0, 0, 0, 0))
		).toThrow(NAME_TAKEN)
		expect(() =>
			createNamedRange(doc, '  ', anchorFromIndices(doc, sheetId, 0, 0, 0, 0))
		).toThrow(NAME_EMPTY)

		renameNamedRange(doc, id, 'Revenue')
		expect(getNamesMap(doc).get(id)?.name).toBe('Revenue')

		redefineNamedRange(doc, id, anchorFromIndices(doc, sheetId, 5, 5, 6, 6))
		expect(resolved(id)).toEqual({ sheetId, top: 5, left: 5, bottom: 6, right: 6 })

		deleteNamedRange(doc, id)
		expect(listNamedRanges(doc)).toEqual([])
	})

	it('grows with inserts inside the range', () => {
		const id = createNamedRange(doc, 'R', anchorFromIndices(doc, sheetId, 2, 2, 4, 4))
		insertRows(sheet, 3, 2)
		insertColumns(sheet, 3, 1)
		expect(resolved(id)).toEqual({ sheetId, top: 2, left: 2, bottom: 6, right: 5 })
	})

	it('moves deleted boundaries to the nearest survivor inside the range', () => {
		const id = createNamedRange(doc, 'R', anchorFromIndices(doc, sheetId, 2, 2, 6, 6))
		deleteRows(sheet, 1, 2) // deletes top boundary (row 2) and row 1 above it
		expect(resolved(id)).toEqual({ sheetId, top: 1, left: 2, bottom: 4, right: 6 })
		deleteColumns(sheet, 6, 8) // deletes right boundary
		expect(resolved(id)).toEqual({ sheetId, top: 1, left: 2, bottom: 4, right: 5 })
	})

	it('deletes a named range whose rows are all deleted', () => {
		const id = createNamedRange(doc, 'R', anchorFromIndices(doc, sheetId, 2, 2, 3, 3))
		const other = createNamedRange(doc, 'S', anchorFromIndices(doc, sheetId, 8, 0, 9, 0))
		deleteRows(sheet, 1, 4)
		expect(getNamesMap(doc).has(id)).toBe(false)
		expect(resolved(other)).toEqual({ sheetId, top: 4, left: 0, bottom: 5, right: 0 })
	})

	it('deletes a named range whose cols are all deleted', () => {
		const id = createNamedRange(doc, 'R', anchorFromIndices(doc, sheetId, 2, 2, 3, 3))
		deleteColumns(sheet, 2, 3)
		expect(getNamesMap(doc).has(id)).toBe(false)
	})

	it('ignores deletions on other sheets', () => {
		const id = createNamedRange(doc, 'R', anchorFromIndices(doc, sheetId, 0, 0, 1, 1))
		const other = getOrCreateSheet(doc, generateSheetId())
		ensureSheetDimensions(other, 5, 5)
		deleteRows(other, 0, 4)
		expect(resolved(id)).toEqual({ sheetId, top: 0, left: 0, bottom: 1, right: 1 })
	})
})

// vim: ts=4
