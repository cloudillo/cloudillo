import { Op } from '@fortune-sheet/core'
import type { YSheetStructure } from './yjs-types'
import * as Y from 'yjs'
import {
	setCell,
	clearCell,
	getCell,
	ensureSheetDimensions,
	insertRows,
	deleteRows,
	insertColumns,
	deleteColumns,
	indexToRowId,
	indexToColId,
	setMerge,
	removeMerge,
	hideRow,
	showRow,
	hideColumn,
	showColumn,
	setBorder,
	removeBorder,
	setHyperlink,
	removeHyperlink
} from './ydoc-helpers'
import { debug } from './debug'

// ============================================================================
// Border Edge Types and Utilities
// ============================================================================

type BorderSide = 'top' | 'bottom' | 'left' | 'right'

interface BorderEdge {
	style: number
	color: string
}

/**
 * Maps border type names to the sides they affect.
 * This eliminates the need for repetitive switch statements.
 */
const BORDER_TYPE_MAP: Record<string, BorderSide[]> = {
	'border-all': ['top', 'bottom', 'left', 'right'],
	'border-outside': ['top', 'bottom', 'left', 'right'],
	'border-horizontal': ['top', 'bottom'],
	'border-vertical': ['left', 'right'],
	'border-top': ['top'],
	'border-bottom': ['bottom'],
	'border-left': ['left'],
	'border-right': ['right']
	// Note: 'border-inside' is intentionally omitted as it requires special handling
}

/**
 * Creates a border style object from a border type and edge definition.
 * Returns undefined if the border type is not supported.
 */
function createBorderStyle(
	borderType: string,
	edge: BorderEdge
): Partial<Record<BorderSide, BorderEdge>> | undefined {
	const sides = BORDER_TYPE_MAP[borderType]
	if (!sides) return undefined

	const style: Partial<Record<BorderSide, BorderEdge>> = {}
	for (const side of sides) {
		style[side] = edge
	}
	return style
}

/**
 * Parses a border definition and creates the border edge object.
 */
function parseBorderEdge(borderDef: { style?: string | number; color?: string }): BorderEdge {
	return {
		style:
			typeof borderDef.style === 'string'
				? parseInt(borderDef.style, 10)
				: (borderDef.style ?? 1),
		color: borderDef.color || '#000000'
	}
}

/**
 * Transform cell operations (add/replace/remove)
 */
function transformCellOp(sheet: YSheetStructure, op: Op): void {
	if (op.path[0] !== 'data') return

	const rowIndex = Number(op.path[1])
	const colIndex = op.path.length >= 3 ? Number(op.path[2]) : undefined

	// Ensure dimensions
	if (colIndex !== undefined) {
		ensureSheetDimensions(sheet, rowIndex + 1, colIndex + 1)
	}

	switch (op.op) {
		case 'add':
		case 'replace': {
			if (colIndex === undefined) {
				// Whole row operation (rare, mostly for initial load)
				if (!Array.isArray(op.value)) return

				ensureSheetDimensions(sheet, rowIndex + 1, op.value.length)

				for (let c = 0; c < op.value.length; c++) {
					const cellValue = op.value[c]
					if (cellValue && typeof cellValue === 'object') {
						setCell(sheet, rowIndex, c, cellValue)
					}
				}
			} else {
				// Single cell operation
				if (
					op.value === null ||
					(typeof op.value === 'object' && Object.keys(op.value).length === 0)
				) {
					clearCell(sheet, rowIndex, colIndex)
				} else if (op.path.length === 3) {
					// Full cell replacement
					setCell(sheet, rowIndex, colIndex, op.value)
				} else {
					// Single property update (e.g., data[5][3].v = "Hello")
					const property = op.path[3]
					const currentCell = getCell(sheet, rowIndex, colIndex) || {}
					setCell(sheet, rowIndex, colIndex, {
						...currentCell,
						[property]: op.value
					})
				}
			}
			break
		}

		case 'remove': {
			if (colIndex !== undefined) {
				clearCell(sheet, rowIndex, colIndex)
			}
			break
		}
	}
}

