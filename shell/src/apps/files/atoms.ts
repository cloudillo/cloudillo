// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

import type { DisplayMode } from './components/index.js'
import type { FileTypeFilter, OwnerFilter, ViewMode } from './types.js'

export interface NavigationEntry {
	parentId: string | null
	remoteOwner: string | null
	shareRoot: string | null
	/** Bare room name; absent/null = main drive */
	drive?: string | null
	view?: ViewMode
}

/** The Files query string for a location; `remoteOwner`/`shareRoot` only count inside a folder. */
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
	return params.toString()
}

export const fileNavStackAtom = atom<NavigationEntry[]>([])

/** Last Files URL seen (pathname + search), so a doc's Close can return to it. */
export const lastFilesUrlAtom = atom({ pathname: '', search: '' })

export const selectedTagsAtom = atom<string[]>([])
export const fileTypeFilterAtom = atom<FileTypeFilter>('all')
export const ownerFilterAtom = atom<OwnerFilter>('anyone')
export const searchQueryAtom = atom<string>('')
export const displayModeAtom = atomWithStorage<DisplayMode>('cloudillo:files-display-mode', 'list')

// vim: ts=4
