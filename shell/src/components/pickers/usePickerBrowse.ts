// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ApiClient, FileView, ListFilesQuery, TagInfo } from '@cloudillo/core'
import { useApi, useAuth, useDebouncedValue, useInfiniteScroll } from '@cloudillo/react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { MANAGED_FOLDER_ID } from '../../apps/files/types.js'
import type { BreadcrumbItem, PickerViewMode } from './types.js'
import { MAX_CONNECTED_FILE_BATCH } from './types.js'

const PICKER_PAGE_SIZE = 30

// Connected view shows the document tree in one shot (no pagination); large
// trees are capped here. Bump or paginate if this proves limiting in practice.
const CONNECTED_TREE_LIMIT = 100

export interface UsePickerBrowseOptions {
	/** Override API client (e.g. for cross-context browsing) */
	api?: ApiClient | null
	/** File ID to load connected/accessible files for (sourceFileId or documentFileId) */
	contextFileId?: string
	/** Server-side content-type filter, e.g. 'image/*'. Undefined = no filter. */
	contentType?: string
	/** Server-side file-type filter, comma-separated, e.g. 'CRDT,RTDB'. Undefined = no filter. */
	fileTp?: string
	/** Restrict listing to tenant-owned files (excludes remote/federated copies that can't be embedded). */
	localOnly?: boolean
}

export interface UsePickerBrowseResult {
	// Filter state
	viewMode: PickerViewMode
	setViewMode: (mode: PickerViewMode) => void
	searchQuery: string
	setSearchQuery: (query: string) => void
	debouncedSearch: string
	selectedTags: string[]
	setSelectedTags: (tags: string[]) => void
	tags: TagInfo[]

	// Navigation
	currentFolderId: string | null
	setCurrentFolderId: (id: string | null) => void
	breadcrumbs: BreadcrumbItem[]
	setBreadcrumbs: React.Dispatch<React.SetStateAction<BreadcrumbItem[]>>

	// Files
	files: FileView[]
	loading: boolean
	error: string | null

	// Pagination
	isLoadingMore: boolean
	hasMore: boolean
	loadMore: () => void
	sentinelRef: React.RefObject<HTMLDivElement | null>
	loadMoreError: Error | null

	// Connected file IDs
	connectedFileIds: Set<string>
	setConnectedFileIds: React.Dispatch<React.SetStateAction<Set<string>>>

	// Actions
	refetch: () => void
}

