// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Button,
	DocBar,
	IcBack,
	IcClose,
	IcHome,
	IcInfo,
	IcMore,
	IcPin,
	IcSearch,
	IcSeparator,
	IcShare,
	Menu,
	MenuItem,
	SearchInput,
	Toolbar,
	useIsMobile,
	VisuallyHidden
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import {
	IcDeleteForever,
	IcEmptyTrash,
	IcRestore,
	IcStar,
	IcTrash,
	IcUnpin,
	IcUnstar
} from '../../../icons.js'
import { DrawerToggle } from '../../../ui/DrawerToggle.js'
import type { FileOwnerScopeOverride } from '../hooks/useFileOwnerScope.js'
import { useFileAccess } from '../hooks/useFileAccess.js'
import type { BreadcrumbItem } from '../hooks/useFileNavigation.js'
import type { FilesScope } from '../hooks/useFilesFilters.js'
import type { File, FileOps, ViewMode } from '../types.js'
import { AccessSlot, type AccessSlotFallback } from './AccessSlot.js'

export type DisplayMode = 'grid' | 'list'

export interface FilesBarProps {
	viewMode: ViewMode
	effectiveScope: FilesScope
	/** Name of the place's root: the drive (`~room · Title` / context name). Remote: share root. */
	driveTitle?: string
	/** `useFileNavigation().breadcrumbs`: root first, current folder last */
	breadcrumbs: BreadcrumbItem[]
	onNavigate: (folderId: string | null) => void
	/** Remote browsing: the node's owner and our level there */
	remote?: { ownerIdTag?: string; permission: 'write' | 'read' }
	/** The folder being browsed (`useCurrentFolder`); undefined at the drive root */
	currentFolder?: File
	/** The browsed folder's id from the route, known before `currentFolder` loads */
	folderId: string | null
	ownerScope?: FileOwnerScopeOverride
	/** Drive-root audience for the access slot (no entry to ask the endpoint about) */
	slotFallback?: AccessSlotFallback
	onShare: (file: File) => void
	onInfo: () => void
	onEmptyTrash?: () => void
	/** Desktop `CreateMenu`, already gated by the caller */
	createMenu?: React.ReactNode
	onOpenNav: () => void
	/** URL `q` and filter count (`useFilesFilters`) */
	q: string
	onSearch: (q: string | null) => void
	activeCount: number
	onClearFilters: () => void
	/** Multi-selection; ≥1 switches the bar to selection mode */
	selectedFiles: File[]
	onClearSelection: () => void
	fileOps: FileOps
}

/**
 * The Files top bar: a `DocBar` describing the PLACE (title + crumb, access slot, New / Share /
 * ⓘ / Empty trash), or the multi-selection and its batch actions while files are selected.
 */
