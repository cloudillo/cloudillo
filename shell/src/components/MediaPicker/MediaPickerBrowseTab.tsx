// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
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
 * MediaPickerBrowseTab Component
 *
 * File browsing tab for the media picker.
 * Allows users to search and navigate through their files.
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import {
	LuSearch as IcSearch,
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
	LuGlobe as IcPublic,
	LuUserPlus as IcFollowers,
	LuUserCheck as IcConnected,
	LuChevronDown as IcChevronDown
} from 'react-icons/lu'

import { useApi, useAuth, type AuthState } from '@cloudillo/react'
import { getFileUrl } from '@cloudillo/core'
import { VISIBILITY_ORDER, type Visibility } from '@cloudillo/core'

import type { MediaPickerResult } from '../../context/media-picker-atom.js'

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
		case 'P':
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

// Visibility filter options for the dropdown
type VisibilityFilter = FileVisibility | 'all'

// Simplified file type for MediaPicker - only the fields we need
interface MediaFile {
	fileId: string
	fileName: string
	fileTp?: string
	contentType: string
	visibility?: FileVisibility
	x?: {
		dim?: [number, number]
	}
}

interface BreadcrumbItem {
	id: string | null
	name: string
}

interface MediaPickerBrowseTabProps {
	mediaType?: string
	documentVisibility?: Visibility
	documentFileId?: string
	isExternalContext?: boolean // True when opened from external app
	selectedFile: MediaPickerResult | null
	onSelect: (file: MediaPickerResult) => void
	onDoubleClick: (file: MediaPickerResult) => void
}

/**
 * Visibility filter options for the dropdown
 */
const VISIBILITY_FILTER_OPTIONS: Array<{
	value: VisibilityFilter
	labelKey: string
	icon: React.ComponentType<{ className?: string }>
}> = [
	{ value: 'all', labelKey: 'All', icon: IcFile },
	{ value: 'P', labelKey: 'Public', icon: IcPublic },
	{ value: 'F', labelKey: 'Followers', icon: IcFollowers },
	{ value: 'C', labelKey: 'Connected', icon: IcConnected }
]

/**
 * Get visibility filter option by value
 */
function getVisibilityFilterOption(value: VisibilityFilter) {
	return (
		VISIBILITY_FILTER_OPTIONS.find((opt) => opt.value === value) || VISIBILITY_FILTER_OPTIONS[0]
	)
}

/**
 * Check if a file is public (can be used in external context)
 */
function isPublicFile(file: MediaFile): boolean {
	return file.visibility === 'P'
}

/**
 * Check if a file matches the media type filter
 */
