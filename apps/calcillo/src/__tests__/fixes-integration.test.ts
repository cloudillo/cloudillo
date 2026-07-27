import * as Y from 'yjs'

import { generateSheetId, generateUniqueColIds, generateUniqueRowIds } from '../id-generator'
import { transformOp } from '../transform-ops'
import {
	calculateColSpan,
	calculateRowSpan,
	deleteColumns,
	deleteRows,
	ensureSheetDimensions,
	getCell,
	getOrCreateSheet,
	indexToColId,
	indexToRowId,
	insertColumns,
	insertRows,
	pruneInvalidMerges,
	setCell,
	setMerge
} from '../ydoc-helpers'
import type { MergeInfo, SheetId, YSheetStructure } from '../yjs-types'

describe('Critical Fixes Integration Tests', () => {
	let doc: Y.Doc
	let sheetId: SheetId

	beforeEach(() => {
		doc = new Y.Doc()
		sheetId = generateSheetId()
	})

	afterEach(() => {
		doc.destroy()
	})

	describe('Fix #2: Merge Range Corruption', () => {
		it('keeps a merge and shrinks its span when an interior row is deleted', () => {
			const sheet = getOrCreateSheet(doc, sheetId)
			ensureSheetDimensions(sheet, 10, 10)

			// Create merge from row 2 to row 4, col 1 to col 3
			const startRowId = indexToRowId(sheet, 2)!
			const endRowId = indexToRowId(sheet, 4)!
			const startColId = indexToColId(sheet, 1)!
			const endColId = indexToColId(sheet, 3)!

			setMerge(sheet, startRowId, endRowId, startColId, endColId)
			expect(sheet.merges.size).toBe(1)

			// Delete row 3 (strictly inside the merge)
			deleteRows(sheet, 3, 3)

			// Merge survives with unchanged boundaries and a smaller span
			expect(sheet.merges.size).toBe(1)
			const merge = Array.from(sheet.merges.values())[0]
			expect(merge.startRow).toBe(startRowId)
			expect(merge.endRow).toBe(endRowId)
			expect(calculateRowSpan(sheet, startRowId, endRowId)).toBe(2)
		})

		it('relocates a merge when its first row is deleted', () => {
			const sheet = getOrCreateSheet(doc, sheetId)
			ensureSheetDimensions(sheet, 10, 10)

			// Create merge
			const startRowId = indexToRowId(sheet, 2)!
			const endRowId = indexToRowId(sheet, 4)!
			const startColId = indexToColId(sheet, 1)!
			const endColId = indexToColId(sheet, 3)!
			const secondRowId = indexToRowId(sheet, 3)!

			setMerge(sheet, startRowId, endRowId, startColId, endColId)

			// Delete starting row
			deleteRows(sheet, 2, 2)

			// Merge survives, anchored on the row that is now first
			expect(sheet.merges.size).toBe(1)
			const merge = Array.from(sheet.merges.values())[0]
			expect(merge.startRow).toBe(secondRowId)
			expect(merge.endRow).toBe(endRowId)
		})

		it('truncates a merge when its last row is deleted', () => {
			const sheet = getOrCreateSheet(doc, sheetId)
			ensureSheetDimensions(sheet, 10, 10)

			const startRowId = indexToRowId(sheet, 2)!
			const endRowId = indexToRowId(sheet, 4)!
			const startColId = indexToColId(sheet, 1)!
			const endColId = indexToColId(sheet, 3)!
			const thirdRowId = indexToRowId(sheet, 3)!

			setMerge(sheet, startRowId, endRowId, startColId, endColId)

			// Delete the last row of the merge
			deleteRows(sheet, 4, 4)

			expect(sheet.merges.size).toBe(1)
			const merge = Array.from(sheet.merges.values())[0]
			expect(merge.startRow).toBe(startRowId)
			expect(merge.endRow).toBe(thirdRowId)
		})

		it('truncates a merge when the deletion overlaps its tail', () => {
			const sheet = getOrCreateSheet(doc, sheetId)
			ensureSheetDimensions(sheet, 10, 10)

			const startRowId = indexToRowId(sheet, 2)!
			const endRowId = indexToRowId(sheet, 4)!
			const startColId = indexToColId(sheet, 1)!
			const endColId = indexToColId(sheet, 3)!

			setMerge(sheet, startRowId, endRowId, startColId, endColId)

			// Deletion starts inside the merge and runs past its end
			deleteRows(sheet, 3, 6)

			// Only the first row survives - still a valid 1x3 merge
			expect(sheet.merges.size).toBe(1)
			const merge = Array.from(sheet.merges.values())[0]
			expect(merge.startRow).toBe(startRowId)
			expect(merge.endRow).toBe(startRowId)
		})

		it('drops a merge that collapses to a single cell', () => {
			const sheet = getOrCreateSheet(doc, sheetId)
			ensureSheetDimensions(sheet, 10, 10)

			// Single-column merge spanning two rows
			const startRowId = indexToRowId(sheet, 2)!
			const endRowId = indexToRowId(sheet, 3)!
			const colId = indexToColId(sheet, 1)!

			setMerge(sheet, startRowId, endRowId, colId, colId)

			deleteRows(sheet, 3, 3)

			expect(sheet.merges.size).toBe(0)
		})

		it('preserves valid merges after deletions outside range', () => {
			const sheet = getOrCreateSheet(doc, sheetId)
			ensureSheetDimensions(sheet, 10, 10)

			// Create merge
			const startRowId = indexToRowId(sheet, 3)!
			const endRowId = indexToRowId(sheet, 5)!
			const startColId = indexToColId(sheet, 1)!
			const endColId = indexToColId(sheet, 3)!

			setMerge(sheet, startRowId, endRowId, startColId, endColId)

			// Delete row outside merge range
			deleteRows(sheet, 0, 0)

			// Merge should still exist
			expect(sheet.merges.size).toBe(1)

			// Verify merge is still valid
			const merge = Array.from(sheet.merges.values())[0]
			expect(merge.startRow).toBe(startRowId)
			expect(merge.endRow).toBe(endRowId)
		})

		it('keeps a merge and shrinks its span when an interior column is deleted', () => {
			const sheet = getOrCreateSheet(doc, sheetId)
			ensureSheetDimensions(sheet, 10, 10)

			// Create merge
			const startRowId = indexToRowId(sheet, 2)!
			const endRowId = indexToRowId(sheet, 4)!
			const startColId = indexToColId(sheet, 2)!
			const endColId = indexToColId(sheet, 5)!

			setMerge(sheet, startRowId, endRowId, startColId, endColId)

			// Delete column inside merge
			deleteColumns(sheet, 3, 3)

			// Merge survives with unchanged boundaries and a smaller span
			expect(sheet.merges.size).toBe(1)
			const merge = Array.from(sheet.merges.values())[0]
			expect(merge.startCol).toBe(startColId)
			expect(merge.endCol).toBe(endColId)
			expect(calculateColSpan(sheet, startColId, endColId)).toBe(3)
		})

		it('relocates a merge when its first column is deleted', () => {
			const sheet = getOrCreateSheet(doc, sheetId)
			ensureSheetDimensions(sheet, 10, 10)

			const startRowId = indexToRowId(sheet, 2)!
			const endRowId = indexToRowId(sheet, 4)!
			const startColId = indexToColId(sheet, 2)!
			const endColId = indexToColId(sheet, 5)!
			const secondColId = indexToColId(sheet, 3)!

			setMerge(sheet, startRowId, endRowId, startColId, endColId)

			// Delete the first column of the merge
			deleteColumns(sheet, 2, 2)

			expect(sheet.merges.size).toBe(1)
			const merge = Array.from(sheet.merges.values())[0]
			expect(merge.startCol).toBe(secondColId)
			expect(merge.endCol).toBe(endColId)
		})
	})

	describe('Fix #4: ID Collision Detection', () => {
		it('generates unique row IDs with collision detection', () => {
			const sheet = getOrCreateSheet(doc, sheetId)
			ensureSheetDimensions(sheet, 5, 5)

			const existingIds = new Set(sheet.rowOrder.toArray())
			const initialSize = existingIds.size

			// Generate new IDs
			const newIds = generateUniqueRowIds(10, existingIds)

			expect(newIds.length).toBe(10)

			// Verify all new IDs are unique
			const allIds = new Set([...existingIds, ...newIds])
			expect(allIds.size).toBe(initialSize + 10)
		})

		it('generates unique column IDs with collision detection', () => {
			const sheet = getOrCreateSheet(doc, sheetId)
			ensureSheetDimensions(sheet, 5, 5)

			const existingIds = new Set(sheet.colOrder.toArray())
			const initialSize = existingIds.size

			// Generate new IDs
			const newIds = generateUniqueColIds(10, existingIds)

			expect(newIds.length).toBe(10)

			// Verify all new IDs are unique
			const allIds = new Set([...existingIds, ...newIds])
			expect(allIds.size).toBe(initialSize + 10)
		})

		it('insertRows generates unique IDs', () => {
			const sheet = getOrCreateSheet(doc, sheetId)
			ensureSheetDimensions(sheet, 10, 10)

			const initialRowIds = new Set(sheet.rowOrder.toArray())

			// Insert rows
			insertRows(sheet, 5, 3)

			const finalRowIds = new Set(sheet.rowOrder.toArray())

			// Should have 3 new unique IDs
			expect(finalRowIds.size).toBe(initialRowIds.size + 3)

			// Verify no duplicates
			const allIds = sheet.rowOrder.toArray()
			const uniqueIds = new Set(allIds)
			expect(uniqueIds.size).toBe(allIds.length)
		})

		it('insertColumns generates unique IDs', () => {
			const sheet = getOrCreateSheet(doc, sheetId)
			ensureSheetDimensions(sheet, 10, 10)

			const initialColIds = new Set(sheet.colOrder.toArray())

			// Insert columns
			insertColumns(sheet, 5, 3)

			const finalColIds = new Set(sheet.colOrder.toArray())

			// Should have 3 new unique IDs
			expect(finalColIds.size).toBe(initialColIds.size + 3)

			// Verify no duplicates
			const allIds = sheet.colOrder.toArray()
			const uniqueIds = new Set(allIds)
			expect(uniqueIds.size).toBe(allIds.length)
		})

		it('handles massive ID generation without collisions', () => {
			const sheet = getOrCreateSheet(doc, sheetId)

			// Generate a large number of rows and columns
			ensureSheetDimensions(sheet, 1000, 100)

			// Verify all IDs are unique
			const rowIds = sheet.rowOrder.toArray()
			const colIds = sheet.colOrder.toArray()

			expect(new Set(rowIds).size).toBe(1000)
			expect(new Set(colIds).size).toBe(100)
		})
	})

	describe('Complex Concurrent Operations', () => {
		it('shrinks both merges when interior rows are deleted in sequence', () => {
			const sheet = getOrCreateSheet(doc, sheetId)
			ensureSheetDimensions(sheet, 20, 20)

			// Create multiple merges
			const merge1Start = indexToRowId(sheet, 2)!
			const merge1End = indexToRowId(sheet, 5)!
			const merge2Start = indexToRowId(sheet, 8)!
			const merge2End = indexToRowId(sheet, 12)!
			const startCol = indexToColId(sheet, 1)!
			const endCol = indexToColId(sheet, 3)!

			setMerge(sheet, merge1Start, merge1End, startCol, endCol)
			setMerge(sheet, merge2Start, merge2End, startCol, endCol)

			expect(sheet.merges.size).toBe(2)

			// Delete row 3 (strictly inside merge1)
			deleteRows(sheet, 3, 3)

			// Delete original row 10 (strictly inside merge2); index shifted by the deletion above
			deleteRows(sheet, 9, 9)

			// Both merges survive with reduced spans
			expect(sheet.merges.size).toBe(2)
			expect(calculateRowSpan(sheet, merge1Start, merge1End)).toBe(3)
			expect(calculateRowSpan(sheet, merge2Start, merge2End)).toBe(4)
		})

		it('preserves data integrity during row insertions and deletions', () => {
			const sheet = getOrCreateSheet(doc, sheetId)
			ensureSheetDimensions(sheet, 10, 10)

			// Set some cell data
			setCell(sheet, 5, 5, { v: 'Important Data' })

			// Insert rows before the cell
			insertRows(sheet, 3, 2)

			// Cell should now be at row 7
			const cellValue = sheet.rows.get(indexToRowId(sheet, 7)!)?.get(indexToColId(sheet, 5)!)
			expect(cellValue?.v).toBe('Important Data')

			// Delete rows after the cell
			deleteRows(sheet, 10, 11)

			// Cell should still be at row 7
			const cellValue2 = sheet.rows.get(indexToRowId(sheet, 7)!)?.get(indexToColId(sheet, 5)!)
			expect(cellValue2?.v).toBe('Important Data')
		})
	})

	describe('Edge Cases', () => {
		it('handles deletion of entire merged range', () => {
			const sheet = getOrCreateSheet(doc, sheetId)
			ensureSheetDimensions(sheet, 10, 10)

			// Create merge
			const startRowId = indexToRowId(sheet, 3)!
			const endRowId = indexToRowId(sheet, 5)!
			const startColId = indexToColId(sheet, 2)!
			const endColId = indexToColId(sheet, 4)!

			setMerge(sheet, startRowId, endRowId, startColId, endColId)

			// Delete entire range
			deleteRows(sheet, 3, 5)

			// Merge should be removed
			expect(sheet.merges.size).toBe(0)
		})

		it('handles empty sheet dimension expansion', () => {
			const sheet = getOrCreateSheet(doc, sheetId)

			// Expand from 0 to 100 rows
			ensureSheetDimensions(sheet, 100, 50)

			expect(sheet.rowOrder.length).toBe(100)
			expect(sheet.colOrder.length).toBe(50)

			// Verify all IDs are unique
			const rowIds = sheet.rowOrder.toArray()
			const colIds = sheet.colOrder.toArray()

			expect(new Set(rowIds).size).toBe(100)
			expect(new Set(colIds).size).toBe(50)
		})
	})

	describe('Fix: nested cell-property ops must not clobber the parent object', () => {
		it('stores ct as an object when Fortune Sheet emits nested ct.fa / ct.t ops', () => {
			const sheet = getOrCreateSheet(doc, sheetId)
			ensureSheetDimensions(sheet, 5, 5)

			// Fortune Sheet sets a number format via nested ops reaching into ct.
			// The old single-property update read only path[3] ('ct') and wrote
			// the bare fa string, corrupting ct to '€0.00'.
			transformOp(sheet, {
				op: 'add',
				id: sheetId,
				path: ['data', 0, 0, 'v'],
				value: '1'
			} as never)
			transformOp(sheet, {
				op: 'add',
				id: sheetId,
				path: ['data', 0, 0, 'ct', 't'],
				value: 'n'
			} as never)
			transformOp(sheet, {
				op: 'replace',
				id: sheetId,
				path: ['data', 0, 0, 'ct', 'fa'],
				value: '€0.00'
			} as never)

			const cell = getCell(sheet, 0, 0)
			expect(cell?.v).toBe('1')
			expect(cell?.ct).toEqual({ t: 'n', fa: '€0.00' })
		})

		it('still handles a flat single-property op (data[r][c].v)', () => {
			const sheet = getOrCreateSheet(doc, sheetId)
			ensureSheetDimensions(sheet, 5, 5)

			transformOp(sheet, {
				op: 'add',
				id: sheetId,
				path: ['data', 1, 1, 'v'],
				value: 'Hello'
			} as never)

			expect(getCell(sheet, 1, 1)?.v).toBe('Hello')
		})
	})
})

