// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
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
 * Export functionality for Calcillo documents
 *
 * Exports the CRDT document as a JSON file with .calcillo extension.
 * Uses ID-based export (not index-based) for perfect round-trip import capability.
 */

import * as Y from 'yjs'
import type { SheetId } from './yjs-types.js'
import { getOrCreateSheet } from './ydoc-helpers.js'

// App version injected at build time
declare const __APP_VERSION__: string

const EXPORT_FORMAT_VERSION = '1.0.0'
const CONTENT_TYPE = 'application/vnd.cloudillo.calcillo+json'

/**
 * Recursively round numeric values in an object for cleaner export (3 decimal places)
 */
function roundNumericValues<T>(value: T): T {
	if (typeof value === 'number') {
		return (Math.round(value * 1000) / 1000) as T
	}
	if (Array.isArray(value)) {
		return value.map(roundNumericValues) as T
	}
	if (value && typeof value === 'object') {
		const result: Record<string, unknown> = {}
		for (const [key, val] of Object.entries(value)) {
			result[key] = roundNumericValues(val)
		}
		return result as T
	}
	return value
}

/**
 * Strip transient `m` property from cell values in rows data
 */
function stripTransientCellProps(rows: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {}
	for (const [rowId, rowData] of Object.entries(rows)) {
		if (rowData && typeof rowData === 'object') {
			const cleanRow: Record<string, unknown> = {}
			for (const [colId, cell] of Object.entries(rowData as Record<string, unknown>)) {
				if (cell && typeof cell === 'object') {
					const { m, ...rest } = cell as Record<string, unknown>
					cleanRow[colId] = rest
				} else {
					cleanRow[colId] = cell
				}
			}
			result[rowId] = cleanRow
		} else {
			result[rowId] = rowData
		}
	}
	return result
}

/**
 * Complete export document structure
 */
export interface CalcilloExportDocument {
	contentType: typeof CONTENT_TYPE
	appVersion: string
	formatVersion: string
	exportedAt: string

	data: {
		sheetOrder: string[]
		sheets: Record<
			string,
			{
				name: string
				rowOrder: string[]
				colOrder: string[]
				rows: Record<string, unknown>
				merges: Record<string, unknown>
				borders: Record<string, unknown>
				hyperlinks: Record<string, unknown>
				validations: Record<string, unknown>
				conditionalFormats: unknown[]
				hiddenRows: Record<string, boolean>
				hiddenCols: Record<string, boolean>
				rowHeights: Record<string, number>
				colWidths: Record<string, number>
				frozen: Record<string, string | number>
			}
		>
	}
}

/**
 * Export the document to a serializable JSON structure
 */
export function exportDocument(yDoc: Y.Doc): CalcilloExportDocument {
	const sheetOrder = yDoc.getArray<SheetId>('sheetOrder')
	const sheetIds = sheetOrder.toArray()

	const sheets: CalcilloExportDocument['data']['sheets'] = {}

	for (const sheetId of sheetIds) {
		const sheet = getOrCreateSheet(yDoc, sheetId)

		const rawRows = sheet.rows.toJSON() as Record<string, unknown>
		const rows = stripTransientCellProps(rawRows)

		sheets[sheetId] = {
			name: sheet.name.toString(),
			rowOrder: sheet.rowOrder.toArray() as string[],
			colOrder: sheet.colOrder.toArray() as string[],
			rows: roundNumericValues(rows),
			merges: sheet.merges.toJSON() as Record<string, unknown>,
			borders: sheet.borders.toJSON() as Record<string, unknown>,
			hyperlinks: sheet.hyperlinks.toJSON() as Record<string, unknown>,
			validations: sheet.validations.toJSON() as Record<string, unknown>,
			conditionalFormats: sheet.conditionalFormats.toArray(),
			hiddenRows: sheet.hiddenRows.toJSON() as Record<string, boolean>,
			hiddenCols: sheet.hiddenCols.toJSON() as Record<string, boolean>,
			rowHeights: roundNumericValues(sheet.rowHeights.toJSON() as Record<string, number>),
			colWidths: roundNumericValues(sheet.colWidths.toJSON() as Record<string, number>),
			frozen: sheet.frozen.toJSON() as Record<string, string | number>
		}
	}

	return {
		contentType: CONTENT_TYPE,
		appVersion: __APP_VERSION__,
		formatVersion: EXPORT_FORMAT_VERSION,
		exportedAt: new Date().toISOString(),
		data: {
			sheetOrder: sheetIds as string[],
			sheets
		}
	}
}

/**
 * Export the document and trigger a file download
 */
export function downloadExport(yDoc: Y.Doc): void {
	const exportData = exportDocument(yDoc)
	const json = JSON.stringify(exportData, null, 2)
	const blob = new Blob([json], { type: 'application/json' })
	const url = URL.createObjectURL(blob)

	// Generate safe filename from first sheet name
	const sheetIds = exportData.data.sheetOrder
	const firstName = sheetIds.length > 0 ? exportData.data.sheets[sheetIds[0]]?.name : ''
	const docName = firstName || 'spreadsheet'
	const safeName = docName.replace(/[^a-zA-Z0-9-_]/g, '_')

	const a = document.createElement('a')
	a.href = url
	a.download = `${safeName}.calcillo`
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	URL.revokeObjectURL(url)
}

// vim: ts=4
