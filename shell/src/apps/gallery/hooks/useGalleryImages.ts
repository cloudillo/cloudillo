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
import { useInfiniteScroll } from '@cloudillo/react'
import type { ListFilesQuery, FileView } from '@cloudillo/core'
import { useContextAwareApi } from '../../../context/index.js'
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

	// Stringify apiQueryParams for dependency tracking
	const queryParamsKey = JSON.stringify(apiQueryParams)

	// Fetch page function for infinite scroll
	const fetchPage = React.useCallback(
		async (cursor: string | null, limit: number) => {
			if (!api) {
				return { items: [], nextCursor: null, hasMore: false }
			}

			const result = await api.files.listPaginated({
				contentType: 'image/*',
				...apiQueryParams,
				cursor: cursor ?? undefined,
				limit
			})

			const photos = result.data.map(convertFileToPhoto)

			return {
				items: photos,
				nextCursor: result.cursorPagination?.nextCursor ?? null,
				hasMore: result.cursorPagination?.hasMore ?? false
			}
		},
		[api, queryParamsKey]
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
