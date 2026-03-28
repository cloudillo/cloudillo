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
 * XLSX Import Module
 *
 * Converts Excel (.xlsx) files into Calcillo's Y.Doc structure.
 * Uses ExcelJS for parsing (with full style support) and the
 * existing ydoc-helpers for populating the CRDT document.
 */

import type * as Y from 'yjs'
import ExcelJS from 'exceljs'
import type { Cell } from '@fortune-sheet/core'
import type { SheetId, MergeInfo } from './yjs-types'
import { generateSheetId } from './id-generator'
import { getOrCreateSheet, ensureSheetDimensions, setCell } from './ydoc-helpers'

const DEFAULT_MIN_ROWS = 100
const DEFAULT_MIN_COLS = 26

/**
 * Import an XLSX file into a Y.Doc
 *
 * Parses the workbook and populates sheets, cells, merges,
 * column widths, and row heights in the Yjs document.
 */
export async function importXlsx(yDoc: Y.Doc, data: ArrayBuffer): Promise<void> {
	const workbook = new ExcelJS.Workbook()
	// ExcelJS types expect Buffer but works with ArrayBuffer in browser
	await workbook.xlsx.load(data as unknown as ExcelJS.Buffer)

	yDoc.transact(() => {
		const sheetOrder = yDoc.getArray<SheetId>('sheetOrder')

		workbook.eachSheet((worksheet) => {
			const sheetId = generateSheetId()
			const sheet = getOrCreateSheet(yDoc, sheetId)

			// Set sheet name
			sheet.name.insert(0, worksheet.name)

			// Determine dimensions
			const maxRow = worksheet.rowCount
			const maxCol = worksheet.columnCount

			const totalRows = Math.max(DEFAULT_MIN_ROWS, maxRow)
			const totalCols = Math.max(DEFAULT_MIN_COLS, maxCol)
			ensureSheetDimensions(sheet, totalRows, totalCols)

			// Import cells
			worksheet.eachRow({ includeEmpty: false }, (row, rowIndex) => {
				row.eachCell({ includeEmpty: false }, (excelCell, colIndex) => {
					const cell = convertCell(excelCell)
					if (cell) {
						// ExcelJS uses 1-based indices, ydoc-helpers use 0-based
						setCell(sheet, rowIndex - 1, colIndex - 1, cell)
					}
				})
			})

			// Import merged cells
			const merges = worksheet.model.merges
			if (merges) {
				for (const mergeRange of merges) {
					const decoded = decodeMergeRange(mergeRange)
					if (!decoded) continue

					const startRowId = sheet.rowOrder.get(decoded.top - 1)
					const endRowId = sheet.rowOrder.get(decoded.bottom - 1)
					const startColId = sheet.colOrder.get(decoded.left - 1)
					const endColId = sheet.colOrder.get(decoded.right - 1)

					if (startRowId && endRowId && startColId && endColId) {
						const mergeKey = `${startRowId}:${startColId}`
						const mergeInfo: MergeInfo = {
							startRow: startRowId,
							endRow: endRowId,
							startCol: startColId,
							endCol: endColId
						}
						sheet.merges.set(mergeKey, mergeInfo)
					}
				}
			}

			// Import column widths
			for (let c = 1; c <= maxCol; c++) {
				const col = worksheet.getColumn(c)
				if (col.width) {
					const colId = sheet.colOrder.get(c - 1)
					if (colId) {
						// ExcelJS width is in characters, convert to pixels (~7px per char)
						sheet.colWidths.set(colId, Math.round(col.width * 7))
					}
				}
			}

			// Import row heights (includeEmpty: true to capture height-only rows)
			worksheet.eachRow({ includeEmpty: true }, (row, rowIndex) => {
				if (row.height) {
					const rowId = sheet.rowOrder.get(rowIndex - 1)
					if (rowId) {
						// ExcelJS height is in points, convert to pixels (96 DPI / 72 pt/in)
						sheet.rowHeights.set(rowId, Math.round((row.height * 96) / 72))
					}
				}
			})

			sheetOrder.push([sheetId])
		})
	})
}

