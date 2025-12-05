import * as Y from 'yjs'
import { Cell, SheetConfig } from '@fortune-sheet/core'
import type {
	RowId,
	ColId,
	SheetId,
	YSheetStructure,
	MergeInfo,
	BorderInfo,
	HyperlinkInfo,
	ValidationRule,
	ConditionalFormat,
	FrozenInfo
} from './yjs-types'
import {
	generateRowId,
	generateColId,
	generateRowIds,
	generateColIds,
	generateUniqueRowIds,
	generateUniqueColIds
} from './id-generator'
import { debug } from './debug'
import { DEFAULT_ROWS, DEFAULT_COLS } from './constants'

/**
 * Get or create sheet structure
 */
export function getOrCreateSheet(yDoc: Y.Doc, sheetId: SheetId): YSheetStructure {
	// Validate sheet ID - prevent undefined or invalid IDs
	if (!sheetId || sheetId === 'undefined' || typeof sheetId !== 'string') {
		throw new Error(`[getOrCreateSheet] Invalid sheet ID: ${sheetId}`)
	}

	const sheets = yDoc.getMap('sheets')
	let sheet = sheets.get(sheetId) as Y.Map<unknown> | undefined

	// Only create new sheet if it doesn't exist
	if (!sheet || !(sheet instanceof Y.Map)) {
		debug.log('[getOrCreateSheet] Creating new sheet:', sheetId)
		sheet = new Y.Map()
		sheet.set('name', new Y.Text()) // Sheet name as Y.Text
		sheet.set('rowOrder', new Y.Array<RowId>())
		sheet.set('colOrder', new Y.Array<ColId>())
		sheet.set('rows', new Y.Map<Y.Map<Cell>>())

		// Initialize ID-based feature maps
		sheet.set('merges', new Y.Map())
		sheet.set('borders', new Y.Map())
		sheet.set('hyperlinks', new Y.Map())
		sheet.set('validations', new Y.Map())
		sheet.set('conditionalFormats', new Y.Array())
		sheet.set('hiddenRows', new Y.Map())
		sheet.set('hiddenCols', new Y.Map())
		sheet.set('rowHeights', new Y.Map())
		sheet.set('colWidths', new Y.Map())
		sheet.set('frozen', new Y.Map()) // Initialize frozen as Y.Map

		sheets.set(sheetId, sheet)
	} else {
		// Sheet already exists - just return it without logging
		// (this is normal during loading)
	}

	// Get existing maps or initialize if missing (for backward compatibility)
	if (!sheet.has('name')) sheet.set('name', new Y.Text())
	if (!sheet.has('merges')) sheet.set('merges', new Y.Map())
	if (!sheet.has('borders')) sheet.set('borders', new Y.Map())
	if (!sheet.has('hyperlinks')) sheet.set('hyperlinks', new Y.Map())
	if (!sheet.has('validations')) sheet.set('validations', new Y.Map())
	if (!sheet.has('conditionalFormats')) sheet.set('conditionalFormats', new Y.Array())
	if (!sheet.has('hiddenRows')) sheet.set('hiddenRows', new Y.Map())
	if (!sheet.has('hiddenCols')) sheet.set('hiddenCols', new Y.Map())
	if (!sheet.has('rowHeights')) sheet.set('rowHeights', new Y.Map())
	if (!sheet.has('colWidths')) sheet.set('colWidths', new Y.Map())
	if (!sheet.has('frozen')) sheet.set('frozen', new Y.Map()) // Backward compatibility

	return {
		name: sheet.get('name') as Y.Text,
		rowOrder: sheet.get('rowOrder') as Y.Array<RowId>,
		colOrder: sheet.get('colOrder') as Y.Array<ColId>,
		rows: sheet.get('rows') as Y.Map<Y.Map<Cell>>,
		merges: sheet.get('merges') as Y.Map<MergeInfo>,
		borders: sheet.get('borders') as Y.Map<BorderInfo>,
		hyperlinks: sheet.get('hyperlinks') as Y.Map<HyperlinkInfo>,
		validations: sheet.get('validations') as Y.Map<ValidationRule>,
		conditionalFormats: sheet.get('conditionalFormats') as Y.Array<ConditionalFormat>,
		hiddenRows: sheet.get('hiddenRows') as Y.Map<boolean>,
		hiddenCols: sheet.get('hiddenCols') as Y.Map<boolean>,
		rowHeights: sheet.get('rowHeights') as Y.Map<number>,
		colWidths: sheet.get('colWidths') as Y.Map<number>,
		frozen: sheet.get('frozen') as Y.Map<string | number>
	}
}

/**
 * Ensure sheet has minimum dimensions
 * Creates row/column IDs as needed with collision detection
 */
