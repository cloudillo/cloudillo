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
import { LoadMoreTrigger, useApi } from '@cloudillo/react'
import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuChevronRight as IcChevronRight,
	LuFileText as IcDocument,
	LuHouse as IcHome
} from 'react-icons/lu'

import { getFileIcon } from '../../apps/files/icons.js'
import type { DocPickerResult } from '../../context/doc-picker-atom.js'
import { useApiContext } from '../../context/index.js'
import { useAppConfig } from '../../utils.js'
import { PickerFilterBar, usePickerBrowse } from '../pickers/index.js'

interface DocumentPickerBrowseTabProps {
	fileTp?: string
	contentType?: string
	sourceFileId?: string
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
	idTag: idTagProp,
	selectedFile,
	onSelect,
	onDoubleClick
}: DocumentPickerBrowseTabProps) {
	const { t } = useTranslation()
	const { api: defaultApi } = useApi()
	const { getClientFor } = useApiContext()
	const api =
		(idTagProp ? getClientFor(idTagProp, { auth: 'preferred' }) : defaultApi) || defaultApi
	const [appConfig] = useAppConfig()

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
		loadMoreError
	} = usePickerBrowse({
		api,
		contextFileId: sourceFileId,
		fileTp: docFileTp,
		contentType,
		localOnly: true // tenant-owned files only (remote can't be embedded)
	})

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
		[handleFolderClick, onSelect, appConfig?.mime]
	)

	// Handle double click
	const handleFileDoubleClick = useCallback(
		(file: FileView) => {
			if (file.fileTp === 'FLDR') {
				handleFolderClick(file)
				return
			}

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
		[handleFolderClick, onDoubleClick, appConfig?.mime]
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
							{files.map((file) => (
								<div
									key={file.fileId}
									className={`doc-picker-item ${
										selectedFile?.fileId === file.fileId ? 'selected' : ''
									}`}
									onClick={() => handleFileClick(file)}
									onDoubleClick={() => handleFileDoubleClick(file)}
								>
									<div className="doc-picker-item-icon">
										{React.createElement(
											getFileIcon(file.contentType, file.fileTp)
										)}
									</div>
									<span className="doc-picker-item-name">{file.fileName}</span>
								</div>
							))}
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
