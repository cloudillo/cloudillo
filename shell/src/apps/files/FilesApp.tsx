// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type * as Types from '@cloudillo/core'
import {
	Alert,
	Button,
	DropZone,
	EmptyState,
	Fcd,
	FileButton,
	Grid,
	Icon,
	List,
	LoadingSpinner,
	LoadMoreTrigger,
	PageHeader,
	ProfilePicture,
	Text,
	useAuth,
	useDebouncedValue,
	useDialog,
	useIsMobile,
	useToast,
	VBox
} from '@cloudillo/react'
import { ROLE_LEVELS, roleLevel } from '@cloudillo/types'
import { useAtom, useSetAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuCloud as IcCloud,
	LuLock as IcLock,
	LuCloudOff as IcOffline,
	LuUpload as IcUpload
} from 'react-icons/lu'
import { useLocation, useNavigate } from 'react-router-dom'

import {
	useActiveCommunity,
	useContextAwareApi,
	useContextRolesFor,
	useCtx,
	useCurrentContextIdTag
} from '../../context/index.js'
import { usePorch } from '../../lib/porch.js'
import { getDirtyDocIds } from '../../message-bus/handlers/crdt.js'
import { useCanCreateRooms } from '../../profile/rooms-tab.js'
import { appPath, feedPath, profilePath, type QueryInit, settingsPath } from '../../routes.js'
import { DrawerToggle } from '../../ui/DrawerToggle.js'
import { isPermissionError, useAppConfig } from '../../utils.js'
import {
	displayModeAtom,
	fileTypeFilterAtom,
	lastFilesUrlAtom,
	ownerFilterAtom,
	searchQueryAtom,
	selectedTagsAtom
} from './atoms.js'
import { audienceText, confirmAudienceDialog, widensAudience } from './audience.js'
import type { ContextMenuPosition } from './components/index.js'
import {
	Breadcrumbs,
	ContextMenu,
	CreateMenu,
	DetailsPanel,
	FilterChips,
	HandActionBar,
	ImportChoiceDialog,
	ItemCard,
	ItemGrid,
	ShareDialog,
	Sidebar,
	Toolbar,
	UploadProgress
} from './components/index.js'
import { viewItems } from './components/Sidebar.js'
import {
	buildFileFilterParams,
	convertFileView,
	useFileList,
	useFileNavigation,
	useKeyboardShortcuts,
	useMultiSelect,
	useSmartUpload
} from './hooks/index.js'
import type { File, FileOps, ViewMode } from './types.js'
import { isFileProcessing } from './types.js'
import { canWrite, fileSrcIdTag } from './utils.js'

