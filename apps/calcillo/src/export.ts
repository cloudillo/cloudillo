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
 *
 * v3.0.0: Uses generic exportYDoc() with inline @T type markers.
 */

import * as Y from 'yjs'
import { stripCellDefaults } from './cell-defaults.js'
import { downloadBlob, sanitizeFilename } from '@cloudillo/core'
import { exportYDoc, type ExportEnvelope } from '@cloudillo/crdt'

// App version injected at build time
declare const __APP_VERSION__: string

const EXPORT_FORMAT_VERSION = '3.0.0'
const CONTENT_TYPE = 'application/vnd.cloudillo.calcillo+json'

/**
 * Strip default cell properties from rows within the serialized sheets data.
 *
 * Walks into each sheet's "rows" map and applies stripCellDefaults to each cell.
 * The serialized structure is: sheets → { "@T": "M", [sheetId]: { "@T": "M", rows: { "@T": "M", [rowId]: { "@T": "M", [colId]: cellObj } } } }
 */
function transformSheets(_key: string, data: unknown): unknown {
	if (_key !== 'sheets' || !data || typeof data !== 'object') return data

	const sheets = data as Record<string, unknown>
	const result: Record<string, unknown> = { '@T': sheets['@T'] }

	for (const [sheetId, sheetData] of Object.entries(sheets)) {
		if (sheetId === '@T') continue
		if (!sheetData || typeof sheetData !== 'object') {
			result[sheetId] = sheetData
			continue
		}

		const sheet = sheetData as Record<string, unknown>
		const rows = sheet['rows']
		if (!rows || typeof rows !== 'object') {
			result[sheetId] = sheetData
			continue
		}

		const rowsMap = rows as Record<string, unknown>
		const cleanRows: Record<string, unknown> = { '@T': rowsMap['@T'] }

		for (const [rowId, rowData] of Object.entries(rowsMap)) {
			if (rowId === '@T') continue
			if (!rowData || typeof rowData !== 'object') continue

			const row = rowData as Record<string, unknown>
			const cleanRow: Record<string, unknown> = { '@T': row['@T'] }

			for (const [colId, cell] of Object.entries(row)) {
				if (colId === '@T') continue
				if (cell && typeof cell === 'object') {
					const cleaned = stripCellDefaults(cell as any)
					if (cleaned) {
						cleanRow[colId] = cleaned
					}
				}
			}

			if (Object.keys(cleanRow).length > 1) {
				cleanRows[rowId] = cleanRow
			}
		}

		result[sheetId] = { ...sheet, rows: cleanRows }
	}

	return result
}

/**
 * Export the document to a serializable JSON structure
 */
export function exportDocument(yDoc: Y.Doc): ExportEnvelope<Record<string, unknown>> {
	return exportYDoc(yDoc, {
		contentType: CONTENT_TYPE,
		appVersion: __APP_VERSION__,
		formatVersion: EXPORT_FORMAT_VERSION,
		transform: transformSheets
	})
}

/**
 * Export the document and trigger a file download
 */
export function downloadExport(yDoc: Y.Doc): void {
	const exportData = exportDocument(yDoc)
	const json = JSON.stringify(exportData, null, 2)
	const blob = new Blob([json], { type: 'application/json' })

	// Generate safe filename from first sheet name
	const sheetOrder = exportData.data['sheetOrder']
	const sheets = exportData.data['sheets'] as Record<string, unknown> | undefined
	let firstName = ''
	if (Array.isArray(sheetOrder) && sheetOrder.length > 1 && sheets) {
		const firstSheet = sheets[sheetOrder[1] as string] as Record<string, unknown> | undefined
		const nameField = firstSheet?.['name']
		if (
			nameField &&
			typeof nameField === 'object' &&
			(nameField as Record<string, unknown>)['@T'] === 'T'
		) {
			firstName = ((nameField as Record<string, unknown>)['text'] as string) || ''
		} else if (typeof nameField === 'string') {
			firstName = nameField
		}
	}
	const safeName = sanitizeFilename(firstName || 'spreadsheet')

	downloadBlob(blob, `${safeName}.calcillo`)
}

// vim: ts=4
