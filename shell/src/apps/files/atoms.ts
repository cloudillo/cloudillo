// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { ViewMode, FileTypeFilter, OwnerFilter } from './types.js'
import type { DisplayMode } from './components/index.js'

export const viewModeAtom = atom<ViewMode>('browse')
export const selectedTagsAtom = atom<string[]>([])
export const fileTypeFilterAtom = atom<FileTypeFilter>('all')
export const ownerFilterAtom = atom<OwnerFilter>('anyone')
export const searchQueryAtom = atom<string>('')
export const displayModeAtom = atomWithStorage<DisplayMode>('cloudillo:files-display-mode', 'list')

// vim: ts=4
