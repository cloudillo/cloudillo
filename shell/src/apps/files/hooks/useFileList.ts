// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type * as Types from '@cloudillo/core'
import type { ApiClient } from '@cloudillo/core'
import { useAuth, useInfiniteScroll } from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'

import { createCachedFileFetchPage } from '../../../cache/index.js'
import {
	fileViewUpdateAtom,
	useContextAwareApi,
	useCurrentContextIdTag
} from '../../../context/index.js'
import { useWsBus } from '../../../ws-bus.js'
import { sortAtom } from '../atoms.js'
import { convertFileView, mergeFileView } from '../file-view.js'
import type { File } from '../types.js'
import { resolveAccessLevel } from '../utils.js'
import type { FilesPerm } from './useFilesFilters.js'

export { convertFileView, mergeFileView }

export interface UseFileListOptions {
	/** The mapped list query (`useFilesFilters().toListQuery`), without cursor/limit/sort */
	query: Types.ListFilesQuery
	/** "My permission", filtered client-side on each row's access level */
	perm?: FilesPerm
	/** Roles held where the rows live, to resolve rows that carry no `accessLevel` */
	permRoles?: string[]
	remoteApi?: ApiClient | null
}

const PAGE_SIZE = 30
// perm filter auto-loads ≤5 pages, server-side perm param if users hit this
const PERM_AUTO_PAGES = 5
const PERM_LEVELS: Record<FilesPerm, readonly string[]> = {
	edit: ['write', 'admin'],
	read: ['read', 'comment']
}

