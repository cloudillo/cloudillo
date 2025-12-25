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
 * SafeTableBlots - Null-safe wrappers for quill-table-better blots
 *
 * Fixes crash when Yjs sync applies deltas with null/undefined/boolean values
 * in table cell, temporary, and col blots. The quill-table-better library's
 * create() methods call Object.keys(value) without null checking.
 */

import Quill from 'quill'

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
	const TableCell = Quill.import('formats/table-cell') as any
	const TableTh = Quill.import('formats/table-th') as any
	const TableTemporary = Quill.import('formats/table-temporary') as any
	const TableCol = Quill.import('formats/table-col') as any

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
