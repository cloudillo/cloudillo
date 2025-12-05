import type { RowId, ColId, SheetId } from './yjs-types'
import { toRowId, toColId, toSheetId } from './yjs-types'
import { debug } from './debug'

/**
 * Generate cryptographically secure base64url ID
 *
 * Base64url alphabet: A-Za-z0-9_- (64 chars = 6 bits per char)
 */
function generateBase64UrlId(length: number): string {
	// Calculate bytes needed: length * 6 bits / 8 bits per byte
	const byteLength = Math.ceil((length * 6) / 8)
	const bytes = new Uint8Array(byteLength)
	crypto.getRandomValues(bytes)

	// Convert to base64
	let base64 = btoa(String.fromCharCode(...bytes))

	// Make URL-safe and remove padding
	base64 = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

	// Return exactly the length needed
	return base64.slice(0, length)
}

/**
 * Generate 9-character row ID
 * Entropy: 54 bits (18 quadrillion unique values)
 * Collision probability: ~0% for reasonable sheet sizes
 */
export function generateRowId(): RowId {
	return toRowId(generateBase64UrlId(9))
}

/**
 * Generate 5-character column ID
 * Entropy: 30 bits (1 billion unique values)
 * More than enough for spreadsheet columns
 */
export function generateColId(): ColId {
	return toColId(generateBase64UrlId(5))
}

/**
 * Generate 12-character sheet ID
 * Entropy: 72 bits (4.7 sextillion unique values)
 * Compatible with UUIDs (but shorter and URL-safe)
 */
export function generateSheetId(): SheetId {
	return toSheetId(generateBase64UrlId(12))
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
		debug.warn(`[ID Collision] Row ID collision detected, attempt ${attempts}/${maxAttempts}`)
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
		debug.warn(
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
