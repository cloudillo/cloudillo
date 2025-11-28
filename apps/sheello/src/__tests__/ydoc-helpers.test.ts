import * as Y from 'yjs'
import {
  getOrCreateSheet,
  ensureSheetDimensions,
  setCell,
  getCell,
  clearCell,
  getRowCells,
  insertRows,
  deleteRows,
  insertColumns,
  deleteColumns,
  transformSheetToCelldata
} from '../ydoc-helpers'
import { generateSheetId } from '../id-generator'
import type { SheetId } from '../yjs-types'

describe('YDoc Helpers', () => {
  let doc: Y.Doc
  let sheetId: SheetId

  beforeEach(() => {
    doc = new Y.Doc()
    sheetId = generateSheetId()
  })

  describe('getOrCreateSheet', () => {
    it('creates new sheet structure', () => {
      const sheet = getOrCreateSheet(doc, sheetId)

      expect(sheet.rowOrder).toBeInstanceOf(Y.Array)
      expect(sheet.colOrder).toBeInstanceOf(Y.Array)
      expect(sheet.rows).toBeInstanceOf(Y.Map)
      expect(sheet.rowOrder.length).toBe(0)
      expect(sheet.colOrder.length).toBe(0)
    })

    it('returns existing sheet if already created', () => {
      const sheet1 = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet1, 5, 5)

      const sheet2 = getOrCreateSheet(doc, sheetId)

      expect(sheet2.rowOrder.length).toBe(5)
      expect(sheet2.colOrder.length).toBe(5)
    })

    it('creates sheet structure in correct location', () => {
      getOrCreateSheet(doc, sheetId)

      const sheets = doc.getMap('sheets')
      expect(sheets.has(sheetId)).toBe(true)
    })
  })

  describe('ensureSheetDimensions', () => {
    it('adds rows when below minimum', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 100, 50)

      expect(sheet.rowOrder.length).toBe(100)
      expect(sheet.colOrder.length).toBe(50)
    })

    it('does not remove rows when above minimum', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 100, 50)
      ensureSheetDimensions(sheet, 50, 25)

      expect(sheet.rowOrder.length).toBe(100)
      expect(sheet.colOrder.length).toBe(50)
    })

    it('adds only needed rows and columns', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 10, 10)
      expect(sheet.rowOrder.length).toBe(10)

      ensureSheetDimensions(sheet, 15, 10)
      expect(sheet.rowOrder.length).toBe(15)
      expect(sheet.colOrder.length).toBe(10)
    })
  })

  describe('setCell and getCell', () => {
    it('sets and retrieves cell values', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 10, 10)

      setCell(sheet, 5, 7, { v: 'Hello', ct: { t: 's' } })
      const cell = getCell(sheet, 5, 7)

      expect(cell?.v).toBe('Hello')
      expect(cell?.ct).toEqual({ t: 's' })
    })

    it('returns undefined for non-existent cells', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 10, 10)

      const cell = getCell(sheet, 5, 7)
      expect(cell).toBeUndefined()
    })

    it('cleans cell data (removes undefined and m property)', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 10, 10)

      setCell(sheet, 2, 3, {
        v: 'Test',
        ct: { t: 's' },
        m: 'should be removed',
        undefinedProp: undefined
      } as any)

      const cell = getCell(sheet, 2, 3)
      expect(cell?.v).toBe('Test')
      expect(cell).not.toHaveProperty('m')
      expect(cell).not.toHaveProperty('undefinedProp')
    })

    it('handles cell overwriting', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 10, 10)

      setCell(sheet, 1, 1, { v: 'First' })
      setCell(sheet, 1, 1, { v: 'Second' })

      const cell = getCell(sheet, 1, 1)
      expect(cell?.v).toBe('Second')
    })

    it('returns undefined for out-of-bounds indices', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 10, 10)

      const cell = getCell(sheet, 100, 100)
      expect(cell).toBeUndefined()
    })
  })

  describe('clearCell', () => {
    it('removes cell data', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 10, 10)

      setCell(sheet, 3, 4, { v: 'Data' })
      expect(getCell(sheet, 3, 4)).toBeDefined()

      clearCell(sheet, 3, 4)
      expect(getCell(sheet, 3, 4)).toBeUndefined()
    })

    it('cleans up empty row maps', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 10, 10)

      const rowId = sheet.rowOrder.get(3)!
      setCell(sheet, 3, 4, { v: 'Only cell in row' })

      expect(sheet.rows.has(rowId)).toBe(true)

      clearCell(sheet, 3, 4)
      expect(sheet.rows.has(rowId)).toBe(false)
    })

    it('does not affect other cells in same row', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 10, 10)

      setCell(sheet, 2, 1, { v: 'A' })
      setCell(sheet, 2, 2, { v: 'B' })
      setCell(sheet, 2, 3, { v: 'C' })

      clearCell(sheet, 2, 2)

      expect(getCell(sheet, 2, 1)?.v).toBe('A')
      expect(getCell(sheet, 2, 2)).toBeUndefined()
      expect(getCell(sheet, 2, 3)?.v).toBe('C')
    })
  })

  describe('getRowCells', () => {
    it('returns all cells in a row', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 10, 10)

      setCell(sheet, 2, 1, { v: 'A' })
      setCell(sheet, 2, 5, { v: 'B' })
      setCell(sheet, 2, 3, { v: 'C' })

      const cells = getRowCells(sheet, 2)

      expect(cells).toHaveLength(3)
      expect(cells.map(c => c.cell.v)).toEqual(['A', 'C', 'B'])
    })

    it('returns cells sorted by column index', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 10, 10)

      setCell(sheet, 2, 9, { v: 'Z' })
      setCell(sheet, 2, 0, { v: 'A' })
      setCell(sheet, 2, 5, { v: 'M' })

      const cells = getRowCells(sheet, 2)

      expect(cells[0].colIndex).toBe(0)
      expect(cells[1].colIndex).toBe(5)
      expect(cells[2].colIndex).toBe(9)
    })

    it('returns empty array for row with no cells', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 10, 10)

      const cells = getRowCells(sheet, 5)
      expect(cells).toEqual([])
    })

    it('returns empty array for non-existent row', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 10, 10)

      const cells = getRowCells(sheet, 100)
      expect(cells).toEqual([])
    })
  })

  describe('insertRows', () => {
    it('inserts rows at specified position', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 5, 5)

      insertRows(sheet, 2, 3)

      expect(sheet.rowOrder.length).toBe(8)
    })

    it('shifts existing row data correctly', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 5, 5)

      setCell(sheet, 2, 0, { v: 'Before' })
      const originalRowId = sheet.rowOrder.get(2)

      insertRows(sheet, 2, 2)

      // Original row 2 is now row 4
      expect(sheet.rowOrder.get(4)).toBe(originalRowId)
      expect(getCell(sheet, 4, 0)?.v).toBe('Before')
    })

    it('inserts at beginning', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 5, 5)

      insertRows(sheet, 0, 2)

      expect(sheet.rowOrder.length).toBe(7)
    })

    it('inserts at end', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 5, 5)

      insertRows(sheet, 5, 3)

      expect(sheet.rowOrder.length).toBe(8)
    })
  })

  describe('deleteRows', () => {
    it('deletes rows and their data', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 10, 10)

      setCell(sheet, 5, 3, { v: 'ToDelete' })
      const rowId = sheet.rowOrder.get(5)

      deleteRows(sheet, 5, 5)

      expect(sheet.rowOrder.length).toBe(9)
      expect(sheet.rows.has(rowId!)).toBe(false)
    })

    it('deletes range of rows', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 10, 10)

      deleteRows(sheet, 3, 6)

      expect(sheet.rowOrder.length).toBe(6)
    })

    it('preserves data in non-deleted rows', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 10, 10)

      setCell(sheet, 2, 0, { v: 'Keep' })
      setCell(sheet, 5, 0, { v: 'Delete' })

      deleteRows(sheet, 5, 5)

      expect(getCell(sheet, 2, 0)?.v).toBe('Keep')
    })

    it('handles deleting at boundaries', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 10, 10)

      deleteRows(sheet, 0, 2)
      expect(sheet.rowOrder.length).toBe(7)

      deleteRows(sheet, 5, 6)
      expect(sheet.rowOrder.length).toBe(5)
    })
  })

  describe('insertColumns', () => {
    it('inserts columns at specified position', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 5, 5)

      insertColumns(sheet, 2, 3)

      expect(sheet.colOrder.length).toBe(8)
    })

    it('shifts existing column data correctly', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 5, 5)

      setCell(sheet, 0, 2, { v: 'Before' })
      const originalColId = sheet.colOrder.get(2)

      insertColumns(sheet, 2, 2)

      // Original column 2 is now column 4
      expect(sheet.colOrder.get(4)).toBe(originalColId)
      expect(getCell(sheet, 0, 4)?.v).toBe('Before')
    })
  })

  describe('deleteColumns', () => {
    it('deletes columns from all rows', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 10, 10)

      setCell(sheet, 1, 5, { v: 'A' })
      setCell(sheet, 3, 5, { v: 'B' })
      setCell(sheet, 7, 5, { v: 'C' })

      deleteColumns(sheet, 5, 5)

      expect(sheet.colOrder.length).toBe(9)
      expect(getCell(sheet, 1, 5)).toBeUndefined()
      expect(getCell(sheet, 3, 5)).toBeUndefined()
      expect(getCell(sheet, 7, 5)).toBeUndefined()
    })

    it('deletes range of columns', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 10, 10)

      deleteColumns(sheet, 2, 5)

      expect(sheet.colOrder.length).toBe(6)
    })

    it('preserves data in non-deleted columns', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 10, 10)

      setCell(sheet, 0, 2, { v: 'Keep' })
      setCell(sheet, 0, 5, { v: 'Delete' })

      deleteColumns(sheet, 5, 5)

      expect(getCell(sheet, 0, 2)?.v).toBe('Keep')
    })
  })

  describe('transformSheetToCelldata', () => {
    it('transforms sheet to Fortune Sheet celldata format', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 5, 5)

      setCell(sheet, 0, 0, { v: 'A1' })
      setCell(sheet, 2, 3, { v: 'D3' })

      const celldata = transformSheetToCelldata(sheet)

      expect(celldata).toHaveLength(2)
      expect(celldata.find(c => c.r === 0 && c.c === 0)?.v.v).toBe('A1')
      expect(celldata.find(c => c.r === 2 && c.c === 3)?.v.v).toBe('D3')
    })

    it('removes m property from cells', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 5, 5)

      setCell(sheet, 1, 1, { v: 'Test', m: 'metadata' } as any)

      const celldata = transformSheetToCelldata(sheet)
      const cell = celldata.find(c => c.r === 1 && c.c === 1)

      expect(cell?.v).not.toHaveProperty('m')
    })

    it('returns empty array for empty sheet', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 5, 5)

      const celldata = transformSheetToCelldata(sheet)

      expect(celldata).toEqual([])
    })

    it('handles sparse data efficiently', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 100, 50)

      setCell(sheet, 0, 0, { v: 'A1' })
      setCell(sheet, 99, 49, { v: 'Last' })

      const celldata = transformSheetToCelldata(sheet)

      expect(celldata).toHaveLength(2)
    })
  })

  describe('Integration: Complex operations', () => {
    it('handles multiple operations on same sheet', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 10, 10)

      // Set some data
      setCell(sheet, 0, 0, { v: 'A1' })
      setCell(sheet, 5, 5, { v: 'F6' })

      // Insert rows
      insertRows(sheet, 3, 2)
      expect(sheet.rowOrder.length).toBe(12)

      // Data should shift
      expect(getCell(sheet, 7, 5)?.v).toBe('F6')

      // Delete columns
      deleteColumns(sheet, 0, 0)
      expect(sheet.colOrder.length).toBe(9)
    })

    it('maintains data consistency across operations', () => {
      const sheet = getOrCreateSheet(doc, sheetId)
      ensureSheetDimensions(sheet, 5, 5)

      // Fill a row
      for (let c = 0; c < 5; c++) {
        setCell(sheet, 2, c, { v: String.fromCharCode(65 + c) })
      }

      // Get row cells
      let cells = getRowCells(sheet, 2)
      expect(cells).toHaveLength(5)

      // Delete middle column
      deleteColumns(sheet, 2, 2)

      // Transform to celldata
      const celldata = transformSheetToCelldata(sheet)
      expect(celldata.filter(c => c.r === 2)).toHaveLength(4)
    })
  })
})
