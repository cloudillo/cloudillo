// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Badge,
	BadgeAnchor,
	Button,
	FileTypeIcon,
	HBox,
	Icon,
	InlineEditForm,
	ListItem,
	ProfilePicture,
	Tag,
	Text,
	useAuth,
	useToast,
	VBox
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuTriangleAlert as IcBroken,
	LuDownload as IcDownload,
	LuPencil as IcEdit,
	LuInfo as IcInfo,
	LuLock as IcLock,
	LuChevronRight as IcOpenFolder,
	LuLoaderCircle as IcProcessing,
	LuPencilOff as IcReadOnly,
	LuStar as IcStar,
	LuCloudOff as IcUnsyncedEdit,
	LuEye as IcView
} from 'react-icons/lu'
import { TbPinnedFilled as IcPin } from 'react-icons/tb'

import { useCurrentContextIdTag } from '../../../context/index.js'
import { useAppConfig } from '../../../utils.js'
import { isViewerSupported, triggerFileDownload } from '../../viewer/MediaViewer.js'
import type { File, FileOps, ViewMode } from '../types.js'
import { isFileProcessing, MANAGED_FOLDER_ID, TRASH_FOLDER_ID } from '../types.js'
import {
	canWrite,
	getSmartTimestamp,
	getVisibilityIcon,
	getVisibilityLabel,
	toAppAccess
} from '../utils.js'
import { LocationChip } from './LocationChip.js'

function iconContentType(contentType: string | undefined, fileTp: string | undefined) {
	return fileTp === 'FLDR' ? 'cloudillo/folder' : contentType
}

interface ItemCardProps {
	className?: string
	selected?: boolean
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
	selected,
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
	const [auth] = useAuth()
	const { t } = useTranslation()
	const contextIdTag = useCurrentContextIdTag()
	const [appConfig] = useAppConfig()
	const toast = useToast()

	const isFolder = file.fileTp === 'FLDR'
	const isInTrash = viewMode === 'trash' || file.parentId === TRASH_FOLDER_ID
	const isManagedView = viewMode === 'managed' || file.parentId === MANAGED_FOLDER_ID
	const isRenaming = renameFileName !== undefined && file.entryId === renameFileId

	function handleDoubleClick(_evt: React.MouseEvent) {
		if (isFolder) {
			onDoubleClick?.(file)
		} else {
			fileOps.openFile(file.entryId, toAppAccess(file.accessLevel))
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
		if (isFolder || (file.accessLevel && !canWrite(file.accessLevel))) return
		longPressTriggered.current = false
		longPressTimer.current = window.setTimeout(() => {
			longPressTriggered.current = true
			fileOps.openFile(file.entryId, 'read')
		}, 500)
	}

	function handleOpenTouchEnd() {
		if (longPressTimer.current !== null) {
			clearTimeout(longPressTimer.current)
			longPressTimer.current = null
		}
	}

	function downloadFile() {
		if (isFileProcessing(file)) {
			toast.warning(t('This file is still being processed — please try again in a moment.'))
			return
		}
		const idTag = contextIdTag ?? auth?.idTag
		if (idTag && file.fileId)
			triggerFileDownload(idTag, file.fileId, file.fileName, () =>
				toast.error(t('Download failed. Please try again.'))
			)
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
		} else if (downloadOnly) {
			downloadFile()
		} else {
			fileOps.openFile(file.entryId, toAppAccess(file.accessLevel))
		}
	}

	const isPinned = file.userData?.pinned ?? false
	const isStarred = file.userData?.starred ?? false
	const isLive = file.fileTp === 'CRDT' || file.fileTp === 'RTDB'
	// Download-only: a stored blob with no registered viewer for its content type.
	// These get a download icon/action instead of the misleading "view" eye.
	const hasAppHandler = !!appConfig?.mime[file.contentType]
	const downloadOnly =
		!isFolder &&
		!isLive &&
		file.accessLevel !== 'none' &&
		!hasAppHandler &&
		!isViewerSupported(file.contentType) &&
		(!file.fileTp || file.fileTp === 'BLOB')
	const smartTimestamp = getSmartTimestamp(file)
	const isProcessing = isFileProcessing(file)
	const isBroken = !!file.brokenAt
	const brokenSubtitle = !isBroken
		? null
		: file.brokenReason === 'revoked'
			? t('No longer shared with you by {{idTag}}.', { idTag: file.upstream?.idTag ?? '' })
			: file.brokenReason === 'deleted'
				? t('The owner deleted this file.')
				: t("{{host}} couldn't be reached. We'll keep trying.", {
						host: file.upstream?.idTag ?? ''
					})

	function handleStarClick(evt: React.MouseEvent) {
		evt.stopPropagation()
		fileOps.toggleStarred?.(file.entryId)
	}

	const isDirect = !file.visibility || file.visibility === 'D'
	// Prefer the upstream node — on a mirrored (pinned/placed) row it is the
	// meaningful "from where" signal, and it is never the active context.
	// Otherwise attribute to the owner.
	const attribution = file.upstream ?? file.owner
	const showAttribution = !!attribution && attribution.idTag !== contextIdTag
	const editable = isLive && (canWrite(file.accessLevel) || !file.accessLevel)

