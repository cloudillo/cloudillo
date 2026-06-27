// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * normalize-table-paste - Quill clipboard matcher that normalizes pasted tables.
 *
 * quill-table-better@1.2.3's paste matchers (src/utils/clipboard-matchers.ts)
 * emit a non-canonical Delta for tables copied from spreadsheets:
 *   - `table-cell` / `table-th` carry positional integer row numbers (or an
 *     object `{ 'data-row': <int> }`) instead of the canonical `row-xxxx` ids.
 *   - `table-cell-block` / `table-th-block` carry positional integer cell ids
 *     (1, 2, 3 ...) that are REUSED identically in every row instead of the
 *     canonical globally-unique `cell-xxxx` ids.
 *   - a `<colgroup>` produces per-cell `table-col` width ops, yielding an
 *     inconsistent column structure.
 *
 * The live DOM right after paste tolerates this, but on reopen the table is
 * rebuilt from the stored Delta through the blot lifecycle, which uses these
 * colliding / misformatted ids to decide merges, splits and widths — producing
 * a mangled table.
 *
 * This matcher rewrites a pasted table into the same uniform-column canonical
 * shape that `Table.insertTable()` produces for manual tables: globally-unique
 * `cell-xxxx` ids, `row-xxxx` row ids, and no colgroup (equal-width columns).
 * Source spreadsheet column proportions are intentionally not preserved.
 */

import type Quill from 'quill'
import type Delta from 'quill-delta'

const CELL_KEYS = ['table-cell', 'table-th'] as const
const BLOCK_KEYS = ['table-cell-block', 'table-th-block'] as const

let idCounter = 0

function rand() {
	return Math.random().toString(36).slice(2, 6)
}

// Match the library's id formats (`row-xxxx` / `cell-xxxx`) so downstream
// helpers (e.g. getCellFormats' `data-row.split('-')[1]`) keep working; the
// incrementing counter guarantees no accidental collision within one paste.
function newRowId() {
	return `row-${rand()}${(idCounter++).toString(36)}`
}

function newCellId() {
	return `cell-${rand()}${(idCounter++).toString(36)}`
}

/**
 * Clipboard matcher for the `'table'` selector. Receives the accumulated Delta
 * for the whole `<table>` subtree (after quill-table-better's inner td/tr/col
 * matchers have run), so it can rewrite the entire table at once.
 */
export function normalizeTablePasteDelta(_node: Node, delta: Delta): Delta {
	const rowMap = new Map<string, string>()
	const cellMap = new Map<string, string>()

	for (const op of delta.ops) {
		const attrs = op.attributes as Record<string, unknown> | undefined
		if (!attrs) continue

		// Step 1: remap row ids on table-cell / table-th to fresh `row-xxxx`.
		// Cells sharing the old row value keep sharing the new one; drop any
		// per-cell width so columns stay uniform.
		let oldRow: string | undefined
		for (const key of CELL_KEYS) {
			const val = attrs[key]
			if (val == null) continue
			oldRow =
				typeof val === 'object'
					? String((val as Record<string, unknown>)['data-row'])
					: String(val)
			let newRow = rowMap.get(oldRow)
			if (!newRow) {
				newRow = newRowId()
				rowMap.set(oldRow, newRow)
			}
			attrs[key] = { 'data-row': newRow }
		}

		// Step 2: remap cell-block ids to fresh, globally-unique `cell-xxxx`.
		// Key on (oldRow, oldCellId): the pasted cell ids (1, 2, 3) repeat
		// across rows, so keying on the cell id alone would re-collide; the
		// compound key keeps multi-paragraph cells (same id within a row)
		// together while making every cell globally unique.
		for (const key of BLOCK_KEYS) {
			const val = attrs[key]
			if (val == null) continue
			// When a block op carries no row context (`oldRow` is undefined — e.g.
			// the cell key was absent on this op), fold the running idCounter into
			// the key so each such op gets its OWN unique key. Otherwise the key
			// would collapse to `::<id>` and distinct ops sharing the same pasted
			// cell id (1, 2, 3 ...) would re-collide across rows. With a row
			// present, keep the (oldRow, id) compound so multi-paragraph cells
			// within one row keep sharing a single generated id.
			const compound =
				oldRow == null
					? `__noRow${idCounter}__::${String(val)}`
					: `${oldRow}::${String(val)}`
			let newCell = cellMap.get(compound)
			if (!newCell) {
				newCell = newCellId()
				cellMap.set(compound, newCell)
			}
			attrs[key] = newCell
		}
	}

	// Step 3: drop colgroup ops so the result has no colgroup and uniform
	// columns, matching insertTable's output.
	delta.ops = delta.ops.filter((op) => !(op.attributes && 'table-col' in op.attributes))

	return delta
}

/** Register the table paste normalizer on a Quill editor instance. */
export function registerTablePasteNormalizer(editor: Quill) {
	editor.clipboard.addMatcher('table', normalizeTablePasteDelta)
}
