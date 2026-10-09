// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * DocumentPickerBrowseTab Component
 *
 * File browsing for the document picker.
 * Displays document files (CRDT, RTDB types) with app icons.
 * Supports Browse, Connected, Recent, and Starred view modes.
 */

import type { FileView } from '@cloudillo/core'
import {
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
	useToast,
	VBox
} from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuFileText as IcDocument, LuHouse as IcHome, LuLock as IcLock } from 'react-icons/lu'

import { resolveAppId } from '../../app-name.js'
import { canManageFile, canWrite, resolveAccessLevel } from '../../apps/files/utils.js'
import type { DocPickerResult } from '../../context/doc-picker-atom.js'
import { activeContextAtom, contextRolesAtom, useApiContext } from '../../context/index.js'
import { isEmbeddable } from '../../manifest-registry.js'
import { isPermissionError, useAppConfig } from '../../utils.js'
import { PickerFilterBar, usePickerBrowse } from '../pickers/index.js'

interface DocumentPickerBrowseTabProps {
	fileTp?: string
	contentType?: string
	sourceFileId?: string
	/**
	 * Site source: the embed is rendered live to an anonymous web reader, so only
	 * a Public document can be embedded. The fix is a visibility change, never a
	 * share — a share grants the *source* document, which that reader never holds.
	 */
	requirePublic?: boolean
	/** Hide documents no app can show as a view embed */
	embeddableOnly?: boolean
	idTag?: string
	selectedFile: DocPickerResult | null
	onSelect: (file: DocPickerResult) => void
	onDoubleClick: (file: DocPickerResult) => void
}

