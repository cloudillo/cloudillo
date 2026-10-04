// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * MediaPickerBrowseTab Component
 *
 * File browsing tab for the media picker.
 * Allows users to search, filter, and navigate through their files.
 */

import type { FileView } from '@cloudillo/core'
import { getFileUrl, VISIBILITY_ORDER, type Visibility } from '@cloudillo/core'
import {
	Alert,
	Breadcrumbs,
	Button,
	EmptyState,
	FileTile,
	Grid,
	IconText,
	LoadingSpinner,
	LoadMoreTrigger,
	useApi,
	useAuth,
	useDialog,
	useToast,
	VBox
} from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuHandshake as IcConnected,
	LuFile as IcFile,
	LuUsers as IcFollowers,
	LuHouse as IcHome,
	LuLock as IcLock
} from 'react-icons/lu'

import { canManageFile, canManageShares } from '../../apps/files/utils.js'
import { activeContextAtom, contextRolesAtom, useApiContext } from '../../context/index.js'
import type { MediaPickerResult } from '../../context/media-picker-atom.js'
import { isPermissionError } from '../../utils.js'
import { PickerFilterBar, usePickerBrowse } from '../pickers/index.js'

// File visibility type (matches API response)
type FileVisibility = 'D' | 'P' | 'V' | '2' | 'F' | 'C' | null

/**
 * Get visibility icon for a file
 */
function getVisibilityIcon(visibility: FileVisibility): React.ReactNode | null {
	switch (visibility) {
		case 'D':
		case null:
			return <IcLock size={12} />
		case 'F':
			return <IcFollowers size={12} />
		case 'C':
			return <IcConnected size={12} />
		default:
			return null // No badge for public files
	}
}

/**
 * Get visibility label key for translation
 */
function getVisibilityLabel(visibility: FileVisibility): string {
	switch (visibility) {
		case 'D':
		case null:
			return 'Private'
		case 'F':
			return 'Followers only'
		case 'C':
			return 'Connected only'
		case 'P':
			return 'Public'
		default:
			return 'Unknown'
	}
}

interface MediaPickerBrowseTabProps {
	mediaType?: string
	documentVisibility?: Visibility
	documentFileId?: string
	/**
	 * Site source: the file ends up on a published page, whose reader is anonymous.
	 * Only Public files may be picked, and the unlock action is "Make public" — a
	 * share grants the *document*, which buys that reader nothing.
	 */
	requirePublic?: boolean
	isExternalContext?: boolean
	idTag?: string
	selectedFile: MediaPickerResult | null
	onSelect: (file: MediaPickerResult) => void
	onDoubleClick: (file: MediaPickerResult) => void
}

/**
 * Check if a file is public (can be used in external context)
 */
function isPublicFile(file: FileView): boolean {
	return file.visibility === 'P'
}

/**
 * Check if a file matches the media type filter
 */
function matchesMediaType(file: FileView, mediaType?: string): boolean {
	if (!mediaType) return true
	if (file.fileTp === 'FLDR') return true // Always show folders

	const contentType = file.contentType || ''
	if (mediaType.endsWith('/*')) {
		const prefix = mediaType.slice(0, -1) // Remove '*'
		return contentType.startsWith(prefix)
	}
	return contentType === mediaType
}

/**
 * Check if file is an image (which can have a thumbnail)
 */
function isImage(file: FileView): boolean {
	const contentType = file.contentType || ''
	return contentType.startsWith('image/')
}

