// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Named ranges and range anchors.
 *
 * Ranges are stored by row/column IDs only; A1 text is for display.
 * Named ranges live in the root `names` map: `Y.Map<NamedRange>` keyed by a stable id.
 */

import { parseNav, randomId } from '@cloudillo/core'
import { indexToColumnChar } from '@fortune-sheet/core'
import * as Y from 'yjs'

import type { ColId, NamedRange, RangeAnchor, RowId, SheetId } from './yjs-types'
import { isValidColId, isValidRowId, isValidSheetId } from './yjs-types'

export type { NamedRange, RangeAnchor }

export interface ResolvedRange {
	sheetId: SheetId
	top: number
	left: number
	bottom: number
	right: number
}

export type RangeNav = { kind: 'range'; anchor: RangeAnchor } | { kind: 'name'; id: string }

export function getNamesMap(yDoc: Y.Doc): Y.Map<NamedRange> {
	return yDoc.getMap<NamedRange>('names')
}

// Reads the sheet without creating it (unlike getOrCreateSheet)
function sheetOrders(
	yDoc: Y.Doc,
	sheetId: SheetId
): { rowOrder: RowId[]; colOrder: ColId[] } | null {
	const sheet = yDoc.getMap('sheets').get(sheetId)
	if (!(sheet instanceof Y.Map)) return null
	const rowOrder = sheet.get('rowOrder')
	const colOrder = sheet.get('colOrder')
	if (!(rowOrder instanceof Y.Array) || !(colOrder instanceof Y.Array)) return null
	return { rowOrder: rowOrder.toArray() as RowId[], colOrder: colOrder.toArray() as ColId[] }
}

/**
 * Anchor a range given by indices (inclusive, any corner order). Throws if out of bounds.
 */
export function anchorFromIndices(
	yDoc: Y.Doc,
	sheetId: SheetId,
	top: number,
	left: number,
	bottom: number,
	right: number
): RangeAnchor {
	const orders = sheetOrders(yDoc, sheetId)
	if (!orders) throw new Error(`[anchorFromIndices] Unknown sheet: ${sheetId}`)
	const r0 = orders.rowOrder[Math.min(top, bottom)]
	const r1 = orders.rowOrder[Math.max(top, bottom)]
	const c0 = orders.colOrder[Math.min(left, right)]
	const c1 = orders.colOrder[Math.max(left, right)]
	if (!r0 || !r1 || !c0 || !c1) throw new Error('[anchorFromIndices] Range out of bounds')
	return { sheetId, r0, c0, r1, c1 }
}

/**
 * Current indices of an anchor, or null if its sheet or any boundary ID is gone.
 */
export function resolveAnchor(yDoc: Y.Doc, a: RangeAnchor): ResolvedRange | null {
	const orders = sheetOrders(yDoc, a.sheetId)
	if (!orders) return null
	const r0 = orders.rowOrder.indexOf(a.r0)
	const r1 = orders.rowOrder.indexOf(a.r1)
	const c0 = orders.colOrder.indexOf(a.c0)
	const c1 = orders.colOrder.indexOf(a.c1)
	if (r0 < 0 || r1 < 0 || c0 < 0 || c1 < 0) return null
	return {
		sheetId: a.sheetId,
		top: Math.min(r0, r1),
		left: Math.min(c0, c1),
		bottom: Math.max(r0, r1),
		right: Math.max(c0, c1)
	}
}

/**
 * A1 text of a resolved range: `B2` for a single cell, `A1:C5` otherwise.
 */
export function formatA1(r: ResolvedRange): string {
	const start = `${indexToColumnChar(r.left)}${r.top + 1}`
	if (r.top === r.bottom && r.left === r.right) return start
	return `${start}:${indexToColumnChar(r.right)}${r.bottom + 1}`
}

/**
 * Parse `range:<sheetId>!<r0>:<c0>:<r1>:<c1>` or `name:<id>`; null for anything else.
 */
export function parseRangeNav(nav: string): RangeNav | null {
	const { kind, value } = parseNav(nav)
	if (kind === 'name') return value ? { kind: 'name', id: value } : null
	if (kind !== 'range') return null
	const bang = value.indexOf('!')
	const sheetId = value.slice(0, bang)
	const [r0, c0, r1, c1, ...rest] = value.slice(bang + 1).split(':')
	if (
		bang < 0 ||
		rest.length > 0 ||
		!isValidSheetId(sheetId) ||
		!isValidRowId(r0 ?? '') ||
		!isValidColId(c0 ?? '') ||
		!isValidRowId(r1 ?? '') ||
		!isValidColId(c1 ?? '')
	)
		return null
	return {
		kind: 'range',
		anchor: { sheetId, r0: r0 as RowId, c0: c0 as ColId, r1: r1 as RowId, c1: c1 as ColId }
	}
}

