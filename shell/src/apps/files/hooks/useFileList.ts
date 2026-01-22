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
import { useLocation } from 'react-router-dom'
import { useAuth, useInfiniteScroll } from '@cloudillo/react'
import * as Types from '@cloudillo/core'
import { parseQS } from '../../../utils.js'
import { useCurrentContextIdTag, useContextAwareApi } from '../../../context/index.js'
import type { File, ViewMode } from '../types.js'
import { TRASH_FOLDER_ID } from '../types.js'

export interface UseFileListOptions {
	viewMode?: ViewMode
	parentId?: string | null
	tags?: string[]
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
	const [auth] = useAuth()
	const location = useLocation()
	const contextIdTag = useCurrentContextIdTag()
	const [sort, setSort] = React.useState<keyof File | undefined>()
	const [sortAsc, setSortAsc] = React.useState(false)
	const [refreshCounter, setRefreshCounter] = React.useState(0)
	const [filter, setFilter] = React.useState<Record<string, string> | undefined>()

	const { viewMode = 'all', parentId, tags } = options || {}

	// Convert tags array to comma-separated string for API
	const tagsParam = tags && tags.length > 0 ? tags.join(',') : undefined

	// Parse query string once
	React.useEffect(() => {
		const qs = parseQS(location.search)
		setFilter(qs)
	}, [location.search])

	// Build the base query params based on viewMode
	const buildQueryParams = React.useCallback(
		(cursor: string | null, limit: number): Types.ListFilesQuery => {
			const baseParams: Types.ListFilesQuery = {
				cursor: cursor ?? undefined,
				limit,
				tag: tagsParam
			}

			switch (viewMode) {
				case 'starred':
					return { ...baseParams, starred: true }
				case 'recent':
					return { ...baseParams, sort: 'recent', sortDir: 'desc' }
				case 'pinned':
					return { ...baseParams, pinned: true }
				case 'live':
					// Live documents need client-side filtering for now
					// (API doesn't support multiple fileTp values)
					return { ...baseParams }
				case 'static':
					// Static files need client-side filtering for now
					return { ...baseParams, fileTp: 'BLOB' }
				case 'trash':
					return { ...baseParams, parentId: TRASH_FOLDER_ID }
				default:
					// 'all' mode - use parentId if provided
					return {
						...baseParams,
						...(filter || {}),
						...(parentId !== undefined && { parentId: parentId ?? '__root__' })
					}
			}
		},
		[viewMode, parentId, tagsParam, filter]
	)

	// Fetch page function for infinite scroll
	const fetchPage = React.useCallback(
		async (cursor: string | null, limit: number) => {
			if (!api) {
				return { items: [], nextCursor: null, hasMore: false }
			}

			const queryParams = buildQueryParams(cursor, limit)
			const result = await api.files.listPaginated(queryParams)

			let files = result.data.map(convertFileView)

			// Client-side filtering for 'live' mode (CRDT and RTDB types)
			if (viewMode === 'live') {
				files = files.filter((f) => f.fileTp === 'CRDT' || f.fileTp === 'RTDB')
			}

			return {
				items: files,
				nextCursor: result.cursorPagination?.nextCursor ?? null,
				hasMore: result.cursorPagination?.hasMore ?? false
			}
		},
		[api, buildQueryParams, viewMode]
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
		deps: [viewMode, parentId, tagsParam, contextIdTag, refreshCounter, filter],
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

			function setFileData(fileId: string, file: File) {
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
				filter,
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
			filter,
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