export function ensureSheetDimensions(
	sheet: YSheetStructure,
	minRows: number,
	minCols: number
): void {
	const currentRows = sheet.rowOrder.length
	const currentCols = sheet.colOrder.length

	if (currentRows < minRows) {
		const existingRowIds = new Set(sheet.rowOrder.toArray())
		const newRowIds = generateUniqueRowIds(minRows - currentRows, existingRowIds)
		sheet.rowOrder.push(newRowIds)
	}

	if (currentCols < minCols) {
		const existingColIds = new Set(sheet.colOrder.toArray())
		const newColIds = generateUniqueColIds(minCols - currentCols, existingColIds)
		sheet.colOrder.push(newColIds)
	}
}

/**
 * Get cell (undefined if not exists)
 */
export function getCell(
	sheet: YSheetStructure,
	rowIndex: number,
	colIndex: number
): Cell | undefined {
	const rowId = sheet.rowOrder.get(rowIndex)
	const colId = sheet.colOrder.get(colIndex)

	if (!rowId || !colId) return undefined

	const rowMap = sheet.rows.get(rowId)
	return rowMap?.get(colId)
}

/**
 * Set cell (creates row map if needed)
 */
export function setCell(
	sheet: YSheetStructure,
	rowIndex: number,
	colIndex: number,
	cell: Cell
): void {
	const rowId = sheet.rowOrder.get(rowIndex)
	const colId = sheet.colOrder.get(colIndex)

	if (!rowId || !colId) {
		debug.error(`[setCell] Invalid indices: (${rowIndex}, ${colIndex})`)
		return
	}

	// Get or create row map
	let rowMap = sheet.rows.get(rowId)
	if (!rowMap) {
		rowMap = new Y.Map<Cell>()
		sheet.rows.set(rowId, rowMap)
	}

	// Clean cell: remove undefined and m property
	const cleanCell: Partial<Cell> = {}
	for (const [key, value] of Object.entries(cell)) {
		if (value !== undefined && key !== 'm') {
			;(cleanCell as Record<string, unknown>)[key] = value
		}
	}

	rowMap.set(colId, cleanCell)
}

/**
 * Clear cell
 */
export function clearCell(sheet: YSheetStructure, rowIndex: number, colIndex: number): void {
	const rowId = sheet.rowOrder.get(rowIndex)
	const colId = sheet.colOrder.get(colIndex)

	if (!rowId || !colId) return

	const rowMap = sheet.rows.get(rowId)
	if (rowMap) {
		rowMap.delete(colId)

		// Clean up empty row maps
		if (rowMap.size === 0) {
			sheet.rows.delete(rowId)
		}
	}
}

/**
 * Get all cells in a row (efficient!)
 */
export function getRowCells(
	sheet: YSheetStructure,
	rowIndex: number
): Array<{ colIndex: number; cell: Cell }> {
	const rowId = sheet.rowOrder.get(rowIndex)
	if (!rowId) return []

	const rowMap = sheet.rows.get(rowId)
	if (!rowMap) return []

	const colOrder = sheet.colOrder.toArray()
	const cells: Array<{ colIndex: number; cell: Cell }> = []

	for (const [colId, cell] of rowMap.entries()) {
		const colIndex = colOrder.indexOf(colId as ColId)
		if (colIndex >= 0) {
			cells.push({ colIndex, cell })
		}
	}

	return cells.sort((a, b) => a.colIndex - b.colIndex)
}

/**
 * Insert rows at position with collision detection
 */
export function insertRows(sheet: YSheetStructure, index: number, count: number): void {
	const existingRowIds = new Set(sheet.rowOrder.toArray())
	const newRowIds = generateUniqueRowIds(count, existingRowIds)
	sheet.rowOrder.insert(index, newRowIds)
}

/**
 * Delete rows (also deletes cell data and cleans up ID-based features)
 */
export function deleteRows(sheet: YSheetStructure, startIndex: number, endIndex: number): void {
	const count = Math.min(endIndex - startIndex + 1, sheet.rowOrder.length - startIndex)

	if (count <= 0) return

	// Collect row IDs to delete
	const rowIdsToDelete: RowId[] = []
	for (let i = 0; i < count; i++) {
		const rowId = sheet.rowOrder.get(startIndex + i)
		if (rowId) rowIdsToDelete.push(rowId)
	}

	// Delete from order array
	sheet.rowOrder.delete(startIndex, count)

	// Delete row data
	for (const rowId of rowIdsToDelete) {
		sheet.rows.delete(rowId)
	}

	// Clean up ID-based features
	cleanupAfterRowDeletion(sheet, rowIdsToDelete)
}