export function usePickerBrowse({
	api: apiOverride,
	contextFileId,
	contentType,
	fileTp,
	localOnly
}: UsePickerBrowseOptions = {}): UsePickerBrowseResult {
	const { t } = useTranslation()
	const { api: defaultApi } = useApi()
	const [auth] = useAuth()
	const api = apiOverride || defaultApi

	// Filter state
	const [viewMode, setViewMode] = useState<PickerViewMode>('browse')
	const [searchQuery, setSearchQuery] = useState('')
	const [selectedTags, setSelectedTags] = useState<string[]>([])
	const [tags, setTags] = useState<TagInfo[]>([])

	// Navigation state
	const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
	const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
		{ id: null, name: t('Home') }
	])

	// Connected-mode file state (separate from the paginated browse/recent/starred state)
	const [connectedFiles, setConnectedFiles] = useState<FileView[]>([])
	const [connectedLoading, setConnectedLoading] = useState(true)
	const [connectedError, setConnectedError] = useState<string | null>(null)

	// Connected file IDs (from share entries)
	const [connectedFileIds, setConnectedFileIds] = useState<Set<string>>(new Set())

	// Refresh counter (bump to re-trigger file fetch)
	const [refreshCounter, setRefreshCounter] = useState(0)

	// Debounced search query
	const debouncedSearch = useDebouncedValue(searchQuery, 300)

	// Stable dependency key for the selected tags
	const selectedTagsKey = selectedTags.join(',')

	// Load tags
	useEffect(() => {
		if (!api || !auth) return

		let cancelled = false
		;(async function () {
			try {
				const res = await api.tags.list({ withCounts: true, limit: 20 })
				if (!cancelled) setTags(res.tags)
			} catch {
				// Tags are optional — silent failure is acceptable
			}
		})()

		return () => {
			cancelled = true
		}
	}, [api, auth])

	// Load connected file IDs from share entries
	useEffect(() => {
		if (!api || !contextFileId) return

		let cancelled = false
		;(async function () {
			try {
				const entries = await api.shares.listBySubject(contextFileId, 'F')
				if (!cancelled && entries?.length) {
					setConnectedFileIds(new Set(entries.map((e) => e.resourceId)))
				}
			} catch {
				// Share entries are optional — silent failure is acceptable
			}
		})()

		return () => {
			cancelled = true
		}
	}, [api, contextFileId])

	// Fetch connected files (shared-to-document + document-tree, merged + de-duped)
	useEffect(() => {
		if (!api || viewMode !== 'connected') return

		let cancelled = false
		const client = api

		setConnectedLoading(true)
		setConnectedError(null)
		;(async () => {
			try {
				const tasks: Promise<FileView[]>[] = []

				// (a) Files explicitly shared/connected to this document
				if (connectedFileIds.size > 0) {
					const fileIdList = [...connectedFileIds]
						.slice(0, MAX_CONNECTED_FILE_BATCH)
						.join(',')
					tasks.push(client.files.list({ fileId: fileIdList }))
				}

				// (b) Files in this document's own tree (root_id = contextFileId)
				if (contextFileId) {
					const treeQuery: ListFilesQuery = {
						rootId: contextFileId,
						limit: CONNECTED_TREE_LIMIT
					}
					if (contentType) treeQuery.contentType = contentType
					if (fileTp) treeQuery.fileTp = fileTp
					const treeFiles = await client.files.list(treeQuery)
					if (treeFiles.length >= CONNECTED_TREE_LIMIT) {
						console.warn(
							`[picker] Connected tree truncated at ${CONNECTED_TREE_LIMIT} files for`,
							contextFileId
						)
					}
					tasks.push(Promise.resolve(treeFiles))
				}

				const results = await Promise.all(tasks)

				// Merge + de-dupe by fileId (a file can be both shared and in-tree)
				const seen = new Set<string>()
				const merged: FileView[] = []
				for (const f of results.flat()) {
					if (!seen.has(f.fileId)) {
						seen.add(f.fileId)
						merged.push(f)
					}
				}

				if (!cancelled) setConnectedFiles(merged)
			} catch (err) {
				console.error('Failed to fetch document files:', err)
				if (!cancelled) {
					setConnectedFiles([])
					setConnectedError(t('Failed to load files'))
				}
			} finally {
				if (!cancelled) setConnectedLoading(false)
			}
		})()

		return () => {
			cancelled = true
		}
	}, [api, viewMode, connectedFileIds, contextFileId, contentType, fileTp, refreshCounter, t])

	// Paginated fetch for browse/recent/starred views
	const fetchPage = useCallback(
		async (cursor: string | null, limit: number) => {
			if (!api) return { items: [] as FileView[], nextCursor: null, hasMore: false }

			const query: ListFilesQuery = { cursor: cursor ?? undefined, limit }
			if (viewMode === 'browse') {
				query.parentId = currentFolderId || undefined
				query.includeFolders = true // keep folder drill-down despite type filters
			} else if (viewMode === 'recent') {
				query.sort = 'recent'
				query.sortDir = 'desc'
			} else if (viewMode === 'starred') {
				query.starred = true
			} else if (viewMode === 'managed') {
				query.parentId = MANAGED_FOLDER_ID
			}
			if (debouncedSearch) query.fileName = debouncedSearch
			if (selectedTags.length > 0) query.tag = selectedTagsKey
			if (contentType) query.contentType = contentType
			if (fileTp) query.fileTp = fileTp
			if (localOnly) query.localOnly = true

			const result = await api.files.listPaginated(query)
			return {
				items: result.data,
				nextCursor: result.cursorPagination?.nextCursor ?? null,
				hasMore: result.cursorPagination?.hasMore ?? false
			}
		},
		[
			api,
			viewMode,
			currentFolderId,
			debouncedSearch,
			selectedTagsKey,
			contentType,
			fileTp,
			localOnly
		]
	)

	const {
		items: paginatedFiles,
		isLoading,
		isLoadingMore,
		error: scrollError,
		hasMore,
		loadMore,
		sentinelRef
	} = useInfiniteScroll<FileView>({
		fetchPage,
		pageSize: PICKER_PAGE_SIZE,
		deps: [
			api,
			viewMode,
			currentFolderId,
			debouncedSearch,
			selectedTagsKey,
			contentType,
			fileTp,
			localOnly,
			refreshCounter
		],
		enabled: !!api && viewMode !== 'connected'
	})

	// Merge connected-mode and paginated-mode outputs into the public API
	const files = viewMode === 'connected' ? connectedFiles : paginatedFiles
	const loading = viewMode === 'connected' ? connectedLoading : isLoading
	// Page-level error only when nothing is shown yet (initial load failed).
	const error =
		viewMode === 'connected'
			? connectedError
			: paginatedFiles.length === 0 && scrollError
				? t('Failed to load files')
				: null
	// Error while fetching a *subsequent* page — surfaced inline (via
	// LoadMoreTrigger) so the already-loaded grid stays visible and the user
	// can retry. Exposes the raw Error; the tab supplies a translated prefix.
	const loadMoreError =
		viewMode === 'connected' || paginatedFiles.length === 0 ? null : scrollError

	const refetch = useCallback(() => {
		setRefreshCounter((c) => c + 1)
	}, [])

	return {
		viewMode,
		setViewMode,
		searchQuery,
		setSearchQuery,
		debouncedSearch,
		selectedTags,
		setSelectedTags,
		tags,
		currentFolderId,
		setCurrentFolderId,
		breadcrumbs,
		setBreadcrumbs,
		files,
		loading,
		error,
		isLoadingMore,
		hasMore,
		loadMore,
		sentinelRef,
		loadMoreError,
		connectedFileIds,
		setConnectedFileIds,
		refetch
	}
}

// vim: ts=4