export function FilesApp() {
	const navigate = useNavigate()
	const location = useLocation()
	const setLastFilesUrl = useSetAtom(lastFilesUrlAtom)
	React.useEffect(
		function rememberLocation() {
			setLastFilesUrl({ pathname: location.pathname, search: location.search })
		},
		[location.pathname, location.search, setLastFilesUrl]
	)
	const { t } = useTranslation()
	const [appConfig] = useAppConfig()
	const { api } = useContextAwareApi()
	const [auth] = useAuth()
	const contextIdTag = useCurrentContextIdTag()
	const community = useActiveCommunity()
	const { base: urlContextIdTag, isHome } = useCtx()
	const dialog = useDialog()
	const toast = useToast()

	// Navigation state
	const {
		currentFolderId,
		remoteOwner,
		isRemoteBrowsing,
		drive,
		driveChannel,
		contextName,
		remoteAccessLevel,
		remoteApi,
		remoteRoles,
		breadcrumbs,
		viewMode,
		canGoBack,
		navigateToFolder,
		navigateToView,
		navigateToDrive,
		goBack,
		goUp,
		enterFolder
	} = useFileNavigation()
	const ctxRoles = useContextRolesFor(contextIdTag)
	// The whole porch: restore tells a deleted room (absent) from one merely left
	const { rooms: porch } = usePorch(isRemoteBrowsing ? undefined : contextIdTag, ctxRoles)
	const rooms = React.useMemo(() => (porch ?? []).filter((r) => r.status === 'in'), [porch])
	// Porch entry of the current room drive; undefined for a room the reader is not `in`
	const currentRoom = drive ? rooms.find((r) => r.name === drive) : undefined
	// A `?drive=` naming no room we are in (stale link, left room): fall back to the main drive
	const unknownDrive = !!porch && !!drive && !currentRoom
	React.useEffect(() => {
		if (unknownDrive) navigate({ search: '' }, { replace: true })
	}, [unknownDrive, navigate])

	const canAdminRooms = useCanCreateRooms(contextIdTag ?? auth?.idTag, ctxRoles)
	const audience = isRemoteBrowsing
		? undefined
		: audienceText(t, contextName, drive ? currentRoom : null, isHome)
	// Drive header (title + audience) while browsing a local drive
	const isDriveView = viewMode === 'browse' && !isRemoteBrowsing
	// Home needs no role (own session); a community needs contributor, as the server's create check.
	const canCreate = isRemoteBrowsing
		? canWrite(remoteAccessLevel)
		: !contextIdTag ||
			contextIdTag === auth?.idTag ||
			roleLevel(ctxRoles) >= ROLE_LEVELS.contributor

	// Dirty (unsynced) CRDT documents
	const [dirtyDocIds, setDirtyDocIds] = React.useState<Set<string>>(new Set())
	React.useEffect(() => {
		getDirtyDocIds().then(setDirtyDocIds)
	}, [])

	// Filter state (persists across route changes via Jotai atoms)
	const [selectedTags, setSelectedTags] = useAtom(selectedTagsAtom)
	const [fileTypeFilter, setFileTypeFilter] = useAtom(fileTypeFilterAtom)
	const [ownerFilter, setOwnerFilter] = useAtom(ownerFilterAtom)
	const [searchQuery, setSearchQuery] = useAtom(searchQueryAtom)

	// Debounce search query for API calls (300ms)
	const debouncedSearchQuery = useDebouncedValue(searchQuery, 300)

	// Search scope — by default Browse-mode searches stay confined to the
	// current folder. The "outside matches?" probe (below) can offer the user
	// to broaden it; resetting scope on context changes prevents accidental
	// global search after navigation.
	const [searchScope, setSearchScope] = React.useState<'folder' | 'all'>('folder')
	const searchActive = !!debouncedSearchQuery
	// Parent-folder chip only adds info when rows can escape the current folder:
	// hierarchy-agnostic views (recent/starred/trash) always, or a browse search
	// that has been broadened to scope=all. In browse + folder-scope every row
	// shares the breadcrumb's parent, so the chip would be noise on every line.
	const showParentChip = viewMode !== 'browse' || (searchActive && searchScope === 'all')
	React.useEffect(() => {
		setSearchScope('folder')
	}, [viewMode, currentFolderId, contextIdTag])
	// Separately: a fresh-empty search query resets scope, so re-opening
	// search after broadening starts in folder-scope again. Crucially this
	// does NOT include non-empty changes — typing another character must
	// not snap the user back to folder-scope mid-query.
	React.useEffect(() => {
		if (!debouncedSearchQuery) setSearchScope('folder')
	}, [debouncedSearchQuery])

	const listParentId =
		viewMode === 'browse' && searchActive && searchScope === 'all' ? undefined : currentFolderId

	// File list (with all filters)
	const fileListData = useFileList({
		viewMode,
		parentId: listParentId,
		tags: selectedTags,
		fileType: fileTypeFilter,
		owner: ownerFilter,
		ownerIdTag: contextIdTag,
		searchQuery: debouncedSearchQuery,
		remoteApi,
		channel: isRemoteBrowsing ? undefined : (driveChannel ?? '')
	})

	// Probe whether matches exist outside the current folder so we can prompt
	// the user to broaden their search. Cheap: limit=1 with notParentId so the
	// server only returns rows the user would see when scope=all. The probe
	// mirrors the active filters (tags, fileType, owner) so the banner only
	// appears when broadening would actually yield results.
	const [outsideMatchExists, setOutsideMatchExists] = React.useState(false)
	React.useEffect(() => {
		// Clear on early-return (probe not applicable). Avoid an unconditional
		// false→true reset on every dep tick: writing the result once at the
		// end of the request prevents the banner from blinking off while the
		// user is mid-typing or toggling tags.
		// Probe must mirror the list's API source (remote when browsing a
		// remote share) so the banner reflects what the user would actually
		// see when broadening — local-API matches inside a remote folder
		// would be spurious.
		const probeApi = remoteApi || api
		if (
			!probeApi ||
			viewMode !== 'browse' ||
			searchScope !== 'folder' ||
			!debouncedSearchQuery ||
			!currentFolderId
		) {
			setOutsideMatchExists(false)
			return
		}
		let cancelled = false
		;(async function () {
			try {
				const probeParams: Types.ListFilesQuery = {
					...buildFileFilterParams({
						tags: selectedTags,
						fileType: fileTypeFilter,
						owner: ownerFilter,
						ownerIdTag: contextIdTag
					}),
					fileName: debouncedSearchQuery,
					notParentId: currentFolderId,
					limit: 1
				}
				const result = await probeApi.files.listPaginated(probeParams)
				if (cancelled) return
				setOutsideMatchExists(result.data.length > 0)
			} catch (err) {
				console.error('outside-match probe failed', err)
				if (!cancelled) setOutsideMatchExists(false)
			}
		})()
		return () => {
			cancelled = true
		}
	}, [
		api,
		remoteApi,
		viewMode,
		searchScope,
		debouncedSearchQuery,
		currentFolderId,
		selectedTags,
		fileTypeFilter,
		ownerFilter,
		contextIdTag
	])

	// The remote node, the tenant it belongs to, and our roles there — derived once and handed to
	// both the details panel and the share dialog it opens, so the affordance one offers and what
	// the other allows are decided from the same values.
	const remoteScope = React.useMemo(
		() =>
			isRemoteBrowsing
				? {
						api: remoteApi,
						idTag: remoteOwner ?? undefined,
						roles: remoteRoles,
						// The row is the remote node's whether or not its token has landed. Dropping
						// the override meanwhile re-judges it against the LOCAL context, whose
						// roles say nothing about standing on the node being browsed.
						resolving: !remoteApi
					}
				: undefined,
		[isRemoteBrowsing, remoteApi, remoteOwner, remoteRoles]
	)

	// Smart upload (wraps upload queue with import detection)
	const uploadQueue = useSmartUpload({
		parentId: currentFolderId,
		onUploadComplete: fileListData.refresh,
		apiOverride: isRemoteBrowsing ? remoteApi : undefined,
		// Room of the current drive; the hooks send it only at the root (folders inherit)
		channel: isRemoteBrowsing ? undefined : driveChannel
	})

	// Clear finished uploads so the mobile FAB returns; errors stay so failures remain visible.
	React.useEffect(() => {
		if (uploadQueue.stats.pending > 0 || uploadQueue.stats.completed === 0) return
		const timer = setTimeout(uploadQueue.clearCompleted, 3000)
		return () => clearTimeout(timer)
	}, [uploadQueue.stats.pending, uploadQueue.stats.completed, uploadQueue.clearCompleted])

	// Sort files: pinned first (except in Recent/Trash), then folders, then regular files
	const files = React.useMemo(() => {
		const data = fileListData.getData()
		const skipPinSort = viewMode === 'recent' || viewMode === 'trash' || viewMode === 'managed'
		return [...data].sort((a, b) => {
			// Pinned files first (not in Recent or Trash views)
			if (!skipPinSort) {
				const aPinned = a.userData?.pinned ? 1 : 0
				const bPinned = b.userData?.pinned ? 1 : 0
				if (aPinned !== bPinned) return bPinned - aPinned
			}

			// Folders second
			const aFolder = a.fileTp === 'FLDR' ? 1 : 0
			const bFolder = b.fileTp === 'FLDR' ? 1 : 0
			if (aFolder !== bFolder) return bFolder - aFolder

			// Default: keep original order (from API)
			return 0
		})
	}, [fileListData, viewMode])

	// A metadata edit changes a row that is already loaded, so patch it. refresh() resets
	// useInfiniteScroll: it blanks the list, drops every page past the first and the scroll
	// position with them. Only a row appearing or disappearing is worth that.
	const patchFile = React.useCallback(
		function patchFile(
			entryId: string,
			patch: Partial<File> | ((file: File) => Partial<File>)
		) {
			if (!fileListData.getData().some((f) => f.entryId === entryId)) {
				// Not in this list — only a refetch can show what changed.
				fileListData.refresh()
				return
			}
			// Merged against the CURRENT row inside the updater, not against the render-time
			// snapshot: a FILE_ID_GENERATED or fileViewUpdateAtom patch landing while the API
			// call was in flight would otherwise be rolled back.
			fileListData.setFileData(entryId, (current) => ({
				...current,
				...(typeof patch === 'function' ? patch(current) : patch)
			}))
		},
		[fileListData]
	)

	// Multi-select state
	const multiSelect = useMultiSelect({
		files: files,
		// Search and tags too: `pruneOnFilesChange` bails on an empty list, so filtering down
		// to zero results would otherwise preserve the old selection invisibly.
		resetKey: `${viewMode}:${currentFolderId ?? ''}:${remoteOwner ?? ''}:${debouncedSearchQuery}:${selectedTags.slice().sort().join(',')}`
	})

	// Get the first selected file for the details panel
	const selectedFile = multiSelect.getFirstSelected()

	// Debounce selected file for the details panel to avoid re-rendering during rapid keyboard navigation
	const detailsFile = useDebouncedValue(selectedFile, 300)

	// Rename state
	const [renameFileId, setRenameFileId] = React.useState<string | undefined>()
	const [renameFileName, setRenameFileName] = React.useState<string | undefined>()

	// Filter visibility (mobile)
	const [showFilter, setShowFilter] = React.useState<boolean>(false)

	// Display mode (grid/list, persists across sessions via localStorage atom)
	const [displayMode, setDisplayMode] = useAtom(displayModeAtom)

	// Context menu state
	const [contextMenuFile, setContextMenuFile] = React.useState<File | undefined>()
	const [contextMenuPosition, setContextMenuPosition] = React.useState<
		ContextMenuPosition | undefined
	>()

	// Share dialog state
	const [shareDialogFile, setShareDialogFile] = React.useState<File | undefined>()

	// Mobile details panel visibility (separate from selection)
	// On desktop (>=768px), details panel follows selection
	// On mobile (<768px), details panel only shows when explicitly requested via info button
	const [showMobileDetails, setShowMobileDetails] = React.useState<boolean>(false)
	const isMobile = useIsMobile()

	// Reset filter on path change (not on search param changes like folder navigation)
	React.useEffect(
		function onLocationEffect() {
			setShowFilter(false)
		},
		[location.pathname]
	)

	const onClickFile = React.useCallback(
		function onClickFile(file: File, event: React.MouseEvent) {
			multiSelect.handleClick(file, event)
		},
		[multiSelect]
	)

	const onDoubleClickFile = React.useCallback(
		function onDoubleClickFile(file: File) {
			if (file.fileTp === 'FLDR') {
				enterFolder(file)
			}
		},
		[enterFolder]
	)

	const onContextMenuFile = React.useCallback(
		function onContextMenuFile(file: File, position: ContextMenuPosition) {
			// If clicked file is not already selected, make it the only selection
			// This ensures context menu operations target the right file(s)
			if (!multiSelect.isSelected(file.entryId)) {
				multiSelect.handleClick(file, {
					ctrlKey: false,
					metaKey: false,
					shiftKey: false
				} as React.MouseEvent)
			}
			setContextMenuFile(file)
			setContextMenuPosition(position)
		},
		[multiSelect]
	)

	const closeContextMenu = React.useCallback(function closeContextMenu() {
		setContextMenuFile(undefined)
		setContextMenuPosition(undefined)
	}, [])

	// Info button click handler (mobile only) - selects the file and shows details panel
	const onInfoClick = React.useCallback(
		function onInfoClick(file: File) {
			multiSelect.handleClick(file, {
				ctrlKey: false,
				metaKey: false,
				shiftKey: false
			} as React.MouseEvent)
			setShowMobileDetails(true)
		},
		[multiSelect]
	)

	const clearSelectionRef = React.useRef(multiSelect.clearSelection)
	clearSelectionRef.current = multiSelect.clearSelection

	const handleViewModeChange = React.useCallback(
		function (mode: ViewMode) {
			navigateToView(mode)
			clearSelectionRef.current()
		},
		[navigateToView]
	)

	const handleCreateFolder = React.useCallback(
		async function () {
			if (!api) return

			const folderName = await dialog.askText(
				t('Create folder'),
				t('Provide a name for the new folder'),
				{ placeholder: t('Untitled folder') }
			)
			if (folderName === undefined) return

			try {
				await api.files.create({
					fileTp: 'FLDR',
					contentType: 'cloudillo/folder',
					fileName: folderName || t('Untitled folder'),
					parentId: currentFolderId || undefined,
					channel: currentFolderId ? undefined : driveChannel
				})
				fileListData.refresh()
			} catch (err) {
				console.error('[Files] create folder failed', err)
				toast.error(t('Failed to create folder'))
			}
		},
		[api, dialog, t, toast, currentFolderId, driveChannel, fileListData]
	)

	const handleEmptyTrash = React.useCallback(
		async function () {
			if (!api) return

			const res = await dialog.confirm(
				t('Empty trash'),
				t(
					'Are you sure you want to permanently delete all files in trash? This action cannot be undone.'
				),
				{ color: 'error', confirmLabel: t('Empty trash') }
			)
			if (!res) return

			await api.trash.empty()
			fileListData.refresh()
		},
		[api, dialog, t, fileListData]
	)

	const fileOps: FileOps = React.useMemo(() => {
		// A restore lands at the root of the entry's drive; when that room is gone (absent
		// from the porch, not merely left) it falls back to the main drive — a wider audience.
		async function confirmRestore(entryIds: string[]): Promise<boolean> {
			const data = fileListData.getData()
			const orphaned = entryIds.some((id) => {
				const ch = data.find((f) => f.entryId === id)?.channel
				return widensAudience(porch, contextIdTag ?? '', ch, ch ?? null)
			})
			if (!orphaned) return true
			return confirmAudienceDialog(
				dialog,
				t,
				t('Restore to {{place}}?', { place: contextName }),
				audienceText(t, contextName, null, isHome) ?? contextName
			)
		}

		// Shared navigation helper for opening files in apps
		function navigateToFile(
			file: File,
			appName: string,
			access?: 'read' | 'comment' | 'write',
			params?: string
		) {
			if (!file.fileId) return // local folders have no content id, so no resId
			// `contextIdTag` is still OUR context while remote-browsing — that is a query
			// param, not a context switch — so the browsed node has to be passed explicitly.
			const srcIdTag = fileSrcIdTag(file, {
				remoteOwner: isRemoteBrowsing ? remoteOwner : undefined,
				contextIdTag,
				authIdTag: auth?.idTag
			})
			const query: QueryInit = {}
			if (access && access !== 'write') query.access = access
			if (params) {
				for (const [k, v] of new URLSearchParams(params)) {
					query[k] = v
				}
			}
			navigate(appPath(urlContextIdTag, appName, `${srcIdTag}:${file.fileId}`, query))
		}

		return {
			setFile: function setFile(file: File) {
				fileListData.setFileData(file.entryId, file)
			},

			openFile: function openFile(entryId?: string, access?: 'read' | 'comment' | 'write') {
				const file = fileListData.getData()?.find((f) => f.entryId === entryId)
				if (!file) return
				if (isFileProcessing(file)) {
					toast.warning(
						t('This file is still being processed — please try again in a moment.')
					)
					return
				}
				const app = appConfig?.mime[file.contentType]
				if (app) {
					const appName = app.split('/').pop()!
					navigateToFile(file, appName, access)
				} else if (!file.fileTp || file.fileTp === 'BLOB') {
					// Unknown binary: open the built-in viewer, which shows a Download fallback
					navigateToFile(file, 'view', access)
				} else {
					// CRDT/RTDB docs with no handler: leave as-is (handled elsewhere as
					// "Unsupported file type")
					console.warn('[FilesApp] openFile: no app for', file.contentType, file.fileTp)
				}
			},

			openFileWithApp: function openFileWithApp(
				entryId: string,
				appId: string,
				access?: 'read' | 'comment' | 'write',
				params?: string
			) {
				const file = fileListData.getData()?.find((f) => f.entryId === entryId)
				if (file) {
					navigateToFile(file, appId, access, params)
				} else {
					console.warn('[FilesApp] File not found in data:', entryId)
				}
			},

			renameFile: function renameFile(entryId?: string) {
				const file = fileListData.getData()?.find((f) => f.entryId === entryId)
				setRenameFileId(entryId)
				setRenameFileName(file?.fileName || '')
			},

			setRenameFileName,

			doRenameFile: async function doRenameFile(entryId: string, fileName: string) {
				if (!api) return
				// Unhandled, a 403 here rejects into nothing: the dialog sits open with no
				// explanation and the name silently does not change. Kept open on failure on
				// purpose, so the user can retry or cancel.
				try {
					await api.files.update(entryId, { fileName })
					setRenameFileId(undefined)
					setRenameFileName(undefined)
					patchFile(entryId, { fileName })
				} catch (err) {
					console.error('Failed to rename file', err)
					toast.error(
						isPermissionError(err)
							? t('You do not have permission to rename this file.')
							: t('Failed to rename file')
					)
				}
			},

			doDeleteFile: async function doDeleteFile(entryId: string) {
				if (!api) return
				const file = fileListData.getData()?.find((f) => f.entryId === entryId)
				const isFolder = file?.fileTp === 'FLDR'

				// Owner-only: probe share entries to warn about active embeds / share links.
				// Per PRD non-goal, user/community grants ('U') are excluded — revocation cascades naturally.
				let warning: string | null = null
				if (file && file.owner?.idTag === auth?.idTag) {
					try {
						const shares = await api.files.listShares(entryId)
						const list = Array.isArray(shares) ? shares : []
						const embeds = list.filter((e) => e.subjectType === 'F').length
						const links = list.filter(
							(e) => e.subjectType !== 'F' && e.subjectType !== 'U'
						).length
						if (embeds > 0 || links > 0) {
							warning = t(
								'This file is currently used by:\n- {{links}} share link(s)\n- {{embeds}} embed(s)\n\nTrashing it will break those references.',
								{ links, embeds }
							)
						}
					} catch {
						// best-effort; skip warning on probe failure
					}
				}

				const res = await dialog.confirm(
					warning
						? t('Move "{{name}}" to trash?', { name: file?.fileName ?? '' })
						: isFolder
							? t('Move folder to trash')
							: t('Move to trash'),
					warning
						? warning
						: isFolder
							? t(
									'Are you sure you want to move this folder and its contents to trash?'
								)
							: t('Are you sure you want to move this file to trash?'),
					{ color: 'error', confirmLabel: t('Move to trash') }
				)
				if (!res) return

				await api.files.delete(entryId)
				if (multiSelect.isSelected(entryId)) {
					multiSelect.clearSelection()
				}
				fileListData.refresh()
			},

			doRestoreFile: async function doRestoreFile(entryId: string, parentId?: string) {
				if (!api) return
				if (!parentId && !(await confirmRestore([entryId]))) return
				await api.files.restore(entryId, parentId)
				fileListData.refresh()
			},

			doPermanentDeleteFile: async function doPermanentDeleteFile(entryId: string) {
				if (!api) return
				const res = await dialog.confirm(
					t('Permanently delete'),
					t(
						'Are you sure you want to permanently delete this file? This action cannot be undone.'
					),
					{ color: 'error', confirmLabel: t('Delete') }
				)
				if (!res) return

				await api.files.permanentDelete(entryId)
				if (multiSelect.isSelected(entryId)) {
					multiSelect.clearSelection()
				}
				fileListData.refresh()
			},

			toggleStarred: async function toggleStarred(entryId: string) {
				if (!api) return
				const file = fileListData.getData()?.find((f) => f.entryId === entryId)
				const starred = !(file?.userData?.starred ?? false)
				try {
					await api.files.setStarred(entryId, starred)
				} catch (err) {
					console.error('Failed to change starred state', err)
					toast.error(t('Failed to change starred state'))
					return
				}
				// Un-starring in the starred view removes the row: only a refetch can do that.
				if (viewMode === 'starred' && !starred) fileListData.refresh()
				else patchFile(entryId, (f) => ({ userData: { ...f.userData, starred } }))
			},

			togglePinned: async function togglePinned(entryId: string) {
				if (!api) return
				const file = fileListData.getData()?.find((f) => f.entryId === entryId)
				const pinned = !(file?.userData?.pinned ?? false)
				try {
					await api.files.setPinned(entryId, pinned)
				} catch (err) {
					console.error('Failed to change pinned state', err)
					toast.error(t('Failed to change pinned state'))
					return
				}
				patchFile(entryId, (f) => ({ userData: { ...f.userData, pinned } }))
			},

			// Batch operations for multi-select
			doDeleteFiles: async function doDeleteFiles(entryIds: string[]) {
				if (!api || entryIds.length === 0) return

				const res = await dialog.confirm(
					t('Move to trash'),
					t('Are you sure you want to move {{count}} items to trash?', {
						count: entryIds.length
					}),
					{ color: 'error', confirmLabel: t('Move to trash') }
				)
				if (!res) return

				await Promise.all(entryIds.map((id) => api.files.delete(id)))
				multiSelect.clearSelection()
				fileListData.refresh()
			},

			doRestoreFiles: async function doRestoreFiles(entryIds: string[], parentId?: string) {
				if (!api || entryIds.length === 0) return
				if (!parentId && !(await confirmRestore(entryIds))) return
				await Promise.all(entryIds.map((id) => api.files.restore(id, parentId)))
				multiSelect.clearSelection()
				fileListData.refresh()
			},

			doPermanentDeleteFiles: async function doPermanentDeleteFiles(entryIds: string[]) {
				if (!api || entryIds.length === 0) return

				const res = await dialog.confirm(
					t('Permanently delete'),
					t(
						'Are you sure you want to permanently delete {{count}} items? This action cannot be undone.',
						{ count: entryIds.length }
					),
					{ color: 'error', confirmLabel: t('Delete') }
				)
				if (!res) return

				await Promise.all(entryIds.map((id) => api.files.permanentDelete(id)))
				multiSelect.clearSelection()
				fileListData.refresh()
			},

			toggleStarredBatch: async function toggleStarredBatch(
				entryIds: string[],
				starred: boolean
			) {
				if (!api || entryIds.length === 0) return
				// Per-id outcomes: `Promise.all` would abandon the rows that DID succeed on the
				// server, leaving the list disagreeing with the backend until a refresh.
				const results = await Promise.allSettled(
					entryIds.map((id) => api.files.setStarred(id, starred))
				)
				const done = entryIds.filter((_, i) => results[i].status === 'fulfilled')
				// Nothing succeeded on the server, so nothing here has to change.
				if (done.length > 0) {
					if (viewMode === 'starred' && !starred) {
						// Un-starring in the starred view removes the rows: only a refetch
						// can do that.
						fileListData.refresh()
					} else {
						for (const id of done) {
							patchFile(id, (f) => ({ userData: { ...f.userData, starred } }))
						}
					}
				}
				if (done.length < entryIds.length) {
					console.error(
						'Failed to change starred state for some files',
						results.filter((r) => r.status === 'rejected')
					)
					toast.error(t('Failed to change starred state'))
				}
			},

			togglePinnedBatch: async function togglePinnedBatch(
				entryIds: string[],
				pinned: boolean
			) {
				if (!api || entryIds.length === 0) return
				const results = await Promise.allSettled(
					entryIds.map((id) => api.files.setPinned(id, pinned))
				)
				const done = entryIds.filter((_, i) => results[i].status === 'fulfilled')
				for (const id of done) {
					patchFile(id, (f) => ({ userData: { ...f.userData, pinned } }))
				}
				if (done.length < entryIds.length) {
					console.error(
						'Failed to change pinned state for some files',
						results.filter((r) => r.status === 'rejected')
					)
					toast.error(t('Failed to change pinned state'))
				}
			},

			// `scopedApi` is the file's own node when the caller knows it differs from ours - see
			// FileOps.setVisibility. Without it a remote row's update goes to the wrong server.
			setVisibility: async function setVisibility(entryId: string, visibility, scopedApi) {
				const target = scopedApi ?? api
				if (!target) return
				// Called without an await from the details panel and the context menu, and the
				// whole point of `scopedApi` is a foreign node - which is exactly where a 403
				// happens. Unhandled, the dropdown just closes and nothing changes.
				try {
					await target.files.update(entryId, { visibility })
					// Only our own node's row is the one this list renders. A `scopedApi` write
					// changed the canonical copy upstream and left the local mirror alone, so
					// patching it here would show a value the next listing contradicts.
					if (target === api) patchFile(entryId, { visibility })
					else fileListData.refresh()
				} catch (err) {
					console.error('Failed to change visibility', err)
					toast.error(
						isPermissionError(err)
							? t('You do not have permission to change this file’s visibility.')
							: t('Failed to change visibility')
					)
				}
			},

			doDuplicateFile: async function doDuplicateFile(entryId: string) {
				if (!api) return

				const file = fileListData.getData()?.find((f) => f.entryId === entryId)
				const defaultName = t('Copy of {{name}}', { name: file?.fileName || '' })

				const fileName = await dialog.askText(
					t('Duplicate'),
					t('Provide a name for the duplicate'),
					{ defaultValue: defaultName }
				)
				if (fileName === undefined) return

				try {
					await api.files.duplicate(entryId, { fileName: fileName || defaultName })
					toast.success(t('File duplicated'))
					fileListData.refresh()
				} catch (err) {
					console.error('Failed to duplicate file', err)
					toast.error(t('Failed to duplicate file'))
				}
			},

			doRefreshFile: async function doRefreshFile(entryId: string) {
				if (!api) return
				try {
					const res = await api.files.refresh(entryId)
					// `unreachable` means the source never answered: the row came back
					// untouched, so there is nothing to patch and nothing to celebrate.
					if (res.refreshStatus === 'unreachable') {
						toast.error(
							t("{{host}} couldn't be reached. We'll keep trying.", {
								host: res.upstream?.idTag ?? res.owner?.idTag ?? ''
							})
						)
						return
					}
					toast.success(t('File metadata refreshed'))
					const r = convertFileView(res)
					// Only what POST /files/:id/refresh reconciles. A blanket spread would
					// overwrite every field `convertFileView` materialises unconditionally —
					// userData above all, which this response does not carry.
					patchFile(entryId, {
						fileName: r.fileName,
						contentType: r.contentType,
						fileTp: r.fileTp,
						tags: r.tags,
						preset: r.preset,
						// Only when the response actually carries one: it is the per-user
						// CACHED level, NULL on a pre-v30 row, while the listing always
						// computes one (`compute_file_access_levels`). Spreading `undefined`
						// here strips the row's Share/visibility affordances until a refetch.
						...(r.accessLevel !== undefined ? { accessLevel: r.accessLevel } : {}),
						brokenAt: r.brokenAt,
						brokenReason: r.brokenReason
					})
				} catch (err) {
					console.error('Failed to refresh file metadata', err)
					toast.error(t('Failed to refresh file metadata'))
				}
			}
		}
	}, [
		auth,
		api,
		appConfig,
		contextIdTag,
		isRemoteBrowsing,
		remoteOwner,
		urlContextIdTag,
		navigate,
		t,
		fileListData,
		patchFile,
		viewMode,
		dialog,
		toast,
		multiSelect,
		porch,
		contextName,
		isHome
	])

	// Keyboard shortcuts
	useKeyboardShortcuts({
		files: files,
		selectedFile,
		onSelectFile: (file) =>
			file
				? multiSelect.handleClick(file, {
						ctrlKey: false,
						metaKey: false,
						shiftKey: false
					} as React.MouseEvent)
				: multiSelect.clearSelection(),
		onEnterFolder: enterFolder,
		onGoToParent: goUp,
		fileOps,
		isRenaming: renameFileId !== undefined,
		onSelectAll: multiSelect.selectAll
	})

	const isTrashView = viewMode === 'trash'
	const isInitialLoading = fileListData.isLoading && files.length === 0

	// Disable drag-drop in trash view and read-only remote browsing
	const canUpload = viewMode === 'browse' && canCreate
	const createMenuProps = {
		contextIdTag,
		currentFolderId,
		channel: isRemoteBrowsing ? undefined : driveChannel,
		onCreateFolder:
			viewMode === 'browse' && !isRemoteBrowsing && canCreate
				? handleCreateFolder
				: undefined,
		onUpload: canUpload ? uploadQueue.handleFilesForUpload : undefined
	}

	return (
		<>
			<DropZone
				variant="overlay"
				target="viewport"
				className="h-100"
				onFiles={canUpload ? uploadQueue.handleFilesForUpload : () => {}}
				hover={
					canUpload ? (
						<VBox gap={2} align="center">
							<Icon as={IcUpload} size="xl" />
							<Text>{t('Drop files here to upload')}</Text>
						</VBox>
					) : undefined
				}
			>
				<Fcd.Container>
					<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
						<Sidebar
							viewMode={viewMode}
							onViewModeChange={handleViewModeChange}
							fileTypeFilter={fileTypeFilter}
							onFileTypeFilterChange={setFileTypeFilter}
							ownerFilter={ownerFilter}
							onOwnerFilterChange={setOwnerFilter}
							searchQuery={searchQuery}
							onSearchQueryChange={setSearchQuery}
							selectedTags={selectedTags}
							onTagFilter={setSelectedTags}
							contextName={contextName}
							drive={drive}
							rooms={rooms}
							onDriveChange={navigateToDrive}
						/>
					</Fcd.Filter>
					<Fcd.Content
						width="fluid"
						header={
							<VBox gap={2}>
								<PageHeader
									title={
										isDriveView
											? drive
												? `~${drive}${currentRoom?.title ? ` · ${currentRoom.title}` : ''}`
												: contextName
											: `${t('Files')} · ${viewItems(t).find((v) => v.mode === viewMode)?.label ?? ''}`
									}
									leading={
										community && (
											<ProfilePicture
												profile={{ profilePic: community.profilePic }}
												srcTag={community.idTag}
												size="sm"
											/>
										)
									}
									subtitle={
										!isDriveView
											? community && (community.name || community.idTag)
											: drive
												? audience && (
														<Button
															variant="link"
															onClick={() =>
																navigate(
																	canAdminRooms
																		? settingsPath(
																				urlContextIdTag,
																				['rooms', drive]
																			)
																		: profilePath(
																				urlContextIdTag,
																				contextIdTag,
																				'rooms'
																			)
																)
															}
														>
															{currentRoom?.closed && <IcLock />}
															{audience}
														</Button>
													)
												: audience
									}
									actions={
										<>
											<DrawerToggle nav onClick={() => setShowFilter(true)} />
											{isDriveView && drive && (
												<Button
													onClick={() =>
														navigate(
															feedPath(urlContextIdTag, undefined, {
																room: drive
															})
														)
													}
												>
													{t('Posts')}
												</Button>
											)}
											{canCreate && !isMobile && (
												<CreateMenu {...createMenuProps} />
											)}
										</>
									}
								/>
								<Toolbar
									canGoBack={canGoBack}
									onGoBack={goBack}
									canGoUp={!!(currentFolderId || isRemoteBrowsing)}
									onGoUp={goUp}
									displayMode={displayMode}
									onDisplayModeChange={setDisplayMode}
									onEmptyTrash={isTrashView ? handleEmptyTrash : undefined}
								/>
								<HandActionBar
									api={api}
									currentFolderId={currentFolderId}
									currentFolderName={
										breadcrumbs.length > 0
											? breadcrumbs[breadcrumbs.length - 1].name
											: undefined
									}
									viewMode={viewMode}
									onRefresh={fileListData.refresh}
									driveChannel={driveChannel}
									contextName={contextName}
									rooms={porch}
								/>
								{viewMode === 'browse' &&
									(breadcrumbs.length > 1 || isRemoteBrowsing) && (
										<Breadcrumbs
											items={breadcrumbs}
											onNavigate={navigateToFolder}
											isRemoteBrowsing={isRemoteBrowsing}
											accessLevel={remoteAccessLevel}
										/>
									)}
								{fileListData.isOffline && (
									<Alert color="neutral" compact icon={<IcOffline />}>
										{t('Showing cached data — you appear to be offline')}
									</Alert>
								)}
								<FilterChips
									fileTypeFilter={fileTypeFilter}
									ownerFilter={ownerFilter}
									searchQuery={debouncedSearchQuery}
									selectedTags={selectedTags}
									onFileTypeFilterChange={setFileTypeFilter}
									onOwnerFilterChange={setOwnerFilter}
									onSearchQueryChange={setSearchQuery}
									onTagFilter={setSelectedTags}
								/>
								{searchActive &&
									viewMode === 'browse' &&
									(() => {
										const folderPath =
											breadcrumbs
												.map((b) => b.name)
												.filter(Boolean)
												.join(' / ') || t('Files')
										return (
											<>
												{searchScope === 'folder' && outsideMatchExists && (
													<Alert
														compact
														color="info"
														actions={
															<Button
																size="sm"
																onClick={() =>
																	setSearchScope('all')
																}
															>
																{t('Search all files')}
															</Button>
														}
													>
														{t(
															'More matches exist outside this folder.'
														)}{' '}
														<Text emphasis="muted">{`${t('In folder:')} ${folderPath}`}</Text>
													</Alert>
												)}
												{searchScope === 'folder' &&
													!outsideMatchExists && (
														<Text
															as="div"
															size="sm"
															emphasis="muted"
															className="p-2"
														>
															{`${t('In folder:')} ${folderPath}`}
														</Text>
													)}
												{searchScope === 'all' && (
													<Alert
														compact
														color="info"
														actions={
															<Button
																size="sm"
																onClick={() =>
																	setSearchScope('folder')
																}
															>
																{t('Back to this folder')}
															</Button>
														}
													>
														{t('Searching all files')}
													</Alert>
												)}
											</>
										)
									})()}
							</VBox>
						}
					>
						{isInitialLoading ? (
							<LoadingSpinner fill size="lg" label={t('Loading files...')} />
						) : files.length === 0 &&
							isDriveView &&
							drive &&
							!currentFolderId &&
							!searchActive ? (
							<EmptyState
								icon={<Icon as={IcCloud} size="xl" />}
								title={t('No files in ~{{room}} yet.', { room: drive })}
								description={
									audience &&
									t('Files you add here are visible to {{audience}}.', {
										audience
									})
								}
								actions={
									canUpload && (
										<FileButton
											multiple
											color="primary"
											icon={<IcUpload />}
											onFiles={uploadQueue.handleFilesForUpload}
										>
											{t('Upload')}
										</FileButton>
									)
								}
							/>
						) : files.length === 0 ? (
							<EmptyState
								icon={<Icon as={IcCloud} size="xl" />}
								title={
									isTrashView
										? t('Trash is empty')
										: viewMode === 'starred'
											? t('No starred files yet')
											: viewMode === 'recent'
												? t('No recent files')
												: currentFolderId
													? t('This folder is empty')
													: t('No files found')
								}
								description={
									isTrashView
										? t('Files you delete will appear here')
										: viewMode === 'starred'
											? t('Star files to quickly access them later')
											: viewMode === 'recent'
												? t('Files you open will appear here')
												: t(
														'Create a new document or upload files to get started'
													)
								}
							/>
						) : displayMode === 'grid' ? (
							<>
								<Grid min="8rem" gap={3} className="p-2" data-file-grid>
									{files.map((file) => (
										<ItemGrid
											key={file.entryId}
											selected={multiSelect.isSelected(file.entryId)}
											file={file}
											isDirty={dirtyDocIds.has(
												`${contextIdTag}:${file.fileId}`
											)}
											onClick={onClickFile}
											onDoubleClick={onDoubleClickFile}
											onContextMenu={onContextMenuFile}
											onInfoClick={auth ? onInfoClick : undefined}
											renameFileId={renameFileId}
											renameFileName={renameFileName}
											fileOps={fileOps}
											viewMode={viewMode}
											showParentChip={showParentChip}
										/>
									))}
								</Grid>
								<LoadMoreTrigger
									ref={fileListData.sentinelRef}
									isLoading={fileListData.isLoadingMore}
									hasMore={fileListData.hasMore}
									error={fileListData.error}
									onRetry={fileListData.loadMore}
									loadingLabel={t('Loading more files...')}
									retryLabel={t('Retry')}
									errorPrefix={t('Failed to load:')}
								/>
							</>
						) : (
							<>
								<List variant="divided">
									{files.map((file) => (
										<ItemCard
											key={file.entryId}
											selected={multiSelect.isSelected(file.entryId)}
											file={file}
											isDirty={dirtyDocIds.has(
												`${contextIdTag}:${file.fileId}`
											)}
											onClick={onClickFile}
											onDoubleClick={onDoubleClickFile}
											onContextMenu={onContextMenuFile}
											onInfoClick={auth ? onInfoClick : undefined}
											renameFileId={renameFileId}
											renameFileName={renameFileName}
											fileOps={fileOps}
											viewMode={viewMode}
											showParentChip={showParentChip}
										/>
									))}
								</List>
								<LoadMoreTrigger
									ref={fileListData.sentinelRef}
									isLoading={fileListData.isLoadingMore}
									hasMore={fileListData.hasMore}
									error={fileListData.error}
									onRetry={fileListData.loadMore}
									loadingLabel={t('Loading more files...')}
									retryLabel={t('Retry')}
									errorPrefix={t('Failed to load:')}
								/>
							</>
						)}
						{/* Keeps the last row clear of the mobile FAB */}
						{canCreate && isMobile && (
							<VBox aria-hidden style={{ flex: 'none', height: '5rem' }} />
						)}
					</Fcd.Content>
					<Fcd.Details
						isVisible={!!auth && !!selectedFile && (!isMobile || showMobileDetails)}
						hide={() => {
							setShowMobileDetails(false)
							multiSelect.clearSelection()
						}}
					>
						{auth && detailsFile && (
							<DetailsPanel
								file={detailsFile}
								fileOps={fileOps}
								onShare={setShareDialogFile}
								onNavigateToFolder={navigateToFolder}
								ownerScope={remoteScope}
							/>
						)}
					</Fcd.Details>
				</Fcd.Container>
			</DropZone>

			{/* Hidden while UploadProgress (same corner) is showing */}
			{canCreate && isMobile && uploadQueue.queue.length === 0 && (
				<CreateMenu fab {...createMenuProps} />
			)}

			<UploadProgress
				queue={uploadQueue.queue}
				stats={uploadQueue.stats}
				onRemoveItem={uploadQueue.removeItem}
				onClearCompleted={uploadQueue.clearCompleted}
				onClearAll={uploadQueue.clearAll}
			/>

			<ImportChoiceDialog
				pendingConversions={uploadQueue.pendingConversions}
				onUploadAsFile={uploadQueue.uploadAsFile}
				onConvert={uploadQueue.startConversion}
				onDismissAll={uploadQueue.dismissAll}
			/>

			{contextMenuFile && contextMenuPosition && (
				<ContextMenu
					selectedFiles={multiSelect.getSelectedFiles()}
					clickedFile={contextMenuFile}
					position={contextMenuPosition}
					viewMode={viewMode}
					fileOps={fileOps}
					onClose={closeContextMenu}
					onShare={
						isRemoteBrowsing
							? undefined
							: (file) => {
									setShareDialogFile(file)
								}
					}
					isRemoteBrowsing={isRemoteBrowsing}
				/>
			)}

			{shareDialogFile && (
				<ShareDialog
					open={!!shareDialogFile}
					file={shareDialogFile}
					onClose={() => setShareDialogFile(undefined)}
					onPermissionsChanged={fileListData.refresh}
					ownerScope={remoteScope}
				/>
			)}
		</>
	)
}

// vim: ts=4