/**
 * Insert columns at position with collision detection
 */
export function insertColumns(sheet: YSheetStructure, index: number, count: number): void {
	const existingColIds = new Set(sheet.colOrder.toArray())
	const newColIds = generateUniqueColIds(count, existingColIds)
	sheet.colOrder.insert(index, newColIds)
}

/**
 * Delete columns (also deletes cell data and cleans up ID-based features)
 */
export function deleteColumns(sheet: YSheetStructure, startIndex: number, endIndex: number): void {
	const count = Math.min(endIndex - startIndex + 1, sheet.colOrder.length - startIndex)

	if (count <= 0) return

	// Collect column IDs to delete
	const colIdsToDelete: ColId[] = []
	for (let i = 0; i < count; i++) {
		const colId = sheet.colOrder.get(startIndex + i)
		if (colId) colIdsToDelete.push(colId)
	}

	// Delete from order array
	sheet.colOrder.delete(startIndex, count)

	// Delete column data from all rows
	for (const rowMap of sheet.rows.values()) {
		for (const colId of colIdsToDelete) {
			rowMap.delete(colId)
		}
	}

	// Clean up ID-based features
	cleanupAfterColDeletion(sheet, colIdsToDelete)
}

/**
 * Transform sheet data to FortuneSheet celldata format
 * Includes merge information in cell.mc property
 * Returns object with celldata and config (for hidden rows/cols, borders, frozen panes)
 */