export function useFileList({ query, perm, permRoles, remoteApi }: UseFileListOptions) {
	const { api } = useContextAwareApi()
	const contextIdTag = useCurrentContextIdTag()
	const [auth] = useAuth()
	const sort = useAtomValue(sortAtom)
	const [refreshCounter, setRefreshCounter] = React.useState(0)
	// Consecutive fetched pages the `perm` filter emptied; drives the auto-load cap. Keyed by the
	// list it counts, so a new list starts from 0 and a stale fetch cannot bump it
	const [permEmpty, setPermEmpty] = React.useState({ key: '', n: 0 })

	// One string key for the whole query (incl. sort; `recent` overrides it), so deps don't
	// churn on object identity
	const queryKey = JSON.stringify({ sort: sort.field, sortDir: sort.dir, ...query })
	const fullQuery = React.useMemo(() => JSON.parse(queryKey) as Types.ListFilesQuery, [queryKey])
	const permKey = perm ? `${perm}:${auth?.idTag ?? ''}:${(permRoles ?? []).join(',')}` : ''
	const listKey = `${queryKey}|${permKey}|${contextIdTag}|${refreshCounter}`
	const listKeyRef = React.useRef(listKey)
	listKeyRef.current = listKey
	const permEmptyPages = permEmpty.key === listKey ? permEmpty.n : 0

	const buildQueryParams = React.useCallback(
		(cursor: string | null, limit: number): Types.ListFilesQuery => ({
			...fullQuery,
			cursor: cursor ?? undefined,
			limit
		}),
		[fullQuery]
	)

	// Offline-cache params. A root or recursive listing returns every cached file for the
	// context rather than only root-level ones — this maximizes offline usefulness. Only
	// fileTp/starred/parentId are supported by the cache layer, so offline results may include
	// unfiltered items for the other dimensions.
	const cacheQueryParams = React.useMemo(() => {
		const params: Record<string, string | boolean> = {}
		if (fullQuery.type) params.fileTp = fullQuery.type
		if (fullQuery.starred) params.starred = true
		if (fullQuery.parentId && fullQuery.parentId !== '__root__' && !fullQuery.recursive) {
			params.parentId = fullQuery.parentId
		}
		return params
	}, [fullQuery])

	// Raw network fetch function (returns FileView for caching)
	const rawFetchPage = React.useCallback(
		async (cursor: string | null, limit: number) => {
			const effectiveApi = remoteApi || api
			if (!effectiveApi) {
				return { items: [] as Types.FileView[] }
			}

			const queryParams = buildQueryParams(cursor, limit)
			const result = await effectiveApi.files.listPaginated(queryParams)

			return {
				items: result.data,
				next: result.meta.next
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

	// Convert FileView → File after cache layer, then apply the client-side `perm` filter
	const fetchPage = React.useCallback(
		async (cursor: string | null, limit: number) => {
			const result = cachedFetchPage
				? await cachedFetchPage(cursor, limit)
				: await rawFetchPage(cursor, limit)
			const items = result.items.map(convertFileView)
			if (!permKey) return { ...result, items }

			const [level, idTag, roles] = permKey.split(':')
			const allowed = PERM_LEVELS[level as FilesPerm]
			// A non-recursive listing keeps its subfolders navigable
			const keepFolders = !fullQuery.recursive
			// Unknown level (not resolvable locally, e.g. remote rows) counts as admin: the
			// server enforces the real permission, same assumption as `shareGrantCeiling`
			const kept = items.filter(
				(f) =>
					(keepFolders && f.fileType === 'FLDR') ||
					allowed.includes(
						resolveAccessLevel(f, idTag || undefined, roles ? roles.split(',') : []) ??
							'admin'
					)
			)
			if (listKey === listKeyRef.current) {
				setPermEmpty((prev) =>
					items.length > 0 && kept.length === 0
						? { key: listKey, n: (prev.key === listKey ? prev.n : 0) + 1 }
						: { key: listKey, n: 0 }
				)
			}
			return { ...result, items: kept }
		},
		[cachedFetchPage, rawFetchPage, permKey, fullQuery.recursive, listKey]
	)

	// Use infinite scroll hook
	const {
		items: files,
		isLoading,
		isLoadingMore,
		error,
		isOffline,
		hasMore,
		loadMore,
		reset,
		prepend,
		updateItem,
		sentinelRef
	} = useInfiniteScroll<File>({
		fetchPage,
		pageSize: PAGE_SIZE,
		deps: [queryKey, permKey, contextIdTag, remoteApi, refreshCounter],
		enabled: !!api
	})

	// A page the perm filter emptied loads the next one, up to PERM_AUTO_PAGES per user action
	// (filter change or Load more); past that the list ends in a "Load more" line (`permCapped`)
	const permAutoLoading =
		!!permKey && hasMore && permEmptyPages > 0 && permEmptyPages <= PERM_AUTO_PAGES
	const permCapped = !!permKey && hasMore && permEmptyPages > PERM_AUTO_PAGES
	React.useEffect(() => {
		if (permAutoLoading && !isLoading && !isLoadingMore) loadMore()
	}, [permAutoLoading, isLoading, isLoadingMore, loadMore])
	const loadMoreFiles = React.useCallback(() => {
		setPermEmpty({ key: listKey, n: 0 })
		loadMore()
	}, [loadMore, listKey])

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
		updateItem((f) => f.id === fileViewUpdate.file.id, convertFileView(fileViewUpdate.file))
	}, [fileViewUpdate, updateItem])

	// When background processing (transcode / variant generation) finishes, the
	// backend assigns the final content-addressed id (`f1~…`), flips status P→A,
	// and broadcasts fileIdGenerated over /ws/bus with the temp id. Patch the
	// row in place so the thumbnail, preview and download start working without a
	// manual refresh (refresh() would reset infinite-scroll pagination).
	const filesRef = React.useRef(files)
	React.useEffect(() => {
		filesRef.current = files
	})
	useWsBus({ types: ['fileIdGenerated'] }, (msg) => {
		const data = msg.data as { tempId?: string; contentId?: string } | undefined
		if (!data?.tempId || !data?.contentId) return
		const current = filesRef.current.find((f) => f.contentId === data.tempId)
		if (!current) return // not in this list instance
		updateItem((f) => f.contentId === data.tempId, {
			...current,
			contentId: data.contentId,
			status: 'active'
		})
	})

	// Content swaps (replace, version restore - also from other clients) keep the entry id but
	// change its content; re-fetch the visible rows the backend names. The bus is the local
	// tenant's, so remote-browsed rows are not ours to patch.
	// Per entry, the latest request's sequence number: an older response landing later is dropped
	const metaSeqRef = React.useRef(new Map<string, number>())
	useWsBus({ types: ['filesChanged'] }, (msg) => {
		const entries = (msg.data as { entries?: string[] } | undefined)?.entries
		if (!api || remoteApi || !Array.isArray(entries)) return
		for (const id of entries) {
			if (!filesRef.current.some((f) => f.id === id)) continue
			const seq = (metaSeqRef.current.get(id) ?? 0) + 1
			metaSeqRef.current.set(id, seq)
			api.files.getMetadata(id).then(
				(view) => {
					if (metaSeqRef.current.get(id) !== seq) return
					updateItem(
						(f) => f.id === id,
						(prev) => mergeFileView(prev, view)
					)
				},
				() => {} // a hint: the next list load catches up
			)
		}
	})

	return React.useMemo(
		function () {
			function getData() {
				return files
			}

			function setFileData(entryId: string, file: File | ((prev: File) => File)) {
				updateItem((f) => f.id === entryId, file)
			}

			function refresh() {
				setRefreshCounter((r) => r + 1)
			}

			return {
				// Data
				getData,
				files,
				setFileData,
				refresh,
				// Infinite scroll
				isLoading: isLoading || (permAutoLoading && files.length === 0),
				isLoadingMore,
				error,
				isOffline,
				hasMore,
				loadMore: loadMoreFiles,
				/** The perm filter hit its auto-load cap with more pages left */
				permCapped,
				reset,
				prepend,
				sentinelRef
			}
		},
		[
			files,
			isLoading,
			permAutoLoading,
			isLoadingMore,
			error,
			isOffline,
			hasMore,
			loadMoreFiles,
			permCapped,
			reset,
			prepend,
			sentinelRef
		]
	)
}

// vim: ts=4
