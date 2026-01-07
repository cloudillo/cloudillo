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

export type GalleryViewMode = 'all' | 'starred' | 'recent'
export type GalleryLayout = 'rows' | 'masonry'
export type TimeFilter = 'all' | 'today' | 'week' | 'month' | 'year'
export type SortOption = 'created' | 'name'
export type SortDir = 'asc' | 'desc'

export interface GalleryFilterState {
	viewMode: GalleryViewMode
	timeFilter: TimeFilter
	selectedTags: string[]
	sort: SortOption
	sortDir: SortDir
	layout: GalleryLayout
}

export interface Photo {
	fileId: string
	variantId?: string
	fileName: string
	contentType: string
	createdAt: string
	preset: string
	tags?: string[]
	x?: {
		dim?: [number, number]
		caption?: string
	}
}

// vim: ts=4