export function transformSheetToCelldata(sheet: YSheetStructure): {
	celldata: Array<{ r: number; c: number; v: Cell }>
	config?: SheetConfig
} {
	const rowOrder = sheet.rowOrder.toArray()
	const colOrder = sheet.colOrder.toArray()
	const celldata: Array<{ r: number; c: number; v: Cell }> = []

	// Build a map of all cells in merges for quick lookup
	const mergeMap = new Map<string, { r: number; c: number; rs: number; cs: number }>()

	for (const merge of sheet.merges.values()) {
		const startRowIdx = rowIdToIndex(sheet, merge.startRow)
		const startColIdx = colIdToIndex(sheet, merge.startCol)
		const rowSpan = calculateRowSpan(sheet, merge.startRow, merge.endRow)
		const colSpan = calculateColSpan(sheet, merge.startCol, merge.endCol)

		if (startRowIdx === -1 || startColIdx === -1 || rowSpan === 0 || colSpan === 0) {
			debug.warn('[transformSheetToCelldata] Invalid merge:', merge)
			continue
		}

		const rowRange = getRowRange(sheet, merge.startRow, merge.endRow)
		const colRange = getColRange(sheet, merge.startCol, merge.endCol)

		for (let ri = 0; ri < rowRange.length; ri++) {
			for (let ci = 0; ci < colRange.length; ci++) {
				const rowId = rowRange[ri]
				const colId = colRange[ci]
				const r = rowOrder.indexOf(rowId)
				const c = colOrder.indexOf(colId)

				if (ri === 0 && ci === 0) {
					// Top-left cell - main merge cell
					mergeMap.set(`${rowId}_${colId}`, { r, c, rs: rowSpan, cs: colSpan })
				} else {
					// Other cells - merged cell reference
					mergeMap.set(`${rowId}_${colId}`, {
						r: startRowIdx,
						c: startColIdx,
						rs: rowSpan,
						cs: colSpan
					})
				}
			}
		}
	}

	// Build celldata with merge information
	for (let r = 0; r < rowOrder.length; r++) {
		const rowId = rowOrder[r]
		const rowMap = sheet.rows.get(rowId)

		for (let c = 0; c < colOrder.length; c++) {
			const colId = colOrder[c] as ColId
			const cell = rowMap?.get(colId)
			const mergeInfo = mergeMap.get(`${rowId}_${colId}`)

			// Include cell if it has data OR is part of a merge
			if (cell || mergeInfo) {
				const cleanCell: Cell = cell ? { ...cell } : {}
				delete cleanCell.m

				// Add merge information
				if (mergeInfo) {
					cleanCell.mc = mergeInfo
				}

				celldata.push({ r, c, v: cleanCell })
			}
		}
	}

	// Build config for hidden rows/columns, borders, and frozen panes
	const config: {
		// Standard SheetConfig fields
		rowhidden?: Record<string, number>
		colhidden?: Record<string, number>
		rowlen?: Record<string, number>
		columnlen?: Record<string, number>
		// Extended fields with specific types (FortuneSheet uses these but types them as any)
		borderInfo?: Array<{
			rangeType: 'cell'
			value: {
				row_index: number
				col_index: number
				l: { style?: number; color?: string } | null
				r: { style?: number; color?: string } | null
				t: { style?: number; color?: string } | null
				b: { style?: number; color?: string } | null
			}
		}>
		frozen?: FrozenInfo
		link?: Record<string, Omit<HyperlinkInfo, 'rowId' | 'colId'>>
		dataVerification?: Record<
			string,
			Omit<ValidationRule, 'id' | 'startRow' | 'endRow' | 'startCol' | 'endCol'> & {
				range: { row: [number, number]; column: [number, number] }
			}
		>
		conditionalFormats?: Array<
			Omit<ConditionalFormat, 'id' | 'startRow' | 'endRow' | 'startCol' | 'endCol'> & {
				range: { row: [number, number]; column: [number, number] }
			}
		>
	} = {}

	// Add row heights (convert from ID-based to index-based)
	const rowlen: Record<string, number> = {}
	for (let r = 0; r < rowOrder.length; r++) {
		const rowId = rowOrder[r]
		const height = sheet.rowHeights.get(rowId)
		if (height !== undefined) {
			rowlen[r] = height
		}
	}
	if (Object.keys(rowlen).length > 0) {
		config.rowlen = rowlen
	}

	// Add column widths (convert from ID-based to index-based)
	const columnlen: Record<string, number> = {}
	for (let c = 0; c < colOrder.length; c++) {
		const colId = colOrder[c]
		const width = sheet.colWidths.get(colId)
		if (width !== undefined) {
			columnlen[c] = width
		}
	}
	if (Object.keys(columnlen).length > 0) {
		config.columnlen = columnlen
	}

	// Add hidden rows
	const rowhidden: Record<string, number> = {}
	for (let r = 0; r < rowOrder.length; r++) {
		const rowId = rowOrder[r]
		if (sheet.hiddenRows.get(rowId) === true) {
			rowhidden[r] = 0 // FortuneSheet uses 0 for hidden
		}
	}
	if (Object.keys(rowhidden).length > 0) {
		config.rowhidden = rowhidden
	}

	// Add hidden columns
	const colhidden: Record<string, number> = {}
	for (let c = 0; c < colOrder.length; c++) {
		const colId = colOrder[c]
		if (sheet.hiddenCols.get(colId) === true) {
			colhidden[c] = 0 // FortuneSheet uses 0 for hidden
		}
	}
	if (Object.keys(colhidden).length > 0) {
		config.colhidden = colhidden
	}

	// Add borders - FortuneSheet expects an array of border objects
	const borderInfo: Array<{
		rangeType: 'cell'
		value: {
			row_index: number
			col_index: number
			l: { style?: number; color?: string } | null
			r: { style?: number; color?: string } | null
			t: { style?: number; color?: string } | null
			b: { style?: number; color?: string } | null
		}
	}> = []
	for (const [key, border] of sheet.borders.entries()) {
		const rowIndex = rowIdToIndex(sheet, border.rowId)
		const colIndex = colIdToIndex(sheet, border.colId)
		if (rowIndex >= 0 && colIndex >= 0) {
			borderInfo.push({
				rangeType: 'cell',
				value: {
					row_index: rowIndex,
					col_index: colIndex,
					l: border.style?.left || null,
					r: border.style?.right || null,
					t: border.style?.top || null,
					b: border.style?.bottom || null
				}
			})
		}
	}
	if (borderInfo.length > 0) {
		config.borderInfo = borderInfo as any
	}

	// Add frozen panes (FortuneSheet doesn't have this in SheetConfig type but accepts it at runtime)
	// Convert Y.Map back to FrozenInfo plain object
	if (sheet.frozen && sheet.frozen.size > 0) {
		const frozenType = sheet.frozen.get('type') as string | undefined
		if (frozenType) {
			const frozenInfo: FrozenInfo = {
				type: frozenType as 'row' | 'column' | 'both' | 'range'
			}

			// Check if range exists
			const rowFocus = sheet.frozen.get('rowFocus') as number | undefined
			const colFocus = sheet.frozen.get('colFocus') as number | undefined

			if (rowFocus !== undefined || colFocus !== undefined) {
				frozenInfo.range = {}
				if (rowFocus !== undefined) frozenInfo.range.rowFocus = rowFocus
				if (colFocus !== undefined) frozenInfo.range.colFocus = colFocus
			}

			config.frozen = frozenInfo
		}
	}

	// Add hyperlinks
	const linkInfo: Record<string, Omit<HyperlinkInfo, 'rowId' | 'colId'>> = {}
	for (const [key, link] of sheet.hyperlinks.entries()) {
		const rowIndex = rowIdToIndex(sheet, link.rowId)
		const colIndex = colIdToIndex(sheet, link.colId)
		if (rowIndex >= 0 && colIndex >= 0) {
			linkInfo[`${rowIndex}_${colIndex}`] = {
				linkAddress: link.linkAddress,
				linkTooltip: link.linkTooltip,
				linkType: link.linkType
			}
		}
	}
	if (Object.keys(linkInfo).length > 0) {
		config.link = linkInfo
	}

	// Add data validations
	const dataVerification: Record<
		string,
		Omit<ValidationRule, 'id' | 'startRow' | 'endRow' | 'startCol' | 'endCol'> & {
			range: { row: [number, number]; column: [number, number] }
		}
	> = {}
	for (const [key, validation] of sheet.validations.entries()) {
		const startRowIdx = rowIdToIndex(sheet, validation.startRow)
		const endRowIdx = rowIdToIndex(sheet, validation.endRow)
		const startColIdx = colIdToIndex(sheet, validation.startCol)
		const endColIdx = colIdToIndex(sheet, validation.endCol)

		if (startRowIdx >= 0 && endRowIdx >= 0 && startColIdx >= 0 && endColIdx >= 0) {
			dataVerification[key] = {
				type: validation.type,
				range: {
					row: [startRowIdx, endRowIdx],
					column: [startColIdx, endColIdx]
				},
				options: validation.options
			}
		}
	}
	if (Object.keys(dataVerification).length > 0) {
		config.dataVerification = dataVerification
	}

	// Add conditional formatting
	const conditionalFormats: Array<
		Omit<ConditionalFormat, 'id' | 'startRow' | 'endRow' | 'startCol' | 'endCol'> & {
			range: { row: [number, number]; column: [number, number] }
		}
	> = []
	for (const format of sheet.conditionalFormats.toArray()) {
		const startRowIdx = rowIdToIndex(sheet, format.startRow)
		const endRowIdx = rowIdToIndex(sheet, format.endRow)
		const startColIdx = colIdToIndex(sheet, format.startCol)
		const endColIdx = colIdToIndex(sheet, format.endCol)

		if (startRowIdx >= 0 && endRowIdx >= 0 && startColIdx >= 0 && endColIdx >= 0) {
			conditionalFormats.push({
				type: format.type,
				range: {
					row: [startRowIdx, endRowIdx],
					column: [startColIdx, endColIdx]
				},
				format: format.format
			})
		}
	}
	if (conditionalFormats.length > 0) {
		config.conditionalFormats = conditionalFormats
	}

	return {
		celldata,
		config: config as SheetConfig
		//...(Object.keys(config).length > 0 ? { config } : {})
	}
}