/**
 * Decode a merge range string like "A1:B2" to 1-based row/col bounds
 */
function decodeMergeRange(range: string): {
	top: number
	left: number
	bottom: number
	right: number
} | null {
	const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/)
	if (!match) return null

	return {
		left: colLetterToNumber(match[1]),
		top: parseInt(match[2], 10),
		right: colLetterToNumber(match[3]),
		bottom: parseInt(match[4], 10)
	}
}

/**
 * Convert column letter(s) to 1-based number (A=1, B=2, ..., Z=26, AA=27)
 */
function colLetterToNumber(letters: string): number {
	let result = 0
	for (let i = 0; i < letters.length; i++) {
		result = result * 26 + (letters.charCodeAt(i) - 64)
	}
	return result
}

/**
 * Convert an ExcelJS cell to a Fortune Sheet Cell
 */
function convertCell(excelCell: ExcelJS.Cell): Cell | null {
	const cell: Cell = {}
	const value = excelCell.value

	if (value === null || value === undefined) return null

	// Handle different value types
	// Fortune Sheet stores cell values as STRINGS in v, with ct.t indicating
	// the semantic type. Raw numbers/booleans must be converted to strings.
	// Dates are stored as numeric serial numbers with t:'d'.
	if (typeof value === 'number') {
		cell.v = String(value)
		cell.ct = { fa: 'General', t: 'n' }
	} else if (typeof value === 'string') {
		cell.v = value
		cell.ct = { fa: 'General', t: 'g' }
	} else if (typeof value === 'boolean') {
		cell.v = value ? '1' : '0'
		cell.ct = { fa: 'General', t: 'b' }
	} else if (value instanceof Date) {
		cell.v = dateToExcelSerial(value)
		cell.ct = {
			fa: excelCell.numFmt ? excelFmtToFortune(excelCell.numFmt) : 'yyyy-MM-dd',
			t: 'd'
		}
	} else if (isFormulaValue(value)) {
		cell.f = `=${value.formula}`
		if (value.result !== undefined && value.result !== null) {
			if (typeof value.result === 'object' && 'error' in value.result) {
				cell.v = String(value.result.error)
			} else if (value.result instanceof Date) {
				// ExcelJS auto-converts numeric results to Date when cell has a date format.
				// Convert back to serial number — Fortune Sheet will recalculate anyway.
				cell.v = String(dateToExcelSerial(value.result))
			} else {
				cell.v = String(value.result)
			}
		}
		// Always treat formulas as numbers — ExcelJS's Date detection is unreliable
		// for formula results (e.g., =G2*D2 with date-formatted cells)
		cell.ct = { fa: 'General', t: 'n' }
	} else if (isRichTextValue(value)) {
		cell.v = value.richText.map((rt) => rt.text).join('')
		cell.ct = { fa: 'General', t: 'g' }
	} else if (isErrorValue(value)) {
		cell.v = String(value.error)
		cell.ct = { fa: 'General', t: 'e' }
	} else if (isDateLike(value)) {
		cell.v = dateToExcelSerial(value as unknown as Date)
		cell.ct = {
			fa: excelCell.numFmt ? excelFmtToFortune(excelCell.numFmt) : 'yyyy-MM-dd',
			t: 'd'
		}
	} else {
		cell.v = excelCell.text || String(value)
	}

	// Apply styles
	applyFont(cell, excelCell.font)
	applyFill(cell, excelCell.fill)
	applyAlignment(cell, excelCell.alignment)
	// Skip numFmt for formulas (Excel inherits date formats onto arithmetic formulas)
	// and for date cells (use hardcoded yyyy-MM-dd format that Fortune Sheet supports)
	if (!cell.f && cell.ct?.t !== 'd') {
		applyNumFmt(cell, excelCell.numFmt)
	}

	// Excel's "General" alignment right-aligns numbers/dates by default,
	// but Fortune Sheet defaults to left (ht=1). Apply Excel's default
	// when no explicit alignment was set.
	if (cell.ht === undefined && (cell.ct?.t === 'n' || cell.ct?.t === 'd')) {
		cell.ht = 2
	}

	return cell
}

