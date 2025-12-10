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
import { getFileUrl } from '@cloudillo/base'

import type { File, FileOps, ViewMode } from '../types.js'

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
	favoriteIds: Set<string>
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
	favoriteIds,
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

	// Favorite state for single/multi selection
	const allFavorites = selectedFiles.every((f) => favoriteIds.has(f.fileId))
	const noneFavorites = selectedFiles.every((f) => !favoriteIds.has(f.fileId))
	const isFavorite = isSingleSelect ? favoriteIds.has(file.fileId) : allFavorites

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

			{/* Favorite toggle - always available */}
			<Item
				icon={isFavorite ? <IcStarOff /> : <IcStar />}
				label={
					isSingleSelect
						? isFavorite
							? t('Remove from favorites')
							: t('Add to favorites')
						: isFavorite
							? t('Remove {{count}} from favorites', { count })
							: t('Add {{count}} to favorites', { count })
				}
				onClick={handleAction(() =>
					isSingleSelect
						? fileOps.toggleFavorite?.(file.fileId)
						: fileOps.toggleFavorites?.(selectedFileIds, !isFavorite)
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
