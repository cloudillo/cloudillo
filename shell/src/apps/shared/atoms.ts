// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { atom } from 'jotai'
import type { FileView } from '@cloudillo/core'
import type { BreadcrumbItem } from '../files/hooks/useFileNavigation.js'

export interface SharedFolderCacheEntry {
	children: FileView[]
	breadcrumbs: BreadcrumbItem[]
}

// Listing cache keyed by `${refId}:${folderId}`. Reused on remount/navigation so
// already-seen folders never flash a spinner.
export const sharedFolderCacheAtom = atom<Record<string, SharedFolderCacheEntry>>({})

// The refId currently populating sharedFolderCacheAtom. When a different share is
// opened we wipe the cache, so one share never shows another's data and memory is
// bounded to the active share's visited folders.
export const sharedCacheRefIdAtom = atom<string | null>(null)

// Guest display name for collaborative-doc awareness, promoted from local state so
// it survives remounts. Persists across shares (do not reset on share switch).
export const folderGuestNameAtom = atom<string | undefined>(undefined)

// vim: ts=4
