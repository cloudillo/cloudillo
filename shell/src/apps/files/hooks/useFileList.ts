// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { useAuth, useInfiniteScroll } from '@cloudillo/react'
import type * as Types from '@cloudillo/core'
import type { ApiClient } from '@cloudillo/core'
import { useCurrentContextIdTag, useContextAwareApi } from '../../../context/index.js'
import { fileViewUpdateAtom } from '../../../context/index.js'
import { createCachedFileFetchPage } from '../../../cache/index.js'
import type { File, ViewMode, FileTypeFilter, OwnerFilter } from '../types.js'
import { TRASH_FOLDER_ID, MANAGED_FOLDER_ID } from '../types.js'

export interface UseFileListOptions {
	viewMode?: ViewMode
	parentId?: string | null
	tags?: string[]
	fileType?: FileTypeFilter
	owner?: OwnerFilter
	ownerIdTag?: string // Current user's idTag (needed for 'me'/'others' filter)
	searchQuery?: string
	remoteApi?: ApiClient | null
}

const PAGE_SIZE = 30

export interface FileFilterParamsInput {
	tags?: string[]
	fileType?: FileTypeFilter
	owner?: OwnerFilter
	ownerIdTag?: string
}

// Map the independent UI filters (tags, file-type, owner) to API params.
// Kept as a pure helper so the FilesApp probe and useFileList stay in sync
// when filter semantics change.
export function buildFileFilterParams(input: FileFilterParamsInput): Types.ListFilesQuery {
	const params: Types.ListFilesQuery = {}

	const tagsParam = input.tags && input.tags.length > 0 ? input.tags.join(',') : undefined
	if (tagsParam) params.tag = tagsParam

	if (input.fileType === 'live') {
		params.fileTp = 'CRDT,RTDB,FLDR'
	} else if (input.fileType === 'static') {
		params.fileTp = 'BLOB,FLDR'
	}

	if (input.owner === 'me' && input.ownerIdTag) {
		params.ownerIdTag = input.ownerIdTag
	} else if (input.owner === 'others' && input.ownerIdTag) {
		params.notOwnerIdTag = input.ownerIdTag
	}

	return params
}

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
		brokenAt: f.brokenAt
			? typeof f.brokenAt === 'string'
				? f.brokenAt
				: f.brokenAt.toISOString()
			: undefined,
		tags: f.tags?.filter((t) => t && t.length > 0),
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
		searchQuery,
		remoteApi
	} = options || {}

	const trimmedSearch = searchQuery?.trim() || undefined
	// Stable key for tags so the callback's dep array doesn't re-run on
	// array-identity churn. The original `tags` array is passed straight
	// through to buildFileFilterParams (no join/split round-trip).
	const tagsKey = tags && tags.length > 0 ? tags.join(',') : ''

	// Build the base query params based on viewMode + independent filters.
	const buildQueryParams = React.useCallback(
		(cursor: string | null, limit: number): Types.ListFilesQuery => {
			const baseParams: Types.ListFilesQuery = {
				cursor: cursor ?? undefined,
				limit,
				...buildFileFilterParams({
					tags,
					fileType,
					owner,
					ownerIdTag
				})
			}

			// Hierarchy-agnostic views (Recent/Starred/Trash) and any search
			// surface files outside the current folder context, so ask the
			// backend for each item's immediate parent folder name. Browse
			// without search stays as cheap as before.
			if (viewMode !== 'browse' || trimmedSearch) {
				baseParams.withParent = true
			}

			// Apply search query
			if (trimmedSearch) {
				baseParams.fileName = trimmedSearch
			}

			// Apply view mode (content scope)
			switch (viewMode) {
				case 'starred':
					return { ...baseParams, starred: true }
				case 'recent':
					return { ...baseParams, sort: 'recent', sortDir: 'desc' }
				case 'trash':
					return { ...baseParams, parentId: TRASH_FOLDER_ID }
				case 'managed':
					return { ...baseParams, parentId: MANAGED_FOLDER_ID }
				default:
					// 'browse' mode - use parentId if provided
					return {
						...baseParams,
						...(parentId !== undefined && { parentId: parentId ?? '__root__' })
					}
			}
		},
		[viewMode, parentId, tagsKey, fileType, trimmedSearch, owner, ownerIdTag]
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
			params.fileTp = 'CRDT,RTDB,FLDR'
		} else if (fileType === 'static') {
			params.fileTp = 'BLOB,FLDR'
		}

		switch (viewMode) {
			case 'starred':
				return { ...params, starred: true }
			case 'recent':
				return params // All cached files, sorted by date (no folder filter)
			case 'trash':
				return { ...params, parentId: TRASH_FOLDER_ID }
			case 'managed':
				return { ...params, parentId: MANAGED_FOLDER_ID }
			default:
				// Only apply parentId filter for subfolder navigation, not root
				return parentId ? { ...params, parentId } : params
		}
	}, [viewMode, parentId, fileType])

	// Raw network fetch function (returns FileView for caching)
	const rawFetchPage = React.useCallback(
		async (cursor: string | null, limit: number) => {
			const effectiveApi = remoteApi || api
			if (!effectiveApi) {
				return { items: [] as Types.FileView[], nextCursor: null, hasMore: false }
			}

			const queryParams = buildQueryParams(cursor, limit)
			const result = await effectiveApi.files.listPaginated(queryParams)

			return {
				items: result.data,
				nextCursor: result.cursorPagination?.nextCursor ?? null,
				hasMore: result.cursorPagination?.hasMore ?? false
			}
		},
		[api, remoteApi, buildQueryParams]
	)

	// Cached fetch page wrapping network call with offline fallback
	// Skip cache layer for remote browsing — remote content shouldn't pollute local cache
	const cachedFetchPage = React.useMemo(
		() =>
			remoteApi
				? null
				: createCachedFileFetchPage(contextIdTag, rawFetchPage, cacheQueryParams),
		[contextIdTag, rawFetchPage, cacheQueryParams, remoteApi]
	)

	// Convert FileView → File after cache layer
	const fetchPage = React.useCallback(
		async (cursor: string | null, limit: number) => {
			const result = cachedFetchPage
				? await cachedFetchPage(cursor, limit)
				: await rawFetchPage(cursor, limit)
			return {
				...result,
				items: result.items.map(convertFileView)
			}
		},
		[cachedFetchPage, rawFetchPage]
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
		updateItem,
		sentinelRef
	} = useInfiniteScroll<File>({
		fetchPage,
		pageSize: PAGE_SIZE,
		deps: [
			viewMode,
			parentId,
			tagsKey,
			fileType,
			owner,
			ownerIdTag,
			trimmedSearch,
			contextIdTag,
			remoteApi,
			refreshCounter
		],
		enabled: !!api
	})

	// Cross-route file-row updates broadcast by MicrofrontendContainer's
	// access-conflict handler. Patch the row in place if it's in our dataset.
	// Each consumer remembers the last version it applied so multiple list
	// instances can all observe a broadcast without racing.
	const fileViewUpdate = useAtomValue(fileViewUpdateAtom)
	const lastSeenVersionRef = React.useRef(0)
	React.useEffect(() => {
		if (!fileViewUpdate) return
		if (fileViewUpdate.version <= lastSeenVersionRef.current) return
		lastSeenVersionRef.current = fileViewUpdate.version
		updateItem(
			(f) => f.fileId === fileViewUpdate.file.fileId,
			convertFileView(fileViewUpdate.file)
		)
	}, [fileViewUpdate, updateItem])

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
				updateItem((f) => f.fileId === fileId, file)
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