export function DocumentPickerBrowseTab({
	fileTp,
	contentType,
	sourceFileId,
	requirePublic,
	embeddableOnly,
	idTag: idTagProp,
	selectedFile,
	onSelect,
	onDoubleClick
}: DocumentPickerBrowseTabProps) {
	const { t } = useTranslation()
	const { api: defaultApi } = useApi()
	const [auth] = useAuth()
	const toast = useToast()
	const { getClientFor } = useApiContext()
	const activeContext = useAtomValue(activeContextAtom)
	const contextRoles = useAtomValue(contextRolesAtom)
	// Memoized: with no token registered for `idTagProp`, `getClientFor`'s
	// 'preferred' fallback returns a fresh anonymous client on every call.
	// `contextRoles` is written in the same tick as the token, so the memo cannot
	// freeze that anonymous client past the arrival of a real one.
	const api = React.useMemo(
		() =>
			// Explicit: the user opened a picker aimed at that tenant's documents.
			(idTagProp
				? getClientFor(idTagProp, { auth: 'preferred', explicit: true })
				: defaultApi) || defaultApi,
		[idTagProp, defaultApi, getClientFor, contextRoles]
	)
	const idTag = idTagProp || auth?.idTag || defaultApi?.idTag
	const [appConfig] = useAppConfig()
	const [updatingFileId, setUpdatingFileId] = useState<string | null>(null)

	// Roles we hold on the node this picker browses — the same node the visibility
	// call below will hit. Mirrors MediaPickerBrowseTab, including the 'leader'
	// short-circuit for our own node.
	const browseRoles = React.useMemo(() => {
		if (!idTag) return []
		if (idTag === auth?.idTag) return ['leader']
		if (activeContext?.idTag === idTag) return activeContext.roles ?? []
		return contextRoles.get(idTag) ?? []
	}, [idTag, auth?.idTag, activeContext, contextRoles])

	// Default to document file types so the server filters them out of the page,
	// instead of returning all files and filtering to docs in the browser.
	const docFileTp = fileTp ?? 'CRDT,RTDB'

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
		files: browsedFiles,
		loading,
		error,
		isLoadingMore,
		hasMore,
		loadMore,
		sentinelRef,
		loadMoreError,
		refetch: refetchFiles
	} = usePickerBrowse({
		api,
		contextFileId: sourceFileId,
		fileTp: docFileTp,
		contentType,
		localOnly: true // tenant-owned files only (remote can't be embedded)
	})

	const files = embeddableOnly
		? browsedFiles.filter((f) => f.fileTp === 'FLDR' || isEmbeddable(f.contentType))
		: browsedFiles

	// A document this picker must not hand back.
	const isBlocked = useCallback(
		(file: FileView) => !!requirePublic && file.visibility !== 'P' && file.fileTp !== 'FLDR',
		[requirePublic]
	)

	// Offering an action the server will refuse just produces a dead embed.
	const canUnlock = useCallback(
		(file: FileView) => canManageFile(file, auth?.idTag, browseRoles),
		[auth?.idTag, browseRoles]
	)

	// A caller may need more than "you can see it" — sharing a document to the feed is a
	// claim about a row the author can widen, so it needs write. See `canPost` in
	// `shell/src/apps/doc-info.ts`.
	const isWritable = useCallback(
		(file: FileView) => canWrite(resolveAccessLevel(file, auth?.idTag, browseRoles)),
		[auth?.idTag, browseRoles]
	)

	// Never automatic: the author asks for it per document, on a file they own.
	const handleMakePublic = useCallback(
		async (file: FileView) => {
			if (!api) return

			setUpdatingFileId(file.entryId)
			try {
				await api.files.update(file.entryId, { visibility: 'P' })
				refetchFiles()
			} catch (err) {
				console.error('Failed to update document visibility:', err)
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
		[api, refetchFiles, toast, t]
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

			const appId = appConfig?.mime
				? resolveAppId(file.contentType, appConfig.mime)
				: undefined

			onSelect({
				fileId: file.fileId,
				entryId: file.entryId,
				fileName: file.fileName,
				contentType: file.contentType,
				fileTp: file.fileTp,
				appId,
				// The node that serves the row. `localOnly: true` above means there are no
				// mirrored rows in this listing, so the browsed node is always the answer.
				srcIdTag: idTag,
				canWrite: isWritable(file),
				visibility: file.visibility
			})
		},
		[handleFolderClick, onSelect, appConfig?.mime, isBlocked, isWritable, idTag]
	)

	// Handle double click
	const handleFileDoubleClick = useCallback(
		(file: FileView) => {
			if (file.fileTp === 'FLDR') {
				handleFolderClick(file)
				return
			}

			if (isBlocked(file)) return

			const appId = appConfig?.mime
				? resolveAppId(file.contentType, appConfig.mime)
				: undefined

			onDoubleClick({
				fileId: file.fileId,
				entryId: file.entryId,
				fileName: file.fileName,
				contentType: file.contentType,
				fileTp: file.fileTp,
				appId,
				// The node that serves the row. `localOnly: true` above means there are no
				// mirrored rows in this listing, so the browsed node is always the answer.
				srcIdTag: idTag,
				canWrite: isWritable(file),
				visibility: file.visibility
			})
		},
		[handleFolderClick, onDoubleClick, appConfig?.mime, isBlocked, isWritable, idTag]
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
				contextFileId={sourceFileId}
				searchPlaceholder={t('Search documents...')}
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

			{loading ? (
				<LoadingSpinner fill />
			) : error ? (
				<EmptyState icon={<IcDocument />} title={error} fill />
			) : files.length === 0 ? (
				<EmptyState icon={<IcDocument />} title={t('No documents found')} fill />
			) : (
				<VBox gap={2} fill scroll>
					<Grid min="7.5rem" gap={2}>
						{files.map((file) => {
							const blocked = isBlocked(file)
							const unlockable = blocked && canUnlock(file)

							return (
								<VBox
									key={file.entryId}
									onDoubleClick={() => handleFileDoubleClick(file)}
								>
									<FileTile
										name={file.fileName}
										contentType={
											file.fileTp === 'FLDR'
												? 'cloudillo/folder'
												: file.contentType
										}
										selected={selectedFile?.fileId === file.fileId}
										onClick={() => handleFileClick(file)}
										meta={
											blocked && (
												<IconText icon={<IcLock />}>
													{t(
														'Only public documents can be embedded in a site page.'
													)}
												</IconText>
											)
										}
										actions={
											blocked && (
												<Button
													size="sm"
													loading={updatingFileId === file.entryId}
													disabled={!unlockable}
													disabledReason={t(
														'You do not have permission to change this file’s visibility.'
													)}
													onClick={() => handleMakePublic(file)}
												>
													{t('Make public')}
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