export function FilesBar({
	viewMode,
	effectiveScope,
	driveTitle,
	breadcrumbs,
	onNavigate,
	remote,
	currentFolder,
	folderId,
	ownerScope,
	slotFallback,
	onShare,
	onInfo,
	onEmptyTrash,
	createMenu,
	onOpenNav,
	q,
	onSearch,
	activeCount,
	onClearFilters,
	selectedFiles,
	onClearSelection,
	fileOps
}: FilesBarProps) {
	const { t } = useTranslation()
	const isMobile = useIsMobile()

	const isBrowse = viewMode === 'browse'
	const allDrives = isBrowse && effectiveScope === 'all'
	const selCount = selectedFiles.length
	const selecting = selCount > 0
	const placeFolder = isBrowse && !allDrives ? currentFolder : undefined
	const { access } = useFileAccess(placeFolder, ownerScope)

	// Search: local text, written to `q` debounced (replace). Expanded whenever `q` is set.
	const [text, setText] = React.useState(q)
	const [searchOpen, setSearchOpen] = React.useState(false)
	// A ref, so a parent re-render (new `onSearch` identity) does not restart the timer
	const onSearchRef = React.useRef(onSearch)
	onSearchRef.current = onSearch
	React.useEffect(() => setText(q), [q])
	// Navigating drops a pending keystroke, so it never lands as `q` on the new folder
	React.useEffect(() => setText(q), [folderId])
	React.useEffect(() => {
		if (text === q) return
		const timer = setTimeout(() => onSearchRef.current(text || null), 300)
		return () => clearTimeout(timer)
	}, [text, q])
	const searchExpanded = searchOpen || !!q || !!text

	function onSearchKeyDown(evt: React.KeyboardEvent<HTMLInputElement>) {
		if (evt.key !== 'Escape') return
		evt.preventDefault()
		if (text) {
			setText('')
			onSearch(null)
			return
		}
		setSearchOpen(false)
		evt.currentTarget.blur()
		// useKeyboardShortcuts ignores input targets, so the selection's Esc is ours here
		if (selecting) onClearSelection()
	}

	// Title + crumb in reading order: Drive › … › Parent › Folder
	const root = breadcrumbs[0]
	const current = breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 1] : undefined
	const between = breadcrumbs.slice(1, -1)
	const hidden = between.slice(0, -1)
	const parent = between[between.length - 1]
	const placeName = remote ? root?.name : driveTitle
	const title = selecting
		? t('{{count}} selected', { count: selCount })
		: viewMode === 'trash'
			? t('Trash')
			: viewMode === 'managed'
				? t('Managed')
				: allDrives
					? t('All drives')
					: placeName
	const showTrail = !selecting && isBrowse && !allDrives && !!current

	function levelsMenu(levels: BreadcrumbItem[]) {
		return (
			<Menu
				trigger={
					<Button variant="ghost" size="sm" icon={<IcMore />} aria-label={t('More')} />
				}
			>
				{levels.map((item) => (
					<MenuItem
						key={item.id ?? ''}
						label={item.name}
						onClick={() => onNavigate(item.id)}
					/>
				))}
			</Menu>
		)
	}

	const crumbs = showTrail && between.length > 0 && (
		<>
			{hidden.length > 0 && (
				<>
					<IcSeparator className="c-docbar-sep" aria-hidden="true" />
					{levelsMenu(hidden)}
				</>
			)}
			{parent && (
				<>
					<IcSeparator className="c-docbar-sep" aria-hidden="true" />
					<Button variant="ghost" size="sm" onClick={() => onNavigate(parent.id)}>
						{parent.name}
					</Button>
				</>
			)}
		</>
	)

	const titleActions = selecting ? (
		<Button
			variant="ghost"
			size="sm"
			icon={<IcClose />}
			aria-label={t('Clear selection')}
			onClick={onClearSelection}
		/>
	) : (
		showTrail &&
		root && (
			<Button
				variant="ghost"
				size="sm"
				icon={<IcHome />}
				aria-label={placeName ?? root.name}
				onClick={() => onNavigate(root.id)}
			/>
		)
	)

	const searchInput = (
		<SearchInput
			autoFocus={searchOpen && !q}
			className={isMobile ? 'flex-fill' : undefined}
			aria-label={t('Search names in {{place}}', { place: title ?? '' })}
			value={text}
			onChange={(evt) => setText(evt.target.value)}
			onKeyDown={onSearchKeyDown}
			onBlur={() => {
				if (!text) setSearchOpen(false)
			}}
		/>
	)

	const subActions = (
		<>
			{activeCount > 0 && (
				<Button
					variant="ghost"
					size="sm"
					aria-label={t('Clear {{count}} filters', { count: activeCount })}
					onClick={onClearFilters}
				>
					{`· ${t('{{count}} filters', { count: activeCount })}`}
				</Button>
			)}
			{searchExpanded ? (
				searchInput
			) : (
				<Button
					variant="ghost"
					size="sm"
					icon={<IcSearch />}
					aria-label={t('Search')}
					onClick={() => setSearchOpen(true)}
				/>
			)}
		</>
	)

	const ids = selectedFiles.map((f) => f.entryId)
	const allStarred = selectedFiles.every((f) => f.userData?.starred)
	const allPinned = selectedFiles.every((f) => f.userData?.pinned)
	const selectionActions =
		viewMode === 'trash' ? (
			<>
				<Button
					variant="ghost"
					icon={<IcRestore />}
					aria-label={t('Restore {{count}} items', { count: selCount })}
					onClick={() => fileOps.doRestoreFiles?.(ids)}
				/>
				<Button
					variant="ghost"
					color="error"
					icon={<IcDeleteForever />}
					aria-label={t('Delete {{count}} items permanently', { count: selCount })}
					onClick={() => fileOps.doPermanentDeleteFiles?.(ids)}
				/>
			</>
		) : (
			!remote &&
			viewMode !== 'managed' && (
				<>
					<Button
						variant="ghost"
						icon={allStarred ? <IcUnstar /> : <IcStar />}
						aria-label={
							allStarred
								? t('Remove star from {{count}} items', { count: selCount })
								: t('Add star to {{count}} items', { count: selCount })
						}
						onClick={() => fileOps.toggleStarredBatch?.(ids, !allStarred)}
					/>
					<Button
						variant="ghost"
						icon={allPinned ? <IcUnpin /> : <IcPin />}
						aria-label={
							allPinned
								? t('Unpin {{count}} items', { count: selCount })
								: t('Pin {{count}} items to top', { count: selCount })
						}
						onClick={() => fileOps.togglePinnedBatch?.(ids, !allPinned)}
					/>
					<Button
						variant="ghost"
						color="error"
						icon={<IcTrash />}
						aria-label={t('Move {{count}} items to trash', { count: selCount })}
						onClick={() => fileOps.doDeleteFiles?.(ids)}
					/>
				</>
			)
		)

	const placeActions = (
		<>
			<AccessSlot
				access={placeFolder ? access : undefined}
				fallback={placeFolder ? undefined : slotFallback}
				remotePermission={remote?.permission}
				hidden={!isBrowse || allDrives}
				compact={isMobile}
				onNavigateToFolder={onNavigate}
				onManage={placeFolder && (() => onShare(placeFolder))}
			/>
			{onEmptyTrash && viewMode === 'trash' && (
				<Button
					variant="ghost"
					color="error"
					icon={<IcEmptyTrash />}
					aria-label={t('Empty trash')}
					onClick={onEmptyTrash}
				/>
			)}
			{placeFolder && (
				<>
					<Button
						variant="ghost"
						icon={<IcInfo />}
						aria-label={t('Details')}
						onClick={onInfo}
					/>
					<Button
						variant="ghost"
						icon={<IcShare />}
						disabledReason={
							access?.canManage
								? undefined
								: t('Only people who can manage sharing can change it')
						}
						onClick={() => onShare(placeFolder)}
					>
						{!isMobile && t('Share')}
					</Button>
				</>
			)}
			{isBrowse && !allDrives && createMenu}
		</>
	)

	// Mobile search takeover: ← and the input across the whole bar; ← = the second Esc
	if (isMobile && searchExpanded && !selecting) {
		return (
			<Toolbar aria-label={t('Search')}>
				<Button
					variant="ghost"
					size="sm"
					icon={<IcBack />}
					aria-label={t('Back')}
					onClick={() => {
						setText('')
						setSearchOpen(false)
						if (q) onSearch(null)
					}}
				/>
				{searchInput}
			</Toolbar>
		)
	}

	return (
		<>
			<DocBar
				title={title}
				state={title ? 'ready' : 'loading'}
				owner={remote && { idTag: remote.ownerIdTag, name: root?.ownerName }}
				showOwner={!!remote && !selecting}
				start={
					<>
						<DrawerToggle nav onClick={onOpenNav} />
						{/* Narrow bars hide the title and crumbs behind `sub` (DocBar CSS): every
						    level above the current folder goes into one menu instead */}
						{isMobile && showTrail && levelsMenu(breadcrumbs.slice(0, -1))}
					</>
				}
				titleActions={titleActions || undefined}
				crumbs={crumbs || undefined}
				sub={showTrail && current ? { label: current.name } : undefined}
				subActions={subActions}
			>
				{selecting ? selectionActions : placeActions}
			</DocBar>
			<VisuallyHidden aria-live="polite">
				{selecting ? t('{{count}} selected', { count: selCount }) : ''}
			</VisuallyHidden>
		</>
	)
}

// vim: ts=4
