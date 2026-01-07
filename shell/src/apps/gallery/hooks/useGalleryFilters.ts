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

import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'

import type {
	GalleryViewMode,
	GalleryLayout,
	TimeFilter,
	SortOption,
	SortDir,
	GalleryFilterState
} from '../types.js'

const DEFAULT_FILTERS: GalleryFilterState = {
	viewMode: 'all',
	timeFilter: 'all',
	selectedTags: [],
	sort: 'created',
	sortDir: 'desc',
	layout: 'rows'
}

function parseViewMode(value: string | null): GalleryViewMode {
	if (value === 'starred' || value === 'recent') return value
	return 'all'
}

function parseTimeFilter(value: string | null): TimeFilter {
	if (value === 'today' || value === 'week' || value === 'month' || value === 'year') return value
	return 'all'
}

function parseLayout(value: string | null): GalleryLayout {
	if (value === 'masonry') return 'masonry'
	return 'rows'
}

function parseSort(value: string | null): SortOption {
	if (value === 'name') return value
	return 'created'
}

function parseSortDir(value: string | null): SortDir {
	if (value === 'asc') return 'asc'
	return 'desc'
}

function parseTags(value: string | null): string[] {
	if (!value) return []
	return value.split(',').filter(Boolean)
}

export interface UseGalleryFiltersReturn {
	filters: GalleryFilterState
	setViewMode: (mode: GalleryViewMode) => void
	setTimeFilter: (filter: TimeFilter) => void
	setLayout: (layout: GalleryLayout) => void
	setSort: (sort: SortOption, dir?: SortDir) => void
	toggleTag: (tag: string) => void
	clearTags: () => void
	clearAll: () => void
	hasActiveFilters: boolean
	apiQueryParams: Record<string, string | boolean>
}

export function useGalleryFilters(): UseGalleryFiltersReturn {
	const [searchParams, setSearchParams] = useSearchParams()

	// Parse current filters from URL
	const filters: GalleryFilterState = React.useMemo(
		() => ({
			viewMode: parseViewMode(searchParams.get('view')),
			timeFilter: parseTimeFilter(searchParams.get('time')),
			selectedTags: parseTags(searchParams.get('tag')),
			sort: parseSort(searchParams.get('sort')),
			sortDir: parseSortDir(searchParams.get('dir')),
			layout: parseLayout(searchParams.get('layout'))
		}),
		[searchParams]
	)

	// Helper to update search params
	const updateParams = React.useCallback(
		(updates: Record<string, string | null>) => {
			setSearchParams((prev) => {
				const next = new URLSearchParams(prev)
				for (const [key, value] of Object.entries(updates)) {
					if (value === null || value === '') {
						next.delete(key)
					} else {
						next.set(key, value)
					}
				}
				return next
			})
		},
		[setSearchParams]
	)

	const setViewMode = React.useCallback(
		(mode: GalleryViewMode) => {
			updateParams({ view: mode === 'all' ? null : mode })
		},
		[updateParams]
	)

	const setTimeFilter = React.useCallback(
		(filter: TimeFilter) => {
			updateParams({ time: filter === 'all' ? null : filter })
		},
		[updateParams]
	)

	const setLayout = React.useCallback(
		(layout: GalleryLayout) => {
			updateParams({ layout: layout === 'rows' ? null : layout })
		},
		[updateParams]
	)

	const setSort = React.useCallback(
		(sort: SortOption, dir?: SortDir) => {
			updateParams({
				sort: sort === 'created' ? null : sort,
				dir: (dir ?? filters.sortDir) === 'desc' ? null : 'asc'
			})
		},
		[updateParams, filters.sortDir]
	)

	const toggleTag = React.useCallback(
		(tag: string) => {
			const newTags = filters.selectedTags.includes(tag)
				? filters.selectedTags.filter((t) => t !== tag)
				: [...filters.selectedTags, tag]
			updateParams({ tag: newTags.length > 0 ? newTags.join(',') : null })
		},
		[filters.selectedTags, updateParams]
	)

	const clearTags = React.useCallback(() => {
		updateParams({ tag: null })
	}, [updateParams])

	const clearAll = React.useCallback(() => {
		setSearchParams(new URLSearchParams())
	}, [setSearchParams])

	const hasActiveFilters =
		filters.viewMode !== 'all' ||
		filters.timeFilter !== 'all' ||
		filters.selectedTags.length > 0

	// Convert filters to API query params
	const apiQueryParams = React.useMemo(() => {
		const params: Record<string, string | boolean> = {}

		// Tags
		if (filters.selectedTags.length > 0) {
			params.tag = filters.selectedTags.join(',')
		}

		// View mode
		if (filters.viewMode === 'starred') {
			params.starred = true
		} else if (filters.viewMode === 'recent') {
			params.sort = 'recent'
			params.sortDir = 'desc'
		}

		// Time filter
		if (filters.timeFilter !== 'all') {
			const now = dayjs()
			switch (filters.timeFilter) {
				case 'today':
					params.createdAfter = now.startOf('day').toISOString()
					break
				case 'week':
					params.createdAfter = now.startOf('week').toISOString()
					break
				case 'month':
					params.createdAfter = now.startOf('month').toISOString()
					break
				case 'year':
					params.createdAfter = now.startOf('year').toISOString()
					break
			}
		}

		// Sort (only if not already set by view mode)
		if (filters.viewMode !== 'recent') {
			if (filters.sort !== 'created') {
				params.sort = filters.sort
			}
			if (filters.sortDir !== 'desc') {
				params.sortDir = filters.sortDir
			}
		}

		return params
	}, [filters])

	return {
		filters,
		setViewMode,
		setTimeFilter,
		setLayout,
		setSort,
		toggleTag,
		clearTags,
		clearAll,
		hasActiveFilters,
		apiQueryParams
	}
}

// vim: ts=4
