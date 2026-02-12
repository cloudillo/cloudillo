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

import * as React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { LuFilter as IcFilter, LuCloud as IcAll } from 'react-icons/lu'

import './files.css'

import {
	useApi,
	useAuth,
	useDialog,
	Fcd,
	mergeClasses,
	LoadingSpinner,
	EmptyState,
	LoadMoreTrigger
} from '@cloudillo/react'

import { useAppConfig } from '../../utils.js'
import { useCurrentContextIdTag } from '../../context/index.js'

import {
	Sidebar,
	Toolbar,
	Breadcrumbs,
	ItemCard,
	ItemGrid,
	DetailsPanel,
	DropZone,
	UploadProgress,
	ContextMenu,
	FolderPicker,
	ShareDialog
} from './components/index.js'
import type { DisplayMode, ContextMenuPosition } from './components/index.js'
import {
	useFileList,
	useFileNavigation,
	useUploadQueue,
	useKeyboardShortcuts,
	useMultiSelect
} from './hooks/index.js'
import type { File, FileOps, ViewMode } from './types.js'
import { TRASH_FOLDER_ID } from './types.js'

export function FilesApp() {
	const navigate = useNavigate()
	const location = useLocation()
	const { t } = useTranslation()
	const [appConfig] = useAppConfig()
	const { api } = useApi()
	const [auth] = useAuth()
	const contextIdTag = useCurrentContextIdTag()
	const dialog = useDialog()

	// Navigation state
	const {
		currentFolderId,
		breadcrumbs,
		viewMode,
		navigateToFolder,
		navigateToView,
		goUp,
		enterFolder
	} = useFileNavigation()

	// Tag filter state
	const [selectedTags, setSelectedTags] = React.useState<string[]>([])

	// File list (with tag filter)
	const fileListData = useFileList({ viewMode, parentId: currentFolderId, tags: selectedTags })

	// Upload queue
	const uploadQueue = useUploadQueue({
		parentId: currentFolderId,
		onUploadComplete: fileListData.refresh
	})

	// Multi-select state
	const multiSelect = useMultiSelect({
		files: fileListData.getData() || []
	})

	// Get the first selected file for the details panel
	const selectedFile = multiSelect.getFirstSelected()

	// Rename state
	const [renameFileId, setRenameFileId] = React.useState<string | undefined>()
	const [renameFileName, setRenameFileName] = React.useState<string | undefined>()

	// Filter visibility (mobile)
	const [showFilter, setShowFilter] = React.useState<boolean>(false)

	// Display mode (grid/list)
	const [displayMode, setDisplayMode] = React.useState<DisplayMode>('list')

	// Context menu state
	const [contextMenuFile, setContextMenuFile] = React.useState<File | undefined>()
	const [contextMenuPosition, setContextMenuPosition] = React.useState<
		ContextMenuPosition | undefined
	>()

	// Move file state (supports multi-select)
	const [moveFileIds, setMoveFileIds] = React.useState<string[] | undefined>()

	// Share dialog state
	const [shareDialogFile, setShareDialogFile] = React.useState<File | undefined>()

	// Mobile details panel visibility (separate from selection)
	// On desktop (>=768px), details panel follows selection
	// On mobile (<768px), details panel only shows when explicitly requested via info button
	const [showMobileDetails, setShowMobileDetails] = React.useState<boolean>(false)

	// Reset filter on location change
	React.useEffect(
		function onLocationEffect() {
			setShowFilter(false)
		},
		[location]
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
			if (!multiSelect.isSelected(file.fileId)) {
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

	const handleMoveFiles = React.useCallback(
		async function handleMoveFiles(targetFolderId: string | null) {
			if (!api || !moveFileIds || moveFileIds.length === 0) return

			await Promise.all(
				moveFileIds.map((fileId) =>
					api.files.update(fileId, { parentId: targetFolderId || undefined })
				)
			)
			setMoveFileIds(undefined)
			multiSelect.clearSelection()
			fileListData.refresh()
		},
		[api, moveFileIds, fileListData, multiSelect]
	)

	const handleViewModeChange = React.useCallback(
		function (mode: ViewMode) {
			navigateToView(mode)
			multiSelect.clearSelection()
		},
		[navigateToView, multiSelect]
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

			await api.files.create({
				fileTp: 'FLDR',
				contentType: 'cloudillo/folder',
				fileName: folderName || t('Untitled folder'),
				parentId: currentFolderId || undefined
			})

			fileListData.refresh()
		},
		[api, dialog, t, currentFolderId, fileListData]
	)

	const handleEmptyTrash = React.useCallback(
		async function () {
			if (!api) return

			const res = await dialog.confirm(
				t('Empty trash'),
				t(
					'Are you sure you want to permanently delete all files in trash? This action cannot be undone.'
				)
			)
			if (!res) return

			await api.trash.empty()
			fileListData.refresh()
		},
		[api, dialog, t, fileListData]
	)

	const fileOps: FileOps = React.useMemo(
		() => ({
			setFile: function setFile(file: File) {
				fileListData.setFileData(file.fileId, file)
			},

			openFile: function openFile(fileId?: string, access?: 'read' | 'write') {
				const file = fileListData.getData()?.find((f) => f.fileId === fileId)
				const app = file && appConfig?.mime[file?.contentType]

				if (app) {
					const appName = app.split('/').pop()
					const basePath = `/app/${contextIdTag || auth?.idTag}/${appName}/${(file.owner?.idTag || auth?.idTag) + ':'}${file.fileId}`
					navigate(access === 'read' ? `${basePath}?access=read` : basePath)
				}
			},

			renameFile: function renameFile(fileId?: string) {
				const file = fileListData.getData()?.find((f) => f.fileId === fileId)
				setRenameFileId(fileId)
				setRenameFileName(file?.fileName || '')
			},

			setRenameFileName,

			doRenameFile: async function doRenameFile(fileId: string, fileName: string) {
				if (!api) return
				await api.files.update(fileId, { fileName })
				setRenameFileId(undefined)
				setRenameFileName(undefined)
				fileListData.refresh()
			},

			doDeleteFile: async function doDeleteFile(fileId: string) {
				if (!api) return
				const file = fileListData.getData()?.find((f) => f.fileId === fileId)
				const isFolder = file?.fileTp === 'FLDR'

				const res = await dialog.confirm(
					isFolder ? t('Move folder to trash') : t('Move to trash'),
					isFolder
						? t('Are you sure you want to move this folder and its contents to trash?')
						: t('Are you sure you want to move this file to trash?')
				)
				if (!res) return

				await api.files.delete(fileId)
				if (multiSelect.isSelected(fileId)) {
					multiSelect.clearSelection()
				}
				fileListData.refresh()
			},

			doRestoreFile: async function doRestoreFile(fileId: string, parentId?: string) {
				if (!api) return
				await api.files.restore(fileId, parentId)
				fileListData.refresh()
			},

			doPermanentDeleteFile: async function doPermanentDeleteFile(fileId: string) {
				if (!api) return
				const res = await dialog.confirm(
					t('Permanently delete'),
					t(
						'Are you sure you want to permanently delete this file? This action cannot be undone.'
					)
				)
				if (!res) return

				await api.files.permanentDelete(fileId)
				if (multiSelect.isSelected(fileId)) {
					multiSelect.clearSelection()
				}
				fileListData.refresh()
			},

			toggleStarred: async function toggleStarred(fileId: string) {
				if (!api) return
				const file = fileListData.getData()?.find((f) => f.fileId === fileId)
				const isStarred = file?.userData?.starred ?? false
				await api.files.setStarred(fileId, !isStarred)
				fileListData.refresh()
			},

			togglePinned: async function togglePinned(fileId: string) {
				if (!api) return
				const file = fileListData.getData()?.find((f) => f.fileId === fileId)
				const isPinned = file?.userData?.pinned ?? false
				await api.files.setPinned(fileId, !isPinned)
				fileListData.refresh()
			},

			// Batch operations for multi-select
			doDeleteFiles: async function doDeleteFiles(fileIds: string[]) {
				if (!api || fileIds.length === 0) return

				const res = await dialog.confirm(
					t('Move to trash'),
					t('Are you sure you want to move {{count}} items to trash?', {
						count: fileIds.length
					})
				)
				if (!res) return

				await Promise.all(fileIds.map((id) => api.files.delete(id)))
				multiSelect.clearSelection()
				fileListData.refresh()
			},

			doRestoreFiles: async function doRestoreFiles(fileIds: string[], parentId?: string) {
				if (!api || fileIds.length === 0) return
				await Promise.all(fileIds.map((id) => api.files.restore(id, parentId)))
				multiSelect.clearSelection()
				fileListData.refresh()
			},

			doPermanentDeleteFiles: async function doPermanentDeleteFiles(fileIds: string[]) {
				if (!api || fileIds.length === 0) return

				const res = await dialog.confirm(
					t('Permanently delete'),
					t(
						'Are you sure you want to permanently delete {{count}} items? This action cannot be undone.',
						{ count: fileIds.length }
					)
				)
				if (!res) return

				await Promise.all(fileIds.map((id) => api.files.permanentDelete(id)))
				multiSelect.clearSelection()
				fileListData.refresh()
			},

			toggleStarredBatch: async function toggleStarredBatch(
				fileIds: string[],
				starred: boolean
			) {
				if (!api || fileIds.length === 0) return
				await Promise.all(fileIds.map((id) => api.files.setStarred(id, starred)))
				fileListData.refresh()
			},

			togglePinnedBatch: async function togglePinnedBatch(
				fileIds: string[],
				pinned: boolean
			) {
				if (!api || fileIds.length === 0) return
				await Promise.all(fileIds.map((id) => api.files.setPinned(id, pinned)))
				fileListData.refresh()
			},

			setVisibility: async function setVisibility(fileId: string, visibility) {
				if (!api) return
				await api.files.update(fileId, { visibility })
				fileListData.refresh()
			}
		}),
		[
			auth,
			api,
			appConfig,
			contextIdTag,
			navigate,
			t,
			fileListData,
			dialog,
			viewMode,
			multiSelect
		]
	)

	// Keyboard shortcuts
	useKeyboardShortcuts({
		files: fileListData.getData() || [],
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

	// Sort files: pinned first, then folders, then regular files
	// NOTE: This useMemo MUST be before any early returns to follow React hooks rules
	const files = React.useMemo(() => {
		const data = fileListData.getData()
		return [...data].sort((a, b) => {
			// Pinned files first
			const aPinned = a.userData?.pinned ? 1 : 0
			const bPinned = b.userData?.pinned ? 1 : 0
			if (aPinned !== bPinned) return bPinned - aPinned

			// Folders second
			const aFolder = a.fileTp === 'FLDR' ? 1 : 0
			const bFolder = b.fileTp === 'FLDR' ? 1 : 0
			if (aFolder !== bFolder) return bFolder - aFolder

			// Default: keep original order (from API)
			return 0
		})
	}, [fileListData])

	const isTrashView = viewMode === 'trash'

	// Show loading spinner only for initial load
	if (fileListData.isLoading && files.length === 0)
		return (
			<div className="d-flex align-items-center justify-content-center h-100">
				<LoadingSpinner size="lg" label={t('Loading files...')} />
			</div>
		)

	// Disable drag-drop in trash view
	const canUpload = viewMode === 'all'

	return (
		<>
			<DropZone onFilesDropped={uploadQueue.addFiles} disabled={!canUpload}>
				<Fcd.Container className="g-1">
					<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
						<Sidebar
							contextIdTag={contextIdTag}
							viewMode={viewMode}
							onViewModeChange={handleViewModeChange}
							selectedTags={selectedTags}
							onTagFilter={setSelectedTags}
						/>
					</Fcd.Filter>
					<Fcd.Content
						header={
							<div className="c-vbox g-2">
								<div className="c-nav c-hbox g-2">
									<IcFilter
										className="md-hide lg-hide"
										onClick={() => setShowFilter(true)}
									/>
									<div className="c-tag-list md-hide lg-hide">
										{viewMode === 'live' && (
											<div className="c-tag">{t('live')}</div>
										)}
										{viewMode === 'static' && (
											<div className="c-tag">{t('static')}</div>
										)}
										{viewMode === 'starred' && (
											<div className="c-tag">{t('starred')}</div>
										)}
										{viewMode === 'recent' && (
											<div className="c-tag">{t('recent')}</div>
										)}
										{viewMode === 'trash' && (
											<div className="c-tag">{t('trash')}</div>
										)}
									</div>
									<Toolbar
										displayMode={displayMode}
										onDisplayModeChange={setDisplayMode}
										onFilesSelected={uploadQueue.addFiles}
										onCreateFolder={
											viewMode === 'all' ? handleCreateFolder : undefined
										}
										onEmptyTrash={isTrashView ? handleEmptyTrash : undefined}
										isTrashView={isTrashView}
									/>
								</div>
								{viewMode === 'all' && breadcrumbs.length > 1 && (
									<Breadcrumbs
										items={breadcrumbs}
										onNavigate={navigateToFolder}
									/>
								)}
							</div>
						}
					>
						{files.length === 0 ? (
							<EmptyState
								icon={<IcAll style={{ fontSize: '2.5rem' }} />}
								title={
									isTrashView
										? t('Trash is empty')
										: viewMode === 'live'
											? t('No live documents')
											: viewMode === 'static'
												? t('No static files')
												: viewMode === 'starred'
													? t('No starred files yet')
													: viewMode === 'recent'
														? t('No recent files')
														: viewMode === 'pinned'
															? t('No pinned files yet')
															: currentFolderId
																? t('This folder is empty')
																: t('No files found')
								}
								description={
									isTrashView
										? t('Files you delete will appear here')
										: viewMode === 'live'
											? t('Create a document to collaborate in real-time')
											: viewMode === 'static'
												? t('Upload files or export documents')
												: viewMode === 'starred'
													? t('Star files to quickly access them later')
													: viewMode === 'recent'
														? t('Files you open will appear here')
														: viewMode === 'pinned'
															? t('Pin files to keep them at the top')
															: t(
																	'Create a new document or upload files to get started'
																)
								}
							/>
						) : displayMode === 'grid' ? (
							<>
								<div className="c-file-grid-container">
									{files.map((file) => (
										<ItemGrid
											key={file.fileId}
											className={mergeClasses(
												multiSelect.isSelected(file.fileId) && 'accent'
											)}
											file={file}
											onClick={onClickFile}
											onDoubleClick={onDoubleClickFile}
											onContextMenu={onContextMenuFile}
											onInfoClick={onInfoClick}
											renameFileId={renameFileId}
											renameFileName={renameFileName}
											fileOps={fileOps}
											viewMode={viewMode}
										/>
									))}
								</div>
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
								{files.map((file) => (
									<ItemCard
										key={file.fileId}
										className={mergeClasses(
											'mb-1',
											multiSelect.isSelected(file.fileId) && 'accent'
										)}
										file={file}
										onClick={onClickFile}
										onDoubleClick={onDoubleClickFile}
										onContextMenu={onContextMenuFile}
										onInfoClick={onInfoClick}
										renameFileId={renameFileId}
										renameFileName={renameFileName}
										fileOps={fileOps}
										viewMode={viewMode}
									/>
								))}
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
					</Fcd.Content>
					<Fcd.Details
						isVisible={
							// On desktop: show when file is selected
							// On mobile: only show when explicitly requested via info button
							!!selectedFile && (window.innerWidth >= 768 || showMobileDetails)
						}
						hide={() => {
							setShowMobileDetails(false)
							multiSelect.clearSelection()
						}}
					>
						{selectedFile && (
							<DetailsPanel
								file={selectedFile}
								renameFileId={renameFileId}
								renameFileName={renameFileName}
								fileOps={fileOps}
								onShare={setShareDialogFile}
							/>
						)}
					</Fcd.Details>
				</Fcd.Container>
			</DropZone>

			<UploadProgress
				queue={uploadQueue.queue}
				stats={uploadQueue.stats}
				onRemoveItem={uploadQueue.removeItem}
				onClearCompleted={uploadQueue.clearCompleted}
				onClearAll={uploadQueue.clearAll}
			/>

			{contextMenuFile && contextMenuPosition && (
				<ContextMenu
					selectedFiles={multiSelect.getSelectedFiles()}
					clickedFile={contextMenuFile}
					position={contextMenuPosition}
					viewMode={viewMode}
					fileOps={fileOps}
					onClose={closeContextMenu}
					onMoveFiles={setMoveFileIds}
					onShare={(file) => {
						setShareDialogFile(file)
					}}
				/>
			)}

			{moveFileIds && moveFileIds.length > 0 && (
				<FolderPicker
					title={
						moveFileIds.length === 1
							? t('Move to folder')
							: t('Move {{count}} items to folder', { count: moveFileIds.length })
					}
					excludeFileIds={moveFileIds}
					onSelect={handleMoveFiles}
					onClose={() => setMoveFileIds(undefined)}
				/>
			)}

			{shareDialogFile && (
				<ShareDialog
					open={!!shareDialogFile}
					file={shareDialogFile}
					onClose={() => setShareDialogFile(undefined)}
					onPermissionsChanged={fileListData.refresh}
				/>
			)}
		</>
	)
}

// vim: ts=4
