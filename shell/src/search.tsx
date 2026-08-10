// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { atom, useAtom } from 'jotai'

/**
 * Shared omnibox focus/query state.
 *
 * `query == undefined` → idle (the header shows the breadcrumb title).
 * `query` is a string (possibly empty) → the omnibox smart input is open.
 *
 * The actual input + breadcrumb UI lives in `omnibox.tsx`; this module only
 * owns the state so both `Header` (for the Ctrl+K toggle) and the omnibox can
 * read/write it.
 */
export interface SearchState {
	query?: string
	/**
	 * One-shot: the omnibox selects its whole content on mount, then clears this.
	 *
	 * The opener has to say so, since `query` alone cannot tell the cases apart:
	 * Ctrl+K recall prefills `"text"` and wants it all selected (the next keystroke
	 * replaces it), while the `/` and `@` hotkeys prefill a one-character sigil that
	 * must survive it. Cleared right after use so it cannot steal the caret again
	 * mid-typing.
	 */
	selectAll?: boolean
}

const searchAtom = atom<SearchState>({})

/** The last text typed into the omnibox. Survives close/reopen, not reload. */
export const lastQueryAtom = atom('')

/** Committed searches, most recent first. Session-only, capped. */
export const recentSearchesAtom = atom<string[]>([])

/** Most recent searches kept. */
export const RECENT_LIMIT = 8

/**
 * Open the omnibox prefilled with the last query, fully selected — the address-bar
 * idiom: typing replaces it, Home/End/arrows keep it.
 *
 * Write-only, so callers need not subscribe to `lastQueryAtom`, which would churn
 * their renders on every keystroke.
 */
export const openOmniboxAtom = atom(null, (get, set) => {
	const last = get(lastQueryAtom)
	set(searchAtom, { query: last, selectAll: !!last })
})

/** Ctrl+K: close if open, otherwise open prefilled with the last query. */
export const toggleOmniboxAtom = atom(null, (get, set) => {
	if (get(searchAtom).query != undefined) {
		set(searchAtom, {})
		return
	}
	set(openOmniboxAtom)
})

/** Record a committed search (Enter / see-all / opening a hit) — never a keystroke. */
export const pushRecentAtom = atom(null, (get, set, q: string) => {
	const term = q.trim()
	if (!term) return
	const rest = get(recentSearchesAtom).filter((r) => r.toLowerCase() !== term.toLowerCase())
	set(recentSearchesAtom, [term, ...rest].slice(0, RECENT_LIMIT))
})

export function useSearch() {
	return useAtom(searchAtom)
}

// vim: ts=4
