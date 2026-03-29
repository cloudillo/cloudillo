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
import { useAuth, useInfiniteScroll } from '@cloudillo/react'
import type * as Types from '@cloudillo/core'
import { useCurrentContextIdTag, useContextAwareApi } from '../../../context/index.js'
import { createCachedFileFetchPage } from '../../../cache/index.js'
import type { File, ViewMode, FileTypeFilter, OwnerFilter } from '../types.js'
import { TRASH_FOLDER_ID } from '../types.js'

export interface UseFileListOptions {
	viewMode?: ViewMode
	parentId?: string | null
	tags?: string[]
	fileType?: FileTypeFilter
	owner?: OwnerFilter
	ownerIdTag?: string // Current user's idTag (needed for 'me'/'others' filter)
	searchQuery?: string
}

const PAGE_SIZE = 30

function convertFileView(f: Types.FileView): File {
	return {
		...f,
		preset: f.preset || '',
		createdAt: typeof f.createdAt === 'string' ? f.createdAt : f.createdAt.toISOString(),
		accessedAt: f.accessedAt
			? typeof f.accessedAt === 'string'
				? f.accessedAt
				: f.accessedAt.toISOString()
			: undefined,
		modifiedAt: f.modifiedAt
			? typeof f.modifiedAt === 'string'
				? f.modifiedAt
				: f.modifiedAt.toISOString()
			: undefined,
		userData: f.userData
			? {
					accessedAt: f.userData.accessedAt
						? typeof f.userData.accessedAt === 'string'
							? f.userData.accessedAt
							: f.userData.accessedAt.toISOString()
						: undefined,
					modifiedAt: f.userData.modifiedAt
						? typeof f.userData.modifiedAt === 'string'
							? f.userData.modifiedAt
							: f.userData.modifiedAt.toISOString()
						: undefined,
					pinned: f.userData.pinned,
					starred: f.userData.starred
				}
			: undefined,
		owner: f.owner ? { ...f.owner, name: f.owner.name || '' } : undefined,
		variantId: undefined
	}
}

