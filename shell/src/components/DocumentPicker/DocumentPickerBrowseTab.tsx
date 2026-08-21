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
import { LoadMoreTrigger, useApi, useAuth, useToast } from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuChevronRight as IcChevronRight,
	LuFileText as IcDocument,
	LuHouse as IcHome
} from 'react-icons/lu'

import { getFileIcon } from '../../apps/files/icons.js'
import { canManageFile, scopeFileToTenant } from '../../apps/files/utils.js'
import type { DocPickerResult } from '../../context/doc-picker-atom.js'
import { activeContextAtom, contextRolesAtom, useApiContext } from '../../context/index.js'
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
	idTag?: string
	selectedFile: DocPickerResult | null
	onSelect: (file: DocPickerResult) => void
	onDoubleClick: (file: DocPickerResult) => void
}

/**
 * Resolve app ID from content type using MIME mapping
 */
function resolveAppId(contentType: string, mime: Record<string, string>): string | undefined {
	const path = mime[contentType]
	if (!path) return undefined
	// Extract app ID from path like '/app/quillo'
	const match = path.match(/^\/app\/(.+)$/)
	return match?.[1]
}

export function DocumentPickerBrowseTab({
	fileTp,
	contentType,
	sourceFileId,
	requirePublic,
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
		files,
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

	// A document this picker must not hand back.
	const isBlocked = useCallback(
		(file: FileView) => !!requirePublic && file.visibility !== 'P' && file.fileTp !== 'FLDR',
		[requirePublic]
	)

	// Offering an action the server will refuse just produces a dead embed.
	const canUnlock = useCallback(
		(file: FileView) =>
			canManageFile(scopeFileToTenant(file, auth?.idTag, idTag), auth?.idTag, browseRoles),
		[auth?.idTag, idTag, browseRoles]
	)

	// Never automatic: the author asks for it per document, on a file they own.
	const handleMakePublic = useCallback(
		async (file: FileView) => {
			if (!api) return

			setUpdatingFileId(file.fileId)
			try {
				await api.files.update(file.fileId, { visibility: 'P' })
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
			setCurrentFolderId(file.fileId)
			setBreadcrumbs((prev) => [...prev, { id: file.fileId, name: file.fileName }])
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
				fileName: file.fileName,
				contentType: file.contentType,
				fileTp: file.fileTp,
				appId
			})
		},
		[handleFolderClick, onSelect, appConfig?.mime, isBlocked]
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
				fileName: file.fileName,
				contentType: file.contentType,
				fileTp: file.fileTp,
				appId
			})
		},
		[handleFolderClick, onDoubleClick, appConfig?.mime, isBlocked]
	)

	return (
		<div className="doc-picker-browse">
			{/* Filter bar */}
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

			{/* Breadcrumbs (only in browse mode) */}
			{viewMode === 'browse' && (
				<div className="doc-picker-breadcrumbs">
					{breadcrumbs.map((crumb, index) => (
						<React.Fragment key={crumb.id ?? 'home'}>
							{index > 0 && <IcChevronRight size={14} />}
							<button type="button" onClick={() => handleBreadcrumbClick(index)}>
								{index === 0 ? <IcHome size={14} /> : crumb.name}
							</button>
						</React.Fragment>
					))}
				</div>
			)}

			{/* File grid */}
			<div className="doc-picker-files">
				{loading ? (
					<div className="doc-picker-loading">
						<span>{t('Loading...')}</span>
					</div>
				) : error ? (
					<div className="doc-picker-empty">
						<IcDocument />
						<span>{error}</span>
					</div>
				) : files.length === 0 ? (
					<div className="doc-picker-empty">
						<IcDocument />
						<span>{t('No documents found')}</span>
					</div>
				) : (
					<>
						<div className="doc-picker-grid">
							{files.map((file) => {
								const blocked = isBlocked(file)
								const unlockable = blocked && canUnlock(file)
								const isUpdating = updatingFileId === file.fileId

								return (
									<div
										key={file.fileId}
										className={`doc-picker-item ${
											selectedFile?.fileId === file.fileId ? 'selected' : ''
										} ${blocked ? 'disabled' : ''}`}
										onClick={() => handleFileClick(file)}
										onDoubleClick={() => handleFileDoubleClick(file)}
										title={
											blocked
												? t(
														'Only public documents can be embedded in a site page.'
													)
												: undefined
										}
									>
										<div className="doc-picker-item-icon">
											{React.createElement(
												getFileIcon(file.contentType, file.fileTp)
											)}
										</div>
										<span className="doc-picker-item-name">
											{file.fileName}
										</span>
										{blocked && (
											<button
												type="button"
												className="c-button small doc-picker-item-unlock"
												disabled={!unlockable || isUpdating}
												title={
													unlockable
														? undefined
														: t(
																'You do not have permission to change this file’s visibility.'
															)
												}
												onClick={(e) => {
													e.stopPropagation()
													handleMakePublic(file)
												}}
											>
												{isUpdating ? t('Updating...') : t('Make public')}
											</button>
										)}
									</div>
								)
							})}
						</div>
						<LoadMoreTrigger
							ref={sentinelRef}
							isLoading={isLoadingMore}
							hasMore={hasMore}
							error={loadMoreError}
							errorPrefix={t('Failed to load more')}
							onRetry={loadMore}
						/>
					</>
				)}
			</div>
		</div>
	)
}

// vim: ts=4