// ============================================
// TYPE GUARDS
// ============================================

function isFormulaValue(
	v: ExcelJS.CellValue
): v is ExcelJS.CellFormulaValue | ExcelJS.CellSharedFormulaValue {
	return typeof v === 'object' && v !== null && ('formula' in v || 'sharedFormula' in v)
}

function isRichTextValue(v: ExcelJS.CellValue): v is ExcelJS.CellRichTextValue {
	return typeof v === 'object' && v !== null && 'richText' in v
}

function isErrorValue(v: ExcelJS.CellValue): v is ExcelJS.CellErrorValue {
	return typeof v === 'object' && v !== null && 'error' in v
}

function isDateLike(v: unknown): boolean {
	return typeof v === 'object' && v !== null && typeof (v as Date).getTime === 'function'
}

// ============================================
// DATE CONVERSION
// ============================================

/**
 * Convert a JavaScript Date to an Excel serial date number.
 * Excel uses the 1900 date system where serial 1 = Jan 1, 1900.
 * Accounts for Excel's historical bug where Feb 29, 1900 (serial 60) exists.
 */
function dateToExcelSerial(date: Date): number {
	const MS_PER_DAY = 86400000
	const EXCEL_EPOCH = Date.UTC(1900, 0, 1) // Jan 1, 1900 UTC
	const daysSinceEpoch = (date.getTime() - EXCEL_EPOCH) / MS_PER_DAY
	let serial = daysSinceEpoch + 1 // Excel serial 1 = Jan 1, 1900
	if (serial > 59) serial += 1 // Skip phantom Feb 29, 1900
	return serial
}

// ============================================
// COLOR HANDLING
// ============================================

/**
 * Default Office theme color palette (Office 2007+)
 * Indices: 0=bg1, 1=text1, 2=bg2, 3=text2, 4-9=accent1-6, 10=hyperlink, 11=followed-hyperlink
 *
 * Note: indices 0 and 1 are swapped in OOXML theme vs display
 * (theme index 0 = dk1/text1, theme index 1 = lt1/bg1)
 */
const DEFAULT_THEME_COLORS = [
	'FFFFFF', // 0: lt1 (background 1 — white)
	'000000', // 1: dk1 (text 1 — black)
	'E7E6E6', // 2: lt2 (background 2 — light gray)
	'44546A', // 3: dk2 (text 2 — dark blue-gray)
	'4472C4', // 4: accent 1
	'ED7D31', // 5: accent 2
	'A5A5A5', // 6: accent 3
	'FFC000', // 7: accent 4
	'5B9BD5', // 8: accent 5
	'70AD47', // 9: accent 6
	'0563C1', // 10: hyperlink
	'954F72' // 11: followed hyperlink
]

/**
 * Apply a tint to an RGB hex color.
 * Tint > 0 lightens toward white, tint < 0 darkens toward black.
 * Follows the OOXML spec for tint/shade calculation.
 */
function applyTint(hex: string, tint: number): string {
	let r = parseInt(hex.slice(0, 2), 16)
	let g = parseInt(hex.slice(2, 4), 16)
	let b = parseInt(hex.slice(4, 6), 16)

	if (tint > 0) {
		// Lighten toward white
		r = Math.round(r + (255 - r) * tint)
		g = Math.round(g + (255 - g) * tint)
		b = Math.round(b + (255 - b) * tint)
	} else if (tint < 0) {
		// Darken toward black
		const factor = 1 + tint
		r = Math.round(r * factor)
		g = Math.round(g * factor)
		b = Math.round(b * factor)
	}

	const clamp = (v: number) => Math.max(0, Math.min(255, v))
	const toHex = (v: number) => clamp(v).toString(16).padStart(2, '0')
	return `${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * Resolve an ExcelJS color to a #RRGGBB hex string.
 * Handles both direct ARGB colors and theme-indexed colors with tint.
 */
function resolveColor(color: Partial<ExcelJS.Color> | undefined): string | undefined {
	if (!color) return undefined

	// Direct ARGB color (AARRGGBB)
	if (color.argb) {
		const rgb = color.argb.length === 8 ? color.argb.slice(2) : color.argb
		return `#${rgb.toUpperCase()}`
	}

	// Theme-indexed color
	if (
		color.theme !== undefined &&
		color.theme >= 0 &&
		color.theme < DEFAULT_THEME_COLORS.length
	) {
		let rgb = DEFAULT_THEME_COLORS[color.theme]
		// Apply tint if present
		const tint = (color as Record<string, unknown>).tint as number | undefined
		if (tint) {
			rgb = applyTint(rgb, tint)
		}
		return `#${rgb}`
	}

	return undefined
}

