// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuFolderOpen as IcOpen,
	LuEye as IcView,
	LuDownload as IcDownload,
	LuShare2 as IcShare,
	LuStar as IcStar,
	LuStarOff as IcStarOff,
	LuPin as IcPin,
	LuPinOff as IcPinOff,
	LuCopyPlus as IcDuplicate,
	LuPencil as IcRename,
	LuFolderInput as IcMove,
	LuTrash2 as IcTrash,
	LuRotateCcw as IcRestore,
	LuTrash as IcPermanentDelete,
	LuAppWindow as IcOpenWith
} from 'react-icons/lu'
import {
	Menu,
	MenuItem,
	MenuDivider,
	SubMenuItem,
	ActionSheet,
	ActionSheetItem,
	ActionSheetDivider,
	ActionSheetSubItem,
	useAuth
} from '@cloudillo/react'
import { getFileUrl } from '@cloudillo/core'
import { useAtom } from 'jotai'
import { activeContextAtom } from '../../../context/index.js'
import { getHandlersForContentType } from '../../../manifest-registry.js'
import { getIcon } from '../../../icon-registry.js'

import type { File, FileOps, ViewMode } from '../types.js'
import {
	VISIBILITY_DROPDOWN_OPTIONS,
	getVisibilityIcon,
	getVisibilityOption,
	canManageFile
} from '../utils.js'

export interface ContextMenuPosition {
	x: number
	y: number
}

export interface ContextMenuProps {
	selectedFiles: File[]
	clickedFile: File
	position: ContextMenuPosition
	viewMode: ViewMode
	fileOps: FileOps
	onClose: () => void
	onMoveFiles?: (fileIds: string[]) => void
	onShare?: (file: File) => void
}

