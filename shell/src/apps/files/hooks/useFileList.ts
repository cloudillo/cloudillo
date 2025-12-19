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
import { useAuth } from '@cloudillo/react'
import * as Types from '@cloudillo/base'
import { parseQS } from '../../../utils.js'
import { useCurrentContextIdTag, useContextAwareApi } from '../../../context/index.js'
import type { File, ViewMode } from '../types.js'
import { TRASH_FOLDER_ID } from '../types.js'

export interface UseFileListOptions {
	viewMode?: ViewMode
	parentId?: string | null
	tags?: string[]
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
	const [page, setPage] = React.useState(0)
	const [refreshHelper, setRefreshHelper] = React.useState(false)
	const [filter, setFilter] = React.useState<Record<string, string> | undefined>()
	const [files, setFiles] = React.useState<File[] | undefined>()

	const { viewMode = 'all', parentId, tags } = options || {}

	// Convert tags array to comma-separated string for API
	const tagsParam = tags && tags.length > 0 ? tags.join(',') : undefined

	React.useEffect(
		function loadFileList() {
			if (!api) return

			;(async function () {
				const qs = parseQS(location.search)
				setFilter(qs)

				let fileList: File[] = []

				switch (viewMode) {
					case 'starred': {
						// Starred files
						const files = await api.files.list({ starred: true, tag: tagsParam })
						fileList = files.map(convertFileView)
						break
					}
					case 'recent': {
						// Recent files sorted by last access/modification
						const files = await api.files.list({
							sort: 'recent',
							sortDir: 'desc',
							tag: tagsParam
						})
						fileList = files.map(convertFileView)
						break
					}
					case 'pinned': {
						// Pinned files (user-specific)
						const files = await api.files.list({ pinned: true, tag: tagsParam })
						fileList = files.map(convertFileView)
						break
					}
					case 'live': {
						// Live documents: CRDT and RTDB (collaboratively editable)
						const allFiles = await api.files.list({ tag: tagsParam })
						fileList = allFiles
							.filter(
								(f: Types.FileView) => f.fileTp === 'CRDT' || f.fileTp === 'RTDB'
							)
							.map(convertFileView)
						break
					}
					case 'static': {
						// Static files: BLOB (immutable, uploaded or exported)
						const allFiles = await api.files.list({ tag: tagsParam })
						fileList = allFiles
							.filter((f: Types.FileView) => f.fileTp === 'BLOB')
							.map(convertFileView)
						break
					}
					case 'trash':
						fileList = (
							await api.files.list({
								...qs,
								parentId: TRASH_FOLDER_ID,
								tag: tagsParam
							} as Types.ListFilesQuery)
						).map(convertFileView)
						break
					default: {
						// 'all' mode - use parentId if provided
						const queryParams: Types.ListFilesQuery = {
							...qs,
							...(parentId !== undefined && { parentId: parentId ?? '__root__' }),
							tag: tagsParam
						}
						fileList = (await api.files.list(queryParams)).map(convertFileView)
					}
				}

				setFiles(fileList)
			})()
		},
		[api, location.search, refreshHelper, viewMode, parentId, tagsParam, contextIdTag]
	)

	return React.useMemo(
		function () {
			function getData() {
				return files || []
			}

			function setState(
				sort: keyof File | undefined,
				sortAsc: boolean | undefined,
				page: number | undefined
			) {
				if (sort !== undefined) setSort(sort)
				if (sortAsc !== undefined) setSortAsc(sortAsc)
				if (page !== undefined) setPage(page)
			}

			function setFileData(fileId: string, file: File) {
				setFiles((files) => files?.map((f) => (f.fileId === fileId ? file : f)))
			}

			async function next() {
				if (!page) setPage(page + 1)
			}

			async function prev() {
				if (page) setPage(page - 1)
			}

			function refresh() {
				setRefreshHelper((r) => !r)
			}

			return {
				getData,
				setFileData,
				filter,
				state: { sort, sortAsc },
				setState,
				refresh
			}
		},
		[files, filter, sort, sortAsc, page]
	)
}

// vim: ts=4
