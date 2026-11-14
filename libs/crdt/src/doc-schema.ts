// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Document schema version gate.
 *
 * Apps keep their schema number in the meta map (`m`), key `schema`. A document stamped
 * by a newer client than this one understands opens read-only, so this client does not
 * write content it cannot interpret. The gate is client-side only: older clients and scripts
 * holding a write token still can. Server enforcement is tracked in
 * claude-docs/DOC-SCHEMA-SERVER-GATE.md.
 */

import type * as Y from 'yjs'

/** Highest schema treated as real; anything above (or not a small non-negative integer) is corrupt */
const MAX_SCHEMA = 1000

function isValidSchema(v: unknown): v is number {
	return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_SCHEMA
}

/**
 * 'ro' when the document was stamped with a schema newer than `supported`. A missing or
 * invalid schema (non-integer, negative, absurdly large) reads as 0: a corrupt value must not
 * lock everyone out of the document.
 *
 * Precondition: only meaningful after the provider has synced. A doc that has not synced has
 * no `schema` yet and reads 'rw'.
 */
export function checkDocSchema(m: Y.Map<unknown>, supported: number): 'rw' | 'ro' {
	const v = m.get('schema')
	return isValidSchema(v) && v > supported ? 'ro' : 'rw'
}

/** Stored schema is valid and >= `n`; an invalid one reads as missing, like the siblings */
export function docSchemaAtLeast(m: Y.Map<unknown>, n: number): boolean {
	const v = m.get('schema')
	return isValidSchema(v) && v >= n
}

/** Raise the stored schema to `n`; never lowers a valid one, overwrites an invalid one. */
export function stampDocSchema(m: Y.Map<unknown>, n: number): void {
	const v = m.get('schema')
	if (!isValidSchema(v) || v < n) m.set('schema', n)
}

// vim: ts=4
