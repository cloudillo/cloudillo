// This file is part of the Cloudillo Platform.
// Copyright (C) 2024-2026  Szilárd Hajba
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

/**
 * DocumentPickerBrowseTab Component
 *
 * File browsing for the document picker.
 * Displays document files (CRDT, RTDB types) with app icons.
 * Supports Browse, Connected, Recent, and Starred view modes.
 */

import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import {
	LuChevronRight as IcChevronRight,
	LuHouse as IcHome,
	LuFileText as IcDocument
} from 'react-icons/lu'

import { useApi } from '@cloudillo/react'
import { useApiContext } from '../../context/index.js'
import { useAppConfig } from '../../utils.js'
import { getFileIcon } from '../../apps/files/icons.js'
import type { FileView } from '@cloudillo/core'

import type { DocPickerResult } from '../../context/doc-picker-atom.js'
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
 * Check if a file is a document (not media)
 */
function isDocumentFile(file: FileView): boolean {
	if (file.fileTp === 'FLDR') return true
	return file.fileTp === 'CRDT' || file.fileTp === 'RTDB'
}

/**
 * Check if a file matches the filter criteria
 */
function matchesFilter(file: FileView, fileTp?: string, contentType?: string): boolean {
	if (file.fileTp === 'FLDR') return true
	if (fileTp && file.fileTp !== fileTp) return false
	if (contentType && file.contentType !== contentType) return false
	return true
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
		(idTagProp ? getClientFor(idTagProp, { auth: 'required' }) : defaultApi) || defaultApi
	const [appConfig] = useAppConfig()

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
		error
	} = usePickerBrowse({ api, contextFileId: sourceFileId })

	// Filter files to show only documents
	const filteredFiles = files.filter((file) => {
		if (!isDocumentFile(file)) return false
		return matchesFilter(file, fileTp, contentType)
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
				) : filteredFiles.length === 0 ? (
					<div className="doc-picker-empty">
						<IcDocument />
						<span>{t('No documents found')}</span>
					</div>
				) : (
					<div className="doc-picker-grid">
						{filteredFiles.map((file) => (
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
				)}
			</div>
		</div>
	)
}

// vim: ts=4