// ============================================================================
// ID/Index Conversion Helpers
// ============================================================================

/**
 * Convert row index to RowId
 */
export function indexToRowId(sheet: YSheetStructure, rowIndex: number): RowId | undefined {
	return sheet.rowOrder.get(rowIndex)
}

/**
 * Convert RowId to index
 */
export function rowIdToIndex(sheet: YSheetStructure, rowId: RowId): number {
	const rowOrder = sheet.rowOrder.toArray()
	return rowOrder.indexOf(rowId)
}

/**
 * Convert column index to ColId
 */
export function indexToColId(sheet: YSheetStructure, colIndex: number): ColId | undefined {
	return sheet.colOrder.get(colIndex)
}

/**
 * Convert ColId to index
 */
export function colIdToIndex(sheet: YSheetStructure, colId: ColId): number {
	const colOrder = sheet.colOrder.toArray()
	return colOrder.indexOf(colId)
}

/**
 * Get all RowIds in range [startRow, endRow] (inclusive)
 * Returns empty array if either boundary ID not found
 */
export function getRowRange(sheet: YSheetStructure, startRow: RowId, endRow: RowId): RowId[] {
	const rowOrder = sheet.rowOrder.toArray()
	const startIdx = rowOrder.indexOf(startRow)
	const endIdx = rowOrder.indexOf(endRow)

	if (startIdx === -1 || endIdx === -1) return []

	return rowOrder.slice(startIdx, endIdx + 1)
}

/**
 * Get all ColIds in range [startCol, endCol] (inclusive)
 * Returns empty array if either boundary ID not found
 */
export function getColRange(sheet: YSheetStructure, startCol: ColId, endCol: ColId): ColId[] {
	const colOrder = sheet.colOrder.toArray()
	const startIdx = colOrder.indexOf(startCol)
	const endIdx = colOrder.indexOf(endCol)

	if (startIdx === -1 || endIdx === -1) return []

	return colOrder.slice(startIdx, endIdx + 1)
}

/**
 * Calculate row span (number of rows) between startRow and endRow (inclusive)
 * Returns 0 if either boundary ID not found
 */
