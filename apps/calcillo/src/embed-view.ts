// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Embed mode: resolve the host's nav to a cell range, measure it, build the view report.
 *
 * Read-only against the document: sheets are read straight from the Y.Maps, never through
 * `getOrCreateSheet` (which fills in missing sub-maps).
 */

import type { EmbedViewReportPayload } from '@cloudillo/core'
import type { Op } from '@fortune-sheet/core'
import type { TFunction } from 'i18next'
import * as Y from 'yjs'

import {
	formatA1,
	getNamesMap,
	parseRangeNav,
	type ResolvedRange,
	resolveAnchor
} from './named-ranges'
import type { SheetId } from './yjs-types'

// Fortune Sheet 1.0.4 defaults (`defaultColWidth` / `defaultRowHeight`)
const DEFAULT_COL_WIDTH = 73
const DEFAULT_ROW_HEIGHT = 19

export interface EmbedTarget {
	range: ResolvedRange
	/** Named range id, for `name:` navs */
	nameId?: string
	name?: string
}

function sheetMap(yDoc: Y.Doc, sheetId: string): Y.Map<unknown> | null {
	const sheet = yDoc.getMap('sheets').get(sheetId)
	return sheet instanceof Y.Map ? sheet : null
}

function subMap<T>(sheet: Y.Map<unknown>, key: string): Y.Map<T> | null {
	const m = sheet.get(key)
	return m instanceof Y.Map ? (m as Y.Map<T>) : null
}

function orderOf(sheet: Y.Map<unknown>, key: 'rowOrder' | 'colOrder'): string[] {
	const a = sheet.get(key)
	return a instanceof Y.Array ? (a.toArray() as string[]) : []
}

/**
 * Bounding box of the non-empty cells of the first sheet (A1 when empty), or null without sheets.
 */
export function usedRangeOfFirstSheet(yDoc: Y.Doc): ResolvedRange | null {
	const sheetId = yDoc.getArray<SheetId>('sheetOrder').get(0)
	const sheet = sheetId ? sheetMap(yDoc, sheetId) : null
	if (!sheetId || !sheet) return null
	const rowIndex = new Map(orderOf(sheet, 'rowOrder').map((id, i) => [id, i]))
	const colIndex = new Map(orderOf(sheet, 'colOrder').map((id, i) => [id, i]))
	let bottom = 0
	let right = 0
	for (const [rowId, row] of subMap<Y.Map<unknown>>(sheet, 'rows')?.entries() ?? []) {
		const r = rowIndex.get(rowId)
		if (r === undefined || !(row instanceof Y.Map) || row.size === 0) continue
		for (const colId of row.keys()) {
			const c = colIndex.get(colId)
			if (c === undefined) continue
			bottom = Math.max(bottom, r)
			right = Math.max(right, c)
		}
	}
	return { sheetId, top: 0, left: 0, bottom, right }
}

/**
 * Resolve an embed nav (`name:<id>`, `range:…`, or none ⇒ used range of the first sheet).
 * Null when the nav is unparsable or its name / sheet / boundary rows or columns are gone.
 */
export function resolveEmbedNav(yDoc: Y.Doc, nav: string | undefined): EmbedTarget | null {
	if (!nav) {
		const range = usedRangeOfFirstSheet(yDoc)
		return range && { range }
	}
	const parsed = parseRangeNav(nav)
	if (!parsed) return null
	if (parsed.kind === 'range') {
		const range = resolveAnchor(yDoc, parsed.anchor)
		return range && { range }
	}
	const named = getNamesMap(yDoc).get(parsed.id)
	const range = named && resolveAnchor(yDoc, named)
	return range ? { range, nameId: parsed.id, name: named.name } : null
}

/**
 * Pixel size of a range at 100% zoom: column widths × row heights, hidden ones as 0.
 * Fortune draws a 1px grid line after every row and column, so each counts size + 1.
 */
export function naturalSize(yDoc: Y.Doc, r: ResolvedRange): { w: number; h: number } {
	const sheet = sheetMap(yDoc, r.sheetId)
	if (!sheet) return { w: 0, h: 0 }
	const sum = (
		ids: string[],
		sizes: Y.Map<number> | null,
		hidden: Y.Map<boolean> | null,
		dflt: number
	) => ids.reduce((acc, id) => (hidden?.get(id) ? acc : acc + (sizes?.get(id) ?? dflt) + 1), 0)
	return {
		w: sum(
			orderOf(sheet, 'colOrder').slice(r.left, r.right + 1),
			subMap(sheet, 'colWidths'),
			subMap(sheet, 'hiddenCols'),
			DEFAULT_COL_WIDTH
		),
		h: sum(
			orderOf(sheet, 'rowOrder').slice(r.top, r.bottom + 1),
			subMap(sheet, 'rowHeights'),
			subMap(sheet, 'hiddenRows'),
			DEFAULT_ROW_HEIGHT
		)
	}
}

export function buildEmbedReport(
	t: TFunction,
	yDoc: Y.Doc,
	nav: string | undefined,
	target: EmbedTarget,
	missing: boolean
): EmbedViewReportPayload {
	const a1 = formatA1(target.range)
	return {
		kind: 'fixed',
		nav,
		viewId: target.nameId,
		named: !!target.nameId,
		natural: naturalSize(yDoc, target.range),
		title: target.name ?? a1,
		a11yLabel: target.name
			? t('Spreadsheet range "{{name}}" ({{range}})', { name: target.name, range: a1 })
			: t('Spreadsheet range {{range}}', { range: a1 }),
		...(missing ? { missing: true } : {})
	}
}

/**
 * The only ops embed mode writes back: cell edits inside the embedded range.
 */
export function isEmbedEditOp(op: Op, r: ResolvedRange): boolean {
	if (op.id !== r.sheetId || op.path[0] !== 'data' || op.path.length < 3) return false
	const row = Number(op.path[1])
	const col = Number(op.path[2])
	return row >= r.top && row <= r.bottom && col >= r.left && col <= r.right
}

/** Clamp a selection box into the range; null when it is already inside. */
export function clampSelection(
	sel: { row: number[]; column: number[] },
	r: ResolvedRange
): { row: [number, number]; column: [number, number] } | null {
	const clamp = (v: number | undefined, lo: number, hi: number) =>
		Math.min(Math.max(v ?? lo, lo), hi)
	const row: [number, number] = [
		clamp(sel.row[0], r.top, r.bottom),
		clamp(sel.row[1], r.top, r.bottom)
	]
	const column: [number, number] = [
		clamp(sel.column[0], r.left, r.right),
		clamp(sel.column[1], r.left, r.right)
	]
	const same =
		row[0] === sel.row[0] &&
		row[1] === sel.row[1] &&
		column[0] === sel.column[0] &&
		column[1] === sel.column[1]
	return same ? null : { row, column }
}

// vim: ts=4
