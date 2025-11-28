import * as Y from 'yjs'
import { Cell, SheetConfig } from '@fortune-sheet/core'

// Branded types for ID safety
export type RowId = string & { readonly __brand: 'RowId' }
export type ColId = string & { readonly __brand: 'ColId' }
export type SheetId = string & { readonly __brand: 'SheetId' }

// Cast functions (use after validation)
export const toRowId = (s: string): RowId => s as RowId
export const toColId = (s: string): ColId => s as ColId
export const toSheetId = (s: string): SheetId => s as SheetId

// ============================================================================
// ID-Based Feature Structures
// ============================================================================

/**
 * Merged cells - ID-based storage
 * Key: `${startRow}_${startCol}` for efficient lookup
 */
export interface MergeInfo {
	startRow: RowId
	endRow: RowId
	startCol: ColId
	endCol: ColId
}

/**
 * Border information - ID-based storage
 * Key: `${rowId}_${colId}` for cell borders
 */
export interface BorderInfo {
	rowId: RowId
	colId: ColId
	style?: {
		top?: { style?: number; color?: string }
		bottom?: { style?: number; color?: string }
		left?: { style?: number; color?: string }
		right?: { style?: number; color?: string }
	}
}

/**
 * Hyperlink information - ID-based storage
 * Key: `${rowId}_${colId}`
 */
export interface HyperlinkInfo {
	rowId: RowId
	colId: ColId
	linkAddress: string
	linkTooltip?: string
	linkType?: 'external' | 'internal' | 'email'
}

/**
 * Data validation rule - ID-based range
 * Key: unique ID for the rule
 */
export interface ValidationRule {
	id: string
	startRow: RowId
	endRow: RowId
	startCol: ColId
	endCol: ColId
	type: 'dropdown' | 'checkbox' | 'number' | 'date' | 'text'
	options?: {
		dropdown?: string[]
		min?: number
		max?: number
		allowBlank?: boolean
	}
}

/**
 * Conditional formatting rule - ID-based range
 */
export interface ConditionalFormat {
	id: string
	startRow: RowId
	endRow: RowId
	startCol: ColId
	endCol: ColId
	type: 'cellValue' | 'colorScale' | 'dataBar' | 'iconSet'
	format: {
		cellStyle?: {
			bg?: string
			fc?: string
			bold?: boolean
			italic?: boolean
		}
		operator?: 'greaterThan' | 'lessThan' | 'between' | 'equal' | 'notEqual'
		value?: string | number
		value2?: string | number
	}
}

/**
 * Frozen panes configuration (plain object for serialization)
 */
export interface FrozenInfo {
	type: 'row' | 'column' | 'both' | 'range'
	range?: {
		rowFocus?: number	// Row index (will convert to ID when needed)
		colFocus?: number	// Column index
	}
}

// YJS structure types
export interface YSheetStructure {
	// Sheet metadata
	name: Y.Text  // Sheet name as Y.Text for collaborative editing

	// Core data
	rowOrder: Y.Array<RowId>
	colOrder: Y.Array<ColId>
	rows: Y.Map<Y.Map<Cell>>

	// ID-based features with proper types
	merges: Y.Map<MergeInfo>
	borders: Y.Map<BorderInfo>
	hyperlinks: Y.Map<HyperlinkInfo>
	validations: Y.Map<ValidationRule>
	conditionalFormats: Y.Array<ConditionalFormat>
	hiddenRows: Y.Map<boolean>  // rowId → true (if hidden)
	hiddenCols: Y.Map<boolean>  // colId → true (if hidden)
	rowHeights: Y.Map<number>   // rowId → height in pixels
	colWidths: Y.Map<number>    // colId → width in pixels
	frozen: Y.Map<string | number>  // Wrap FrozenInfo in Y.Map for proper CRDT sync
}

// Root YDoc structure
export interface YWorkbookStructure {
	sheetOrder: Y.Array<SheetId>
	sheets: Y.Map<YSheetStructure>
	meta: Y.Map<unknown>	// Keep for compatibility with cloudillo.init()
}

// Type guards
export function isValidRowId(id: string): id is RowId {
	return /^[A-Za-z0-9_-]{9}$/.test(id)
}

export function isValidColId(id: string): id is ColId {
	return /^[A-Za-z0-9_-]{5}$/.test(id)
}

export function isValidSheetId(id: string): id is SheetId {
	return /^[A-Za-z0-9_-]{12}$/.test(id)
}

// vim: ts=4
