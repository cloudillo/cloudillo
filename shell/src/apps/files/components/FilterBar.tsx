// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	ActionSheet,
	Button,
	HBox,
	IcFilter,
	IcGridView,
	IcList,
	IcMore,
	IcSortAsc,
	IcSortDesc,
	Menu,
	MenuDivider,
	MenuItem,
	Segmented,
	SegmentedItem,
	SubMenuItem,
	Tag,
	Text,
	Toolbar,
	ToolbarDivider,
	ToolbarSpacer,
	useIsMobile,
	VBox,
	VisuallyHidden
} from '@cloudillo/react'
import { useAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { IcBrowse, IcFilesApp, IcRecent, IcRoom, IcStar } from '../../../icons.js'
import { displayModeAtom, type FilesSortField, sortAtom } from '../atoms.js'
import {
	countActiveFilters,
	type FilesAccess,
	type FilesFilterUpdates,
	type FilesModified,
	type FilesOwner,
	type FilesPerm,
	type FilesType,
	useFilesFilters
} from '../hooks/useFilesFilters.js'
import type { DisplayMode } from './FilesBar.js'
import { TagFilter } from './TagFilter.js'

type TFn = ReturnType<typeof useTranslation>['t']

function typeLabels(t: TFn): Record<FilesType, string> {
	return { doc: t('Documents'), file: t('Files'), image: t('Images'), folder: t('Folders') }
}
function accessLabels(t: TFn): Record<FilesAccess, string> {
	return {
		private: t('Private'),
		audience: t('Audience'),
		people: t('Shared with people'),
		link: t('Shared by link'),
		public: t('Public')
	}
}
function ownerLabels(t: TFn): Record<FilesOwner, string> {
	return { me: t('Me'), others: t('Others') }
}
function modifiedLabels(t: TFn): Record<FilesModified, string> {
	return { '7d': t('Last 7 days'), '30d': t('Last 30 days'), '365d': t('Last year') }
}
function permLabels(t: TFn): Record<FilesPerm, string> {
	return { edit: t('Can edit'), read: t('Read only') }
}
function sortLabels(t: TFn): Record<FilesSortField, string> {
	return { name: t('Name'), modified: t('Modified'), created: t('Created') }
}

/** `⋯` extras: once set, each pins into the bar as a removable chip */
type Extra = 'owner' | 'modified' | 'perm'
const EXTRA_KEYS: Extra[] = ['owner', 'modified', 'perm']

function extraOptions(t: TFn): Record<Extra, { label: string; values: Record<string, string> }> {
	return {
		owner: { label: t('Owner'), values: ownerLabels(t) },
		modified: { label: t('Modified'), values: modifiedLabels(t) },
		perm: { label: t('My permission'), values: permLabels(t) }
	}
}

/** Content width below which the bar collapses */
const COLLAPSE_PX = 720

/** True while `ref`'s element is narrower than `px` (content width, not the viewport) */
function useNarrow(ref: React.RefObject<HTMLElement | null>, px: number): boolean {
	const [narrow, setNarrow] = React.useState(false)
	React.useLayoutEffect(() => {
		const el = ref.current
		if (!el || typeof ResizeObserver === 'undefined') return
		const check = () => setNarrow(el.clientWidth < px)
		check()
		const ro = new ResizeObserver(check)
		ro.observe(el)
		return () => ro.disconnect()
	}, [ref, px])
	return narrow
}

/** A labelled group of option chips inside the Filters sheet */
function SheetGroup({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<VBox gap={1}>
			<Text size="sm" emphasis="muted">
				{label}
			</Text>
			<HBox gap={1} wrap role="group" aria-label={label}>
				{children}
			</HBox>
		</VBox>
	)
}

/**
 * The Files filter bar: scope chip, Recent/Starred, Type, Access, pinned extras + `⋯`,
 * Tags, Clear; then a second row with Sort (left) and List/Grid (right). All filter state is in
 * the URL (`useFilesFilters`). Below ~720px of content width the bar collapses to
 * `[scope] [Filters · n] [Tags]`, the rest moving into a Filters sheet, plus a scrolling row of
 * the active filters.
 */
export function FilterBar({ roomName, folderName }: { roomName: string; folderName?: string }) {
	const { t } = useTranslation()
	const { filters, effectiveScope, activeCount, setFilter, setScope, clearAll } =
		useFilesFilters()
	const [sort, setSort] = useAtom(sortAtom)
	const [displayMode, setDisplayMode] = useAtom(displayModeAtom)
	const isMobile = useIsMobile()
	const barRef = React.useRef<HTMLDivElement>(null)
	// ResizeObserver, not a container query: the collapse also swaps what React renders
	const narrow = useNarrow(barRef, COLLAPSE_PX)
	const [sheetOpen, setSheetOpen] = React.useState(false)

	// A finder flipping the derived scope (no explicit `scope`): announce it
	const prevScope = React.useRef(effectiveScope)
	const [announce, setAnnounce] = React.useState('')
	React.useEffect(() => {
		const prev = prevScope.current
		prevScope.current = effectiveScope
		if (prev === effectiveScope || filters.scope) return
		setAnnounce(
			effectiveScope === 'room'
				? t('Searching all of {{place}}, including subfolders', { place: roomName })
				: t('Back to {{place}}', { place: folderName ?? roomName })
		)
	}, [effectiveScope, filters.scope, roomName, folderName, t])
	// A finder widened the derived scope past the current folder: kept emphasized while it lasts
	const widened = !filters.scope && effectiveScope === 'room'
	const onlyLabel = folderName
		? t('Only {{place}}', { place: folderName })
		: t('Only top level of {{place}}', { place: roomName })
	const allLabel = t('All of {{place}}', { place: roomName })
	const canClear = activeCount > 0 || !!filters.scope

	const types = typeLabels(t)
	const accesses = accessLabels(t)
	const extras = extraOptions(t)
	const sorts = sortLabels(t)
	const unpinned = EXTRA_KEYS.filter((key) => !filters[key])
	// The sheet's own filters: everything but the name search and the Tags button
	const sheetCount = countActiveFilters({ ...filters, q: '', tags: [] })

	function nextAccess(value: FilesAccess): FilesAccess[] {
		return filters.access.includes(value)
			? filters.access.filter((a) => a !== value)
			: [...filters.access, value]
	}

	function toggleAccess(evt: React.MouseEvent, value: FilesAccess) {
		// Multi-select: keep the menu open
		evt.preventDefault()
		setFilter({ access: nextAccess(value) })
	}

	const scopeMenu = (
		<>
			{effectiveScope === 'all' ? (
				<Tag
					color="primary"
					icon={<IcFilesApp />}
					onRemove={() => setFilter({ scope: null })}
				>
					{t('All rooms')}
				</Tag>
			) : (
				<Menu
					trigger={
						<Tag
							caret
							icon={effectiveScope === 'folder' ? <IcBrowse /> : <IcRoom />}
							color={filters.scope ? 'primary' : widened ? 'accent' : undefined}
						>
							{effectiveScope === 'folder' ? (folderName ?? roomName) : allLabel}
						</Tag>
					}
				>
					<MenuItem
						icon={<IcBrowse />}
						label={onlyLabel}
						selected={effectiveScope === 'folder'}
						onClick={() => setScope('folder')}
					/>
					<MenuItem
						icon={<IcRoom />}
						label={allLabel}
						selected={effectiveScope === 'room'}
						onClick={() => setScope('room')}
					/>
				</Menu>
			)}
			{widened && (
				<Tag icon={<IcBrowse />} onClick={() => setScope('folder')}>
					{onlyLabel}
				</Tag>
			)}
			<VisuallyHidden aria-live="polite">{announce}</VisuallyHidden>
		</>
	)

	const finderToggles = (
		<>
			<Tag
				icon={<IcRecent />}
				pressed={filters.recent}
				onClick={() => setFilter({ recent: !filters.recent })}
			>
				{t('Recent')}
			</Tag>
			<Tag
				icon={<IcStar />}
				pressed={filters.starred}
				onClick={() => setFilter({ starred: !filters.starred })}
			>
				{t('Starred')}
			</Tag>
		</>
	)

	const sortControl = filters.recent ? (
		<Button
			variant="ghost"
			size="sm"
			icon={<IcSortDesc />}
			disabledReason={t('Sorted by last opened while Recent is on')}
		>
			{t('Last opened')}
		</Button>
	) : (
		<Menu
			placement="bottom-end"
			trigger={
				<Button
					variant="ghost"
					size="sm"
					icon={sort.dir === 'asc' ? <IcSortAsc /> : <IcSortDesc />}
					aria-label={t('Sort by {{field}}', { field: sorts[sort.field] })}
				>
					{sorts[sort.field]}
				</Button>
			}
		>
			{(Object.keys(sorts) as FilesSortField[]).map((field) => (
				<MenuItem
					key={field}
					label={sorts[field]}
					selected={sort.field === field}
					onClick={() => setSort({ ...sort, field })}
				/>
			))}
			<MenuDivider />
			<MenuItem
				label={t('Ascending')}
				selected={sort.dir === 'asc'}
				onClick={() => setSort({ ...sort, dir: 'asc' })}
			/>
			<MenuItem
				label={t('Descending')}
				selected={sort.dir === 'desc'}
				onClick={() => setSort({ ...sort, dir: 'desc' })}
			/>
		</Menu>
	)

	const layoutControl = (
		<Segmented
			size="sm"
			aria-label={t('Layout')}
			value={displayMode}
			onChange={(v) => setDisplayMode(v as DisplayMode)}
		>
			<SegmentedItem value="list" icon={IcList} label={t('List')} />
			<SegmentedItem value="grid" icon={IcGridView} label={t('Grid')} />
		</Segmented>
	)

	const tagFilter = <TagFilter selected={filters.tags} onChange={(tags) => setFilter({ tags })} />

	const extraChips = EXTRA_KEYS.map((key) => {
		const value = filters[key]
		if (!value) return null
		const { label, values } = extras[key]
		return (
			<Tag
				key={key}
				color="primary"
				onRemove={() => setFilter({ [key]: null } as FilesFilterUpdates)}
				removeLabel={t('Remove {{filter}} filter', { filter: label })}
			>
				{`${label}: ${values[value]}`}
			</Tag>
		)
	})

	function removable(key: string, label: string, onRemove: () => void) {
		return (
			<Tag
				key={key}
				color="primary"
				onRemove={onRemove}
				removeLabel={t('Remove {{filter}} filter', { filter: label })}
			>
				{label}
			</Tag>
		)
	}

	// Collapsed: the active sheet filters as a scrolling row of removable chips
	const activeRow = narrow && sheetCount > 0 && (
		<Toolbar className="scroll" aria-label={t('Active filters')}>
			{filters.recent && removable('recent', t('Recent'), () => setFilter({ recent: null }))}
			{filters.starred &&
				removable('starred', t('Starred'), () => setFilter({ starred: null }))}
			{filters.type &&
				removable('type', types[filters.type], () => setFilter({ type: null }))}
			{filters.access.map((a) =>
				removable(`access-${a}`, accesses[a], () => setFilter({ access: nextAccess(a) }))
			)}
			{extraChips}
		</Toolbar>
	)

	const sheet = (
		<ActionSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} title={t('Filters')}>
			<VBox gap={3} padding={2}>
				<SheetGroup label={t('Filters')}>{finderToggles}</SheetGroup>
				<SheetGroup label={t('Type')}>
					<Tag pressed={!filters.type} onClick={() => setFilter({ type: null })}>
						{t('Any type')}
					</Tag>
					{(Object.keys(types) as FilesType[]).map((type) => (
						<Tag
							key={type}
							pressed={filters.type === type}
							onClick={() => setFilter({ type })}
						>
							{types[type]}
						</Tag>
					))}
				</SheetGroup>
				<SheetGroup label={t('Access')}>
					{(Object.keys(accesses) as FilesAccess[]).map((access) => (
						<Tag
							key={access}
							pressed={filters.access.includes(access)}
							onClick={() => setFilter({ access: nextAccess(access) })}
						>
							{accesses[access]}
						</Tag>
					))}
				</SheetGroup>
				{EXTRA_KEYS.map((key) => (
					<SheetGroup key={key} label={extras[key].label}>
						{Object.entries(extras[key].values).map(([value, label]) => (
							<Tag
								key={value}
								pressed={filters[key] === value}
								onClick={() =>
									setFilter({
										[key]: filters[key] === value ? null : value
									} as FilesFilterUpdates)
								}
							>
								{label}
							</Tag>
						))}
					</SheetGroup>
				))}
				{canClear && (
					<Button variant="ghost" onClick={clearAll}>
						{t('Clear filters')}
					</Button>
				)}
			</VBox>
		</ActionSheet>
	)

	return (
		<>
			<VBox gap={0} className="files-filters">
				<Toolbar
					ref={barRef}
					className="flex-wrap"
					// Hides on scroll down on phones; the header sits above the scroll area, so it
					// is sticky by construction. Reduced motion is handled in OpalUI c-toolbar.css.
					autoHide={isMobile}
					aria-label={t('Filters')}
				>
					{scopeMenu}
					{narrow ? (
						<>
							<Tag
								icon={<IcFilter />}
								color={sheetCount > 0 ? 'primary' : undefined}
								count={sheetCount || undefined}
								aria-haspopup="dialog"
								onClick={() => setSheetOpen(true)}
							>
								{t('Filters')}
							</Tag>
							{tagFilter}
						</>
					) : (
						<>
							<ToolbarDivider />
							{finderToggles}
							<Menu
								trigger={
									<Tag caret color={filters.type ? 'primary' : undefined}>
										{filters.type ? types[filters.type] : t('Type')}
									</Tag>
								}
							>
								<MenuItem
									label={t('Any type')}
									selected={!filters.type}
									onClick={() => setFilter({ type: null })}
								/>
								{(Object.keys(types) as FilesType[]).map((type) => (
									<MenuItem
										key={type}
										label={types[type]}
										selected={filters.type === type}
										onClick={() => setFilter({ type })}
									/>
								))}
							</Menu>
							<Menu
								trigger={
									<Tag
										caret
										color={filters.access.length > 0 ? 'primary' : undefined}
										count={filters.access.length || undefined}
									>
										{t('Access')}
									</Tag>
								}
							>
								{(Object.keys(accesses) as FilesAccess[]).map((access) => (
									<MenuItem
										key={access}
										label={accesses[access]}
										checked={filters.access.includes(access)}
										onClick={(evt) => toggleAccess(evt, access)}
									/>
								))}
							</Menu>
							{extraChips}
							{unpinned.length > 0 && (
								<Menu
									trigger={
										<Button
											variant="ghost"
											size="sm"
											icon={<IcMore />}
											aria-label={t('More filters')}
										/>
									}
								>
									{unpinned.map((key) => (
										<SubMenuItem key={key} label={extras[key].label}>
											{Object.entries(extras[key].values).map(
												([value, label]) => (
													<MenuItem
														key={value}
														label={label}
														onClick={() =>
															setFilter({
																[key]: value
															} as FilesFilterUpdates)
														}
													/>
												)
											)}
										</SubMenuItem>
									))}
								</Menu>
							)}
							<ToolbarDivider />
							{tagFilter}
							<ToolbarSpacer />
							{canClear && (
								<Button variant="ghost" size="sm" onClick={clearAll}>
									{t('Clear')}
								</Button>
							)}
						</>
					)}
				</Toolbar>
				{activeRow}
				<Toolbar autoHide={isMobile} aria-label={t('View')}>
					{sortControl}
					<ToolbarSpacer />
					{layoutControl}
				</Toolbar>
			</VBox>
			{narrow && sheet}
			{filters.type === 'image' && (
				<Text size="sm" emphasis="muted">
					{t('Folders are hidden while filtering by Images')}
				</Text>
			)}
		</>
	)
}

// vim: ts=4