	return (
		<ListItem
			className={className}
			size="sm"
			selected={selected}
			data-file-id={file.entryId}
			data-source-context={contextIdTag ?? undefined}
			onClick={
				isRenaming
					? undefined
					: (evt) => onClick?.(file, evt as unknown as React.MouseEvent)
			}
			onDoubleClick={handleDoubleClick}
			onContextMenu={handleContextMenu}
			leading={
				<BadgeAnchor
					position="top-start"
					badge={
						isPinned ? (
							<Icon as={IcPin} size="xs" color="primary" label={t('Pinned')} />
						) : undefined
					}
				>
					<BadgeAnchor
						badge={
							isLive ? (
								<Badge dot color="success" aria-label={t('Live document')} />
							) : undefined
						}
					>
						<FileTypeIcon
							contentType={iconContentType(file.contentType, file.fileTp)}
							size="md"
						/>
					</BadgeAnchor>
				</BadgeAnchor>
			}
			title={
				isRenaming ? (
					<InlineEditForm
						value={renameFileName}
						onSave={(newName) => fileOps.doRenameFile(file.entryId, newName)}
						onCancel={() => fileOps.setRenameFileName(undefined)}
						size="small"
					/>
				) : (
					file.fileName
				)
			}
			subtitle={
				<VBox gap={1}>
					{/* Meta line: smart timestamp, parent chip, owner, visibility */}
					<HBox gap={2} align="center">
						<Text>
							{smartTimestamp.label && (
								<Text emphasis="muted">{t(smartTimestamp.label)} </Text>
							)}
							{smartTimestamp.time}
						</Text>
						{showParentChip && (
							<LocationChip file={file} driveOnly={isInTrash || isManagedView} />
						)}
						{showAttribution && attribution && (
							<HBox gap={1} align="center" fill>
								{/* The listing came from the active context, which holds the blob. */}
								<ProfilePicture
									profile={attribution}
									tiny
									srcTag={contextIdTag ?? auth?.idTag}
								/>
								<Text truncate>{attribution.name || `@${attribution.idTag}`}</Text>
							</HBox>
						)}
						{/* Direct is the default, so only a wider visibility earns an icon */}
						{!isDirect && (
							<Icon
								as={getVisibilityIcon(file.visibility ?? null)}
								label={getVisibilityLabel(t, file.visibility ?? null)}
							/>
						)}
					</HBox>
					{/* Tombstone subtitle */}
					{brokenSubtitle && (
						<Text size="sm" emphasis="muted">
							{brokenSubtitle}
						</Text>
					)}
					{/* Tags (read-only on card) */}
					{!isFolder && file.tags && file.tags.length > 0 && (
						<HBox gap={1} align="center" wrap>
							{file.tags.slice(0, 3).map((tag) => (
								<Tag key={tag} size="sm">
									#{tag}
								</Tag>
							))}
							{file.tags.length > 3 && (
								<Text size="sm" emphasis="muted">
									+{file.tags.length - 3}
								</Text>
							)}
						</HBox>
					)}
				</VBox>
			}
			meta={
				<HBox gap={1} align="center">
					{isBroken && (
						<Icon as={IcBroken} color="warning" label={brokenSubtitle ?? ''} />
					)}
					{!isBroken && isProcessing && (
						<Icon as={IcProcessing} label={t('Still processing — available shortly')} />
					)}
					{/* 'none' is shown once, by the lock on the open button */}
					{!isFolder &&
						file.accessLevel &&
						file.accessLevel !== 'none' &&
						!canWrite(file.accessLevel) && (
							<Icon as={IcReadOnly} label={t('Read only')} />
						)}
					{isDirty && (
						<Icon
							as={IcUnsyncedEdit}
							color="warning"
							label={t('Has unsynced local edits')}
						/>
					)}
				</HBox>
			}
			trailing={
				<HBox gap={1} align="center">
					{!isInTrash && !isManagedView && (
						<Button
							variant="ghost"
							size="sm"
							className={isStarred ? undefined : 'sm-hide'}
							icon={<IcStar />}
							pressed={isStarred}
							onClick={handleStarClick}
							aria-label={isStarred ? t('Unstar') : t('Star')}
						/>
					)}
					{/* Info button (lg has the details column; the only way to details below lg) */}
					{!isInTrash && onInfoClick && (
						<Button
							variant="ghost"
							className="lg-hide"
							icon={<IcInfo />}
							onClick={handleInfoClick}
							aria-label={t('Show details')}
						/>
					)}
					{/* Open button (for mobile touch and clarity) */}
					{/* Long-press on files with write access opens in read mode */}
					{/* Icon changes based on access level: pencil=edit, eye=view, lock=none */}
					{!isInTrash && (
						<Button
							variant="ghost"
							onClick={handleOpenClick}
							onTouchStart={handleOpenTouchStart}
							onTouchEnd={handleOpenTouchEnd}
							onTouchCancel={handleOpenTouchEnd}
							icon={
								isFolder ? (
									<IcOpenFolder />
								) : file.accessLevel === 'none' ? (
									<IcLock />
								) : editable ? (
									<IcEdit />
								) : downloadOnly ? (
									<IcDownload />
								) : (
									<IcView />
								)
							}
							aria-label={
								isFolder
									? t('Open folder')
									: file.accessLevel === 'none'
										? t('No access')
										: editable
											? t('Edit (hold for view mode)')
											: downloadOnly
												? t('Download')
												: t('View')
							}
						/>
					)}
				</HBox>
			}
		/>
	)
})

// vim: ts=4
