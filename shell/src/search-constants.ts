// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Shared limits for the full-text search surfaces (omnibox dropdown +
 * `/search` page).
 *
 * The caps mirror the server's, which rejects anything over them rather than
 * clamping — so the client clamps first, and stops offering "load more" at the
 * offset ceiling instead of firing a request that 400s.
 */

/** Server cap on the query text. */
export const FTS_MAX_QUERY = 256
/** Server cap on `limit`. */
export const FTS_MAX_LIMIT = 100
/** Server cap on `offset`. */
export const FTS_MAX_OFFSET = 1000

/** Shortest plain-text query the omnibox will send. */
export const FTS_MIN_QUERY = 2
/** Hits shown inline under the omnibox. */
export const FTS_DROPDOWN_LIMIT = 8
/** Results per page on `/search`. */
export const FTS_PAGE_SIZE = 20

/**
 * Idle time before a search surface sends a query. Top of the 150–300 ms band
 * accepted for a network-backed autocomplete, so typing one word costs one request.
 */
export const FTS_DEBOUNCE_MS = 300
/** Delay before the "Searching…" row appears, so it never flashes per keystroke. */
export const FTS_SPINNER_DELAY_MS = 300
/**
 * Query→results memo, so backspacing does not re-hit the server. LRU, so the
 * term being typed around survives the ones tried once.
 */
export const FTS_CACHE_LIMIT = 20
/**
 * How long a cached dropdown result stays usable: long enough to absorb typing and
 * backspacing over one query, short enough that a document created or renamed while
 * the box is open still shows up. `/search` never reads this cache.
 */
export const FTS_CACHE_TTL_MS = 30_000

/** The `type` filter vocabulary, as the server names it. */
export const FTS_TYPES = ['file', 'doc', 'action', 'profile'] as const
export type FtsType = (typeof FTS_TYPES)[number]

/**
 * The subset a guest may search. `'profile'` is excluded — the server strips it from
 * an unauthenticated caller's filter anyway, since profile rows are exempt from the
 * visibility prefilter and would otherwise expose the whole contact graph.
 */
export const FTS_GUEST_TYPES = ['file', 'doc', 'action'] as const

// vim: ts=4
