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
import dayjs from 'dayjs'

import {
	LuChevronRight as IcOpenFolder,
	LuSquareArrowOutUpRight as IcOpenFile,
	LuPencil as IcEdit,
	LuEye as IcView,
	LuLock as IcLock,
	LuStar as IcFavorite,
	LuInfo as IcInfo
} from 'react-icons/lu'

import { useAuth, InlineEditForm, Tag, ProfilePicture, mergeClasses } from '@cloudillo/react'

import { getFileIcon, IcUnknown } from '../icons.js'
import type { File, FileOps, ViewMode } from '../types.js'
import { TRASH_FOLDER_ID } from '../types.js'

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

function formatRelativeTime(dateInput: string | number): string {
	try {
		// Handle Unix timestamp (seconds) - if it's a number or looks like one
		let d: Date
		if (typeof dateInput === 'number') {
			// Unix timestamp in seconds
			d = new Date(dateInput * 1000)
		} else if (/^\d+$/.test(dateInput)) {
			// String that looks like a Unix timestamp
			d = new Date(parseInt(dateInput, 10) * 1000)
		} else {
			// ISO string or other date format
			d = new Date(dateInput)
		}

		// Check for invalid date
		if (isNaN(d.getTime())) return ''

		const now = new Date()
		const deltaSec = (now.getTime() - d.getTime()) / 1000

		if (deltaSec < 0) return dayjs(d).format('MMM D') // Future date
		if (deltaSec < 60) return 'just now'
		if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`
		if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}h ago`
		if (deltaSec < 604800) return `${Math.floor(deltaSec / 86400)}d ago`
		if (now.getFullYear() === d.getFullYear()) {
			return dayjs(d).format('MMM D')
		}
		return dayjs(d).format('MMM D, YYYY')
	} catch {
		return ''
	}
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

	return (
		<div
			className={mergeClasses('c-file-card', className)}
			data-file-id={file.fileId}
			onClick={handleClick}
			onDoubleClick={handleDoubleClick}
			onContextMenu={handleContextMenu}
		>
			{/* File Icon with access badge */}
			<div className="c-file-card-icon">
				{React.createElement<React.ComponentProps<typeof IcUnknown>>(Icon)}
				{!isFolder && file.accessLevel && file.accessLevel !== 'write' && (
					<span className="c-file-card-access-badge">
						{file.accessLevel === 'read' ? <IcView /> : <IcLock />}
					</span>
				)}
			</div>

			{/* Content: name, meta, tags */}
			<div className="c-file-card-content">
				{/* File name with inline edit */}
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
					{isFavorite && <IcFavorite className="c-file-card-favorite" />}
				</div>

				{/* Meta line: time and owner */}
				<div className="c-file-card-meta">
					<span className="c-file-card-meta-date">
						{formatRelativeTime(file.createdAt)}
					</span>
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
							: file.accessLevel === 'write'
								? t('Edit (hold for view mode)')
								: file.accessLevel === 'read'
									? t('View')
									: t('No access')
					}
				>
					{isFolder ? (
						<IcOpenFolder />
					) : file.accessLevel === 'write' ? (
						<IcEdit />
					) : file.accessLevel === 'read' ? (
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
