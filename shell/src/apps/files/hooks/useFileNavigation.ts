// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAtom } from 'jotai'
import {
	useContextAwareApi,
	useContextSwitch,
	useCurrentContextIdTag
} from '../../../context/index.js'
import type { File, ViewMode } from '../types.js'
import { TRASH_FOLDER_ID } from '../types.js'
import { viewModeAtom } from '../atoms.js'

export interface BreadcrumbItem {
	id: string | null
	name: string
}

export function useFileNavigation() {
	const _navigate = useNavigate()
	const [searchParams, setSearchParams] = useSearchParams()
	const { api } = useContextAwareApi()
	const { switchTo } = useContextSwitch()
	const contextIdTag = useCurrentContextIdTag()
	const [breadcrumbs, setBreadcrumbs] = React.useState<BreadcrumbItem[]>([])
	const [viewMode, setViewMode] = useAtom(viewModeAtom)

	// Get current folder from URL
	const currentFolderId = searchParams.get('parentId') || null

	// Build breadcrumb path when folder changes
	React.useEffect(
		function buildBreadcrumbs() {
			if (!api) return

			;(async function () {
				const path: BreadcrumbItem[] = [{ id: null, name: 'Files' }]

				if (currentFolderId && currentFolderId !== TRASH_FOLDER_ID) {
					// Traverse parent chain to build full path
					let folderId: string | null = currentFolderId
					const folderPath: BreadcrumbItem[] = []

					while (folderId) {
						try {
							// Use list with fileId filter to get folder metadata
							const folders = await api.files.list({ fileId: folderId })
							if (folders.length > 0) {
								const folder = folders[0]
								folderPath.unshift({ id: folder.fileId, name: folder.fileName })
								folderId = folder.parentId || null
							} else {
								break
							}
						} catch {
							break
						}
					}

					path.push(...folderPath)
				}

				setBreadcrumbs(path)
			})()
		},
		[api, currentFolderId]
	)

	const navigateToFolder = React.useCallback(
		function (folderId: string | null) {
			setViewMode('browse')
			if (folderId === null) {
				searchParams.delete('parentId')
			} else {
				searchParams.set('parentId', folderId)
			}
			setSearchParams(searchParams)
		},
		[searchParams, setSearchParams]
	)

	const navigateToView = React.useCallback(
		function (mode: ViewMode) {
			setViewMode(mode)
			if (mode === 'trash') {
				searchParams.set('parentId', TRASH_FOLDER_ID)
			} else {
				searchParams.delete('parentId')
			}
			setSearchParams(searchParams)
		},
		[searchParams, setSearchParams]
	)

	const goUp = React.useCallback(
		function () {
			if (breadcrumbs.length > 1) {
				const parentId = breadcrumbs[breadcrumbs.length - 2].id
				navigateToFolder(parentId)
			}
		},
		[breadcrumbs, navigateToFolder]
	)

	const enterFolder = React.useCallback(
		function (folder: File) {
			if (folder.fileTp === 'FLDR') {
				// Only switch context for folders with an explicit foreign owner (shared files)
				// Tenant-owned folders (owner = null) stay in current context
				if (folder.owner?.idTag && folder.owner.idTag !== contextIdTag) {
					switchTo(folder.owner.idTag, `/files?parentId=${folder.fileId}`)
				} else {
					navigateToFolder(folder.fileId)
				}
			}
		},
		[navigateToFolder, switchTo, contextIdTag]
	)

	return {
		currentFolderId,
		breadcrumbs,
		viewMode,
		navigateToFolder,
		navigateToView,
		goUp,
		enterFolder
	}
}

// vim: ts=4