// ============================================
// STYLE CONVERTERS
// ============================================

function applyFont(cell: Cell, font: Partial<ExcelJS.Font> | undefined): void {
	if (!font) return

	if (font.bold) cell.bl = 1
	if (font.italic) cell.it = 1
	if (font.underline) cell.un = 1
	if (font.strike) cell.cl = 1
	if (font.size) cell.fs = font.size
	const fontColor = resolveColor(font.color)
	if (fontColor) cell.fc = fontColor
}

function applyFill(cell: Cell, fill: ExcelJS.Fill | undefined): void {
	if (!fill || fill.type !== 'pattern') return

	const patternFill = fill as ExcelJS.FillPattern
	const bgColor = resolveColor(patternFill.fgColor)
	if (bgColor) cell.bg = bgColor
}

function applyAlignment(cell: Cell, alignment: Partial<ExcelJS.Alignment> | undefined): void {
	if (!alignment) return

	switch (alignment.horizontal) {
		case 'left':
			cell.ht = 1
			break
		case 'center':
			cell.ht = 0
			break
		case 'right':
			cell.ht = 2
			break
	}

	switch (alignment.vertical) {
		case 'top':
			cell.vt = 1
			break
		case 'middle':
			cell.vt = 0
			break
		case 'bottom':
			cell.vt = 2
			break
	}

	if (alignment.wrapText) {
		cell.tb = '1'
	}
}

/**
 * Convert Excel date format tokens to Fortune Sheet (ICU) conventions.
 * Excel uses lowercase 'm' for both month and minutes (disambiguated by position).
 * Fortune Sheet uses uppercase 'M' for month and lowercase 'm' for minutes.
 */
function excelFmtToFortune(fmt: string): string {
	let result = ''
	let i = 0
	let afterH = false
	while (i < fmt.length) {
		const ch = fmt[i]
		// Skip quoted strings
		if (ch === '"') {
			const end = fmt.indexOf('"', i + 1)
			if (end === -1) break
			result += fmt.slice(i, end + 1)
			i = end + 1
			continue
		}
		// Skip bracket sections like [Red]
		if (ch === '[') {
			const end = fmt.indexOf(']', i + 1)
			if (end === -1) break
			result += fmt.slice(i, end + 1)
			i = end + 1
			continue
		}
		// Track 'h' for minute detection
		if (ch === 'h' || ch === 'H') {
			afterH = true
			result += ch
			i++
			continue
		}
		// 'm' tokens: month (uppercase) or minutes (lowercase after h)
		if (ch === 'm') {
			let mCount = 0
			while (i < fmt.length && fmt[i] === 'm') {
				mCount++
				i++
			}
			result += afterH ? 'm'.repeat(mCount) : 'M'.repeat(mCount)
			afterH = false
			continue
		}
		// Separators (:, space) don't reset afterH
		if (ch !== ':' && ch !== ' ') {
			afterH = false
		}
		result += ch
		i++
	}
	return result
}

function applyNumFmt(cell: Cell, numFmt: string | undefined): void {
	if (!numFmt || numFmt === 'General') return

	// Convert Excel format tokens to Fortune Sheet conventions (e.g., mm → MM for months)
	const fa = excelFmtToFortune(numFmt)

	// Only override the format string, preserve the type (t) already set by convertCell.
	if (cell.ct) {
		cell.ct = { ...cell.ct, fa }
	} else {
		cell.ct = { fa, t: 'n' }
	}
}

// vim: ts=4
