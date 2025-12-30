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
	LuChevronRight as IcOpenFolder,
	LuSquareArrowOutUpRight as IcOpenFile,
	LuPencil as IcEdit,
	LuEye as IcView,
	LuLock as IcLock,
	LuStar as IcStar,
	LuInfo as IcInfo,
	LuPin as IcPin
} from 'react-icons/lu'

import { useAuth, InlineEditForm, Tag, ProfilePicture, mergeClasses } from '@cloudillo/react'

import { getFileIcon, IcUnknown } from '../icons.js'
import type { File, FileOps, ViewMode } from '../types.js'
import { TRASH_FOLDER_ID } from '../types.js'
import {
	getSmartTimestamp,
	formatRelativeTime,
	getVisibilityIcon,
	getVisibilityLabelKey
} from '../utils.js'

interface ItemCardProps {
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

export const ItemCard = React.memo(function ItemCard({
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
}: ItemCardProps) {
	const [auth] = useAuth()
	const { t } = useTranslation()

	const isFolder = file.fileTp === 'FLDR'
	const isInTrash = viewMode === 'trash' || file.parentId === TRASH_FOLDER_ID
	const Icon = getFileIcon(file.contentType, file.fileTp)
	const isRenaming = renameFileName !== undefined && file.fileId === renameFileId

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

	// Long-press timer for opening in read mode
	const longPressTimer = React.useRef<number | null>(null)
	const longPressTriggered = React.useRef(false)

	function handleOpenTouchStart() {
		if (isFolder || file.accessLevel !== 'write') return
		longPressTriggered.current = false
		longPressTimer.current = window.setTimeout(() => {
			longPressTriggered.current = true
			fileOps.openFile(file.fileId, 'read')
		}, 500)
	}

	function handleOpenTouchEnd() {
		if (longPressTimer.current !== null) {
			clearTimeout(longPressTimer.current)
			longPressTimer.current = null
		}
	}

	function handleOpenClick(evt: React.MouseEvent) {
		evt.stopPropagation()
		// Prevent click if long-press already triggered
		if (longPressTriggered.current) {
			longPressTriggered.current = false
			return
		}
		if (isFolder) {
			onDoubleClick?.(file)
		} else {
			fileOps.openFile(file.fileId, file.accessLevel === 'none' ? 'read' : file.accessLevel)
		}
	}

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
			className={mergeClasses('c-file-card', isPinned && 'pinned', className)}
			data-file-id={file.fileId}
			onClick={handleClick}
			onDoubleClick={handleDoubleClick}
			onContextMenu={handleContextMenu}
		>
			{/* Pin indicator */}
			{isPinned && (
				<span className="c-file-card-pin" title={t('Pinned')}>
					<IcPin />
				</span>
			)}

			{/* File Icon with access badge and live indicator */}
			<div className="c-file-card-icon">
				{React.createElement<React.ComponentProps<typeof IcUnknown>>(Icon)}
				{!isFolder && file.accessLevel && file.accessLevel !== 'write' && (
					<span className="c-file-card-access-badge">
						{file.accessLevel === 'read' ? <IcView /> : <IcLock />}
					</span>
				)}
				{isLive && <span className="c-file-card-live" title={t('Live document')} />}
			</div>

			{/* Content: name, meta, tags */}
			<div className="c-file-card-content">
				{/* File name with inline edit and star button */}
				<div className="c-file-card-name">
					{isRenaming ? (
						<InlineEditForm
							value={renameFileName}
							onSave={(newName) => fileOps.doRenameFile(file.fileId, newName)}
							onCancel={() => fileOps.setRenameFileName(undefined)}
							size="small"
						/>
					) : (
						<span className="text-truncate">{file.fileName}</span>
					)}
					{!isInTrash && (
						<button
							type="button"
							className={mergeClasses('c-file-card-star', isStarred && 'active')}
							onClick={handleStarClick}
							title={isStarred ? t('Unstar') : t('Star')}
						>
							<IcStar />
						</button>
					)}
					{isFavorite && !isStarred && <IcStar className="c-file-card-favorite" />}
				</div>

				{/* Meta line: smart timestamp, visibility, and owner */}
				<div className="c-file-card-meta">
					<span className="c-file-card-meta-date">
						{smartTimestamp.label && (
							<span className="text-muted">{t(smartTimestamp.label)} </span>
						)}
						{smartTimestamp.time}
					</span>
					{/* Visibility badge */}
					{(() => {
						const VisibilityIcon = getVisibilityIcon(file.visibility ?? null)
						return (
							<span
								className="c-file-card-visibility"
								title={t(getVisibilityLabelKey(file.visibility ?? null))}
							>
								<VisibilityIcon />
							</span>
						)
					})()}
					{file.owner && (
						<>
							<ProfilePicture profile={file.owner} tiny />
							<span>{file.owner.name || file.owner.idTag}</span>
						</>
					)}
				</div>

				{/* Tags (read-only on card) */}
				{!isFolder && file.tags && file.tags.length > 0 && (
					<div className="c-file-card-tags">
						{file.tags.slice(0, 3).map((tag) => (
							<Tag key={tag} size="small">
								#{tag}
							</Tag>
						))}
						{file.tags.length > 3 && (
							<span className="c-file-card-tags-more">+{file.tags.length - 3}</span>
						)}
					</div>
				)}
			</div>

			{/* Info button (visible on mobile only) */}
			{!isInTrash && onInfoClick && (
				<button
					type="button"
					className="c-file-card-info c-button link icon lg-hide"
					onClick={handleInfoClick}
					title={t('Show details')}
				>
					<IcInfo />
				</button>
			)}

			{/* Open button (for mobile touch and clarity) */}
			{/* Long-press on files with write access opens in read mode */}
			{/* Icon changes based on access level: pencil=edit, eye=view, lock=none */}
			{!isInTrash && (
				<button
					type="button"
					className="c-file-card-open c-button link icon"
					onClick={handleOpenClick}
					onTouchStart={handleOpenTouchStart}
					onTouchEnd={handleOpenTouchEnd}
					onTouchCancel={handleOpenTouchEnd}
					title={
						isFolder
							? t('Open folder')
							: isLive && file.accessLevel === 'write'
								? t('Edit (hold for view mode)')
								: file.accessLevel !== 'none'
									? t('View')
									: t('No access')
					}
				>
					{isFolder ? (
						<IcOpenFolder />
					) : isLive && file.accessLevel === 'write' ? (
						<IcEdit />
					) : file.accessLevel !== 'none' ? (
						<IcView />
					) : (
						<IcLock />
					)}
				</button>
			)}
		</div>
	)
})

// vim: ts=4
