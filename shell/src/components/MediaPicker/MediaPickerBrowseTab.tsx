// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * MediaPickerBrowseTab Component
 *
 * File browsing tab for the media picker.
 * Allows users to search, filter, and navigate through their files.
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import {
	LuFolder as IcFolder,
	LuChevronRight as IcChevronRight,
	LuHouse as IcHome,
	LuImage as IcImage,
	LuVideo as IcVideo,
	LuMusic as IcAudio,
	LuFileText as IcDocument,
	LuFile as IcFile,
	LuTriangleAlert as IcWarning,
	LuLock as IcLock,
	LuCheck as IcCheck,
	LuX as IcX,
	LuUserPlus as IcFollowers,
	LuUserCheck as IcConnected
} from 'react-icons/lu'

import { useApi, useAuth } from '@cloudillo/react'
import { useApiContext } from '../../context/index.js'
import { getFileUrl } from '@cloudillo/core'
import { VISIBILITY_ORDER, type Visibility } from '@cloudillo/core'
import type { FileView } from '@cloudillo/core'

import type { MediaPickerResult } from '../../context/media-picker-atom.js'
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
 * Get icon for file type
 */
function getFileIcon(file: FileView): React.ReactNode {
	if (file.fileTp === 'FLDR') return <IcFolder />
	const contentType = file.contentType || ''
	if (contentType.startsWith('image/')) return <IcImage />
	if (contentType.startsWith('video/')) return <IcVideo />
	if (contentType.startsWith('audio/')) return <IcAudio />
	if (contentType === 'application/pdf') return <IcDocument />
	return <IcFile />
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
	isExternalContext,
	idTag: idTagProp,
	selectedFile,
	onSelect,
	onDoubleClick
}: MediaPickerBrowseTabProps) {
	const { t } = useTranslation()
	const { api: defaultApi } = useApi()
	const [auth] = useAuth()
	const { getClientFor } = useApiContext()
	const api =
		(idTagProp ? getClientFor(idTagProp, { auth: 'required' }) : defaultApi) || defaultApi
	const idTag = idTagProp || auth?.idTag || defaultApi?.idTag

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
		connectedFileIds: accessibleFileIds,
		setConnectedFileIds: setAccessibleFileIds,
		refetch: refetchFiles
	} = usePickerBrowse({ api, contextFileId: documentFileId })

	// Visibility state
	const [resolvedDocVisibility, setResolvedDocVisibility] = useState<Visibility | undefined>(
		documentVisibility
	)
	const [showVisibilityWarning, setShowVisibilityWarning] = useState(false)

	// Track which file is currently being updated (for loading state)
	const [updatingFileId, setUpdatingFileId] = useState<string | null>(null)
	// Track which file is awaiting confirmation and which side is confirm (vertical split)
	const [confirmingFile, setConfirmingFile] = useState<{
		id: string
		confirmSide: 'top' | 'bottom'
	} | null>(null)

	// Auto-reset confirmation state after 3 seconds
	useEffect(() => {
		if (!confirmingFile) return

		const timeout = setTimeout(() => {
			setConfirmingFile(null)
		}, 3000)

		return () => clearTimeout(timeout)
	}, [confirmingFile])

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
				const fileInfo = await api.files.getDescriptor(documentFileId)
				const file = fileInfo.file as Record<string, unknown> | undefined
				if (!cancelled) setResolvedDocVisibility((file?.visibility as Visibility) || 'F')
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

			// Check if file is disabled (non-public in external context)
			const isDisabled =
				isExternalContext && !isPublicFile(file) && !accessibleFileIds.has(file.fileId)
			if (isDisabled) {
				return
			}

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
		[handleFolderClick, onSelect, resolvedDocVisibility, isExternalContext, accessibleFileIds]
	)

	// Handle double click
	const handleFileDoubleClick = useCallback(
		(file: FileView) => {
			if (file.fileTp === 'FLDR') {
				handleFolderClick(file)
				return
			}

			// Check if file is disabled (non-public in external context)
			const isDisabled =
				isExternalContext && !isPublicFile(file) && !accessibleFileIds.has(file.fileId)
			if (isDisabled) {
				return
			}

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
		[
			handleFolderClick,
			onDoubleClick,
			showVisibilityWarning,
			isExternalContext,
			accessibleFileIds
		]
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
		async (fileId: string, fileName: string, contentType: string) => {
			if (!api || !documentFileId) return

			setUpdatingFileId(fileId)
			try {
				await api.files.createShare(fileId, {
					subjectType: 'F',
					subjectId: documentFileId,
					permission: 'R'
				})

				// Track that this file is now accessible
				setAccessibleFileIds((prev) => new Set(prev).add(fileId))

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
			} finally {
				setUpdatingFileId(null)
			}
		},
		[api, documentFileId, files, selectedFile, onSelect, setAccessibleFileIds]
	)

	// Handle "Make Public" action for a file
	const handleMakePublic = useCallback(
		async (fileId: string, fileName: string, contentType: string) => {
			if (!api) return

			setUpdatingFileId(fileId)
			try {
				await api.files.update(fileId, { visibility: 'P' })

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
			} finally {
				setUpdatingFileId(null)
			}
		},
		[api, refetchFiles, selectedFile, onSelect]
	)

	// Unified handler for file access action (grant document access or make public)
	const handleFileAccessAction = useCallback(
		(fileId: string, fileName: string, contentType: string) => {
			if (documentFileId) {
				handleGrantDocumentAccess(fileId, fileName, contentType)
			} else {
				handleMakePublic(fileId, fileName, contentType)
			}
		},
		[documentFileId, handleGrantDocumentAccess, handleMakePublic]
	)

	const fileAccessActionLabel = documentFileId ? t('Grant access') : t('Make public')

	return (
		<div className="media-picker-browse">
			{/* Filter bar */}
			<PickerFilterBar
				viewMode={viewMode}
				onViewModeChange={setViewMode}
				searchQuery={searchQuery}
				onSearchQueryChange={setSearchQuery}
				selectedTags={selectedTags}
				onTagFilter={setSelectedTags}
				contextFileId={documentFileId}
				searchPlaceholder={t('Search files...')}
				tags={tags}
			/>

			{/* Breadcrumbs (only in browse mode) */}
			{viewMode === 'browse' && (
				<div className="media-picker-breadcrumbs">
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

			{/* Visibility warning */}
			{showVisibilityWarning && selectedFile && (
				<div className="media-picker-visibility-warning">
					<IcWarning />
					<div className="media-picker-visibility-warning-content">
						<strong>{t('Visibility mismatch')}</strong>
						<p>
							{t(
								'This file is {{visibility}}. Some viewers may not be able to see this media.',
								{
									visibility: t(
										getVisibilityLabel(
											selectedFile.visibility as FileVisibility
										)
									)
								}
							)}
						</p>
						<div className="media-picker-visibility-warning-actions">
							<button
								type="button"
								className="c-button small"
								onClick={() => setShowVisibilityWarning(false)}
							>
								{t('Cancel')}
							</button>
							<button
								type="button"
								className="c-button small primary"
								onClick={() =>
									handleFileAccessAction(
										selectedFile.fileId,
										selectedFile.fileName,
										selectedFile.contentType
									)
								}
								disabled={updatingFileId === selectedFile.fileId}
							>
								{updatingFileId === selectedFile.fileId
									? t('Updating...')
									: fileAccessActionLabel}
							</button>
							<button
								type="button"
								className="c-button small"
								onClick={handleAcknowledgeWarning}
							>
								{t('Use anyway')}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* File grid */}
			<div className="media-picker-files">
				{loading ? (
					<div className="media-picker-loading">
						<span>{t('Loading...')}</span>
					</div>
				) : error ? (
					<div className="media-picker-empty">
						<IcFile />
						<span>{error}</span>
					</div>
				) : filteredFiles.length === 0 ? (
					<div className="media-picker-empty">
						<IcFile />
						<span>{t('No files found')}</span>
					</div>
				) : (
					<div className="media-picker-grid">
						{filteredFiles.map((file) => {
							// Check if file is disabled (non-public in external context, not a folder)
							const isFileDisabled =
								isExternalContext &&
								!isPublicFile(file) &&
								!accessibleFileIds.has(file.fileId) &&
								file.fileTp !== 'FLDR'
							const visibilityIcon = getVisibilityIcon(file.visibility ?? null)
							const isUpdating = updatingFileId === file.fileId
							const isConfirming = confirmingFile?.id === file.fileId
							const confirmSide = isConfirming ? confirmingFile.confirmSide : null

							return (
								<div
									key={file.fileId}
									className={`media-picker-item ${
										selectedFile?.fileId === file.fileId ? 'selected' : ''
									} ${isFileDisabled ? 'disabled' : ''}`}
									onClick={() => handleFileClick(file)}
									onDoubleClick={() => handleFileDoubleClick(file)}
								>
									<div className="media-picker-item-thumbnail">
										{isImage(file) && idTag ? (
											<img
												src={getFileUrl(idTag, file.fileId, 'vis.tn')}
												alt={file.fileName}
											/>
										) : (
											getFileIcon(file)
										)}
										{/* Interactive lock overlay with vertical split confirmation */}
										{isFileDisabled && (
											<div
												className={`media-picker-item-lock ${isUpdating ? 'loading' : ''} ${isConfirming ? 'confirming' : ''}`}
												onClick={(e) => {
													e.stopPropagation()
													if (isUpdating || isConfirming) return

													// Determine which half was clicked (vertical split)
													const rect =
														e.currentTarget.getBoundingClientRect()
													const clickY = e.clientY - rect.top
													const isTopClick = clickY < rect.height / 2

													// Confirm is on the OPPOSITE half of click
													setConfirmingFile({
														id: file.fileId,
														confirmSide: isTopClick ? 'bottom' : 'top'
													})
												}}
												title={t('Click to {{action}}', {
													action: fileAccessActionLabel
												})}
											>
												{isUpdating ? (
													<span className="media-picker-lock-spinner" />
												) : isConfirming ? (
													<div className="media-picker-lock-split">
														{/* Top half */}
														<div
															className={`media-picker-lock-half ${confirmSide === 'top' ? 'confirm' : 'cancel'}`}
															onClick={(e) => {
																e.stopPropagation()
																if (confirmSide === 'top') {
																	handleFileAccessAction(
																		file.fileId,
																		file.fileName,
																		file.contentType
																	)
																}
																setConfirmingFile(null)
															}}
														>
															{confirmSide === 'top' ? (
																<IcCheck />
															) : (
																<IcX />
															)}
															<span>
																{confirmSide === 'top'
																	? t('Confirm')
																	: t('Cancel')}
															</span>
														</div>
														{/* Bottom half */}
														<div
															className={`media-picker-lock-half ${confirmSide === 'bottom' ? 'confirm' : 'cancel'}`}
															onClick={(e) => {
																e.stopPropagation()
																if (confirmSide === 'bottom') {
																	handleFileAccessAction(
																		file.fileId,
																		file.fileName,
																		file.contentType
																	)
																}
																setConfirmingFile(null)
															}}
														>
															{confirmSide === 'bottom' ? (
																<IcCheck />
															) : (
																<IcX />
															)}
															<span>
																{confirmSide === 'bottom'
																	? t('Confirm')
																	: t('Cancel')}
															</span>
														</div>
													</div>
												) : (
													<>
														<IcLock />
														<span className="media-picker-item-lock-label">
															{fileAccessActionLabel}
														</span>
													</>
												)}
											</div>
										)}
										{/* Visibility badge for non-public files */}
										{!isFileDisabled &&
											visibilityIcon &&
											file.fileTp !== 'FLDR' && (
												<div
													className="media-picker-item-visibility"
													title={t(
														getVisibilityLabel(file.visibility ?? null)
													)}
												>
													{visibilityIcon}
												</div>
											)}
									</div>
									<span className="media-picker-item-name">{file.fileName}</span>
								</div>
							)
						})}
					</div>
				)}
			</div>
		</div>
	)
}

// vim: ts=4
