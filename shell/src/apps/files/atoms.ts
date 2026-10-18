// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

import type { DisplayMode } from './components/index.js'
import type { ViewMode } from './types.js'

export interface NavigationEntry {
	parentId: string | null
	remoteOwner: string | null
	shareRoot: string | null
	/** Bare room name; absent/null = main drive */
	drive?: string | null
	view?: ViewMode
	/** Filter params as a query string (`useFilesFilters` keys); absent = none */
	filters?: string
}

/** The Files query string for a location; `remoteOwner`/`shareRoot` only count inside a folder.
 *  `filters` passes filter params through; omitted, the location opens unfiltered. */
export function navSearch(entry: Partial<NavigationEntry>): string {
	const params = new URLSearchParams()
	if (entry.drive) params.set('drive', entry.drive)
	if (entry.view && entry.view !== 'browse') params.set('view', entry.view)
	if (entry.parentId) {
		params.set('parentId', entry.parentId)
		if (entry.remoteOwner) {
			params.set('remoteOwner', entry.remoteOwner)
			if (entry.shareRoot) params.set('shareRoot', entry.shareRoot)
		}
	}
	new URLSearchParams(entry.filters).forEach((value, key) => {
		params.set(key, value)
	})
	return params.toString()
}

export const fileNavStackAtom = atom<NavigationEntry[]>([])

/** Last Files URL seen (pathname + search), so a doc's Close can return to it. */
export const lastFilesUrlAtom = atom({ pathname: '', search: '' })

export const displayModeAtom = atomWithStorage<DisplayMode>('cloudillo:files-display-mode', 'list')

export type FilesSortField = 'name' | 'modified' | 'created'
export interface FilesSort {
	field: FilesSortField
	dir: 'asc' | 'desc'
}
/** Per-user list sort; the Recent finder overrides it with `recent`/`desc` */
export const sortAtom = atomWithStorage<FilesSort>('cloudillo:files-sort', {
	field: 'name',
	dir: 'asc'
})

// vim: ts=4
