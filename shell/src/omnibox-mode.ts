// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Which surface the omnibox input addresses, derived from what was typed.
 *
 * Its own module, like `search-target.ts` and `refs.ts`: `omnibox.tsx` pulls in the
 * whole component tree (and its stylesheets), and this is pure logic worth testing
 * on its own.
 */

import { isRefLike } from './refs.js'
import { FTS_MIN_QUERY } from './search-constants.js'

export type OmniMode = 'command' | 'profile-search' | 'reference' | 'full-text' | 'none'

/**
 * `profiles` is false for a guest: `GET /api/profiles` is authenticated-only, so
 * profile search would 403. `@bob.example` then falls through to plain full-text
 * search — no rewriting needed, because the FTS tokenizer drops a leading `@`
 * anyway.
 */
export function deriveMode(query: string, profiles: boolean): OmniMode {
	if (query.startsWith('/')) return 'command'
	if (profiles && query.startsWith('@')) return 'profile-search'
	if (isRefLike(query)) return 'reference'
	// Bare dotted text is *not* special-cased into a profile jump: `@` is the explicit
	// prefix for that, and a dotted token is just as often a filename (`report.pdf`).
	// Profiles are indexed, so one still surfaces as a hit row here. Ordered last, so
	// the sigil and reference branches keep winning.
	if (query.trim().length >= FTS_MIN_QUERY) return 'full-text'
	// Empty or a single character: no dropdown, and no request behind a bare Ctrl+K.
	return 'none'
}

// vim: ts=4