export function formatRangeNav(a: RangeAnchor): string {
	return `range:${a.sheetId}!${a.r0}:${a.c0}:${a.r1}:${a.c1}`
}

export function formatNameNav(id: string): string {
	return `name:${id}`
}

/**
 * All named ranges with their ids, sorted by name.
 */
export function listNamedRanges(yDoc: Y.Doc): Array<NamedRange & { id: string }> {
	return Array.from(getNamesMap(yDoc).entries(), ([id, r]) => ({ ...r, id })).sort((a, b) =>
		a.name.localeCompare(b.name)
	)
}

/**
 * Whether `name` is empty or already used (case-insensitive), ignoring `exceptId`.
 */
export function isNameTaken(yDoc: Y.Doc, name: string, exceptId?: string): boolean {
	const key = name.trim().toLowerCase()
	if (!key) return true
	for (const [id, r] of getNamesMap(yDoc).entries()) {
		if (id !== exceptId && r.name.toLowerCase() === key) return true
	}
	return false
}

/** Stable `Error.message` codes thrown by create/rename; the UI translates them */
export const NAME_EMPTY = 'name-empty'
export const NAME_TAKEN = 'name-taken'

function checkName(yDoc: Y.Doc, name: string, exceptId?: string): string {
	const trimmed = name.trim()
	if (!trimmed) throw new Error(NAME_EMPTY)
	if (isNameTaken(yDoc, trimmed, exceptId)) throw new Error(NAME_TAKEN)
	return trimmed
}

function anchorOf(a: RangeAnchor): RangeAnchor {
	return { sheetId: a.sheetId, r0: a.r0, c0: a.c0, r1: a.r1, c1: a.c1 }
}

/**
 * Create a named range. Throws on an empty or duplicate name. Returns the new id.
 */
export function createNamedRange(
	yDoc: Y.Doc,
	name: string,
	anchor: RangeAnchor,
	desc?: string
): string {
	const names = getNamesMap(yDoc)
	const trimmed = checkName(yDoc, name)
	let id = randomId(12)
	while (names.has(id)) id = randomId(12)
	const entry: NamedRange = { ...anchorOf(anchor), name: trimmed }
	if (desc) entry.desc = desc
	names.set(id, entry)
	return id
}

/**
 * Rename, keeping the id. Throws on an empty or duplicate name or an unknown id.
 */
export function renameNamedRange(yDoc: Y.Doc, id: string, name: string): void {
	const names = getNamesMap(yDoc)
	const cur = names.get(id)
	if (!cur) throw new Error(`Unknown named range: ${id}`)
	names.set(id, { ...cur, name: checkName(yDoc, name, id) })
}

/**
 * Point an existing name at a new range. Throws on an unknown id.
 */
export function redefineNamedRange(yDoc: Y.Doc, id: string, anchor: RangeAnchor): void {
	const names = getNamesMap(yDoc)
	const cur = names.get(id)
	if (!cur) throw new Error(`Unknown named range: ${id}`)
	names.set(id, { ...cur, ...anchorOf(anchor) })
}

export function deleteNamedRange(yDoc: Y.Doc, id: string): void {
	getNamesMap(yDoc).delete(id)
}

/**
 * Keep named ranges valid across a row/column deletion on `sheetId`.
 * Must run BEFORE `deletedIds` are removed from the sheet's order array.
 * A deleted boundary moves to the nearest surviving row/col inside the range;
 * a range whose rows (or cols) are all deleted is removed.
 */
export function fixupNamedRangesOnDelete(
	yDoc: Y.Doc,
	sheetId: SheetId,
	axis: 'row' | 'col',
	deletedIds: string[]
): void {
	const names = getNamesMap(yDoc)
	if (names.size === 0 || deletedIds.length === 0) return
	const orders = sheetOrders(yDoc, sheetId)
	if (!orders) return
	const order: string[] = axis === 'row' ? orders.rowOrder : orders.colOrder
	const deleted = new Set(deletedIds)

	yDoc.transact(() => {
		for (const [id, r] of Array.from(names.entries())) {
			if (r.sheetId !== sheetId) continue
			const start: string = axis === 'row' ? r.r0 : r.c0
			const end: string = axis === 'row' ? r.r1 : r.c1
			if (!deleted.has(start) && !deleted.has(end)) continue
			const i0 = order.indexOf(start)
			const i1 = order.indexOf(end)
			if (i0 < 0 || i1 < 0) continue // already broken, nothing to anchor to
			const survivors = order
				.slice(Math.min(i0, i1), Math.max(i0, i1) + 1)
				.filter((x) => !deleted.has(x))
			if (survivors.length === 0) {
				names.delete(id)
				continue
			}
			const first = survivors[0]
			const last = survivors[survivors.length - 1]
			names.set(
				id,
				axis === 'row'
					? { ...r, r0: first as RowId, r1: last as RowId }
					: { ...r, c0: first as ColId, c1: last as ColId }
			)
		}
	})
}

// vim: ts=4
