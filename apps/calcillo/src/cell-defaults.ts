import type { Cell } from '@fortune-sheet/core'

/**
 * FortuneSheet default cell property values.
 *
 * FortuneSheet's `normalizedCellAttr()` applies these at render time,
 * so storing them in the CRDT is redundant bloat.
 */
const CELL_DEFAULTS: Record<string, unknown> = {
	bl: 0, // bold off
	it: 0, // italic off
	ff: 0, // font family default
	cl: 0, // strikethrough off
	un: 0, // underline off
	fs: 10, // font size 10pt
	fc: '#000000', // black text
	ht: 1, // h-align left
	vt: 0, // v-align top
	tb: 0, // no text wrap
	tr: 0 // no rotation
}

/**
 * Check if a `ct` value is the default General format (no rich-text `s` key).
 */
function isDefaultCt(ct: unknown): boolean {
	if (!ct || typeof ct !== 'object') return false
	const obj = ct as Record<string, unknown>
	// Only strip if there's no `s` (rich-text segments) key
	if ('s' in obj) return false
	return obj.t === 'g' && obj.fa === 'General' && Object.keys(obj).length === 2
}

/**
 * Strip FortuneSheet default properties from a cell object.
 *
 * Removes:
 * - `undefined` values
 * - transient `m` property (display memo)
 * - all style properties that match FortuneSheet defaults
 * - default `ct` (General format without rich-text)
 *
 * Returns `null` if the cell becomes empty (all defaults, no value/formula).
 */
export function stripCellDefaults(cell: Cell): Partial<Cell> | null {
	const clean: Record<string, unknown> = {}

	for (const [key, value] of Object.entries(cell)) {
		// Skip undefined and transient `m`
		if (value === undefined || key === 'm') continue

		// Skip default ct
		if (key === 'ct') {
			if (isDefaultCt(value)) continue
			clean[key] = value
			continue
		}

		// Skip properties matching defaults (== for number/string tolerance)
		if (key in CELL_DEFAULTS && value == CELL_DEFAULTS[key]) continue

		clean[key] = value
	}

	return Object.keys(clean).length > 0 ? (clean as Partial<Cell>) : null
}

// vim: ts=4
