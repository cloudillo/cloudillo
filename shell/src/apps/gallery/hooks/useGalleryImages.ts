// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useInfiniteScroll } from '@cloudillo/react'
import type { ListFilesQuery, FileView } from '@cloudillo/core'
import { useContextAwareApi } from '../../../context/index.js'
import { useCurrentContextIdTag } from '../../../context/index.js'
import { createCachedFileFetchPage } from '../../../cache/index.js'
import type { Photo } from '../types.js'

export interface UseGalleryImagesOptions {
	apiQueryParams: Partial<ListFilesQuery>
	enabled?: boolean
}

const PAGE_SIZE = 20

function convertFileToPhoto(f: FileView): Photo {
	return {
		fileId: f.fileId,
		variantId: undefined,
		fileName: f.fileName,
		contentType: f.contentType,
		createdAt: typeof f.createdAt === 'string' ? f.createdAt : f.createdAt.toISOString(),
		preset: f.preset || '',
		tags: f.tags,
		x: f.x
	}
}

export function useGalleryImages(options: UseGalleryImagesOptions) {
	const { apiQueryParams, enabled = true } = options
	const { api } = useContextAwareApi()
	const contextIdTag = useCurrentContextIdTag()

	// Stringify apiQueryParams for dependency tracking
	const queryParamsKey = JSON.stringify(apiQueryParams)

	// Raw network fetch function
	const rawFetchPage = React.useCallback(
		async (cursor: string | null, limit: number) => {
			if (!api) {
				return { items: [] as FileView[], nextCursor: null, hasMore: false }
			}

			const result = await api.files.listPaginated({
				contentType: 'image/*',
				...apiQueryParams,
				cursor: cursor ?? undefined,
				limit
			})

			return {
				items: result.data,
				nextCursor: result.cursorPagination?.nextCursor ?? null,
				hasMore: result.cursorPagination?.hasMore ?? false
			}
		},
		[api, queryParamsKey]
	)

	// Cache query params for offline fallback
	const cacheQueryParams = React.useMemo(
		() => ({
			contentType: 'image/*',
			starred: apiQueryParams.starred,
			pinned: apiQueryParams.pinned
		}),
		[apiQueryParams.starred, apiQueryParams.pinned]
	)

	// Fetch page with offline cache fallback (operates on FileView, converts to Photo after)
	const cachedFetchPage = React.useMemo(
		() => createCachedFileFetchPage(contextIdTag, rawFetchPage, cacheQueryParams),
		[contextIdTag, rawFetchPage, cacheQueryParams]
	)

	// Convert FileView → Photo
	const fetchPage = React.useCallback(
		async (cursor: string | null, limit: number) => {
			const result = await cachedFetchPage(cursor, limit)
			return {
				...result,
				items: result.items.map(convertFileToPhoto)
			}
		},
		[cachedFetchPage]
	)

	// Use infinite scroll hook
	const {
		items: photos,
		isLoading,
		isLoadingMore,
		error,
		hasMore,
		loadMore,
		reset,
		sentinelRef
	} = useInfiniteScroll<Photo>({
		fetchPage,
		pageSize: PAGE_SIZE,
		deps: [queryParamsKey],
		enabled: !!api && enabled
	})

	return {
		photos,
		isLoading,
		isLoadingMore,
		error,
		hasMore,
		loadMore,
		reset,
		sentinelRef
	}
}

// vim: ts=4