function matchesMediaType(file: MediaFile, mediaType?: string): boolean {
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
function getFileIcon(file: MediaFile): React.ReactNode {
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
function isImage(file: MediaFile): boolean {
	const contentType = file.contentType || ''
	return contentType.startsWith('image/')
}

export function MediaPickerBrowseTab({
	mediaType,
	documentVisibility,
	documentFileId,
	isExternalContext,
	selectedFile,
	onSelect,
	onDoubleClick
}: MediaPickerBrowseTabProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()
	const idTag = auth?.idTag || api?.idTag

	// State
	const [searchQuery, setSearchQuery] = useState('')
	const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
	const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
		{ id: null, name: t('Home') }
	])
	const [files, setFiles] = useState<MediaFile[]>([])
	const [loading, setLoading] = useState(true)
	const [resolvedDocVisibility, setResolvedDocVisibility] = useState<Visibility | undefined>(
		documentVisibility
	)
	const [showVisibilityWarning, setShowVisibilityWarning] = useState(false)
	// Visibility filter: default to 'P' (Public) for external context, 'all' for internal
	const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>(
		isExternalContext ? 'P' : 'all'
	)
	const [showVisibilityDropdown, setShowVisibilityDropdown] = useState(false)
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

	// Fetch files when folder changes
	useEffect(() => {
		async function fetchFiles() {
			if (!api) return

			setLoading(true)
			try {
				const query: Record<string, unknown> = {
					parentId: currentFolderId || undefined
				}
				if (searchQuery) {
					query.fileName = searchQuery
				}

				const result = await api.files.list(query as Parameters<typeof api.files.list>[0])
				setFiles(result || [])
			} catch (err) {
				console.error('Failed to fetch files:', err)
				setFiles([])
			} finally {
				setLoading(false)
			}
		}

		fetchFiles()
	}, [api, currentFolderId, searchQuery])

	// Resolve document visibility from fileId if needed
	useEffect(() => {
		async function fetchDocumentVisibility() {
			if (documentVisibility) {
				setResolvedDocVisibility(documentVisibility)
				return
			}

			// Skip visibility check if no documentFileId provided
			// This is common for new documents that haven't been saved yet
			if (!documentFileId || !api) return

			try {
				const fileInfo = await api.files.getDescriptor(documentFileId)
				// Map accessLevel to visibility (simplified - in real app would need proper mapping)
				// For now, assume 'read' = 'F' (followers), 'write' = 'F', 'none' = 'P' (public)
				// This is a placeholder - actual visibility would come from file metadata
				setResolvedDocVisibility('F')
			} catch {
				// Silently ignore - visibility check is optional
				// This can fail for new documents or if the API doesn't support this endpoint
			}
		}

		fetchDocumentVisibility()
	}, [api, documentFileId, documentVisibility])

	// Filter files by media type and visibility
	const filteredFiles = files.filter((file) => {
		// Always check media type
		if (!matchesMediaType(file, mediaType)) return false
		// Always show folders regardless of visibility filter
		if (file.fileTp === 'FLDR') return true
		// Apply visibility filter
		if (visibilityFilter === 'all') return true
		return file.visibility === visibilityFilter
	})

	// Handle folder navigation
	const handleFolderClick = useCallback((file: MediaFile) => {
		setCurrentFolderId(file.fileId)
		setBreadcrumbs((prev) => [...prev, { id: file.fileId, name: file.fileName }])
	}, [])

	// Handle breadcrumb navigation
	const handleBreadcrumbClick = useCallback(
		(index: number) => {
			setBreadcrumbs((prev) => prev.slice(0, index + 1))
			setCurrentFolderId((prev) => {
				const newBreadcrumbs = breadcrumbs.slice(0, index + 1)
				return newBreadcrumbs[newBreadcrumbs.length - 1].id
			})
		},
		[breadcrumbs]
	)

	// Handle file selection
	const handleFileClick = useCallback(
		(file: MediaFile) => {
			if (file.fileTp === 'FLDR') {
				handleFolderClick(file)
				return
			}

			// Check if file is disabled (non-public in external context)
			// Disabled files are handled by the lock overlay click, not here
			const isDisabled = isExternalContext && !isPublicFile(file)
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
		[handleFolderClick, onSelect, resolvedDocVisibility, isExternalContext]
	)

	// Handle double click
	const handleFileDoubleClick = useCallback(
		(file: MediaFile) => {
			if (file.fileTp === 'FLDR') {
				handleFolderClick(file)
				return
			}

			// Check if file is disabled (non-public in external context)
			const isDisabled = isExternalContext && !isPublicFile(file)
			if (isDisabled) {
				// Don't allow selection of disabled files
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
		[handleFolderClick, onDoubleClick, showVisibilityWarning, isExternalContext]
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

	// Handle visibility filter change
	const handleVisibilityFilterChange = useCallback((value: VisibilityFilter) => {
		setVisibilityFilter(value)
		setShowVisibilityDropdown(false)
	}, [])

	// Refetch files (used after visibility change)
	const refetchFiles = useCallback(async () => {
		if (!api) return

		setLoading(true)
		try {
			const query: Record<string, unknown> = {
				parentId: currentFolderId || undefined
			}
			if (searchQuery) {
				query.fileName = searchQuery
			}

			const result = await api.files.list(query as Parameters<typeof api.files.list>[0])
			setFiles(result || [])
		} catch (err) {
			console.error('Failed to fetch files:', err)
		} finally {
			setLoading(false)
		}
	}, [api, currentFolderId, searchQuery])

	// Handle "Make Public" action for a file
	const handleMakePublic = useCallback(
		async (fileId: string, fileName: string, contentType: string) => {
			if (!api) return

			setUpdatingFileId(fileId)
			try {
				await api.files.update(fileId, { visibility: 'P' })

				// Refetch files to update the list
				await refetchFiles()

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
				// Could add toast notification here
			} finally {
				setUpdatingFileId(null)
			}
		},
		[api, refetchFiles, selectedFile, onSelect]
	)

	const currentFilterOption = getVisibilityFilterOption(visibilityFilter)
	const FilterIcon = currentFilterOption.icon

	return (
		<div className="media-picker-browse">
			{/* Search and visibility filter */}
			<div className="media-picker-search">
				<div className="c-input-group">
					<span className="c-input-addon">
						<IcSearch />
					</span>
					<input
						type="text"
						className="c-input"
						placeholder={t('Search files...')}
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
					/>
				</div>
				{/* Visibility filter dropdown */}
				<div className="media-picker-visibility-filter">
					<button
						type="button"
						className="c-button ghost small"
						onClick={() => setShowVisibilityDropdown(!showVisibilityDropdown)}
						title={t('Filter by visibility')}
					>
						<FilterIcon />
						<span>{t(currentFilterOption.labelKey)}</span>
						<IcChevronDown />
					</button>
					{showVisibilityDropdown && (
						<div className="media-picker-visibility-dropdown">
							{VISIBILITY_FILTER_OPTIONS.map((opt) => {
								const OptionIcon = opt.icon
								return (
									<button
										key={opt.value ?? 'all'}
										type="button"
										className={`media-picker-visibility-option ${visibilityFilter === opt.value ? 'active' : ''}`}
										onClick={() => handleVisibilityFilterChange(opt.value)}
									>
										<OptionIcon />
										<span>{t(opt.labelKey)}</span>
									</button>
								)
							})}
						</div>
					)}
				</div>
			</div>

			{/* Breadcrumbs */}
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
									handleMakePublic(
										selectedFile.fileId,
										selectedFile.fileName,
										selectedFile.contentType
									)
								}
								disabled={updatingFileId === selectedFile.fileId}
							>
								{updatingFileId === selectedFile.fileId
									? t('Updating...')
									: t('Make Public')}
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
								isExternalContext && !isPublicFile(file) && file.fileTp !== 'FLDR'
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
												title={t('Click to make public')}
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
																	handleMakePublic(
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
																	handleMakePublic(
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
															{t('Make public')}
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