export function useFileList(options?: UseFileListOptions) {
	const { api } = useContextAwareApi()
	const [_auth] = useAuth()
	const contextIdTag = useCurrentContextIdTag()
	const [sort, setSort] = React.useState<keyof File | undefined>()
	const [sortAsc, setSortAsc] = React.useState(false)
	const [refreshCounter, setRefreshCounter] = React.useState(0)

	const {
		viewMode = 'browse',
		parentId,
		tags,
		fileType = 'all',
		owner = 'anyone',
		ownerIdTag,
		searchQuery
	} = options || {}

	// Convert tags array to comma-separated string for API
	const tagsParam = tags && tags.length > 0 ? tags.join(',') : undefined
	const trimmedSearch = searchQuery?.trim() || undefined

	// Build the base query params based on viewMode + independent filters
	const buildQueryParams = React.useCallback(
		(cursor: string | null, limit: number): Types.ListFilesQuery => {
			const baseParams: Types.ListFilesQuery = {
				cursor: cursor ?? undefined,
				limit,
				tag: tagsParam
			}

			// Apply independent file type filter
			if (fileType === 'live') {
				baseParams.fileTp = 'CRDT,RTDB'
			} else if (fileType === 'static') {
				baseParams.fileTp = 'BLOB'
			}

			// Apply search query
			if (trimmedSearch) {
				baseParams.fileName = trimmedSearch
			}

			// Apply owner filter
			if (owner === 'me' && ownerIdTag) {
				baseParams.ownerIdTag = ownerIdTag
			} else if (owner === 'others' && ownerIdTag) {
				baseParams.notOwnerIdTag = ownerIdTag
			}

			// Apply view mode (content scope)
			switch (viewMode) {
				case 'starred':
					return { ...baseParams, starred: true }
				case 'recent':
					return { ...baseParams, sort: 'recent', sortDir: 'desc' }
				case 'trash':
					return { ...baseParams, parentId: TRASH_FOLDER_ID }
				default:
					// 'browse' mode - use parentId if provided
					return {
						...baseParams,
						...(parentId !== undefined && { parentId: parentId ?? '__root__' })
					}
			}
		},
		[viewMode, parentId, tagsParam, fileType, trimmedSearch, owner, ownerIdTag]
	)

	// Build cache query params for offline fallback.
	// For "browse" at root (parentId=null), return all cached files for the context
	// rather than only root-level files — this maximizes offline usefulness.
	// Note: owner and searchQuery filters are not supported by the cache layer,
	// so offline results may include unfiltered items for those dimensions.
	const cacheQueryParams = React.useMemo(() => {
		const params: Record<string, string | boolean> = {}

		// File type filter for cache
		if (fileType === 'live') {
			params.fileTp = 'CRDT,RTDB'
		} else if (fileType === 'static') {
			params.fileTp = 'BLOB'
		}

		switch (viewMode) {
			case 'starred':
				return { ...params, starred: true }
			case 'recent':
				return params // All cached files, sorted by date (no folder filter)
			case 'trash':
				return { ...params, parentId: TRASH_FOLDER_ID }
			default:
				// Only apply parentId filter for subfolder navigation, not root
				return parentId ? { ...params, parentId } : params
		}
	}, [viewMode, parentId, fileType])

	// Raw network fetch function (returns FileView for caching)
	const rawFetchPage = React.useCallback(
		async (cursor: string | null, limit: number) => {
			if (!api) {
				return { items: [] as Types.FileView[], nextCursor: null, hasMore: false }
			}

			const queryParams = buildQueryParams(cursor, limit)
			const result = await api.files.listPaginated(queryParams)

			return {
				items: result.data,
				nextCursor: result.cursorPagination?.nextCursor ?? null,
				hasMore: result.cursorPagination?.hasMore ?? false
			}
		},
		[api, buildQueryParams]
	)

	// Cached fetch page wrapping network call with offline fallback
	const cachedFetchPage = React.useMemo(
		() => createCachedFileFetchPage(contextIdTag, rawFetchPage, cacheQueryParams),
		[contextIdTag, rawFetchPage, cacheQueryParams]
	)

	// Convert FileView → File after cache layer
	const fetchPage = React.useCallback(
		async (cursor: string | null, limit: number) => {
			const result = await cachedFetchPage(cursor, limit)
			return {
				...result,
				items: result.items.map(convertFileView)
			}
		},
		[cachedFetchPage]
	)

	// Use infinite scroll hook
	const {
		items: files,
		isLoading,
		isLoadingMore,
		error,
		hasMore,
		loadMore,
		reset,
		prepend,
		sentinelRef
	} = useInfiniteScroll<File>({
		fetchPage,
		pageSize: PAGE_SIZE,
		deps: [
			viewMode,
			parentId,
			tagsParam,
			fileType,
			owner,
			ownerIdTag,
			trimmedSearch,
			contextIdTag,
			refreshCounter
		],
		enabled: !!api
	})

	return React.useMemo(
		function () {
			function getData() {
				return files
			}

			function setState(
				sort: keyof File | undefined,
				sortAsc: boolean | undefined,
				_page: number | undefined
			) {
				if (sort !== undefined) setSort(sort)
				if (sortAsc !== undefined) setSortAsc(sortAsc)
				// page is no longer used - infinite scroll handles loading
			}

			function setFileData(_fileId: string, _file: File) {
				// Note: This won't work well with infinite scroll's internal state
				// Consider using a separate state or refactoring if needed
			}

			function refresh() {
				setRefreshCounter((r) => r + 1)
			}

			return {
				// Data
				getData,
				files,
				setFileData,
				state: { sort, sortAsc },
				setState,
				refresh,
				// Infinite scroll
				isLoading,
				isLoadingMore,
				error,
				hasMore,
				loadMore,
				reset,
				prepend,
				sentinelRef
			}
		},
		[
			files,
			sort,
			sortAsc,
			isLoading,
			isLoadingMore,
			error,
			hasMore,
			loadMore,
			reset,
			prepend,
			sentinelRef
		]
	)
}

// vim: ts=4
