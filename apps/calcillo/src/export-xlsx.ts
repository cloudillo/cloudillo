// This file is part of the Cloudillo Platform.
// Copyright (C) 2026  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * XLSX Export Module
 *
 * Exports Calcillo's Y.Doc structure to Excel (.xlsx) files.
 * Uses ExcelJS for writing and the existing ydoc-helpers for
 * reading data from the CRDT document.
 */

import type * as Y from 'yjs'
import ExcelJS from 'exceljs'
import type { Cell } from '@fortune-sheet/core'
import type { SheetId, RowId, ColId } from './yjs-types'
import { getOrCreateSheet, rowIdToIndex, colIdToIndex } from './ydoc-helpers'
import { downloadBlob, sanitizeFilename } from '@cloudillo/core'

/**
 * Export the Y.Doc as an XLSX file and trigger a download.
 */
export async function downloadXlsxExport(yDoc: Y.Doc): Promise<void> {
	const workbook = new ExcelJS.Workbook()
	const sheetOrder = yDoc.getArray<SheetId>('sheetOrder')

	let firstName = ''

	for (const sheetId of sheetOrder.toArray()) {
		const ySheet = getOrCreateSheet(yDoc, sheetId)
		const name = ySheet.name.toString() || 'Sheet'
		if (!firstName) firstName = name

		const worksheet = workbook.addWorksheet(name)
		const rowOrder = ySheet.rowOrder.toArray()
		const colOrder = ySheet.colOrder.toArray()

		// Build O(1) lookup maps for row/col indices
		const rowIndex = new Map(rowOrder.map((id, i) => [id, i]))
		const colIndex = new Map(colOrder.map((id, i) => [id, i]))

		// Export cells
		for (const [rowId, rowMap] of ySheet.rows.entries()) {
			const rowIdx = rowIndex.get(rowId as RowId) ?? -1
			if (rowIdx < 0) continue

			for (const [colId, cellData] of (rowMap as Y.Map<Cell>).entries()) {
				const colIdx = colIndex.get(colId as ColId) ?? -1
				if (colIdx < 0) continue

				const excelCell = worksheet.getCell(rowIdx + 1, colIdx + 1)
				applyCellToExcel(excelCell, cellData)
			}
		}

		// Export merged cells
		for (const merge of ySheet.merges.values()) {
			const top = rowIdToIndex(ySheet, merge.startRow) + 1
			const left = colIdToIndex(ySheet, merge.startCol) + 1
			const bottom = rowIdToIndex(ySheet, merge.endRow) + 1
			const right = colIdToIndex(ySheet, merge.endCol) + 1

			if (top > 0 && left > 0 && bottom > 0 && right > 0) {
				worksheet.mergeCells(top, left, bottom, right)
			}
		}

		// Export column widths
		for (const [colId, width] of ySheet.colWidths.entries()) {
			const colIdx = colIndex.get(colId as ColId) ?? -1
			if (colIdx >= 0) {
				// Convert pixels to character width (~7px per char)
				worksheet.getColumn(colIdx + 1).width = Math.round(width / 7)
			}
		}

		// Export row heights
		for (const [rowId, height] of ySheet.rowHeights.entries()) {
			const rowIdx = rowIndex.get(rowId as RowId) ?? -1
			if (rowIdx >= 0) {
				// Convert pixels back to points for ExcelJS (72 pt/in / 96 DPI)
				worksheet.getRow(rowIdx + 1).height = Math.round((height * 72) / 96)
			}
		}
	}

	// Generate buffer and download
	const buffer = await workbook.xlsx.writeBuffer()
	const blob = new Blob([buffer], {
		type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
	})
	const safeName = sanitizeFilename(firstName || 'spreadsheet')
	downloadBlob(blob, `${safeName}.xlsx`)
}

// ============================================
// CELL CONVERSION
// ============================================

/**
 * Apply a Fortune Sheet Cell's value and style to an ExcelJS cell.
 */
function applyCellToExcel(excelCell: ExcelJS.Cell, cell: Cell): void {
	// Value / Formula
	if (cell.f) {
		// Strip leading '=' that Fortune Sheet stores
		const formula = cell.f.startsWith('=') ? cell.f.slice(1) : cell.f
		excelCell.value = { formula, result: cell.v as number | string | boolean | undefined }
	} else if (cell.v !== undefined && cell.v !== null) {
		excelCell.value = cell.v as ExcelJS.CellValue
	}

	// Font
	const font: Partial<ExcelJS.Font> = {}
	let hasFont = false
	if (cell.bl === 1) {
		font.bold = true
		hasFont = true
	}
	if (cell.it === 1) {
		font.italic = true
		hasFont = true
	}
	if (cell.un === 1) {
		font.underline = true
		hasFont = true
	}
	if (cell.cl === 1) {
		font.strike = true
		hasFont = true
	}
	if (cell.fs && cell.fs !== 10) {
		font.size = cell.fs
		hasFont = true
	}
	if (cell.fc && cell.fc !== '#000000') {
		font.color = hexToArgb(cell.fc)
		hasFont = true
	}
	if (hasFont) excelCell.font = font

	// Fill (background color)
	if (cell.bg) {
		excelCell.fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: hexToArgb(cell.bg)
		}
	}

	// Alignment
	const alignment: Partial<ExcelJS.Alignment> = {}
	let hasAlignment = false
	if (cell.ht !== undefined && cell.ht !== 1) {
		// Fortune Sheet: 0=center, 1=left, 2=right
		alignment.horizontal = cell.ht === 0 ? 'center' : cell.ht === 2 ? 'right' : 'left'
		hasAlignment = true
	}
	if (cell.vt !== undefined && cell.vt !== 0) {
		// Fortune Sheet: 0=middle(default mapped from top), 1=top, 2=bottom
		alignment.vertical = cell.vt === 1 ? 'top' : cell.vt === 2 ? 'bottom' : 'middle'
		hasAlignment = true
	}
	if (cell.tb === '1' || cell.tb === '2') {
		alignment.wrapText = true
		hasAlignment = true
	}
	if (hasAlignment) excelCell.alignment = alignment

	// Number format
	if (cell.ct?.fa && cell.ct.fa !== 'General') {
		excelCell.numFmt = cell.ct.fa
	}
}

// ============================================
// COLOR CONVERSION
// ============================================

/**
 * Convert #RRGGBB hex color to ExcelJS ARGB color object.
 * Prepends FF alpha channel.
 */
function hexToArgb(hex: string): Partial<ExcelJS.Color> {
	const rgb = hex.startsWith('#') ? hex.slice(1) : hex
	return { argb: `FF${rgb.toUpperCase()}` }
}

// vim: ts=4
