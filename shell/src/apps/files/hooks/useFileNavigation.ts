// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ApiClient } from '@cloudillo/core'
import { makeChannel, useAuth } from '@cloudillo/react'
import { useAtom } from 'jotai'
import * as React from 'react'
import { useNavigate, useNavigationType, useSearchParams } from 'react-router-dom'

import {
	useApiContext,
	useContextAwareApi,
	useContextName,
	useCurrentContextIdTag
} from '../../../context/index.js'
import { ctxBase, filesPath } from '../../../routes.js'
import { ROOM_NAME_RE } from '../../../settings/room-form.js'
import { fileNavStackAtom, navSearch } from '../atoms.js'
import { channelTarget } from '../audience.js'
import type { File, ViewMode } from '../types.js'
import { MANAGED_FOLDER_ID, TRASH_FOLDER_ID, VIEW_MODES } from '../types.js'
import type { FileAccessLevel } from '../utils.js'

export interface BreadcrumbItem {
	id: string | null
	name: string
	isShareRoot?: boolean
	ownerName?: string
}

export function useFileNavigation() {
	const navigate = useNavigate()
	const [searchParams] = useSearchParams()
	const navigationType = useNavigationType()
	const [auth] = useAuth()
	// `authenticated` is a dep of `buildBreadcrumbs` below: the api client's
	// identity is stable per idTag, so this flag is what changes when a context
	// token lands. None of the other deps move on token arrival.
	const { api, authenticated } = useContextAwareApi()
	const { getTokenFor, getClientFor } = useApiContext()
	const [breadcrumbs, setBreadcrumbs] = React.useState<BreadcrumbItem[]>([])
	const [navStack, setNavStack] = useAtom(fileNavStackAtom)
	const [remoteApi, setRemoteApi] = React.useState<ApiClient | null>(null)
	// Roles we hold ON the remote tenant, from the same proxy token that minted `remoteApi`.
	// Standing there cannot be read off the active context's roles.
	const [remoteRoles, setRemoteRoles] = React.useState<string[]>([])
	// The share root's own level, carried verbatim rather than flattened to read/write: an 'A'
	// grant on the shared folder must still read as write-or-better downstream (`canWrite`).
	const [remoteAccessLevel, setRemoteAccessLevel] = React.useState<FileAccessLevel | undefined>()

	// Get current state from URL
	const currentFolderId = searchParams.get('parentId') || null
	const remoteOwner = searchParams.get('remoteOwner') || null
	const shareRoot = searchParams.get('shareRoot') || null
	const isRemoteBrowsing = !!remoteOwner
	const viewParam = searchParams.get('view')
	const viewMode: ViewMode =
		viewParam && (VIEW_MODES as readonly string[]).includes(viewParam)
			? (viewParam as ViewMode)
			: 'browse'
	// Bare room name; absent = the context's main drive. Browse view only, never while remote browsing.
	const rawDrive = (!remoteOwner && viewMode === 'browse' && searchParams.get('drive')) || null
	const drive = rawDrive && ROOM_NAME_RE.test(rawDrive) ? rawDrive : null
	const contextIdTag = useCurrentContextIdTag()
	const driveChannel = drive && contextIdTag ? makeChannel(contextIdTag, drive) : undefined
	const contextName = useContextName()

	const canGoBack = navStack.length > 0

	// Acquire remote API client when remoteOwner changes
	React.useEffect(
		function acquireRemoteApi() {
			// Unconditionally, before any await: `remoteOwner` changing from one tenant to another
			// leaves the previous owner's client and roles in place while the new token loads, and
			// FilesApp pairs them with the NEW owner's idTag in `remoteScope` — the api-and-standing
			// disagreement useFileOwnerScope exists to prevent.
			setRemoteApi(null)
			setRemoteRoles([])
			setRemoteAccessLevel(undefined)
			if (!remoteOwner) return

			let cancelled = false
			;(async function () {
				try {
					const tokenResult = await getTokenFor(remoteOwner, { explicit: true })
					if (cancelled) return
					const client = tokenResult
						? getClientFor(remoteOwner, { token: tokenResult.token })
						: null
					if (!cancelled) {
						setRemoteApi(client)
						setRemoteRoles(tokenResult?.roles ?? [])
					}
				} catch {
					if (!cancelled) {
						setRemoteApi(null)
						setRemoteRoles([])
					}
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

			const currentState = {
				parentId: currentFolderId,
				remoteOwner,
				shareRoot,
				drive,
				view: viewMode
			}
			setNavStack((prev) => {
				// Find the last matching entry (iterate from end)
				let idx = -1
				for (let i = prev.length - 1; i >= 0; i--) {
					const entry = prev[i]
					if (
						entry.parentId === currentState.parentId &&
						entry.remoteOwner === currentState.remoteOwner &&
						entry.shareRoot === currentState.shareRoot &&
						(entry.drive ?? null) === currentState.drive &&
						(entry.view ?? 'browse') === currentState.view
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
		[navigationType, currentFolderId, remoteOwner, shareRoot, drive, viewMode]
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
									id: folder.entryId,
									name: folder.fileName,
									isShareRoot: isRoot,
									ownerName: isRoot
										? folder.owner?.name || remoteOwner
										: undefined
								})
								if (isRoot) {
									setRemoteAccessLevel(folder.accessLevel ?? 'read')
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
					// Local mode: the trail starts at the drive
					const path: BreadcrumbItem[] = [
						{ id: null, name: drive ? `~${drive}` : contextName }
					]

					if (
						currentFolderId &&
						currentFolderId !== TRASH_FOLDER_ID &&
						currentFolderId !== MANAGED_FOLDER_ID
					) {
						let folderId: string | null = currentFolderId
						const folderPath: BreadcrumbItem[] = []

						while (folderId) {
							try {
								const folders = await effectiveApi.files.list({ fileId: folderId })
								if (folders.length > 0) {
									const folder = folders[0]
									folderPath.unshift({
										id: folder.entryId,
										name: folder.fileName
									})
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
		[
			api,
			authenticated,
			remoteApi,
			currentFolderId,
			isRemoteBrowsing,
			shareRoot,
			remoteOwner,
			drive,
			contextName
		]
	)

	const navigateToFolder = React.useCallback(
		function (folderId: string | null) {
			navigate({ search: navSearch({ drive, parentId: folderId, remoteOwner, shareRoot }) })
		},
		[remoteOwner, shareRoot, drive, navigate]
	)

	// Open a drive's root: `null` = the main drive, else a bare room name.
	const navigateToDrive = React.useCallback(
		function (name: string | null) {
			if (viewMode === 'browse' && !currentFolderId && !remoteOwner && drive === name) return
			setNavStack((prev) => [
				...prev,
				{ parentId: currentFolderId, remoteOwner, shareRoot, drive, view: viewMode }
			])
			navigate({ search: navSearch({ drive: name }) })
		},
		[navigate, setNavStack, currentFolderId, remoteOwner, shareRoot, drive, viewMode]
	)

	const navigateToView = React.useCallback(
		function (mode: ViewMode) {
			// Same-view re-click (e.g. Recent → Recent from the side nav) is
			// a no-op; pushing the current location would bloat the back
			// stack with duplicates.
			if (mode === viewMode) return
			// Push current location onto the nav stack so the in-app back
			// arrow returns to the originating folder/share — without this,
			// switching from a deep folder to Recent/Starred/Trash and pressing
			// back would silently drop the user at root.
			setNavStack((prev) => [
				...prev,
				{
					parentId: currentFolderId,
					remoteOwner,
					shareRoot,
					drive,
					view: viewMode
				}
			])
			navigate({
				search: navSearch({ drive: mode === 'browse' ? drive : null, view: mode })
			})
		},
		[navigate, setNavStack, currentFolderId, remoteOwner, shareRoot, drive, viewMode]
	)

	const goBack = React.useCallback(
		function () {
			if (navStack.length === 0) return
			const entry = navStack[navStack.length - 1]
			setNavStack((prev) => prev.slice(0, -1))

			navigate({ search: navSearch(entry) })
		},
		[navStack, setNavStack, navigate]
	)

	const goUp = React.useCallback(
		function () {
			if (isRemoteBrowsing && currentFolderId === shareRoot) {
				// At share root — behave like "back"
				if (navStack.length > 0) {
					goBack()
				} else {
					navigate({ search: '' })
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
			navigate
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
					shareRoot,
					drive,
					view: viewMode
				}
			])

			// Only a MIRRORED folder points at another node; a row that originates here is
			// browsed in place however it is owned.
			if (folder.upstream?.idTag && folder.upstream.idTag !== remoteOwner) {
				// Entering a shared folder (new remote context or from own files) — browse mode.
				// Our entry id is unknown upstream: browse by the upstream folder id.
				const remoteId = folder.fileId ?? folder.entryId
				const params = new URLSearchParams()
				params.set('parentId', remoteId)
				params.set('remoteOwner', folder.upstream.idTag)
				params.set('shareRoot', remoteId)
				navigate({ search: params.toString() })
			} else {
				// Search/Starred list folders from every drive (and context): adopt the folder's own
				const { tenant, drive: folderDrive }: ReturnType<typeof channelTarget> = remoteOwner
					? { drive }
					: channelTarget(folder.channel, contextIdTag)
				if (tenant) {
					navigate(
						filesPath(ctxBase(tenant, auth?.idTag), {
							...(folderDrive && { drive: folderDrive }),
							parentId: folder.entryId
						})
					)
				} else {
					navigate({
						search: navSearch({
							drive: folderDrive,
							parentId: folder.entryId,
							remoteOwner,
							shareRoot
						})
					})
				}
			}
		},
		[
			currentFolderId,
			remoteOwner,
			shareRoot,
			drive,
			viewMode,
			contextIdTag,
			auth?.idTag,
			setNavStack,
			navigate
		]
	)

	return {
		currentFolderId,
		remoteOwner,
		shareRoot,
		isRemoteBrowsing,
		drive,
		driveChannel,
		contextName,
		remoteAccessLevel,
		breadcrumbs,
		viewMode,
		canGoBack,
		remoteApi,
		remoteRoles,
		navigateToFolder,
		navigateToView,
		navigateToDrive,
		goBack,
		goUp,
		enterFolder
	}
}

// vim: ts=4
