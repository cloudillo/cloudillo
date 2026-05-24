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
	LuRefreshCw as IcRefresh,
	LuTrash2 as IcTrash,
	LuRotateCcw as IcRestore,
	LuTrash as IcPermanentDelete,
	LuAppWindow as IcOpenWith,
	LuHand as IcHand
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
	useAuth,
	useToast
} from '@cloudillo/react'
import { getFileUrl } from '@cloudillo/core'
import { useAtom, useStore } from 'jotai'
import { activeContextAtom } from '../../../context/index.js'
import { pickUp, HandTypeConflictError, type FileHandItem } from '../../../state/hand.js'
import { handTargetElAtom, flyToHand, prefersReducedMotion } from '../../../state/hand-fly.js'
import { getHandlersForContentType } from '../../../manifest-registry.js'
import { getIcon } from '../../../icon-registry.js'

import type { File, FileOps, ViewMode } from '../types.js'
import {
	getVisibilityDropdownOptions,
	getVisibilityIcon,
	getVisibilityOption,
	canManageFile
} from '../utils.js'

export interface ContextMenuPosition {
	x: number
	y: number
}

interface PickUpOpts {
	activeContextIdTag: string
	selectedFiles: File[]
	inTrash: boolean
	store: ReturnType<typeof useStore>
	toast: ReturnType<typeof useToast>
	t: ReturnType<typeof useTranslation>['t']
}

// On the very first pickup, HandChip is still mounting and handTargetElAtom
// is still being populated. Poll across a handful of animation frames.
const PICKUP_TARGET_POLL_FRAMES = 6

function doPickUp(opts: PickUpOpts) {
	const ctxIdTag = opts.activeContextIdTag
	const items: FileHandItem[] = opts.selectedFiles.map((f) => ({
		type: 'file' as const,
		id: f.fileId,
		idTag: f.owner?.idTag ?? ctxIdTag,
		sourceContext: ctxIdTag,
		sourceParentId: !f.parentId || f.parentId === '__root__' ? null : f.parentId,
		label: f.fileName,
		fileTp: f.fileTp,
		contentType: f.contentType,
		brokenAt: f.brokenAt,
		inTrash: opts.inTrash
	}))

	const reduced = prefersReducedMotion()

	// Briefly lift each source row to telegraph the pickup. Safe to add to
	// elements that have already been removed (no-op on null).
	if (!reduced) {
		for (const it of items) {
			const sel = `[data-file-id="${CSS.escape(it.id)}"][data-source-context="${CSS.escape(it.sourceContext)}"]`
			const el =
				document.querySelector(sel) ??
				document.querySelector(`[data-file-id="${CSS.escape(it.id)}"]`)
			if (el instanceof HTMLElement) {
				el.classList.add('cl-pickup-lift')
				window.setTimeout(() => el.classList.remove('cl-pickup-lift'), 260)
			}
		}
	}

	try {
		pickUp(opts.store.get, opts.store.set, items)
		opts.toast.success(opts.t('Picked up {{count}} files', { count: items.length }))
		if (!reduced) {
			// On the very first pickup the HandChip is mounting *now* — its ref
			// callback hasn't populated handTargetElAtom yet. Poll across a few
			// animation frames so the parcel flight starts as soon as the icon
			// node is available.
			const tryFly = (tries: number) => {
				const target = opts.store.get(handTargetElAtom)
				if (target) {
					void flyToHand({ items, target, reducedMotion: false })
				} else if (tries > 0) {
					requestAnimationFrame(() => tryFly(tries - 1))
				}
			}
			tryFly(PICKUP_TARGET_POLL_FRAMES)
		}
	} catch (err) {
		if (err instanceof HandTypeConflictError) {
			opts.toast.warning(opts.t('Hand contains a different item type. Empty the hand first.'))
		} else {
			throw err
		}
	}
}

export interface ContextMenuProps {
	selectedFiles: File[]
	clickedFile: File
	position: ContextMenuPosition
	viewMode: ViewMode
	fileOps: FileOps
	onClose: () => void
	onShare?: (file: File) => void
	isRemoteBrowsing?: boolean
}

