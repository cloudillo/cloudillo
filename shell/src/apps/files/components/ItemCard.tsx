// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { InlineEditForm, mergeClasses, ProfilePicture, Tag, useAuth } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuTriangleAlert as IcBroken,
	LuPencil as IcEdit,
	LuFolder as IcFolder,
	LuInfo as IcInfo,
	LuLock as IcLock,
	LuChevronRight as IcOpenFolder,
	LuPin as IcPin,
	LuStar as IcStar,
	LuCloudOff as IcUnsyncedEdit,
	LuEye as IcView
} from 'react-icons/lu'

import { useCurrentContextIdTag } from '../../../context/index.js'
import { getFileIcon, type IcUnknown } from '../icons.js'
import type { File, FileOps, ViewMode } from '../types.js'
import { MANAGED_FOLDER_ID, TRASH_FOLDER_ID } from '../types.js'
import { getSmartTimestamp, getVisibilityIcon, getVisibilityLabel } from '../utils.js'

interface ItemCardProps {
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

export const ItemCard = React.memo(function ItemCard({
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
}: ItemCardProps) {
	const [_auth] = useAuth()
	const { t } = useTranslation()
	const contextIdTag = useCurrentContextIdTag()

	const isFolder = file.fileTp === 'FLDR'
	const isInTrash = viewMode === 'trash' || file.parentId === TRASH_FOLDER_ID
	const isManagedView = viewMode === 'managed' || file.parentId === MANAGED_FOLDER_ID
	const Icon = getFileIcon(file.contentType, file.fileTp)
	const isRenaming = renameFileName !== undefined && file.fileId === renameFileId

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

	// Long-press timer for opening in read mode
	const longPressTimer = React.useRef<number | null>(null)
	const longPressTriggered = React.useRef(false)

	function handleOpenTouchStart() {
		// Long-press enables read-only fallback for files that open in write mode
		// by default — that's anything with explicit write access plus the
		// unknown-access case (we'll try write and let the backend downgrade).
		if (isFolder || (file.accessLevel && file.accessLevel !== 'write')) return
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
	const isBroken = !!file.brokenAt
	const brokenSubtitle = !isBroken
		? null
		: file.brokenReason === 'revoked'
			? t('No longer shared with you by {{idTag}}.', { idTag: file.owner?.idTag ?? '' })
			: file.brokenReason === 'deleted'
				? t('The owner deleted this file.')
				: t("{{host}} couldn't be reached. We'll keep trying.", {
						host: file.owner?.idTag ?? ''
					})

	function handleStarClick(evt: React.MouseEvent) {
		evt.stopPropagation()
		fileOps.toggleStarred?.(file.fileId)
	}

	return (
		<div
			className={mergeClasses(
				'c-file-card',
				isPinned && 'pinned',
				isBroken && 'broken',
				className
			)}
			data-file-id={file.fileId}
			data-source-context={contextIdTag ?? undefined}
			onClick={handleClick}
			onDoubleClick={handleDoubleClick}
			onContextMenu={handleContextMenu}
		>
			{/* File Icon with pin, access badge and live indicator */}
			<div className="c-file-card-icon pos-relative">
				{React.createElement<React.ComponentProps<typeof IcUnknown>>(Icon)}
				{isBroken && (
					<span className="c-file-card-broken-badge" title={brokenSubtitle ?? ''}>
						<IcBroken />
					</span>
				)}
				{isPinned && (
					<span className="c-file-card-pin" title={t('Pinned')}>
						<IcPin />
					</span>
				)}
				{!isFolder && file.accessLevel && file.accessLevel !== 'write' && (
					<span className="c-file-card-access-badge">
						{file.accessLevel === 'read' || file.accessLevel === 'comment' ? (
							<IcView />
						) : (
							<IcLock />
						)}
					</span>
				)}
				{isLive && <span className="c-file-card-live" title={t('Live document')} />}
				{isDirty && (
					<span className="c-file-card-dirty" title={t('Has unsynced local edits')}>
						<IcUnsyncedEdit />
					</span>
				)}
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
						<span className="c-file-card-name-text text-truncate">{file.fileName}</span>
					)}
					{!isInTrash && !isManagedView && (
						<button
							type="button"
							className={mergeClasses('c-file-card-star', isStarred && 'active')}
							onClick={handleStarClick}
							title={isStarred ? t('Unstar') : t('Star')}
						>
							<IcStar />
						</button>
					)}
				</div>

				{/* Meta line: smart timestamp, parent chip, owner, visibility */}
				<div className="c-file-card-meta">
					<span className="c-file-card-meta-date">
						{smartTimestamp.label && (
							<span className="c-file-card-meta-label">
								{t(smartTimestamp.label)}{' '}
							</span>
						)}
						{smartTimestamp.time}
					</span>
					{showParentChip && file.parentName && (
						<span className="c-file-card-meta-parent" title={file.parentName}>
							<IcFolder /> <span className="text-truncate">{file.parentName}</span>
						</span>
					)}
					<span className="c-file-card-meta-right">
						{(() => {
							// Prefer owner when it differs from the current context — for
							// cross-context (pinned/placed) rows the owner is the meaningful
							// "from where" signal; the creator may be the local user.
							// Fall back to creator for normal rows.
							const attribution =
								file.owner && file.owner.idTag !== contextIdTag
									? file.owner
									: file.creator || file.owner
							if (!attribution) return null
							if (attribution.idTag === contextIdTag) return null
							return (
								<span className="c-file-card-meta-owner">
									<ProfilePicture profile={attribution} tiny />
									<span className="text-truncate">
										{attribution.name || `@${attribution.idTag}`}
									</span>
								</span>
							)
						})()}
						{(() => {
							const VisibilityIcon = getVisibilityIcon(file.visibility ?? null)
							const isDirect = !file.visibility || file.visibility === 'D'
							return (
								<span
									className={mergeClasses(
										'c-file-card-visibility',
										isDirect && 'muted'
									)}
									title={getVisibilityLabel(t, file.visibility ?? null)}
								>
									<VisibilityIcon />
								</span>
							)
						})()}
					</span>
				</div>

				{/* Tombstone subtitle */}
				{isBroken && brokenSubtitle && (
					<div className="c-file-card-meta">
						<span className="small text-muted">{brokenSubtitle}</span>
					</div>
				)}

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
							: file.accessLevel === 'none'
								? t('No access')
								: isLive && (file.accessLevel === 'write' || !file.accessLevel)
									? t('Edit (hold for view mode)')
									: t('View')
					}
				>
					{isFolder ? (
						<IcOpenFolder />
					) : file.accessLevel === 'none' ? (
						<IcLock />
					) : isLive && (file.accessLevel === 'write' || !file.accessLevel) ? (
						<IcEdit />
					) : (
						<IcView />
					)}
				</button>
			)}
		</div>
	)
})

// vim: ts=4
