// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { Cell } from '@fortune-sheet/core'
import * as Y from 'yjs'

import {
	clampSelection,
	isEmbedEditOp,
	naturalSize,
	resolveEmbedNav,
	usedRangeOfFirstSheet
} from '../embed-view'
import { generateSheetId } from '../id-generator'
import { anchorFromIndices, createNamedRange, formatNameNav } from '../named-ranges'
import { ensureSheetDimensions, getOrCreateSheet } from '../ydoc-helpers'
import type { SheetId, YSheetStructure } from '../yjs-types'

describe('embed view', () => {
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

	const setCell = (r: number, c: number) => {
		const rowId = sheet.rowOrder.get(r)
		const row = new Y.Map<Cell>()
		sheet.rows.set(rowId, row)
		row.set(sheet.colOrder.get(c), { v: 'x' })
	}

	const range = () => ({ sheetId, top: 1, left: 1, bottom: 3, right: 2 })

	it('allows only cell edits inside the range', () => {
		const r = range()
		expect(isEmbedEditOp({ op: 'replace', id: sheetId, path: ['data', 2, 2] }, r)).toBe(true)
		expect(isEmbedEditOp({ op: 'replace', id: sheetId, path: ['data', 0, 1] }, r)).toBe(false)
		expect(isEmbedEditOp({ op: 'replace', id: sheetId, path: ['data', 2, 5] }, r)).toBe(false)
		expect(isEmbedEditOp({ op: 'replace', id: 'other', path: ['data', 2, 2] }, r)).toBe(false)
		expect(isEmbedEditOp({ op: 'replace', id: sheetId, path: ['name'] }, r)).toBe(false)
		expect(isEmbedEditOp({ op: 'replace', id: sheetId, path: ['data', 2] }, r)).toBe(false)
	})

	it('clamps a selection into the range, null when already inside', () => {
		const r = range()
		expect(clampSelection({ row: [1, 2], column: [1, 2] }, r)).toBeNull()
		expect(clampSelection({ row: [0, 2], column: [1, 5] }, r)).toEqual({
			row: [1, 2],
			column: [1, 2]
		})
		expect(clampSelection({ row: [10, 12], column: [8, 9] }, r)).toEqual({
			row: [3, 3],
			column: [2, 2]
		})
	})

	it('resolves a named range', () => {
		const id = createNamedRange(doc, 'Sales', anchorFromIndices(doc, sheetId, 1, 1, 3, 2))
		expect(resolveEmbedNav(doc, formatNameNav(id))).toEqual({
			range: range(),
			nameId: id,
			name: 'Sales'
		})
	})

	it('falls back to the used range without a nav, null for an unknown name', () => {
		setCell(4, 3)
		expect(resolveEmbedNav(doc, undefined)).toEqual({
			range: { sheetId, top: 0, left: 0, bottom: 4, right: 3 }
		})
		expect(resolveEmbedNav(doc, formatNameNav('missing'))).toBeNull()
	})

	it('has no target in a doc without sheets', () => {
		const empty = new Y.Doc()
		expect(usedRangeOfFirstSheet(empty)).toBeNull()
		expect(resolveEmbedNav(empty, undefined)).toBeNull()
	})

	it('measures a range with default sizes plus grid lines', () => {
		expect(naturalSize(doc, range())).toEqual({ w: 2 * 74, h: 3 * 20 })
	})
})

// vim: ts=4