export function ContextMenu({
	selectedFiles,
	clickedFile,
	position,
	viewMode,
	fileOps,
	onClose,
	onShare,
	isRemoteBrowsing
}: ContextMenuProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const [activeContext] = useAtom(activeContextAtom)
	const store = useStore()
	const toast = useToast()

	// Detect mobile for ActionSheet vs Menu
	const isMobile = window.innerWidth < 768

	const count = selectedFiles.length
	const isSingleSelect = count === 1
	const file = isSingleSelect ? selectedFiles[0] : clickedFile
	const isFolder = file.fileTp === 'FLDR'
	const isTrashView = viewMode === 'trash'
	const isManagedView = viewMode === 'managed'

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
	const currentVisibility = getVisibilityOption(t, file.visibility ?? null)
	const visibilityDropdownOptions = getVisibilityDropdownOptions(t)

	// Use different components based on mobile/desktop
	const Item = isMobile ? ActionSheetItem : MenuItem
	const Divider = isMobile ? ActionSheetDivider : MenuDivider
	const Sub = isMobile ? ActionSheetSubItem : SubMenuItem

	const renderPickUpItem = (inTrash: boolean) =>
		activeContext && (
			<Item
				icon={<IcHand />}
				label={count > 1 ? t('Pick up {{count}} files', { count }) : t('Pick up')}
				onClick={handleAction(() =>
					doPickUp({
						activeContextIdTag: activeContext.idTag,
						selectedFiles,
						inTrash,
						store,
						toast,
						t
					})
				)}
			/>
		)

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
			{renderPickUpItem(true)}
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

			{/* Pick up — Hand pick-up; works in normal and trash views */}
			{!isTrashView && !isManagedView && renderPickUpItem(false)}

			{/* Share & Visibility section — hidden in remote browsing */}
			{!isRemoteBrowsing &&
				!isManagedView &&
				(onShare || (canManage && fileOps.setVisibility)) && <Divider />}

			{/* Share - only for single selection */}
			{!isRemoteBrowsing && !isManagedView && isSingleSelect && onShare && (
				<Item
					icon={<IcShare />}
					label={t('Share...')}
					onClick={handleAction(() => onShare(file))}
				/>
			)}

			{/* Visibility submenu - only for single selection and owner/manager */}
			{!isRemoteBrowsing && !isManagedView && canManage && fileOps.setVisibility && (
				<Sub
					icon={React.createElement(currentVisibility.icon)}
					label={t('Visibility')}
					detail={currentVisibility.label}
				>
					{visibilityDropdownOptions.map((opt) => {
						const VisibilityIcon = getVisibilityIcon(opt.value)
						const isCurrentVisibility = (file.visibility ?? null) === opt.value
						return (
							<Item
								key={opt.value ?? 'null'}
								icon={<VisibilityIcon />}
								label={opt.label}
								onClick={handleAction(() =>
									fileOps.setVisibility!(file.fileId, opt.value)
								)}
								disabled={isCurrentVisibility}
							/>
						)
					})}
				</Sub>
			)}

			{/* Star toggle — hidden in remote browsing */}
			{!isRemoteBrowsing && !isManagedView && (
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
			)}

			{/* Pin toggle — hidden in remote browsing */}
			{!isRemoteBrowsing && !isManagedView && (
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
			)}

			{/* Refresh metadata - only for cross-context (remote) file rows */}
			{!isRemoteBrowsing &&
				!isManagedView &&
				isSingleSelect &&
				file.owner?.idTag &&
				file.owner.idTag !== activeContext?.idTag && (
					<Item
						icon={<IcRefresh />}
						label={t('Refresh metadata')}
						onClick={handleAction(() => fileOps.doRefreshFile?.(file.fileId))}
					/>
				)}

			{!isRemoteBrowsing && !isManagedView && <Divider />}

			{/* Rename - only for single selection */}
			{!isRemoteBrowsing && !isManagedView && isSingleSelect && (
				<Item
					icon={<IcRename />}
					label={t('Rename')}
					onClick={handleAction(() => fileOps.renameFile(file.fileId))}
				/>
			)}

			{/* Duplicate - only for single CRDT/RTDB files */}
			{!isRemoteBrowsing &&
				!isManagedView &&
				isSingleSelect &&
				(file.fileTp === 'CRDT' || file.fileTp === 'RTDB') && (
					<Item
						icon={<IcDuplicate />}
						label={t('Duplicate')}
						onClick={handleAction(() => fileOps.doDuplicateFile?.(file.fileId))}
					/>
				)}

			{!isRemoteBrowsing && !isManagedView && <Divider />}

			{/* Delete — hidden in remote browsing */}
			{!isRemoteBrowsing && !isManagedView && (
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
			)}
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
