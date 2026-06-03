// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getFileUrl } from '@cloudillo/core'
import { InlineEditForm, mergeClasses } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuFolder as IcFolder,
	LuInfo as IcInfo,
	LuLock as IcLock,
	LuPin as IcPin,
	LuStar as IcStar,
	LuCloudOff as IcUnsyncedEdit,
	LuEye as IcView
} from 'react-icons/lu'

import { useCurrentContextIdTag } from '../../../context/index.js'
import { getFileIcon, type IcUnknown } from '../icons.js'
import {
	type File,
	type FileOps,
	MANAGED_FOLDER_ID,
	TRASH_FOLDER_ID,
	type ViewMode
} from '../types.js'
import { getSmartTimestamp, getVisibilityIcon, getVisibilityLabel } from '../utils.js'

interface ItemGridProps {
	className?: string
	file: File
	isDirty?: boolean
	onClick?: (file: File, event: React.MouseEvent) => void
	onDoubleClick?: (file: File) => void
	onContextMenu?: (file: File, position: { x: number; y: number }) => void
	onInfoClick?: (file: File) => void
	renameFileId?: string
	renameFileName?: string
	fileOps: FileOps
	viewMode?: ViewMode
	showParentChip?: boolean
}

export const ItemGrid = React.memo(function ItemGrid({
	className,
	file,
	isDirty,
	onClick,
	onDoubleClick,
	onContextMenu,
	onInfoClick,
	renameFileId,
	renameFileName,
	fileOps,
	viewMode = 'browse',
	showParentChip = false
}: ItemGridProps) {
	const contextIdTag = useCurrentContextIdTag()
	const { t } = useTranslation()

	const isFolder = file.fileTp === 'FLDR'
	const Icon = getFileIcon(file.contentType, file.fileTp)
	const isRenaming = renameFileName !== undefined && file.fileId === renameFileId

	// Check if file has a thumbnail/variant
	const hasThumbnail = file.variantId && contextIdTag
	const isImage = file.contentType?.startsWith('image/')

	function handleClick(evt: React.MouseEvent) {
		onClick?.(file, evt)
	}

	function handleDoubleClick(_evt: React.MouseEvent) {
		if (isFolder) {
			onDoubleClick?.(file)
		} else {
			fileOps.openFile(file.fileId, file.accessLevel === 'none' ? 'read' : file.accessLevel)
		}
	}

	function handleContextMenu(evt: React.MouseEvent) {
		evt.preventDefault()
		onContextMenu?.(file, { x: evt.clientX, y: evt.clientY })
	}

	function handleInfoClick(evt: React.MouseEvent) {
		evt.stopPropagation()
		onInfoClick?.(file)
	}

	const isInTrash = viewMode === 'trash' || file.parentId === TRASH_FOLDER_ID
	const isManagedView = viewMode === 'managed' || file.parentId === MANAGED_FOLDER_ID
	const isPinned = file.userData?.pinned ?? false
	const isStarred = file.userData?.starred ?? false
	const isLive = file.fileTp === 'CRDT' || file.fileTp === 'RTDB'
	const smartTimestamp = getSmartTimestamp(file)

	function handleStarClick(evt: React.MouseEvent) {
		evt.stopPropagation()
		fileOps.toggleStarred?.(file.fileId)
	}

	return (
		<div
			className={mergeClasses('c-file-grid-item', isPinned && 'pinned', className)}
			data-file-id={file.fileId}
			data-source-context={contextIdTag ?? undefined}
			onClick={handleClick}
			onDoubleClick={handleDoubleClick}
			onContextMenu={handleContextMenu}
		>
			{/* Thumbnail or Icon with badges */}
			<div className="c-file-grid-thumb">
				{(hasThumbnail || isImage) && contextIdTag ? (
					<img
						className="c-file-grid-thumb-img"
						src={getFileUrl(contextIdTag, file.variantId || file.fileId, 'vis.tn')}
						alt={file.fileName}
						loading="lazy"
					/>
				) : (
					<div className="c-file-grid-thumb-icon">
						{React.createElement<React.ComponentProps<typeof IcUnknown>>(Icon)}
					</div>
				)}

				{/* Pin badge - top left */}
				{isPinned && (
					<span className="c-file-grid-pin" title={t('Pinned')}>
						<IcPin />
					</span>
				)}

				{/* Star button - top right (clickable) */}
				{!isInTrash && !isManagedView && (
					<button
						type="button"
						className={mergeClasses('c-file-grid-star', isStarred && 'active')}
						onClick={handleStarClick}
						title={isStarred ? t('Unstar') : t('Star')}
					>
						<IcStar />
					</button>
				)}

				{/* Live indicator - bottom right */}
				{isLive && <span className="c-file-grid-live" title={t('Live document')} />}

				{/* Unsynced local edits indicator */}
				{isDirty && (
					<span className="c-file-grid-dirty" title={t('Has unsynced local edits')}>
						<IcUnsyncedEdit />
					</span>
				)}

				{/* Access level badge for non-write access */}
				{!isFolder && file.accessLevel && file.accessLevel !== 'write' && (
					<span className="c-file-grid-access-badge">
						{file.accessLevel === 'read' ? <IcView /> : <IcLock />}
					</span>
				)}

				{/* Visibility badge - bottom left */}
				{(() => {
					const VisibilityIcon = getVisibilityIcon(file.visibility ?? null)
					const isDirect = !file.visibility || file.visibility === 'D'
					return (
						<span
							className={mergeClasses('c-file-grid-visibility', isDirect && 'muted')}
							title={getVisibilityLabel(t, file.visibility ?? null)}
						>
							<VisibilityIcon />
						</span>
					)
				})()}
			</div>

			{/* File name */}
			<div className="c-file-grid-name">
				{isRenaming ? (
					<InlineEditForm
						value={renameFileName}
						onSave={(newName) => fileOps.doRenameFile(file.fileId, newName)}
						onCancel={() => fileOps.setRenameFileName(undefined)}
						size="small"
					/>
				) : (
					<span className="c-file-grid-name-text">{file.fileName}</span>
				)}
			</div>

			{/* Parent folder context — shown only in hierarchy-agnostic views
			    or during cross-folder search. */}
			{showParentChip && file.parentName && (
				<div className="text-muted small d-inline-flex align-items-center g-1">
					<IcFolder /> <span className="text-truncate">{file.parentName}</span>
				</div>
			)}

			{/* Smart timestamp */}
			<div className="c-file-grid-timestamp">
				{smartTimestamp.label && (
					<span className="text-muted">{t(smartTimestamp.label)} </span>
				)}
				{smartTimestamp.time}
			</div>

			{/* Info button (visible on mobile only) */}
			{!isInTrash && onInfoClick && (
				<button
					type="button"
					className="c-file-grid-info c-button link icon lg-hide"
					onClick={handleInfoClick}
					title={t('Show details')}
				>
					<IcInfo />
				</button>
			)}
		</div>
	)
})

// vim: ts=4