export function calculateRowSpan(sheet: YSheetStructure, startRow: RowId, endRow: RowId): number {
	const range = getRowRange(sheet, startRow, endRow)
	return range.length
}

/**
 * Calculate column span (number of columns) between startCol and endCol (inclusive)
 * Returns 0 if either boundary ID not found
 */
export function calculateColSpan(sheet: YSheetStructure, startCol: ColId, endCol: ColId): number {
	const range = getColRange(sheet, startCol, endCol)
	return range.length
}

// ============================================================================
// Merged Cells Helpers
// ============================================================================

/**
 * Add or update a merge
 * Key format: `${startRow}_${startCol}`
 */
export function setMerge(
	sheet: YSheetStructure,
	startRow: RowId,
	endRow: RowId,
	startCol: ColId,
	endCol: ColId
): void {
	const key = `${startRow}_${startCol}`
	const merge: MergeInfo = { startRow, endRow, startCol, endCol }
	sheet.merges.set(key, merge)
}

/**
 * Remove a merge by key
 */
export function removeMerge(sheet: YSheetStructure, key: string): void {
	sheet.merges.delete(key)
}

/**
 * Get merge at cell position (by indices)
 * Returns the merge if the cell is part of a merged range
 */
export function getMergeAt(
	sheet: YSheetStructure,
	rowIndex: number,
	colIndex: number
): MergeInfo | undefined {
	const rowId = indexToRowId(sheet, rowIndex)
	const colId = indexToColId(sheet, colIndex)
	if (!rowId || !colId) return undefined

	// Check all merges to see if this cell is within any range
	for (const merge of sheet.merges.values()) {
		const rowRange = getRowRange(sheet, merge.startRow, merge.endRow)
		const colRange = getColRange(sheet, merge.startCol, merge.endCol)

		if (rowRange.includes(rowId) && colRange.includes(colId)) {
			return merge
		}
	}

	return undefined
}

/**
 * Check if a cell is the start of a merge (top-left corner)
 */
export function isMergeStart(sheet: YSheetStructure, rowIndex: number, colIndex: number): boolean {
	const rowId = indexToRowId(sheet, rowIndex)
	const colId = indexToColId(sheet, colIndex)
	if (!rowId || !colId) return false

	const key = `${rowId}_${colId}`
	return sheet.merges.has(key)
}

// ============================================================================
// Row/Column Hiding Helpers
// ============================================================================

/**
 * Hide a row by index
 */
export function hideRow(sheet: YSheetStructure, rowIndex: number): void {
	const rowId = indexToRowId(sheet, rowIndex)
	if (rowId) {
		sheet.hiddenRows.set(rowId, true)
	}
}

/**
 * Show a row by index
 */
export function showRow(sheet: YSheetStructure, rowIndex: number): void {
	const rowId = indexToRowId(sheet, rowIndex)
	if (rowId) {
		sheet.hiddenRows.delete(rowId)
	}
}

/**
 * Check if row is hidden
 */
export function isRowHidden(sheet: YSheetStructure, rowIndex: number): boolean {
	const rowId = indexToRowId(sheet, rowIndex)
	return rowId ? sheet.hiddenRows.get(rowId) === true : false
}

/**
 * Hide a column by index
 */
export function hideColumn(sheet: YSheetStructure, colIndex: number): void {
	const colId = indexToColId(sheet, colIndex)
	if (colId) {
		sheet.hiddenCols.set(colId, true)
	}
}

/**
 * Show a column by index
 */
export function showColumn(sheet: YSheetStructure, colIndex: number): void {
	const colId = indexToColId(sheet, colIndex)
	if (colId) {
		sheet.hiddenCols.delete(colId)
	}
}

/**
 * Check if column is hidden
 */
export function isColumnHidden(sheet: YSheetStructure, colIndex: number): boolean {
	const colId = indexToColId(sheet, colIndex)
	return colId ? sheet.hiddenCols.get(colId) === true : false
}

// ============================================================================
// Border Helpers
// ============================================================================

/**
 * Set border for a cell
 * Key format: `${rowId}_${colId}`
 */
export function setBorder(
	sheet: YSheetStructure,
	rowIndex: number,
	colIndex: number,
	style: {
		top?: { style?: number; color?: string }
		bottom?: { style?: number; color?: string }
		left?: { style?: number; color?: string }
		right?: { style?: number; color?: string }
	}
): void {
	const rowId = indexToRowId(sheet, rowIndex)
	const colId = indexToColId(sheet, colIndex)

	if (!rowId || !colId) return

	const key = `${rowId}_${colId}`

	// Deep clone the style to ensure immutability (no shared references)
	const clonedStyle: typeof style = {}
	if (style.top) clonedStyle.top = { ...style.top }
	if (style.bottom) clonedStyle.bottom = { ...style.bottom }
	if (style.left) clonedStyle.left = { ...style.left }
	if (style.right) clonedStyle.right = { ...style.right }

	sheet.borders.set(key, { rowId, colId, style: clonedStyle })
}

