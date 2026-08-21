// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { randomId } from '@cloudillo/core'

import { DEV } from './utils'
import type { ColId, RowId, SheetId } from './yjs-types'
import { toColId, toRowId, toSheetId } from './yjs-types'

/**
 * Generate 9-character row ID
 * Entropy: 54 bits (18 quadrillion unique values)
 * Collision probability: ~0% for reasonable sheet sizes
 */
export function generateRowId(): RowId {
	return toRowId(randomId(9))
}

/**
 * Generate 5-character column ID
 * Entropy: 30 bits (1 billion unique values)
 * More than enough for spreadsheet columns
 */
export function generateColId(): ColId {
	return toColId(randomId(5))
}

/**
 * Generate 12-character sheet ID
 * Entropy: 72 bits (4.7 sextillion unique values)
 * Compatible with UUIDs (but shorter and URL-safe)
 */
export function generateSheetId(): SheetId {
	return toSheetId(randomId(12))
}

/**
 * Batch generate IDs for efficiency
 */
export function generateRowIds(count: number): RowId[] {
	return Array.from({ length: count }, generateRowId)
}

export function generateColIds(count: number): ColId[] {
	return Array.from({ length: count }, generateColId)
}

/**
 * Generate unique row ID with collision detection
 * Checks against existing IDs in the sheet
 */
export function generateUniqueRowId(existingIds: Set<RowId>): RowId {
	const maxAttempts = 10
	let attempts = 0

	while (attempts < maxAttempts) {
		const rowId = generateRowId()
		if (!existingIds.has(rowId)) {
			return rowId
		}
		attempts++
		if (DEV)
			console.warn(
				`[ID Collision] Row ID collision detected, attempt ${attempts}/${maxAttempts}`
			)
	}

	throw new Error(`Failed to generate unique row ID after ${maxAttempts} attempts`)
}

/**
 * Generate unique column ID with collision detection
 * Checks against existing IDs in the sheet
 */
export function generateUniqueColId(existingIds: Set<ColId>): ColId {
	const maxAttempts = 10
	let attempts = 0

	while (attempts < maxAttempts) {
		const colId = generateColId()
		if (!existingIds.has(colId)) {
			return colId
		}
		attempts++
		if (DEV)
			console.warn(
				`[ID Collision] Column ID collision detected, attempt ${attempts}/${maxAttempts}`
			)
	}

	throw new Error(`Failed to generate unique column ID after ${maxAttempts} attempts`)
}

/**
 * Batch generate unique row IDs with collision detection
 */
export function generateUniqueRowIds(count: number, existingIds: Set<RowId>): RowId[] {
	const newIds: RowId[] = []
	const allIds = new Set(existingIds)

	for (let i = 0; i < count; i++) {
		const rowId = generateUniqueRowId(allIds)
		newIds.push(rowId)
		allIds.add(rowId)
	}

	return newIds
}

/**
 * Batch generate unique column IDs with collision detection
 */
export function generateUniqueColIds(count: number, existingIds: Set<ColId>): ColId[] {
	const newIds: ColId[] = []
	const allIds = new Set(existingIds)

	for (let i = 0; i < count; i++) {
		const colId = generateUniqueColId(allIds)
		newIds.push(colId)
		allIds.add(colId)
	}

	return newIds
}

// vim: ts=4