export function ContextMenu({
	selectedFiles,
	clickedFile,
	position,
	viewMode,
	fileOps,
	onClose,
	onMoveFiles,
	onShare
}: ContextMenuProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const [activeContext] = useAtom(activeContextAtom)

	// Detect mobile for ActionSheet vs Menu
	const isMobile = window.innerWidth < 768

	const count = selectedFiles.length
	const isSingleSelect = count === 1
	const file = isSingleSelect ? selectedFiles[0] : clickedFile
	const isFolder = file.fileTp === 'FLDR'
	const isTrashView = viewMode === 'trash'

	// Starred/Pinned state for single/multi selection
	const allStarred = selectedFiles.every((f) => f.userData?.starred)
	const allPinned = selectedFiles.every((f) => f.userData?.pinned)
	const isStarred = isSingleSelect ? (file.userData?.starred ?? false) : allStarred
	const isPinned = isSingleSelect ? (file.userData?.pinned ?? false) : allPinned

	const handleAction = (action: () => void) => () => {
		action()
		onClose()
	}

	const selectedFileIds = selectedFiles.map((f) => f.fileId)

	// Get handlers for "Open with" submenu
	const handlers = isSingleSelect && !isFolder ? getHandlersForContentType(file.contentType) : []
	// Collect all launch modes from all handlers
	const launchModeEntries = handlers.flatMap((h) =>
		(h.manifest.launchModes ?? []).map((mode) => ({
			manifest: h.manifest,
			mode
		}))
	)
	// Show "Open with" when multiple handlers exist or there are launch modes
	const showOpenWith = handlers.length > 1 || launchModeEntries.length > 0

	// Visibility info
	const canManage = isSingleSelect && canManageFile(file, auth?.idTag, activeContext?.roles ?? [])
	const currentVisibility = getVisibilityOption(file.visibility ?? null)

	// Use different components based on mobile/desktop
	const Item = isMobile ? ActionSheetItem : MenuItem
	const Divider = isMobile ? ActionSheetDivider : MenuDivider
	const Sub = isMobile ? ActionSheetSubItem : SubMenuItem

	const menuContent = isTrashView ? (
		// Trash view menu
		<>
			<Item
				icon={<IcRestore />}
				label={isSingleSelect ? t('Restore') : t('Restore {{count}} items', { count })}
				onClick={handleAction(() =>
					isSingleSelect
						? fileOps.doRestoreFile?.(file.fileId)
						: fileOps.doRestoreFiles?.(selectedFileIds)
				)}
			/>
			<Divider />
			<Item
				icon={<IcPermanentDelete />}
				label={
					isSingleSelect
						? t('Delete permanently')
						: t('Delete {{count}} items permanently', { count })
				}
				onClick={handleAction(() =>
					isSingleSelect
						? fileOps.doPermanentDeleteFile?.(file.fileId)
						: fileOps.doPermanentDeleteFiles?.(selectedFileIds)
				)}
				danger
			/>
		</>
	) : (
		// Normal view menu
		<>
			{/* Open - only for single selection */}
			{isSingleSelect && (
				<Item
					icon={<IcOpen />}
					label={isFolder ? t('Open folder') : t('Open')}
					onClick={handleAction(() =>
						fileOps.openFile(
							file.fileId,
							file.accessLevel === 'none' ? 'read' : file.accessLevel
						)
					)}
				/>
			)}

			{/* View in read-only mode - only for files user can edit */}
			{isSingleSelect && !isFolder && file.accessLevel === 'write' && (
				<Item
					icon={<IcView />}
					label={t('View')}
					onClick={handleAction(() => fileOps.openFile(file.fileId, 'read'))}
				/>
			)}

			{/* Open with - when multiple handlers or launch modes exist */}
			{isSingleSelect && showOpenWith && (
				<Sub icon={<IcOpenWith />} label={t('Open with...')}>
					{handlers.map((h) => {
						const AppIcon = getIcon(h.manifest.icon)
						return (
							<Item
								key={h.manifest.id}
								icon={AppIcon ? <AppIcon /> : undefined}
								label={h.manifest.name}
								onClick={handleAction(() =>
									fileOps.openFileWithApp?.(
										file.fileId,
										h.manifest.id,
										file.accessLevel === 'none' ? 'read' : file.accessLevel
									)
								)}
							/>
						)
					})}
					{launchModeEntries.length > 0 && <Divider />}
					{launchModeEntries.map((entry) => {
						const AppIcon = getIcon(entry.manifest.icon)
						return (
							<Item
								key={`${entry.manifest.id}-${entry.mode.id}`}
								icon={AppIcon ? <AppIcon /> : undefined}
								label={`${entry.manifest.name}: ${entry.mode.label}`}
								onClick={handleAction(() => {
									fileOps.openFileWithApp?.(
										file.fileId,
										entry.manifest.id,
										file.accessLevel === 'none' ? 'read' : file.accessLevel,
										'mode=' + entry.mode.id
									)
								})}
							/>
						)
					})}
				</Sub>
			)}

			{/* Download - only for single file (not folder) */}
			{isSingleSelect && !isFolder && auth?.idTag && (
				<Item
					icon={<IcDownload />}
					label={t('Download')}
					onClick={handleAction(() => {
						if (auth.idTag) {
							window.open(getFileUrl(auth.idTag, file.fileId), '_blank')
						}
					})}
				/>
			)}

			{/* Share & Visibility section */}
			{(onShare || (canManage && fileOps.setVisibility)) && <Divider />}

			{/* Share - only for single selection */}
			{isSingleSelect && onShare && (
				<Item
					icon={<IcShare />}
					label={t('Share...')}
					onClick={handleAction(() => onShare(file))}
				/>
			)}

			{/* Visibility submenu - only for single selection and owner/manager */}
			{canManage && fileOps.setVisibility && (
				<Sub
					icon={React.createElement(currentVisibility.icon)}
					label={t('Visibility')}
					detail={t(currentVisibility.labelKey)}
				>
					{VISIBILITY_DROPDOWN_OPTIONS.map((opt) => {
						const VisibilityIcon = getVisibilityIcon(opt.value)
						const isCurrentVisibility = (file.visibility ?? null) === opt.value
						return (
							<Item
								key={opt.value ?? 'null'}
								icon={<VisibilityIcon />}
								label={t(opt.labelKey)}
								onClick={handleAction(() =>
									fileOps.setVisibility!(file.fileId, opt.value)
								)}
								disabled={isCurrentVisibility}
							/>
						)
					})}
				</Sub>
			)}

			{/* Star toggle */}
			<Item
				icon={isStarred ? <IcStarOff /> : <IcStar />}
				label={
					isSingleSelect
						? isStarred
							? t('Remove star')
							: t('Add star')
						: isStarred
							? t('Remove star from {{count}} items', { count })
							: t('Add star to {{count}} items', { count })
				}
				onClick={handleAction(() =>
					isSingleSelect
						? fileOps.toggleStarred?.(file.fileId)
						: fileOps.toggleStarredBatch?.(selectedFileIds, !isStarred)
				)}
			/>

			{/* Pin toggle */}
			<Item
				icon={isPinned ? <IcPinOff /> : <IcPin />}
				label={
					isSingleSelect
						? isPinned
							? t('Unpin')
							: t('Pin to top')
						: isPinned
							? t('Unpin {{count}} items', { count })
							: t('Pin {{count}} items to top', { count })
				}
				onClick={handleAction(() =>
					isSingleSelect
						? fileOps.togglePinned?.(file.fileId)
						: fileOps.togglePinnedBatch?.(selectedFileIds, !isPinned)
				)}
			/>

			<Divider />

			{/* Rename - only for single selection */}
			{isSingleSelect && (
				<Item
					icon={<IcRename />}
					label={t('Rename')}
					onClick={handleAction(() => fileOps.renameFile(file.fileId))}
				/>
			)}

			{/* Duplicate - only for single CRDT/RTDB files */}
			{isSingleSelect && (file.fileTp === 'CRDT' || file.fileTp === 'RTDB') && (
				<Item
					icon={<IcDuplicate />}
					label={t('Duplicate')}
					onClick={handleAction(() => fileOps.doDuplicateFile?.(file.fileId))}
				/>
			)}

			{/* Move - always available */}
			{onMoveFiles && (
				<Item
					icon={<IcMove />}
					label={
						isSingleSelect ? t('Move to...') : t('Move {{count}} items...', { count })
					}
					onClick={handleAction(() => onMoveFiles(selectedFileIds))}
				/>
			)}

			<Divider />

			{/* Delete - always available */}
			<Item
				icon={<IcTrash />}
				label={
					isSingleSelect
						? t('Move to trash')
						: t('Move {{count}} items to trash', { count })
				}
				onClick={handleAction(() =>
					isSingleSelect
						? fileOps.doDeleteFile(file.fileId)
						: fileOps.doDeleteFiles?.(selectedFileIds)
				)}
				danger
			/>
		</>
	)

	// Render ActionSheet on mobile, Menu on desktop
	if (isMobile) {
		return (
			<ActionSheet
				isOpen={true}
				onClose={onClose}
				title={isSingleSelect ? file.fileName : t('{{count}} items selected', { count })}
			>
				{menuContent}
			</ActionSheet>
		)
	}

	return (
		<Menu position={position} onClose={onClose}>
			{menuContent}
		</Menu>
	)
}

// vim: ts=4
