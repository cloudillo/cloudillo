import * as Y from 'yjs'
import { WorkbookInstance } from '@fortune-sheet/react'
import type { YSheetStructure, SheetId, ColId } from './yjs-types'
import { debug } from './debug'

/**
 * Apply sheet data changes from remote users
 */
export function applySheetYEvent(
	sheetId: SheetId,
	sheet: YSheetStructure,
	wb: WorkbookInstance,
	evt: Y.YEvent<Y.AbstractType<unknown>>
): boolean {
	if (evt.transaction.local) return false

	const path = evt.path.slice(1)
	let needsRecalc = false

	if (path[0] === 'name' && evt instanceof Y.YTextEvent) {
		// Sheet name changed
		const newName = sheet.name.toString()
		wb.setSheetName(newName, { id: sheetId })
	} else if (path[0] === 'rows' && evt instanceof Y.YMapEvent) {
		// Cell data changed
		const rowOrder = sheet.rowOrder.toArray()
		const colOrder = sheet.colOrder.toArray()

		for (const rowId of evt.keysChanged) {
			const rowIndex = rowOrder.indexOf(rowId)
			if (rowIndex < 0) continue

			const rowMap = sheet.rows.get(rowId)
			if (!rowMap) {
				// Row was deleted - clear all cells
				for (let c = 0; c < colOrder.length; c++) {
					wb.clearCell(rowIndex, c, { id: sheetId })
				}
				continue
			}

			// Update changed cells in this row
			for (const [colId, cell] of rowMap.entries()) {
				const colIndex = colOrder.indexOf(colId as ColId)
				if (colIndex < 0) continue

				if (cell && (cell.v !== undefined || cell.f !== undefined)) {
					const value = cell.f || cell.v
					// First set the value
					wb.setCellValue(rowIndex, colIndex, value, {
						id: sheetId,
						type: cell.f ? 'f' : 'v'
					})

					// Then apply cell formatting if present
					// Common cell format properties in Fortune Sheet:
					// bl: bold, it: italic, ff: font family, fs: font size
					// fc: font color, bg: background color, ht: horizontal align, vt: vertical align
					const cellAny = cell as any
					const formatAttrs = ['bl', 'it', 'ff', 'fs', 'fc', 'bg', 'ht', 'vt', 'un', 'cl', 'st', 'tb']
					for (const attr of formatAttrs) {
						if (cellAny[attr] !== undefined) {
							wb.setCellFormat(rowIndex, colIndex, attr as any, cellAny[attr], { id: sheetId })
						}
					}

					needsRecalc = true
				} else {
					wb.clearCell(rowIndex, colIndex, { id: sheetId })
				}
			}
		}
	} else if (path[0] === 'rowOrder' && evt instanceof Y.YArrayEvent) {
		// Row insertion/deletion
		let pos = 0
		for (const delta of evt.delta) {
			if (delta.retain) {
				pos += delta.retain
			} else if (delta.insert) {
				const count = Array.isArray(delta.insert) ? delta.insert.length : 1
				wb.insertRowOrColumn('row', pos, count, 'lefttop', { id: sheetId })
				pos += count
				needsRecalc = true
			} else if (delta.delete) {
				wb.deleteRowOrColumn('row', pos, pos + delta.delete - 1, { id: sheetId })
				needsRecalc = true
			}
		}
	} else if (path[0] === 'colOrder' && evt instanceof Y.YArrayEvent) {
		// Column insertion/deletion
		let pos = 0
		for (const delta of evt.delta) {
			if (delta.retain) {
				pos += delta.retain
			} else if (delta.insert) {
				const count = Array.isArray(delta.insert) ? delta.insert.length : 1
				wb.insertRowOrColumn('column', pos, count, 'lefttop', { id: sheetId })
				pos += count
				needsRecalc = true
			} else if (delta.delete) {
				wb.deleteRowOrColumn('column', pos, pos + delta.delete - 1, { id: sheetId })
				needsRecalc = true
			}
		}
	} else if (path[0] === 'frozen' && evt instanceof Y.YMapEvent) {
		// Frozen pane changes - apply using Fortune Sheet freeze API
		const frozenType = sheet.frozen.get('type') as string | undefined

		if (frozenType && sheet.frozen.size > 0) {
			// Extract frozen config from Y.Map
			const rowFocus = sheet.frozen.get('rowFocus') as number | undefined
			const colFocus = sheet.frozen.get('colFocus') as number | undefined

			// Apply freeze using Fortune Sheet API
			// API: wb.freeze(type, range, options?)
			// type: 'row' | 'column' | 'both'
			// range: { row: number, column: number }
			const range = {
				row: rowFocus ?? 0,
				column: colFocus ?? 0
			}
			wb.freeze(frozenType as any, range, { id: sheetId })
		} else {
			// Unfreeze if map is empty - use type 'cancel' or empty range
			// Based on the API, we need to pass a range even for cancel
			wb.freeze('cancel' as any, { row: 0, column: 0 }, { id: sheetId })
		}
	} else if (path[0] === 'rowHeights' && evt instanceof Y.YMapEvent) {
		// Row height changes - use setRowHeight API
		const rowOrder = sheet.rowOrder.toArray()
		const rowInfo: Record<number, number> = {}

		for (const rowId of evt.keysChanged) {
			const rowIdx = rowOrder.indexOf(rowId as any)
			if (rowIdx >= 0) {
				const height = sheet.rowHeights.get(rowId)
				if (height !== undefined) {
					rowInfo[rowIdx] = height
				}
			}
		}

		if (Object.keys(rowInfo).length > 0) {
			wb.setRowHeight(rowInfo, { id: sheetId })
		}
	} else if (path[0] === 'colWidths' && evt instanceof Y.YMapEvent) {
		// Column width changes - use setColumnWidth API
		const colOrder = sheet.colOrder.toArray()
		const colInfo: Record<number, number> = {}

		for (const colId of evt.keysChanged) {
			const colIdx = colOrder.indexOf(colId as any)
			if (colIdx >= 0) {
				const width = sheet.colWidths.get(colId)
				if (width !== undefined) {
					colInfo[colIdx] = width
				}
			}
		}

		if (Object.keys(colInfo).length > 0) {
			wb.setColumnWidth(colInfo, { id: sheetId })
		}
	} else if (path[0] === 'borders' && evt instanceof Y.YMapEvent) {
		// Border changes - apply using setCellFormat with 'bd' attribute
		const rowOrder = sheet.rowOrder.toArray()
		const colOrder = sheet.colOrder.toArray()

		debug.log('[yjs-events] Border event, keys changed:', Array.from(evt.keysChanged))

		for (const borderKey of evt.keysChanged) {
			const border = sheet.borders.get(borderKey)
			// Border key is "rowId_colId"
			const [rowId, colId] = borderKey.split('_')

			if (rowId && colId) {
				const rowIdx = rowOrder.indexOf(rowId as any)
				const colIdx = colOrder.indexOf(colId as any)

				if (rowIdx >= 0 && colIdx >= 0) {
					if (border && border.style) {
						// Apply border style using setCellFormat
						// Fortune Sheet uses 'bd' attribute with the border object structure
						debug.log('[yjs-events] Applying border to cell', rowIdx, colIdx, border.style)
						wb.setCellFormat(rowIdx, colIdx, 'bd' as any, border.style, { id: sheetId })
					} else {
						// Border was removed - clear it
						debug.log('[yjs-events] Clearing border from cell', rowIdx, colIdx)
						wb.setCellFormat(rowIdx, colIdx, 'bd' as any, null, { id: sheetId })
					}
				}
			}
		}
	} else if (path[0] === 'merges' && evt instanceof Y.YMapEvent) {
		// Merge changes - stored in cell.mc property, already synced via cell updates
		debug.log('[yjs-events] Merge changed, synced via cell data')
	} else if (path[0] === 'hiddenRows' && evt instanceof Y.YMapEvent) {
		// Hidden row changes - stored in config.rowhidden, will apply on reload
		debug.log('[yjs-events] Row visibility changed, will apply on reload')
	} else if (path[0] === 'hiddenCols' && evt instanceof Y.YMapEvent) {
		// Hidden column changes - stored in config.colhidden, will apply on reload
		debug.log('[yjs-events] Column visibility changed, will apply on reload')
	} else if (path[0] === 'hyperlinks' && evt instanceof Y.YMapEvent) {
		// Hyperlink changes - stored in config.link, will apply on reload
		debug.log('[yjs-events] Hyperlink changed, will apply on reload')
	} else if (path[0] === 'validations' && evt instanceof Y.YMapEvent) {
		// Data validation changes - stored in config.dataVerification, will apply on reload
		debug.log('[yjs-events] Validation changed, will apply on reload')
	} else if (path[0] === 'conditionalFormats' && evt instanceof Y.YArrayEvent) {
		// Conditional format changes - stored in config.conditionalFormats, will apply on reload
		debug.log('[yjs-events] Conditional format changed, will apply on reload')
	}

	return needsRecalc
}

// vim: ts=4
