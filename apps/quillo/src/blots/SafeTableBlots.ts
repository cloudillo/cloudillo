// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * SafeTableBlots - Null-safe wrappers for quill-table-better blots
 *
 * Fixes crash when Yjs sync applies deltas with null/undefined/boolean values
 * in table cell, temporary, and col blots. The quill-table-better library's
 * create() methods call Object.keys(value) without null checking.
 */

import Quill from 'quill'

/** Minimal interface for Quill blot static methods returned by Quill.import() */
interface QuillBlotStatic {
	create(value?: unknown): HTMLElement
}

// Helper to normalize value to a valid Props object
function normalizeValue(value: unknown): Record<string, string> {
	if (value == null || typeof value !== 'object') {
		return {}
	}
	return value as Record<string, string>
}

// Get blots from Quill registry after QuillTableBetter registers them
// and patch their create() methods with null-safe versions
export function registerSafeTableBlots() {
	const TableCell = Quill.import('formats/table-cell') as QuillBlotStatic
	const TableTh = Quill.import('formats/table-th') as QuillBlotStatic
	const TableTemporary = Quill.import('formats/table-temporary') as QuillBlotStatic
	const TableCol = Quill.import('formats/table-col') as QuillBlotStatic

	// Store original create methods
	const originalTableCellCreate = TableCell.create.bind(TableCell)
	const originalTableThCreate = TableTh.create.bind(TableTh)
	const originalTableTemporaryCreate = TableTemporary.create.bind(TableTemporary)
	const originalTableColCreate = TableCol.create.bind(TableCol)

	// Override with null-safe versions
	TableCell.create = function (value: unknown) {
		return originalTableCellCreate(normalizeValue(value))
	}

	TableTh.create = function (value: unknown) {
		return originalTableThCreate(normalizeValue(value))
	}

	TableTemporary.create = function (value: unknown) {
		return originalTableTemporaryCreate(normalizeValue(value))
	}

	TableCol.create = function (value: unknown) {
		return originalTableColCreate(normalizeValue(value))
	}
}

// vim: ts=4
