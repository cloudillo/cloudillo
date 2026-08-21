// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Document format versions — **not** app versions. A format version describes the
 * search-index contract an app declares for one content type: what parts exist, what
 * fields they read, how a hit deep-links. It must move whenever that content type's
 * `search` rules are edited, and must not move for an unrelated release.
 *
 * The wire and the database carry the integer encoding `MMMmmmppp` — three decimal
 * digits per component, so `'2.1.42'` is `2001042` — letting the server order two
 * registrations with one comparison and refuse an older client's overwrite.
 */

/**
 * Three components, each `0..=999`, no leading zeros. Deliberately narrow: it rejects
 * `'2.1'`, `'2.1.1000'`, `'v2.1.0'`, `'2.1.0-beta'` and `'02.1.0'` — the last so two
 * spellings can never encode to one integer.
 */
const FORMAT_VERSION_RE = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/

/**
 * Encode a declared format version for the wire.
 *
 * Throws rather than returning `undefined`: a malformed version is a manifest bug, and
 * a silently absent version would put the server back to accepting writes in any order.
 */
export function encodeFormatVersion(version: string): number {
	const m = FORMAT_VERSION_RE.exec(version)
	if (!m) {
		throw new Error(
			`Invalid formatVersion ${JSON.stringify(version)}: ` +
				'expected major.minor.patch, each 0-999'
		)
	}
	return Number(m[1]) * 1_000_000 + Number(m[2]) * 1_000 + Number(m[3])
}

// vim: ts=4
