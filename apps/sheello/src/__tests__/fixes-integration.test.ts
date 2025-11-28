import * as Y from 'yjs'
import {
  getOrCreateSheet,
  ensureSheetDimensions,
  setCell,
  deleteRows,
  deleteColumns,
  setMerge,
  insertRows,
  insertColumns,
  indexToRowId,
  indexToColId
} from '../ydoc-helpers'
import { generateSheetId, generateUniqueRowIds, generateUniqueColIds } from '../id-generator'
import type { SheetId, RowId, ColId } from '../yjs-types'

describe('Critical Fixes Integration Tests', () => {
  let doc: Y.Doc
  let sheetId: SheetId

  beforeEach(() => {
    doc = new Y.Doc()
    sheetId = generateSheetId()
  })

  describe('Fix #2: Merge Range Corruption', () => {
    it('validates and removes invalid merges after concurrent deletions', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 10, 10)

      // Create merge from row 2 to row 4, col 1 to col 3
      const startRowId = indexToRowId(sheet, 2)!
      const endRowId = indexToRowId(sheet, 4)!
      const startColId = indexToColId(sheet, 1)!
      const endColId = indexToColId(sheet, 3)!

      setMerge(sheet, startRowId, endRowId, startColId, endColId)
      expect(sheet.merges.size).toBe(1)

      // Simulate concurrent deletion: delete row 3 (inside merge)
      deleteRows(sheet, 3, 3)

      // Merge should be removed because it references deleted row
      expect(sheet.merges.size).toBe(0)
    })

    it('validates merges after row deletions at boundaries', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 10, 10)

      // Create merge
      const startRowId = indexToRowId(sheet, 2)!
      const endRowId = indexToRowId(sheet, 4)!
      const startColId = indexToColId(sheet, 1)!
      const endColId = indexToColId(sheet, 3)!

      setMerge(sheet, startRowId, endRowId, startColId, endColId)

      // Delete starting row
      deleteRows(sheet, 2, 2)

      // Merge should be removed
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

    it('handles column deletions affecting merges', () => {
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

      // Merge should be removed
      expect(sheet.merges.size).toBe(0)
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
    it('handles multiple concurrent deletions with merges', () => {
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

      // Simulate concurrent deletions
      // User A deletes row 3 (affects merge1)
      deleteRows(sheet, 3, 3)

      // User B deletes row 10 (affects merge2) - simulated by second deletion
      deleteRows(sheet, 9, 9) // Index shifted by previous deletion

      // Both merges should be removed
      expect(sheet.merges.size).toBe(0)
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
})