/**
 * Remove border from a cell
 */
export function removeBorder(sheet: YSheetStructure, rowIndex: number, colIndex: number): void {
	const rowId = indexToRowId(sheet, rowIndex)
	const colId = indexToColId(sheet, colIndex)

	if (!rowId || !colId) return

	const key = `${rowId}_${colId}`
	sheet.borders.delete(key)
}

/**
 * Get border at cell position
 */
export function getBorderAt(
	sheet: YSheetStructure,
	rowIndex: number,
	colIndex: number
):
	| {
			top?: { style?: number; color?: string }
			bottom?: { style?: number; color?: string }
			left?: { style?: number; color?: string }
			right?: { style?: number; color?: string }
	  }
	| undefined {
	const rowId = indexToRowId(sheet, rowIndex)
	const colId = indexToColId(sheet, colIndex)

	if (!rowId || !colId) return undefined

	const key = `${rowId}_${colId}`
	const border = sheet.borders.get(key)
	return border?.style
}

// ============================================================================
// Hyperlink Helpers
// ============================================================================

/**
 * Set hyperlink for a cell
 * Key format: `${rowId}_${colId}`
 */
export function setHyperlink(
	sheet: YSheetStructure,
	rowIndex: number,
	colIndex: number,
	linkAddress: string,
	linkTooltip?: string,
	linkType?: 'external' | 'internal' | 'email'
): void {
	const rowId = indexToRowId(sheet, rowIndex)
	const colId = indexToColId(sheet, colIndex)

	if (!rowId || !colId) return

	const key = `${rowId}_${colId}`
	sheet.hyperlinks.set(key, { rowId, colId, linkAddress, linkTooltip, linkType })
}

/**
 * Remove hyperlink from a cell
 */
export function removeHyperlink(sheet: YSheetStructure, rowIndex: number, colIndex: number): void {
	const rowId = indexToRowId(sheet, rowIndex)
	const colId = indexToColId(sheet, colIndex)

	if (!rowId || !colId) return

	const key = `${rowId}_${colId}`
	sheet.hyperlinks.delete(key)
}

/**
 * Get hyperlink at cell position
 */
export function getHyperlinkAt(
	sheet: YSheetStructure,
	rowIndex: number,
	colIndex: number
):
	| {
			linkAddress: string
			linkTooltip?: string
			linkType?: 'external' | 'internal' | 'email'
	  }
	| undefined {
	const rowId = indexToRowId(sheet, rowIndex)
	const colId = indexToColId(sheet, colIndex)

	if (!rowId || !colId) return undefined

	const key = `${rowId}_${colId}`
	const hyperlink = sheet.hyperlinks.get(key)
	if (!hyperlink) return undefined

	return {
		linkAddress: hyperlink.linkAddress,
		linkTooltip: hyperlink.linkTooltip,
		linkType: hyperlink.linkType
	}
}

// ============================================================================
// Cleanup Helpers for Deletion
// ============================================================================

/**
 * Validate and repair merge ranges after structural changes
 * Removes merges that reference non-existent rows or columns
 * This prevents corruption from concurrent deletions by different users
 */
function validateAndRepairMerges(sheet: YSheetStructure): void {
	const rowOrder = sheet.rowOrder.toArray()
	const colOrder = sheet.colOrder.toArray()
	const rowSet = new Set(rowOrder)
	const colSet = new Set(colOrder)

	for (const [key, merge] of sheet.merges.entries()) {
		// Check if ALL boundary IDs still exist
		const hasStartRow = rowSet.has(merge.startRow)
		const hasEndRow = rowSet.has(merge.endRow)
		const hasStartCol = colSet.has(merge.startCol)
		const hasEndCol = colSet.has(merge.endCol)

		if (!hasStartRow || !hasEndRow || !hasStartCol || !hasEndCol) {
			// Merge references deleted rows/columns - remove it
			sheet.merges.delete(key)
			debug.warn('[Merge] Removed invalid merge after deletion:', key, {
				hasStartRow,
				hasEndRow,
				hasStartCol,
				hasEndCol
			})
			continue
		}

		// Check if indices are still valid (start <= end)
		const startRowIdx = rowOrder.indexOf(merge.startRow)
		const endRowIdx = rowOrder.indexOf(merge.endRow)
		const startColIdx = colOrder.indexOf(merge.startCol)
		const endColIdx = colOrder.indexOf(merge.endCol)

		if (startRowIdx > endRowIdx || startColIdx > endColIdx) {
			// Merge range is inverted - remove it
			sheet.merges.delete(key)
			debug.warn('[Merge] Removed inverted merge:', key, {
				startRowIdx,
				endRowIdx,
				startColIdx,
				endColIdx
			})
		}
	}
}

