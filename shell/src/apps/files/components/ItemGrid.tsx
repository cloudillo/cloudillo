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
import { useTranslation } from 'react-i18next'

import {
	LuStar as IcStar,
	LuEye as IcView,
	LuLock as IcLock,
	LuInfo as IcInfo,
	LuPin as IcPin
} from 'react-icons/lu'

import { useAuth, InlineEditForm, mergeClasses } from '@cloudillo/react'
import { getFileUrl } from '@cloudillo/base'

import { getFileIcon, IcUnknown } from '../icons.js'
import type { File, FileOps, ViewMode } from '../types.js'
import { TRASH_FOLDER_ID } from '../types.js'
import { getSmartTimestamp } from '../utils.js'

interface ItemGridProps {
	className?: string
	file: File
	onClick?: (file: File, event: React.MouseEvent) => void
	onDoubleClick?: (file: File) => void
	onContextMenu?: (file: File, position: { x: number; y: number }) => void
	onInfoClick?: (file: File) => void
	renameFileId?: string
	renameFileName?: string
	fileOps: FileOps
	viewMode?: ViewMode
	isFavorite?: boolean
}

export const ItemGrid = React.memo(function ItemGrid({
	className,
	file,
	onClick,
	onDoubleClick,
	onContextMenu,
	onInfoClick,
	renameFileId,
	renameFileName,
	fileOps,
	viewMode = 'all',
	isFavorite = false
}: ItemGridProps) {
	const [auth] = useAuth()
	const { t } = useTranslation()

	const isFolder = file.fileTp === 'FLDR'
	const isInTrash = viewMode === 'trash' || file.parentId === TRASH_FOLDER_ID
	const Icon = getFileIcon(file.contentType, file.fileTp)
	const isRenaming = renameFileName !== undefined && file.fileId === renameFileId

	// Check if file has a thumbnail/variant
	const hasThumbnail = file.variantId && auth?.idTag
	const isImage = file.contentType?.startsWith('image/')

	function handleClick(evt: React.MouseEvent) {
		onClick?.(file, evt)
	}

	function handleDoubleClick(evt: React.MouseEvent) {
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

	const isInTrashView = viewMode === 'trash'
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
			onClick={handleClick}
			onDoubleClick={handleDoubleClick}
			onContextMenu={handleContextMenu}
		>
			{/* Thumbnail or Icon with badges */}
			<div className="c-file-grid-thumb">
				{(hasThumbnail || isImage) && auth?.idTag ? (
					<img
						className="c-file-grid-thumb-img"
						src={getFileUrl(auth.idTag, file.variantId || file.fileId, 'vis.tn')}
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
				{!isInTrashView && (
					<button
						type="button"
						className={mergeClasses('c-file-grid-star', isStarred && 'active')}
						onClick={handleStarClick}
						title={isStarred ? t('Unstar') : t('Star')}
					>
						<IcStar />
					</button>
				)}

				{/* Favorite indicator (if not starred, for backwards compat) */}
				{isFavorite && !isStarred && (
					<span className="c-file-grid-favorite">
						<IcStar />
					</span>
				)}

				{/* Live indicator - bottom right */}
				{isLive && <span className="c-file-grid-live" title={t('Live document')} />}

				{/* Access level badge for non-write access */}
				{!isFolder && file.accessLevel && file.accessLevel !== 'write' && (
					<span className="c-file-grid-access-badge">
						{file.accessLevel === 'read' ? <IcView /> : <IcLock />}
					</span>
				)}
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

			{/* Smart timestamp */}
			<div className="c-file-grid-timestamp">
				{smartTimestamp.label && (
					<span className="text-muted">{t(smartTimestamp.label)} </span>
				)}
				{smartTimestamp.time}
			</div>

			{/* Info button (visible on mobile only) */}
			{!isInTrashView && onInfoClick && (
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