describe('CRDT convergence: concurrent structural deletions', () => {
	/** Exchange updates both ways until both docs hold the same state. */
	function syncDocs(a: Y.Doc, b: Y.Doc) {
		Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)))
		Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)))
	}

	/** Stable, diffable representation of a sheet's merge map. */
	function mergeEntries(sheet: YSheetStructure): Array<[string, MergeInfo]> {
		return Array.from(sheet.merges.entries()).sort((x, y) => x[0].localeCompare(y[0]))
	}

	let docA: Y.Doc
	let docB: Y.Doc
	let sheetId: SheetId
	let sheetA: YSheetStructure
	let sheetB: YSheetStructure

	beforeEach(() => {
		docA = new Y.Doc()
		docB = new Y.Doc()
		sheetId = generateSheetId()

		sheetA = getOrCreateSheet(docA, sheetId)
		ensureSheetDimensions(sheetA, 12, 6)
		// Merge spanning rows 2..6 and cols 1..3
		setMerge(
			sheetA,
			indexToRowId(sheetA, 2)!,
			indexToRowId(sheetA, 6)!,
			indexToColId(sheetA, 1)!,
			indexToColId(sheetA, 3)!
		)

		syncDocs(docA, docB)
		sheetB = getOrCreateSheet(docB, sheetId)
	})

	afterEach(() => {
		docA.destroy()
		docB.destroy()
	})

	it('converges when both clients delete a different interior row', () => {
		const startRow = indexToRowId(sheetA, 2)!
		const endRow = indexToRowId(sheetA, 6)!

		// A deletes row 3, B deletes row 5 - both strictly inside the merge
		deleteRows(sheetA, 3, 3)
		deleteRows(sheetB, 5, 5)

		syncDocs(docA, docB)

		expect(mergeEntries(sheetA)).toEqual(mergeEntries(sheetB))
		expect(sheetA.merges.size).toBe(1)

		const merge = mergeEntries(sheetA)[0][1]
		expect(merge.startRow).toBe(startRow)
		expect(merge.endRow).toBe(endRow)
		// 5 rows originally, two removed
		expect(calculateRowSpan(sheetA, startRow, endRow)).toBe(3)
		expect(calculateRowSpan(sheetB, startRow, endRow)).toBe(3)
	})

	it('converges when one client deletes the leading row and the other an unrelated row', () => {
		const relocatedStart = indexToRowId(sheetA, 3)!
		const endRow = indexToRowId(sheetA, 6)!

		// A deletes the merge's first row (index 2) - the merge relocates down
		deleteRows(sheetA, 2, 2)
		// B deletes row 10, far outside the merge
		deleteRows(sheetB, 10, 10)

		syncDocs(docA, docB)

		expect(mergeEntries(sheetA)).toEqual(mergeEntries(sheetB))
		expect(sheetA.merges.size).toBe(1)

		const merge = mergeEntries(sheetA)[0][1]
		expect(merge.startRow).toBe(relocatedStart)
		expect(merge.endRow).toBe(endRow)
		expect(calculateRowSpan(sheetA, relocatedStart, endRow)).toBe(4)
	})

	it('leaves no stale merge entries when both clients delete opposite boundaries', () => {
		// A drops the merge's first row, B drops its last row. Each writes a repaired range
		// whose surviving boundary the other client removed, so after sync both entries
		// reference a dead row ID. Pruning must clear them on every client.
		deleteRows(sheetA, 2, 2)
		deleteRows(sheetB, 6, 6)

		syncDocs(docA, docB)

		// Precondition: the concurrent repairs really do strand two dangling entries,
		// so the pruning assertions below are not vacuous.
		expect(sheetA.merges.size).toBe(2)
		const liveRowsBefore = new Set(sheetA.rowOrder.toArray())
		expect(
			Array.from(sheetA.merges.values()).some(
				(m) => !liveRowsBefore.has(m.startRow) || !liveRowsBefore.has(m.endRow)
			)
		).toBe(true)

		docA.transact(() => pruneInvalidMerges(sheetA))
		docB.transact(() => pruneInvalidMerges(sheetB))

		syncDocs(docA, docB)

		expect(mergeEntries(sheetA)).toEqual(mergeEntries(sheetB))

		for (const sheet of [sheetA, sheetB]) {
			const liveRows = new Set(sheet.rowOrder.toArray())
			const liveCols = new Set(sheet.colOrder.toArray())
			for (const merge of sheet.merges.values()) {
				expect(liveRows.has(merge.startRow)).toBe(true)
				expect(liveRows.has(merge.endRow)).toBe(true)
				expect(liveCols.has(merge.startCol)).toBe(true)
				expect(liveCols.has(merge.endCol)).toBe(true)
			}
		}
	})

	it('prunes idempotently regardless of which client runs it first', () => {
		deleteRows(sheetA, 2, 2)
		deleteRows(sheetB, 6, 6)

		syncDocs(docA, docB)

		// Only A prunes, then the deletions propagate, then B prunes on top
		docA.transact(() => pruneInvalidMerges(sheetA))
		syncDocs(docA, docB)
		docB.transact(() => pruneInvalidMerges(sheetB))
		syncDocs(docA, docB)

		expect(mergeEntries(sheetA)).toEqual(mergeEntries(sheetB))

		// Running it again changes nothing
		const before = mergeEntries(sheetA)
		docA.transact(() => pruneInvalidMerges(sheetA))
		docB.transact(() => pruneInvalidMerges(sheetB))
		syncDocs(docA, docB)
		expect(mergeEntries(sheetA)).toEqual(before)
		expect(mergeEntries(sheetB)).toEqual(before)
	})
})
