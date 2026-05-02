// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useNavigate, useSearchParams, useNavigationType } from 'react-router-dom'
import { useAtom } from 'jotai'
import type { ApiClient } from '@cloudillo/core'
import { useCurrentContextIdTag } from '../../../context/index.js'
import { useApiContext, useContextAwareApi } from '../../../context/index.js'
import type { File, ViewMode } from '../types.js'
import { TRASH_FOLDER_ID } from '../types.js'
import { viewModeAtom, fileNavStackAtom } from '../atoms.js'

export interface BreadcrumbItem {
	id: string | null
	name: string
	isShareRoot?: boolean
	ownerName?: string
}

export function useFileNavigation() {
	const _navigate = useNavigate()
	const [searchParams] = useSearchParams()
	const navigationType = useNavigationType()
	const { api } = useContextAwareApi()
	const { getTokenFor, getClientFor } = useApiContext()
	const contextIdTag = useCurrentContextIdTag()
	const [breadcrumbs, setBreadcrumbs] = React.useState<BreadcrumbItem[]>([])
	const [viewMode, setViewMode] = useAtom(viewModeAtom)
	const [navStack, setNavStack] = useAtom(fileNavStackAtom)
	const [remoteApi, setRemoteApi] = React.useState<ApiClient | null>(null)
	const [remoteAccessLevel, setRemoteAccessLevel] = React.useState<'read' | 'write' | undefined>()

	// Get current state from URL
	const currentFolderId = searchParams.get('parentId') || null
	const remoteOwner = searchParams.get('remoteOwner') || null
	const shareRoot = searchParams.get('shareRoot') || null
	const isRemoteBrowsing = !!remoteOwner

	const canGoBack = navStack.length > 0

	// Acquire remote API client when remoteOwner changes
	React.useEffect(
		function acquireRemoteApi() {
			if (!remoteOwner) {
				setRemoteApi(null)
				setRemoteAccessLevel(undefined)
				return
			}

			let cancelled = false
			;(async function () {
				try {
					const tokenResult = await getTokenFor(remoteOwner, { explicit: true })
					if (cancelled) return
					const client = tokenResult
						? getClientFor(remoteOwner, { token: tokenResult.token })
						: null
					if (!cancelled) setRemoteApi(client)
				} catch {
					if (!cancelled) setRemoteApi(null)
				}
			})()

			return () => {
				cancelled = true
			}
		},
		[remoteOwner, getTokenFor, getClientFor]
	)

	// Browser history sync: when user clicks browser back/forward,
	// search the nav stack for the new URL state and trim accordingly
	React.useEffect(
		function syncNavStackOnPop() {
			if (navigationType !== 'POP') return

			const currentState = { parentId: currentFolderId, remoteOwner, shareRoot }
			setNavStack((prev) => {
				// Find the last matching entry (iterate from end)
				let idx = -1
				for (let i = prev.length - 1; i >= 0; i--) {
					const entry = prev[i]
					if (
						entry.parentId === currentState.parentId &&
						entry.remoteOwner === currentState.remoteOwner &&
						entry.shareRoot === currentState.shareRoot
					) {
						idx = i
						break
					}
				}
				if (idx >= 0) {
					return prev.slice(0, idx)
				}
				return []
			})
		},
		[navigationType, currentFolderId, remoteOwner, shareRoot]
	)

	// Build breadcrumb path when folder changes
	React.useEffect(
		function buildBreadcrumbs() {
			const effectiveApi = isRemoteBrowsing ? remoteApi : api
			if (!effectiveApi) return

			;(async function () {
				if (isRemoteBrowsing && currentFolderId) {
					// Remote mode: walk parent chain up to shareRoot
					const folderPath: BreadcrumbItem[] = []
					let folderId: string | null = currentFolderId

					while (folderId) {
						try {
							const folders = await effectiveApi.files.list({ fileId: folderId })
							if (folders.length > 0) {
								const folder = folders[0]
								const isRoot = folderId === shareRoot
								folderPath.unshift({
									id: folder.fileId,
									name: folder.fileName,
									isShareRoot: isRoot,
									ownerName: isRoot
										? folder.owner?.name || remoteOwner
										: undefined
								})
								if (isRoot) {
									setRemoteAccessLevel(
										folder.accessLevel === 'write' ? 'write' : 'read'
									)
									break
								}
								folderId = folder.parentId || null
							} else {
								break
							}
						} catch {
							break
						}
					}

					setBreadcrumbs(folderPath)
				} else {
					// Local mode: original breadcrumb logic
					const path: BreadcrumbItem[] = [{ id: null, name: 'Files' }]

					if (currentFolderId && currentFolderId !== TRASH_FOLDER_ID) {
						let folderId: string | null = currentFolderId
						const folderPath: BreadcrumbItem[] = []

						while (folderId) {
							try {
								const folders = await effectiveApi.files.list({ fileId: folderId })
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
				}
			})()
		},
		[api, remoteApi, currentFolderId, isRemoteBrowsing, shareRoot, remoteOwner]
	)

	const navigateToFolder = React.useCallback(
		function (folderId: string | null) {
			setViewMode('browse')
			const params = new URLSearchParams()
			if (folderId) {
				params.set('parentId', folderId)
				if (remoteOwner) {
					params.set('remoteOwner', remoteOwner)
					if (shareRoot) params.set('shareRoot', shareRoot)
				}
			}
			_navigate({ search: params.toString() })
		},
		[remoteOwner, shareRoot, _navigate]
	)

	const navigateToView = React.useCallback(
		function (mode: ViewMode) {
			setViewMode(mode)
			const params = new URLSearchParams()
			if (mode === 'trash') {
				params.set('parentId', TRASH_FOLDER_ID)
			}
			_navigate({ search: params.toString() })
		},
		[_navigate]
	)

	const goBack = React.useCallback(
		function () {
			if (navStack.length === 0) return
			const entry = navStack[navStack.length - 1]
			setNavStack((prev) => prev.slice(0, -1))

			const params = new URLSearchParams()
			if (entry.parentId) params.set('parentId', entry.parentId)
			if (entry.remoteOwner) {
				params.set('remoteOwner', entry.remoteOwner)
				if (entry.shareRoot) params.set('shareRoot', entry.shareRoot)
			}
			_navigate({ search: params.toString() })
		},
		[navStack, setNavStack, _navigate]
	)

	const goUp = React.useCallback(
		function () {
			if (isRemoteBrowsing && currentFolderId === shareRoot) {
				// At share root — behave like "back"
				if (navStack.length > 0) {
					goBack()
				} else {
					_navigate({ search: '' })
				}
			} else if (breadcrumbs.length > 1) {
				const parentId = breadcrumbs[breadcrumbs.length - 2].id
				navigateToFolder(parentId)
			}
		},
		[
			isRemoteBrowsing,
			currentFolderId,
			shareRoot,
			navStack,
			breadcrumbs,
			goBack,
			navigateToFolder,
			_navigate
		]
	)

	const enterFolder = React.useCallback(
		function (folder: File) {
			if (folder.fileTp !== 'FLDR') return

			// Push current location onto navigation stack
			setNavStack((prev) => [
				...prev,
				{
					parentId: currentFolderId,
					remoteOwner,
					shareRoot
				}
			])

			if (
				folder.owner?.idTag &&
				folder.owner.idTag !== contextIdTag &&
				folder.owner.idTag !== remoteOwner
			) {
				// Entering a shared folder (new remote context or from own files)
				const params = new URLSearchParams()
				params.set('parentId', folder.fileId)
				params.set('remoteOwner', folder.owner.idTag)
				params.set('shareRoot', folder.fileId)
				_navigate({ search: params.toString() })
			} else {
				navigateToFolder(folder.fileId)
			}
		},
		[
			currentFolderId,
			remoteOwner,
			shareRoot,
			contextIdTag,
			setNavStack,
			navigateToFolder,
			_navigate
		]
	)

	return {
		currentFolderId,
		remoteOwner,
		shareRoot,
		isRemoteBrowsing,
		remoteAccessLevel,
		breadcrumbs,
		viewMode,
		canGoBack,
		remoteApi,
		navigateToFolder,
		navigateToView,
		goBack,
		goUp,
		enterFolder
	}
}

// vim: ts=4
