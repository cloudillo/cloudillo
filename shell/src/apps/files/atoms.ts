// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { ViewMode, FileTypeFilter, OwnerFilter } from './types.js'
import type { DisplayMode } from './components/index.js'

export interface NavigationEntry {
	parentId: string | null
	remoteOwner: string | null
	shareRoot: string | null
}

export const fileNavStackAtom = atom<NavigationEntry[]>([])

export const viewModeAtom = atom<ViewMode>('browse')
export const selectedTagsAtom = atom<string[]>([])
export const fileTypeFilterAtom = atom<FileTypeFilter>('all')
export const ownerFilterAtom = atom<OwnerFilter>('anyone')
export const searchQueryAtom = atom<string>('')
export const displayModeAtom = atomWithStorage<DisplayMode>('cloudillo:files-display-mode', 'list')

// vim: ts=4
