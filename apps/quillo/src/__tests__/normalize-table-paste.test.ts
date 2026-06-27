// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type Delta from 'quill-delta'

import { normalizeTablePasteDelta } from '../normalize-table-paste.js'

// normalizeTablePasteDelta only reads/writes `delta.ops`, so we feed it a plain
// object shaped like a Delta and a dummy node (the node argument is unused).
type TestOp = { insert: string; attributes?: Record<string, unknown> }

function makeDelta(ops: TestOp[]): Delta {
	return { ops } as unknown as Delta
}

const dummyNode = null as unknown as Node

function rowId(op: TestOp): string {
	const cell = (op.attributes?.['table-cell'] ?? op.attributes?.['table-th']) as {
		'data-row': string
	}
	return cell['data-row']
}

function blockId(op: TestOp): string {
	return (op.attributes?.['table-cell-block'] ?? op.attributes?.['table-th-block']) as string
}

/** A normal table cell op carrying both the row id and the cell-block id. */
function cellOp(row: unknown, block: unknown): TestOp {
	return { insert: '\n', attributes: { 'table-cell': row, 'table-cell-block': block } }
}

describe('normalizeTablePasteDelta', () => {
	it('remaps row ids to fresh row-xxxx and keeps cells in one row sharing it', () => {
		const delta = makeDelta([cellOp(1, 1), cellOp(1, 2), cellOp(2, 1), cellOp(2, 2)])
		normalizeTablePasteDelta(dummyNode, delta)
		const ops = delta.ops as unknown as TestOp[]

		// Fresh canonical row ids.
		expect(rowId(ops[0])).toMatch(/^row-/)
		// Cells sharing the old row value share the new one.
		expect(rowId(ops[0])).toBe(rowId(ops[1]))
		expect(rowId(ops[2])).toBe(rowId(ops[3]))
		// Distinct old rows get distinct new rows.
		expect(rowId(ops[0])).not.toBe(rowId(ops[2]))
		// Per-cell width info is replaced by the canonical { data-row } object.
		expect(ops[0].attributes?.['table-cell']).toEqual({ 'data-row': rowId(ops[0]) })
	})

	it('makes repeated cell ids globally unique across rows but shared within a row', () => {
		const delta = makeDelta([
			// Row 1: two paragraphs in the same cell (block id 1), then cell 2.
			cellOp(1, 1),
			cellOp(1, 1),
			cellOp(1, 2),
			// Row 2: the SAME positional cell ids (1, 2) reused.
			cellOp(2, 1),
			cellOp(2, 2)
		])
		normalizeTablePasteDelta(dummyNode, delta)
		const ops = delta.ops as unknown as TestOp[]

		// Fresh canonical cell ids.
		expect(blockId(ops[0])).toMatch(/^cell-/)
		// Multi-paragraph cell (same id within one row) stays shared.
		expect(blockId(ops[0])).toBe(blockId(ops[1]))
		// Repeated cell id across rows becomes globally unique.
		expect(blockId(ops[0])).not.toBe(blockId(ops[3]))
		expect(blockId(ops[2])).not.toBe(blockId(ops[4]))
		// All distinct cells across the table are distinct.
		const ids = new Set([blockId(ops[0]), blockId(ops[2]), blockId(ops[3]), blockId(ops[4])])
		expect(ids.size).toBe(4)
	})

	it('supports the object row form and table-th header cells', () => {
		const delta = makeDelta([
			{
				insert: '\n',
				attributes: { 'table-th': { 'data-row': 7 }, 'table-th-block': 9 }
			},
			{
				insert: '\n',
				attributes: { 'table-th': { 'data-row': 7 }, 'table-th-block': 10 }
			}
		])
		normalizeTablePasteDelta(dummyNode, delta)
		const ops = delta.ops as unknown as TestOp[]

		expect(rowId(ops[0])).toMatch(/^row-/)
		expect(rowId(ops[0])).toBe(rowId(ops[1]))
		expect(blockId(ops[0])).toMatch(/^cell-/)
		expect(blockId(ops[0])).not.toBe(blockId(ops[1]))
	})

	it('drops table-col ops', () => {
		const delta = makeDelta([
			{ insert: '\n', attributes: { 'table-col': { width: 100 } } },
			{ insert: '\n', attributes: { 'table-col': { width: 200 } } },
			cellOp(1, 1)
		])
		normalizeTablePasteDelta(dummyNode, delta)
		const ops = delta.ops as unknown as TestOp[]

		expect(ops).toHaveLength(1)
		expect(ops[0].attributes?.['table-col']).toBeUndefined()
		expect(blockId(ops[0])).toMatch(/^cell-/)
	})

	it('guard: block ops with no row context do not collide', () => {
		const delta = makeDelta([
			{ insert: '\n', attributes: { 'table-cell-block': 5 } },
			{ insert: '\n', attributes: { 'table-cell-block': 5 } }
		])
		normalizeTablePasteDelta(dummyNode, delta)
		const ops = delta.ops as unknown as TestOp[]

		expect(blockId(ops[0])).toMatch(/^cell-/)
		// Without the guard both would collapse to the `::5` key and share one id.
		expect(blockId(ops[0])).not.toBe(blockId(ops[1]))
	})
})
