// This file is part of the Cloudillo Platform.
// Copyright (C) 2026  Szilárd Hajba
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

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { useApi, useAuth, useDebouncedValue } from '@cloudillo/react'
import type { ApiClient, TagInfo, FileView } from '@cloudillo/core'

import type { PickerViewMode, BreadcrumbItem } from './types.js'
import { MAX_CONNECTED_FILE_BATCH } from './types.js'

export interface UsePickerBrowseOptions {
	/** Override API client (e.g. for cross-context browsing) */
	api?: ApiClient | null
	/** File ID to load connected/accessible files for (sourceFileId or documentFileId) */
	contextFileId?: string
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

	// Connected file IDs
	connectedFileIds: Set<string>
	setConnectedFileIds: React.Dispatch<React.SetStateAction<Set<string>>>

	// Actions
	refetch: () => void
}

export function usePickerBrowse({
	api: apiOverride,
	contextFileId
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

	// File state
	const [files, setFiles] = useState<FileView[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	// Connected file IDs (from share entries)
	const [connectedFileIds, setConnectedFileIds] = useState<Set<string>>(new Set())

	// Refresh counter (bump to re-trigger file fetch)
	const [refreshCounter, setRefreshCounter] = useState(0)

	// Debounced search query
	const debouncedSearch = useDebouncedValue(searchQuery, 300)

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

	// Fetch connected files
	useEffect(() => {
		if (!api || viewMode !== 'connected') return

		if (connectedFileIds.size === 0) {
			setFiles([])
			setLoading(false)
			return
		}

		let cancelled = false
		const client = api

		setLoading(true)
		setError(null)
		;(async () => {
			try {
				const fileIdList = [...connectedFileIds]
					.slice(0, MAX_CONNECTED_FILE_BATCH)
					.join(',')
				const allFiles = await client.files.list({ fileId: fileIdList })
				if (!cancelled) setFiles(allFiles)
			} catch (err) {
				console.error('Failed to fetch connected files:', err)
				if (!cancelled) {
					setFiles([])
					setError(t('Failed to load connected files'))
				}
			} finally {
				if (!cancelled) setLoading(false)
			}
		})()

		return () => {
			cancelled = true
		}
	}, [api, viewMode, connectedFileIds, refreshCounter, t])

	// Fetch files for browse/recent/starred views
	useEffect(() => {
		if (!api || viewMode === 'connected') return

		let cancelled = false
		const client = api

		setLoading(true)
		setError(null)
		;(async () => {
			try {
				const query: Record<string, unknown> = {}

				if (viewMode === 'browse') {
					query.parentId = currentFolderId || undefined
				} else if (viewMode === 'recent') {
					query.sort = 'recent'
					query.sortDir = 'desc'
				} else if (viewMode === 'starred') {
					query.starred = true
				}

				if (debouncedSearch) {
					query.fileName = debouncedSearch
				}

				if (selectedTags.length > 0) {
					query.tag = selectedTags.join(',')
				}

				const result = await client.files.list(
					query as Parameters<typeof client.files.list>[0]
				)
				if (!cancelled) setFiles(result || [])
			} catch (err) {
				console.error('Failed to fetch files:', err)
				if (!cancelled) {
					setFiles([])
					setError(t('Failed to load files'))
				}
			} finally {
				if (!cancelled) setLoading(false)
			}
		})()

		return () => {
			cancelled = true
		}
	}, [api, viewMode, currentFolderId, debouncedSearch, selectedTags, refreshCounter, t])

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
		connectedFileIds,
		setConnectedFileIds,
		refetch
	}
}

// vim: ts=4