/**
 * Transform config operations (sheet name, column widths, merges, etc.)
 */
function transformConfigOp(sheet: YSheetStructure, op: Op): void {
	if (!op.id) return

	switch (op.op) {
		case 'add':
		case 'replace': {
			if (op.path[0] === 'name') {
				// Update sheet name
				const nameText = sheet.name
				nameText.delete(0, nameText.length)
				nameText.insert(0, op.value)
			} else if (op.path[0] === 'config') {
				if (op.path.length === 1) {
					// Full config replacement - extract borderInfo array if present
					if (op.value && typeof op.value === 'object') {
						// Handle borderInfo array format
						if (Array.isArray(op.value.borderInfo)) {
							for (const borderDef of op.value.borderInfo) {
								// Handle individual cell borders (rangeType: 'cell')
								if (borderDef.rangeType === 'cell' && borderDef.value) {
									const { row_index, col_index, l, r, t, b } = borderDef.value
									if (row_index !== undefined && col_index !== undefined) {
										const borderStyle: Partial<Record<BorderSide, BorderEdge>> =
											{}
										if (t) borderStyle.top = t
										if (b) borderStyle.bottom = b
										if (l) borderStyle.left = l
										if (r) borderStyle.right = r

										if (Object.keys(borderStyle).length > 0) {
											setBorder(sheet, row_index, col_index, borderStyle)
											debug.log(
												`[Border] Saved cell border at (${row_index}, ${col_index}):`,
												borderStyle
											)
										}
									}
								}
								// Handle range borders (rangeType: 'range')
								else if (borderDef.range && Array.isArray(borderDef.range)) {
									debug.log(
										'[Border] Processing border def:',
										borderDef.borderType,
										'range cells:',
										borderDef.range.length
									)

									const borderEdge = parseBorderEdge(borderDef)

									for (const rangeItem of borderDef.range) {
										// Each rangeItem can be a range with row: [start, end] and column: [start, end]
										const rowStart = Array.isArray(rangeItem.row)
											? rangeItem.row[0]
											: rangeItem.row
										const rowEnd = Array.isArray(rangeItem.row)
											? rangeItem.row[1]
											: rangeItem.row
										const colStart = Array.isArray(rangeItem.column)
											? rangeItem.column[0]
											: rangeItem.column
										const colEnd = Array.isArray(rangeItem.column)
											? rangeItem.column[1]
											: rangeItem.column

										// Iterate through all cells in the range
										for (
											let rowIndex = rowStart;
											rowIndex <= rowEnd;
											rowIndex++
										) {
											for (
												let colIndex = colStart;
												colIndex <= colEnd;
												colIndex++
											) {
												// Use lookup table instead of switch statement
												const borderStyle = createBorderStyle(
													borderDef.borderType,
													borderEdge
												)

												if (
													borderStyle &&
													Object.keys(borderStyle).length > 0
												) {
													setBorder(
														sheet,
														rowIndex,
														colIndex,
														borderStyle
													)
													debug.log(
														`[Border] Saved border at (${rowIndex}, ${colIndex}):`,
														borderDef.borderType
													)
												}
											}
										}
									}
								}
							}
						}
					}
				} else if (op.path.length === 3 && op.path[1] === 'columnlen') {
					// Column width update - store by ID, not index!
					const colIndex = Number(op.path[2])
					const colId = indexToColId(sheet, colIndex)
					if (colId) {
						sheet.colWidths.set(colId, op.value)
					}
				} else if (op.path.length === 3 && op.path[1] === 'rowlen') {
					// Row height update - store by ID, not index!
					const rowIndex = Number(op.path[2])
					const rowId = indexToRowId(sheet, rowIndex)
					if (rowId) {
						sheet.rowHeights.set(rowId, op.value)
					}
				} else if (op.path.length === 3 && op.path[1] === 'rowhidden') {
					// Row hide/show operation: config.rowhidden.{index}
					const rowIndex = Number(op.path[2])
					if (op.value === 0) {
						// Hide row (FortuneSheet uses 0 for hidden)
						hideRow(sheet, rowIndex)
					}
				} else if (op.path.length === 3 && op.path[1] === 'colhidden') {
					// Column hide/show operation: config.colhidden.{index}
					const colIndex = Number(op.path[2])
					if (op.value === 0) {
						// Hide column (FortuneSheet uses 0 for hidden)
						hideColumn(sheet, colIndex)
					}
				} else if (op.path.length === 3 && op.path[1] === 'merge') {
					// Merge operation: config.merge.{key}
					const mergeKey = String(op.path[2])
					const mergeValue = op.value

					if (mergeValue && typeof mergeValue === 'object') {
						// Add/update merge - convert indices to IDs
						const { r, c, rs, cs } = mergeValue
						const startRowId = indexToRowId(sheet, r)
						const endRowId = indexToRowId(sheet, r + rs - 1)
						const startColId = indexToColId(sheet, c)
						const endColId = indexToColId(sheet, c + cs - 1)

						if (startRowId && endRowId && startColId && endColId) {
							setMerge(sheet, startRowId, endRowId, startColId, endColId)
						} else {
							debug.error('[transformConfigOp] Invalid merge indices:', mergeValue)
						}
					}
				} else if (op.path.length === 3 && op.path[1] === 'borderInfo') {
					// Border operation: config.borderInfo.{key}
					const borderKey = String(op.path[2])
					const [rStr, cStr] = borderKey.split('_')

					if (rStr && cStr) {
						const rowIndex = parseInt(rStr, 10)
						const colIndex = parseInt(cStr, 10)

						if (op.value && typeof op.value === 'object') {
							// Add/update border
							setBorder(sheet, rowIndex, colIndex, op.value)
						}
					}
				} else if (
					op.path.length === 3 &&
					(op.path[1] === 'link' || op.path[1] === 'hyperlink')
				) {
					// Hyperlink operation: config.link.{key} or config.hyperlink.{key}
					const linkKey = String(op.path[2])
					const [rStr, cStr] = linkKey.split('_')

					if (rStr && cStr) {
						const rowIndex = parseInt(rStr, 10)
						const colIndex = parseInt(cStr, 10)

						if (op.value && typeof op.value === 'object') {
							// Add/update hyperlink
							setHyperlink(
								sheet,
								rowIndex,
								colIndex,
								op.value.linkAddress || op.value.address || '',
								op.value.linkTooltip || op.value.tooltip,
								op.value.linkType || op.value.type
							)
						}
					}
				} else if (op.path.length === 3 && op.path[1] === 'dataVerification') {
					// Data validation operation: config.dataVerification.{id}
					const validationId = String(op.path[2])

					if (op.value && typeof op.value === 'object' && op.value.range) {
						// Add/update validation - convert indices to IDs
						const { type, range, options } = op.value
						const startRowId = indexToRowId(sheet, range.row[0])
						const endRowId = indexToRowId(sheet, range.row[1])
						const startColId = indexToColId(sheet, range.column[0])
						const endColId = indexToColId(sheet, range.column[1])

						if (startRowId && endRowId && startColId && endColId) {
							// Deep clone options to ensure immutability
							const clonedOptions = options
								? {
										dropdown: options.dropdown
											? [...options.dropdown]
											: undefined,
										min: options.min,
										max: options.max,
										allowBlank: options.allowBlank
									}
								: undefined

							sheet.validations.set(validationId, {
								id: validationId,
								startRow: startRowId,
								endRow: endRowId,
								startCol: startColId,
								endCol: endColId,
								type,
								options: clonedOptions
							})
						} else {
							debug.warn('[Validation] Invalid range indices:', range)
						}
					}
				} else if (op.path.length === 3 && op.path[1] === 'conditionalFormats') {
					// Conditional formatting operation: config.conditionalFormats.{index}
					if (op.value && typeof op.value === 'object' && op.value.range) {
						// Add conditional format - convert indices to IDs
						const { type, range, format } = op.value
						const startRowId = indexToRowId(sheet, range.row[0])
						const endRowId = indexToRowId(sheet, range.row[1])
						const startColId = indexToColId(sheet, range.column[0])
						const endColId = indexToColId(sheet, range.column[1])

						if (startRowId && endRowId && startColId && endColId) {
							// Deep clone format to ensure immutability
							const clonedFormat = {
								cellStyle: format.cellStyle ? { ...format.cellStyle } : undefined,
								operator: format.operator,
								value: format.value,
								value2: format.value2
							}

							// Generate unique ID for this conditional format
							const formatId = `cf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
							sheet.conditionalFormats.push([
								{
									id: formatId,
									startRow: startRowId,
									endRow: endRowId,
									startCol: startColId,
									endCol: endColId,
									type,
									format: clonedFormat
								}
							])
						} else {
							debug.warn('[ConditionalFormat] Invalid range indices:', range)
						}
					}
				} else if (op.path.length === 2 && op.path[1] === 'frozen') {
					// Frozen pane operation: config.frozen
					if (op.value && typeof op.value === 'object') {
						// Store frozen config in Y.Map for proper CRDT sync
						sheet.frozen.clear()
						sheet.frozen.set('type', op.value.type)
						if (op.value.range) {
							if (op.value.range.rowFocus !== undefined) {
								sheet.frozen.set('rowFocus', op.value.range.rowFocus)
							}
							if (op.value.range.colFocus !== undefined) {
								sheet.frozen.set('colFocus', op.value.range.colFocus)
							}
						}
					} else {
						// Unfreeze - clear the map
						sheet.frozen.clear()
					}
				}
			}
			break
		}

		case 'remove': {
			if (op.path.length === 3 && op.path[1] === 'merge') {
				// Remove merge
				const mergeKey = String(op.path[2])

				// Find the merge by looking for one starting at the given row/col
				// FortuneSheet uses "r_c" format for merge keys
				const [rStr, cStr] = mergeKey.split('_')
				if (rStr && cStr) {
					const r = parseInt(rStr, 10)
					const c = parseInt(cStr, 10)
					const startRowId = indexToRowId(sheet, r)
					const startColId = indexToColId(sheet, c)

					if (startRowId && startColId) {
						const key = `${startRowId}_${startColId}`
						removeMerge(sheet, key)
					}
				}
			} else if (op.path.length === 3 && op.path[1] === 'borderInfo') {
				// Remove border
				const borderKey = String(op.path[2])
				const [rStr, cStr] = borderKey.split('_')

				if (rStr && cStr) {
					const rowIndex = parseInt(rStr, 10)
					const colIndex = parseInt(cStr, 10)
					removeBorder(sheet, rowIndex, colIndex)
				}
			} else if (
				op.path.length === 3 &&
				(op.path[1] === 'link' || op.path[1] === 'hyperlink')
			) {
				// Remove hyperlink
				const linkKey = String(op.path[2])
				const [rStr, cStr] = linkKey.split('_')

				if (rStr && cStr) {
					const rowIndex = parseInt(rStr, 10)
					const colIndex = parseInt(cStr, 10)
					removeHyperlink(sheet, rowIndex, colIndex)
				}
			} else if (op.path.length === 3 && op.path[1] === 'dataVerification') {
				// Remove validation
				const validationId = String(op.path[2])
				sheet.validations.delete(validationId)
			} else if (op.path.length === 3 && op.path[1] === 'conditionalFormats') {
				// Remove conditional format
				const formatIndex = Number(op.path[2])
				if (formatIndex >= 0 && formatIndex < sheet.conditionalFormats.length) {
					sheet.conditionalFormats.delete(formatIndex, 1)
				}
			} else if (op.path.length === 3 && op.path[1] === 'rowhidden') {
				// Show row (remove from hidden)
				const rowIndex = Number(op.path[2])
				showRow(sheet, rowIndex)
			} else if (op.path.length === 3 && op.path[1] === 'colhidden') {
				// Show column (remove from hidden)
				const colIndex = Number(op.path[2])
				showColumn(sheet, colIndex)
			} else if (op.path.length === 2 && op.path[1] === 'frozen') {
				// Remove frozen panes - clear the Y.Map
				sheet.frozen.clear()
			}
			break
		}
	}
}

/**
 * Transform sheet-level operations (add sheet, insert/delete rows/cols)
 */
function transformSheetOp(sheet: YSheetStructure, op: Op): void {
	switch (op.op) {
		case 'addSheet': {
			// Sheet is already created by getOrCreateSheet, just set name
			const nameText = sheet.name
			nameText.delete(0, nameText.length)
			nameText.insert(0, op.value.name)
			break
		}

		case 'insertRowCol': {
			if (op.value.type === 'row') {
				insertRows(sheet, op.value.index, op.value.count)
			} else if (op.value.type === 'column') {
				insertColumns(sheet, op.value.index, op.value.count)
			}
			break
		}

		case 'deleteRowCol': {
			if (op.value.type === 'row') {
				deleteRows(sheet, op.value.start, op.value.end)
			} else if (op.value.type === 'column') {
				deleteColumns(sheet, op.value.start, op.value.end)
			}
			break
		}
	}
}

/**
 * Delete a sheet from the CRDT
 */
export function deleteSheet(yDoc: Y.Doc, sheetId: string): void {
	const sheets = yDoc.getMap('sheets')
	const sheetOrder = yDoc.getArray<string>('sheetOrder')

	// Remove from sheets map
	sheets.delete(sheetId)

	// Remove from sheetOrder array
	const orderArray = sheetOrder.toArray()
	const index = orderArray.indexOf(sheetId)
	if (index !== -1) {
		sheetOrder.delete(index, 1)
	}

	debug.log('[deleteSheet] Deleted sheet from CRDT:', sheetId)
}

/**
 * Transform frozen pane operations (path starts with 'frozen')
 */
function transformFrozenOp(sheet: YSheetStructure, op: Op): void {
	switch (op.op) {
		case 'add':
		case 'replace': {
			if (op.value && typeof op.value === 'object') {
				// Store frozen config in Y.Map for proper CRDT sync
				sheet.frozen.clear()
				sheet.frozen.set('type', op.value.type)
				if (op.value.range) {
					if (op.value.range.row_focus !== undefined) {
						sheet.frozen.set('rowFocus', op.value.range.row_focus)
					}
					if (op.value.range.column_focus !== undefined) {
						sheet.frozen.set('colFocus', op.value.range.column_focus)
					}
				}
			} else {
				// Unfreeze - clear the map
				sheet.frozen.clear()
			}
			break
		}

		case 'remove': {
			// Remove frozen panes - clear the Y.Map
			sheet.frozen.clear()
			break
		}
	}
}

/**
 * Main transform function (MUCH SIMPLER than original!)
 */
export function transformOp(sheet: YSheetStructure, op: Op): void {
	if (op.path[0] === 'data') {
		transformCellOp(sheet, op)
	} else if (op.path[0] === 'name' || op.path[0] === 'config') {
		transformConfigOp(sheet, op)
	} else if (op.path[0] === 'frozen') {
		transformFrozenOp(sheet, op)
	} else if (op.path.length === 0) {
		transformSheetOp(sheet, op)
	}
}

// vim: ts=4
