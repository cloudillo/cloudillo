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
	LuTrash as IcPermanentDelete
} from 'react-icons/lu'
import {
	Menu,
	MenuItem,
	MenuDivider,
	ActionSheet,
	ActionSheetItem,
	ActionSheetDivider,
	useAuth
} from '@cloudillo/react'
import { getFileUrl } from '@cloudillo/core'

import type { File, FileOps, ViewMode, FileVisibility } from '../types.js'
import { VISIBILITY_DROPDOWN_OPTIONS, getVisibilityIcon } from '../utils.js'

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

	// Detect mobile for ActionSheet vs Menu
	const isMobile = window.innerWidth < 768

	const count = selectedFiles.length
	const isSingleSelect = count === 1
	const file = isSingleSelect ? selectedFiles[0] : clickedFile
	const hasFolder = selectedFiles.some((f) => f.fileTp === 'FLDR')
	const hasFile = selectedFiles.some((f) => f.fileTp !== 'FLDR')
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

	// Use different components based on mobile/desktop
	const Item = isMobile ? ActionSheetItem : MenuItem
	const Divider = isMobile ? ActionSheetDivider : MenuDivider

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

			{/* Share - only for single selection */}
			{isSingleSelect && onShare && (
				<Item
					icon={<IcShare />}
					label={t('Share...')}
					onClick={handleAction(() => onShare(file))}
				/>
			)}

			{/* Visibility - only for single selection and owner */}
			{isSingleSelect && file.owner?.idTag === auth?.idTag && fileOps.setVisibility && (
				<>
					<Divider />
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
				</>
			)}

			{/* Star toggle - always available */}
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

			{/* Pin toggle - always available */}
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
