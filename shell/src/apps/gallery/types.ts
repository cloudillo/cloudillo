// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

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
