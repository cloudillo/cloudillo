// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getFileUrl } from '@cloudillo/core'
import { Button, FileTile, HBox, Icon, InlineEditForm, Text, VBox } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuFolder as IcFolder,
	LuInfo as IcInfo,
	LuRadio as IcLive,
	LuLock as IcLock,
	LuPin as IcPin,
	LuLoaderCircle as IcProcessing,
	LuPencilOff as IcReadOnly,
	LuStar as IcStar,
	LuCloudOff as IcUnsyncedEdit
} from 'react-icons/lu'

import { useCurrentContextIdTag } from '../../../context/index.js'
import {
	type File,
	type FileOps,
	isFileProcessing,
	MANAGED_FOLDER_ID,
	TRASH_FOLDER_ID,
	type ViewMode
} from '../types.js'
import {
	canWrite,
	getSmartTimestamp,
	getVisibilityIcon,
	getVisibilityLabel,
	toAppAccess
} from '../utils.js'

function iconContentType(contentType: string | undefined, fileTp: string | undefined) {
	return fileTp === 'FLDR' ? 'cloudillo/folder' : contentType
}

interface ItemGridProps {
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

export const ItemGrid = React.memo(function ItemGrid({
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
}: ItemGridProps) {
	const contextIdTag = useCurrentContextIdTag()
	const { t } = useTranslation()

	const isFolder = file.fileTp === 'FLDR'
	const isRenaming = renameFileName !== undefined && file.fileId === renameFileId

	// Check if file has a thumbnail/variant
	const hasThumbnail = file.variantId && contextIdTag
	const isImage = file.contentType?.startsWith('image/')
	// A processing file's variants 404, so show the type icon plus a spinner badge
	// instead of a broken thumbnail until FileIdGeneratorTask finalizes its id.
	const isProcessing = isFileProcessing(file)
	const thumbSrc =
		!isProcessing && (hasThumbnail || isImage) && contextIdTag
			? getFileUrl(contextIdTag, file.variantId || file.fileId, 'vis.tn')
			: undefined

	function handleClick(evt: React.MouseEvent) {
		onClick?.(file, evt)
	}

	function handleDoubleClick(_evt: React.MouseEvent) {
		if (isFolder) {
			onDoubleClick?.(file)
		} else {
			fileOps.openFile(file.fileId, toAppAccess(file.accessLevel))
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
	const isDirect = !file.visibility || file.visibility === 'D'

	function handleStarClick(evt: React.MouseEvent) {
		evt.stopPropagation()
		fileOps.toggleStarred?.(file.fileId)
	}

	const meta = (
		<VBox gap={1}>
			{/* Parent folder context — shown only in hierarchy-agnostic views
			    or during cross-folder search. */}
			{showParentChip && file.parentName && (
				<HBox gap={1} align="center">
					<Icon as={IcFolder} />
					<Text size="sm" emphasis="muted" truncate>
						{file.parentName}
					</Text>
				</HBox>
			)}
			<Text size="sm">
				{smartTimestamp.label && <Text emphasis="muted">{t(smartTimestamp.label)} </Text>}
				{smartTimestamp.time}
			</Text>
			<HBox gap={1} align="center" wrap>
				{isProcessing && (
					<Icon as={IcProcessing} label={t('Still processing — available shortly')} />
				)}
				{isPinned && <Icon as={IcPin} label={t('Pinned')} />}
				{isLive && <Icon as={IcLive} color="success" label={t('Live document')} />}
				{isDirty && (
					<Icon
						as={IcUnsyncedEdit}
						color="warning"
						label={t('Has unsynced local edits')}
					/>
				)}
				{!isFolder &&
					file.accessLevel &&
					!canWrite(file.accessLevel) &&
					(file.accessLevel === 'none' ? (
						<Icon as={IcLock} label={t('No access')} />
					) : (
						<Icon as={IcReadOnly} label={t('Read only')} />
					))}
				{/* Direct is the default, so only a wider visibility earns an icon */}
				{!isDirect && (
					<Icon
						as={getVisibilityIcon(file.visibility ?? null)}
						label={getVisibilityLabel(t, file.visibility ?? null)}
					/>
				)}
			</HBox>
		</VBox>
	)

	const actions = (
		<>
			{!isInTrash && !isManagedView && (
				<Button
					variant="ghost"
					size="sm"
					icon={<IcStar />}
					pressed={isStarred}
					onClick={handleStarClick}
					aria-label={isStarred ? t('Unstar') : t('Star')}
				/>
			)}
			{/* Info button (visible on mobile only) */}
			{!isInTrash && onInfoClick && (
				<Button
					variant="ghost"
					size="sm"
					className="lg-hide"
					icon={<IcInfo />}
					onClick={handleInfoClick}
					aria-label={t('Show details')}
				/>
			)}
		</>
	)

	// The wrapper carries the row plumbing FileTile does not forward: `data-file-id`
	// (hand-fly, ContextMenu, keyboard shortcuts), double-click and context menu.
	return (
		<VBox
			data-file-id={file.fileId}
			data-source-context={contextIdTag ?? undefined}
			onDoubleClick={handleDoubleClick}
			onContextMenu={handleContextMenu}
		>
			<FileTile
				className={className}
				selected={selected}
				name={
					isRenaming ? (
						<InlineEditForm
							value={renameFileName}
							onSave={(newName) => fileOps.doRenameFile(file.fileId, newName)}
							onCancel={() => fileOps.setRenameFileName(undefined)}
							size="small"
						/>
					) : (
						file.fileName
					)
				}
				onClick={isRenaming ? undefined : handleClick}
				src={thumbSrc}
				alt={file.fileName}
				contentType={iconContentType(file.contentType, file.fileTp)}
				meta={meta}
				actions={actions}
			/>
		</VBox>
	)
})

// vim: ts=4