/**
 * Clean up ID-based features after row deletion
 * Removes merges, borders, hyperlinks, validations, and conditional formats
 * that reference deleted rows
 */
function cleanupAfterRowDeletion(sheet: YSheetStructure, deletedRowIds: RowId[]): void {
	const deletedSet = new Set(deletedRowIds)

	// Clean up merges - remove if any boundary row deleted
	for (const [key, merge] of sheet.merges.entries()) {
		if (deletedSet.has(merge.startRow) || deletedSet.has(merge.endRow)) {
			sheet.merges.delete(key)
		}
	}

	// Validate all remaining merges to catch concurrent deletion issues
	validateAndRepairMerges(sheet)

	// Clean up borders - remove if row deleted
	for (const [key, border] of sheet.borders.entries()) {
		if (deletedSet.has(border.rowId)) {
			sheet.borders.delete(key)
		}
	}

	// Clean up hyperlinks - remove if row deleted
	for (const [key, hyperlink] of sheet.hyperlinks.entries()) {
		if (deletedSet.has(hyperlink.rowId)) {
			sheet.hyperlinks.delete(key)
		}
	}

	// Clean up validations - remove if any boundary row deleted
	for (const [key, validation] of sheet.validations.entries()) {
		if (deletedSet.has(validation.startRow) || deletedSet.has(validation.endRow)) {
			sheet.validations.delete(key)
		}
	}

	// Clean up conditional formats - remove if any boundary row deleted
	const formatsToRemove: number[] = []
	for (let i = 0; i < sheet.conditionalFormats.length; i++) {
		const format = sheet.conditionalFormats.get(i)
		if (format && (deletedSet.has(format.startRow) || deletedSet.has(format.endRow))) {
			formatsToRemove.push(i)
		}
	}
	// Remove in reverse order to maintain indices
	for (let i = formatsToRemove.length - 1; i >= 0; i--) {
		sheet.conditionalFormats.delete(formatsToRemove[i], 1)
	}

	// Clean up hidden rows
	for (const rowId of deletedRowIds) {
		sheet.hiddenRows.delete(rowId)
	}
}

/**
 * Clean up ID-based features after column deletion
 * Removes merges, borders, hyperlinks, validations, and conditional formats
 * that reference deleted columns
 */
function cleanupAfterColDeletion(sheet: YSheetStructure, deletedColIds: ColId[]): void {
	const deletedSet = new Set(deletedColIds)

	// Clean up merges - remove if any boundary column deleted
	for (const [key, merge] of sheet.merges.entries()) {
		if (deletedSet.has(merge.startCol) || deletedSet.has(merge.endCol)) {
			sheet.merges.delete(key)
		}
	}

	// Validate all remaining merges to catch concurrent deletion issues
	validateAndRepairMerges(sheet)

	// Clean up borders - remove if column deleted
	for (const [key, border] of sheet.borders.entries()) {
		if (deletedSet.has(border.colId)) {
			sheet.borders.delete(key)
		}
	}

	// Clean up hyperlinks - remove if column deleted
	for (const [key, hyperlink] of sheet.hyperlinks.entries()) {
		if (deletedSet.has(hyperlink.colId)) {
			sheet.hyperlinks.delete(key)
		}
	}

	// Clean up validations - remove if any boundary column deleted
	for (const [key, validation] of sheet.validations.entries()) {
		if (deletedSet.has(validation.startCol) || deletedSet.has(validation.endCol)) {
			sheet.validations.delete(key)
		}
	}

	// Clean up conditional formats - remove if any boundary column deleted
	const formatsToRemove: number[] = []
	for (let i = 0; i < sheet.conditionalFormats.length; i++) {
		const format = sheet.conditionalFormats.get(i)
		if (format && (deletedSet.has(format.startCol) || deletedSet.has(format.endCol))) {
			formatsToRemove.push(i)
		}
	}
	// Remove in reverse order to maintain indices
	for (let i = formatsToRemove.length - 1; i >= 0; i--) {
		sheet.conditionalFormats.delete(formatsToRemove[i], 1)
	}

	// Clean up hidden columns
	for (const colId of deletedColIds) {
		sheet.hiddenCols.delete(colId)
	}
}

// vim: ts=4