export function MediaPickerBrowseTab({
	mediaType,
	documentVisibility,
	documentFileId,
	requirePublic,
	isExternalContext,
	idTag: idTagProp,
	selectedFile,
	onSelect,
	onDoubleClick
}: MediaPickerBrowseTabProps) {
	const { t } = useTranslation()
	const { api: defaultApi } = useApi()
	const [auth] = useAuth()
	const toast = useToast()
	const dialog = useDialog()
	const { getClientFor } = useApiContext()
	const activeContext = useAtomValue(activeContextAtom)
	const contextRoles = useAtomValue(contextRolesAtom)
	// Memoized: with no token registered for `idTagProp`, `getClientFor`'s
	// 'preferred' fallback returns a FRESH anonymous client on every call (that is
	// how it guarantees anonymity), and this `api` is a dep of the descriptor
	// effect below — unmemoized it refires that request on every render.
	// `contextRoles` is written in the same tick as the token, so the memo cannot
	// freeze an anonymous client past the arrival of a real one.
	const api = React.useMemo(
		() =>
			// Explicit: the user opened a picker aimed at that tenant's media.
			(idTagProp
				? getClientFor(idTagProp, { auth: 'preferred', explicit: true })
				: defaultApi) || defaultApi,
		[idTagProp, defaultApi, getClientFor, contextRoles]
	)
	const idTag = idTagProp || auth?.idTag || defaultApi?.idTag

	// Roles we hold on the node this picker browses — the same node the grant/visibility calls below
	// will hit. On our own node the session token always carries the full owner role set. 'leader'
	// short-circuits canManageShares ahead of every ownership test, deliberately: it mirrors the
	// backend's own is_leader short-circuit (crates/cloudillo-file/src/share.rs), so a leader may
	// re-share anything their node serves, pinned foreign-owned copies included.
	const browseRoles = React.useMemo(() => {
		if (!idTag) return []
		if (idTag === auth?.idTag) return ['leader']
		if (activeContext?.idTag === idTag) return activeContext.roles ?? []
		return contextRoles.get(idTag) ?? []
	}, [idTag, auth?.idTag, activeContext, contextRoles])

	/**
	 * Whether the lock overlay's action can actually succeed for this file.
	 * Granting document access creates a share entry (share-manager standing);
	 * "Make public" is a visibility change (the looser file-manage rule). In
	 * `requirePublic` mode the action is always "Make public", document or not.
	 */
	const canUnlock = useCallback(
		(file: FileView) =>
			documentFileId && !requirePublic
				? canManageShares(file, auth?.idTag, browseRoles)
				: canManageFile(file, auth?.idTag, browseRoles),
		[documentFileId, requirePublic, auth?.idTag, browseRoles]
	)

	const {
		viewMode,
		setViewMode,
		searchQuery,
		setSearchQuery,
		selectedTags,
		setSelectedTags,
		tags,
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
		connectedFileIds: accessibleFileIds,
		setConnectedFileIds: setAccessibleFileIds,
		refetch: refetchFiles
	} = usePickerBrowse({
		api,
		contextFileId: documentFileId,
		contentType: mediaType // server-side type filter (e.g. 'image/*')
	})

	// Visibility state
	const [resolvedDocVisibility, setResolvedDocVisibility] = useState<Visibility | undefined>(
		documentVisibility
	)
	const [showVisibilityWarning, setShowVisibilityWarning] = useState(false)

	// Track which file is currently being updated (for loading state)
	const [updatingFileId, setUpdatingFileId] = useState<string | null>(null)
	// Resolve document visibility from fileId if needed
	useEffect(() => {
		if (documentVisibility) {
			setResolvedDocVisibility(documentVisibility)
			return
		}

		if (!documentFileId || !api) return

		let cancelled = false
		;(async function () {
			try {
				// The descriptor carries renditions only; `/metadata` is the answer that
				// includes `visibility`. A file's level is wider than this picker's
				// three-rung ladder, so anything outside it folds onto the most
				// restrictive rung.
				const { visibility } = await api.files.getMetadata(documentFileId)
				if (!cancelled) {
					setResolvedDocVisibility(
						visibility === 'P' || visibility === 'C' ? visibility : 'F'
					)
				}
			} catch {
				// Visibility check is optional
			}
		})()

		return () => {
			cancelled = true
		}
	}, [api, documentFileId, documentVisibility])

	// Filter files by media type
	const filteredFiles = files.filter((file) => matchesMediaType(file, mediaType))

	// A file this picker must not hand back. In `requirePublic` mode an existing
	// share is irrelevant — it grants the document, not the anonymous web reader —
	// so only 'P' passes, whatever the file is already shared with.
	const isBlocked = useCallback(
		(file: FileView) =>
			requirePublic
				? !isPublicFile(file)
				: !!isExternalContext &&
					!isPublicFile(file) &&
					!accessibleFileIds.has(file.entryId),
		[requirePublic, isExternalContext, accessibleFileIds]
	)

	// Handle folder navigation
	const handleFolderClick = useCallback(
		(file: FileView) => {
			setCurrentFolderId(file.entryId)
			setBreadcrumbs((prev) => [...prev, { id: file.entryId, name: file.fileName }])
		},
		[setCurrentFolderId, setBreadcrumbs]
	)

	// Handle breadcrumb navigation
	const handleBreadcrumbClick = useCallback(
		(index: number) => {
			const newBreadcrumbs = breadcrumbs.slice(0, index + 1)
			setBreadcrumbs(newBreadcrumbs)
			setCurrentFolderId(newBreadcrumbs[newBreadcrumbs.length - 1].id)
		},
		[breadcrumbs, setBreadcrumbs, setCurrentFolderId]
	)

	// Handle file selection
	const handleFileClick = useCallback(
		(file: FileView) => {
			if (file.fileTp === 'FLDR') {
				handleFolderClick(file)
				return
			}

			if (isBlocked(file)) return

			// Get actual file visibility from API response
			const fileVisibility: Visibility = (file.visibility as Visibility) || 'F'
			const needsWarning =
				resolvedDocVisibility &&
				VISIBILITY_ORDER[fileVisibility] > VISIBILITY_ORDER[resolvedDocVisibility]

			const result: MediaPickerResult = {
				fileId: file.fileId,
				fileName: file.fileName,
				contentType: file.contentType,
				dim: file.x?.dim,
				visibility: fileVisibility,
				visibilityAcknowledged: false
			}

			if (needsWarning) {
				setShowVisibilityWarning(true)
			}

			onSelect(result)
		},
		[handleFolderClick, onSelect, resolvedDocVisibility, isBlocked]
	)

	// Handle double click
	const handleFileDoubleClick = useCallback(
		(file: FileView) => {
			if (file.fileTp === 'FLDR') {
				handleFolderClick(file)
				return
			}

			if (isBlocked(file)) return

			const fileVisibility: Visibility = (file.visibility as Visibility) || 'F'
			const result: MediaPickerResult = {
				fileId: file.fileId,
				fileName: file.fileName,
				contentType: file.contentType,
				dim: file.x?.dim,
				visibility: fileVisibility,
				visibilityAcknowledged: showVisibilityWarning
			}

			onDoubleClick(result)
		},
		[handleFolderClick, onDoubleClick, showVisibilityWarning, isBlocked]
	)

	// Acknowledge visibility warning
	const handleAcknowledgeWarning = useCallback(() => {
		if (selectedFile) {
			onSelect({
				...selectedFile,
				visibilityAcknowledged: true
			})
		}
		setShowVisibilityWarning(false)
	}, [selectedFile, onSelect])

	// Handle "Grant document access" action for a file (creates share entry)
	const handleGrantDocumentAccess = useCallback(
		async (fileId: string, entryId: string, fileName: string, contentType: string) => {
			if (!api || !documentFileId) return

			setUpdatingFileId(fileId)
			try {
				await api.files.createShare(entryId, {
					subjectType: 'F',
					subjectId: documentFileId,
					permission: 'R'
				})

				// Track that this file is now accessible
				setAccessibleFileIds((prev) => new Set(prev).add(entryId))

				// Auto-select the file that was just granted access
				const fileVisibility: Visibility =
					(files.find((f) => f.fileId === fileId)?.visibility as Visibility) || 'F'
				if (selectedFile?.fileId === fileId) {
					setShowVisibilityWarning(false)
					onSelect({
						...selectedFile,
						visibilityAcknowledged: true
					})
				} else {
					onSelect({
						fileId,
						fileName,
						contentType,
						visibility: fileVisibility,
						visibilityAcknowledged: true
					})
				}
			} catch (err) {
				console.error('Failed to grant document access:', err)
				// Swallowed, this leaves the file selectable and the resulting
				// embed unreadable for everyone else.
				toast.error(
					isPermissionError(err)
						? t('You do not have permission to share this file.')
						: err instanceof Error
							? err.message
							: t('Failed to grant document access')
				)
			} finally {
				setUpdatingFileId(null)
			}
		},
		[api, documentFileId, files, selectedFile, onSelect, setAccessibleFileIds, toast, t]
	)

	// Handle "Make Public" action for a file
	const handleMakePublic = useCallback(
		async (fileId: string, entryId: string, fileName: string, contentType: string) => {
			if (!api) return

			setUpdatingFileId(fileId)
			try {
				await api.files.update(entryId, { visibility: 'P' })

				// Refetch files to update the list
				refetchFiles()

				// If this was from the warning banner, dismiss it and update selection
				if (selectedFile?.fileId === fileId) {
					setShowVisibilityWarning(false)
					onSelect({
						...selectedFile,
						visibility: 'P',
						visibilityAcknowledged: true
					})
				} else {
					// Auto-select the file that was just made public
					onSelect({
						fileId,
						fileName,
						contentType,
						visibility: 'P',
						visibilityAcknowledged: false
					})
				}
			} catch (err) {
				console.error('Failed to update file visibility:', err)
				// Speaks up for the same reason as handleGrantDocumentAccess above: both are
				// dispatched from the same lock overlay via handleFileAccessAction, so on the
				// non-document (avatar / media selection) path a swallowed failure would just clear
				// the spinner and leave the file quietly private.
				toast.error(
					isPermissionError(err)
						? t('You do not have permission to change this file’s visibility.')
						: err instanceof Error
							? err.message
							: t('Failed to update file visibility')
				)
			} finally {
				setUpdatingFileId(null)
			}
		},
		[api, refetchFiles, selectedFile, onSelect, toast, t]
	)

	// Unified handler for file access action (grant document access or make public)
	const handleFileAccessAction = useCallback(
		(fileId: string, fileName: string, contentType: string) => {
			// Shares and updates live on entries; the handlers stay keyed by content id for onSelect
			const entryId = files.find((f) => f.fileId === fileId)?.entryId ?? fileId
			if (documentFileId && !requirePublic) {
				handleGrantDocumentAccess(fileId, entryId, fileName, contentType)
			} else {
				handleMakePublic(fileId, entryId, fileName, contentType)
			}
		},
		[files, documentFileId, requirePublic, handleGrantDocumentAccess, handleMakePublic]
	)

	const fileAccessActionLabel =
		documentFileId && !requirePublic ? t('Grant access') : t('Make public')

	const handleUnlockClick = useCallback(
		async (file: FileView) => {
			const ok = await dialog.confirm(
				fileAccessActionLabel,
				documentFileId && !requirePublic
					? t('Let readers of this document see {{name}}?', { name: file.fileName })
					: t('Make {{name}} public? Anyone will be able to see it.', {
							name: file.fileName
						}),
				{ confirmLabel: fileAccessActionLabel }
			)
			if (ok) handleFileAccessAction(file.fileId, file.fileName, file.contentType)
		},
		[dialog, fileAccessActionLabel, documentFileId, requirePublic, handleFileAccessAction, t]
	)

	return (
		<VBox gap={2} fill>
			<PickerFilterBar
				viewMode={viewMode}
				onViewModeChange={setViewMode}
				searchQuery={searchQuery}
				onSearchQueryChange={setSearchQuery}
				selectedTags={selectedTags}
				onTagFilter={setSelectedTags}
				contextFileId={documentFileId}
				showManaged
				searchPlaceholder={t('Search files...')}
				tags={tags}
			/>

			{viewMode === 'browse' && (
				<Breadcrumbs
					items={breadcrumbs.map((crumb, index) => ({
						label: index === 0 ? t('Home') : crumb.name,
						icon: index === 0 ? <IcHome /> : undefined,
						onClick: () => handleBreadcrumbClick(index)
					}))}
				/>
			)}

			{showVisibilityWarning && selectedFile && (
				<Alert
					color="warning"
					title={t('Visibility mismatch')}
					actions={
						<>
							<Button size="sm" onClick={() => setShowVisibilityWarning(false)}>
								{t('Cancel')}
							</Button>
							<Button
								size="sm"
								color="primary"
								loading={updatingFileId === selectedFile.fileId}
								onClick={() =>
									handleFileAccessAction(
										selectedFile.fileId,
										selectedFile.fileName,
										selectedFile.contentType
									)
								}
							>
								{fileAccessActionLabel}
							</Button>
							<Button size="sm" onClick={handleAcknowledgeWarning}>
								{t('Use anyway')}
							</Button>
						</>
					}
				>
					{t(
						'This file is {{visibility}}. Some viewers may not be able to see this media.',
						{
							visibility: t(
								getVisibilityLabel(selectedFile.visibility as FileVisibility)
							)
						}
					)}
				</Alert>
			)}

			{loading ? (
				<LoadingSpinner fill />
			) : error ? (
				<EmptyState icon={<IcFile />} title={error} fill />
			) : filteredFiles.length === 0 ? (
				<EmptyState icon={<IcFile />} title={t('No files found')} fill />
			) : (
				<VBox gap={2} fill scroll>
					<Grid min="7.5rem" gap={2}>
						{filteredFiles.map((file) => {
							const isFolder = file.fileTp === 'FLDR'
							// Non-public in an external context (folders always navigate)
							const isFileDisabled = isBlocked(file) && !isFolder
							const visibilityIcon = getVisibilityIcon(file.visibility ?? null)
							// Offering an action the server will refuse just
							// produces a broken embed — show the lock inert.
							const unlockable = canUnlock(file)

							return (
								<VBox
									key={file.entryId}
									onDoubleClick={() => handleFileDoubleClick(file)}
								>
									<FileTile
										name={file.fileName}
										contentType={
											isFolder ? 'cloudillo/folder' : file.contentType
										}
										src={
											isImage(file) && idTag
												? getFileUrl(idTag, file.fileId, 'vis.tn')
												: undefined
										}
										selected={selectedFile?.fileId === file.fileId}
										onClick={() => handleFileClick(file)}
										meta={
											isFileDisabled ? (
												<IconText icon={<IcLock />}>
													{unlockable ? t('Not shared') : t('No access')}
												</IconText>
											) : (
												visibilityIcon &&
												!isFolder && (
													<IconText icon={visibilityIcon}>
														{t(
															getVisibilityLabel(
																file.visibility ?? null
															)
														)}
													</IconText>
												)
											)
										}
										actions={
											isFileDisabled && (
												<Button
													size="sm"
													icon={<IcLock />}
													loading={updatingFileId === file.fileId}
													disabled={!unlockable}
													disabledReason={t(
														'You do not have permission to share this file.'
													)}
													onClick={() => handleUnlockClick(file)}
												>
													{fileAccessActionLabel}
												</Button>
											)
										}
									/>
								</VBox>
							)
						})}
					</Grid>
					<LoadMoreTrigger
						ref={sentinelRef}
						isLoading={isLoadingMore}
						hasMore={hasMore}
						error={loadMoreError}
						errorPrefix={t('Failed to load more')}
						onRetry={loadMore}
					/>
				</VBox>
			)}
		</VBox>
	)
}

// vim: ts=4
