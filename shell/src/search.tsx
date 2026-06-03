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
}

const searchAtom = atom<SearchState>({})

export function useSearch() {
	return useAtom(searchAtom)
}

// vim: ts=4
