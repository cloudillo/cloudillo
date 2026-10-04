// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { PorchEntry, TagInfo } from '@cloudillo/core'
import {
	Button,
	HBox,
	IconText,
	Nav,
	Panel,
	SearchInput,
	Segmented,
	SegmentedItem,
	Tag,
	Text,
	useAuth,
	VBox
} from '@cloudillo/react'
import * as React from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import {
	LuFolderOpen as IcBrowse,
	LuStar as IcFavorites,
	LuDoorOpen as IcRoom,
	LuShieldCheck as IcManaged,
	LuClock as IcRecent,
	LuTag as IcTag,
	LuTrash2 as IcTrash
} from 'react-icons/lu'

import { useContextAwareApi, useCtx, useCurrentContextIdTag } from '../../../context/index.js'
import { profilePath } from '../../../routes.js'
import type { FileTypeFilter, OwnerFilter, ViewMode } from '../types.js'

export const viewItems = (
	t: TFunction
): { mode: ViewMode; icon: React.ComponentType; label: string }[] => [
	{ mode: 'browse', icon: IcBrowse, label: t('Browse') },
	{ mode: 'starred', icon: IcFavorites, label: t('Starred') },
	{ mode: 'recent', icon: IcRecent, label: t('Recent') },
	{ mode: 'trash', icon: IcTrash, label: t('Trash') },
	{ mode: 'managed', icon: IcManaged, label: t('Managed') }
]

interface SidebarProps {
	className?: string
	viewMode: ViewMode
	onViewModeChange: (mode: ViewMode) => void
	fileTypeFilter: FileTypeFilter
	onFileTypeFilterChange: (filter: FileTypeFilter) => void
	ownerFilter: OwnerFilter
	onOwnerFilterChange: (filter: OwnerFilter) => void
	searchQuery: string
	onSearchQueryChange: (query: string) => void
	selectedTags?: string[]
	onTagFilter?: (tags: string[]) => void
	/** Main drive label (the context's name) */
	contextName: string
	/** Current room (bare name); null = main drive */
	drive: string | null
	/** Rooms the viewer is `in`; empty hides the Rooms group */
	rooms: PorchEntry[]
	onDriveChange: (name: string | null) => void
}

// Rail recipe: padded VBox → SearchInput → Nav → `Panel variant="plain"` facets.
export const Sidebar = React.memo(function Sidebar({
	className,
	viewMode,
	onViewModeChange,
	fileTypeFilter,
	onFileTypeFilterChange,
	ownerFilter,
	onOwnerFilterChange,
	searchQuery,
	onSearchQueryChange,
	selectedTags = [],
	onTagFilter,
	contextName,
	drive,
	rooms,
	onDriveChange
}: SidebarProps) {
	const { t } = useTranslation()
	const base = useCtx().base
	const contextIdTag = useCurrentContextIdTag()
	const sortedRooms = React.useMemo(
		() => [...rooms].sort((a, b) => a.name.localeCompare(b.name)),
		[rooms]
	)
	const hasRooms = sortedRooms.length > 0
	// `authenticated` is a dep of the tag-load effect below: the api client's
	// identity is stable per idTag, so this flag (not `api`, and not `auth`,
	// which tracks the home session) is what changes when a context token lands.
	const { api, authenticated } = useContextAwareApi()
	const [auth] = useAuth()

	// Tags with counts for tag cloud
	const [tags, setTags] = React.useState<TagInfo[]>([])

	// Load tags with counts
	React.useEffect(
		function loadTags() {
			if (!api || !auth) return

			;(async function () {
				try {
					const res = await api.tags.list({ withCounts: true, limit: 10 })
					setTags(res.tags)
				} catch {
					// Ignore errors loading tags
				}
			})()
		},
		[api, authenticated, auth]
	)

	const toggleTag = React.useCallback(
		function toggleTag(tag: string) {
			if (!onTagFilter) return

			const newTags = selectedTags.includes(tag)
				? selectedTags.filter((t) => t !== tag)
				: [...selectedTags, tag]
			onTagFilter(newTags)
		},
		[selectedTags, onTagFilter]
	)

	const clearTags = React.useCallback(
		function clearTags() {
			if (onTagFilter) onTagFilter([])
		},
		[onTagFilter]
	)

	return (
		<VBox gap={2} padding={2} className={className}>
			<SearchInput
				aria-label={t('Search files...')}
				placeholder={t('Search files...')}
				value={searchQuery}
				onChange={(e) => onSearchQueryChange(e.target.value)}
			/>

			<Nav aria-label={t('Files')}>
				{/* Main drive; with no rooms it stays the plain "Browse" entry */}
				<Nav.Item
					icon={<IcBrowse />}
					label={hasRooms ? contextName : t('Browse')}
					active={viewMode === 'browse' && !drive}
					onClick={() => onDriveChange(null)}
				/>
				{hasRooms && (
					<Nav.Section label={t('Rooms')}>
						{sortedRooms.map((room) => (
							<Nav.Item
								key={room.name}
								icon={<IcRoom />}
								label={
									<>
										~{room.name}
										{room.title && <Text color="secondary"> {room.title}</Text>}
									</>
								}
								active={viewMode === 'browse' && drive === room.name}
								onClick={() => onDriveChange(room.name)}
							/>
						))}
						<Nav.Item
							label={<Text color="secondary">{t('Browse rooms…')}</Text>}
							href={profilePath(base, contextIdTag, 'rooms')}
						/>
					</Nav.Section>
				)}
				{hasRooms && <Nav.Divider />}
				{viewItems(t)
					.filter(({ mode }) => mode !== 'browse')
					.map(({ mode, icon: ViewIcon, label }) => (
						<Nav.Item
							key={mode}
							icon={<ViewIcon />}
							label={label}
							active={viewMode === mode}
							onClick={() => onViewModeChange(mode)}
						/>
					))}
			</Nav>

			<Panel variant="plain" title={t('Type')}>
				<Segmented
					size="sm"
					fill
					aria-label={t('Type')}
					value={fileTypeFilter}
					onChange={(v) => onFileTypeFilterChange(v as FileTypeFilter)}
				>
					<SegmentedItem value="all">{t('All')}</SegmentedItem>
					<SegmentedItem value="live">{t('Live')}</SegmentedItem>
					<SegmentedItem value="static">{t('Static')}</SegmentedItem>
				</Segmented>
			</Panel>

			<Panel variant="plain" title={t('Owner')}>
				<Segmented
					size="sm"
					fill
					aria-label={t('Owner')}
					value={ownerFilter}
					onChange={(v) => onOwnerFilterChange(v as OwnerFilter)}
				>
					<SegmentedItem value="anyone">{t('Anyone')}</SegmentedItem>
					<SegmentedItem value="me">{t('Me')}</SegmentedItem>
					<SegmentedItem value="others">{t('Others')}</SegmentedItem>
				</Segmented>
			</Panel>

			{tags.length > 0 && (
				<Panel
					variant="plain"
					title={<IconText icon={<IcTag />}>{t('Tags')}</IconText>}
					actions={
						selectedTags.length > 0 && (
							<Button variant="ghost" size="sm" onClick={clearTags}>
								{t('Clear')}
							</Button>
						)
					}
				>
					<HBox gap={1} wrap>
						{tags.map((tagInfo) => (
							<Tag
								key={tagInfo.tag}
								pressed={selectedTags.includes(tagInfo.tag)}
								count={tagInfo.count}
								onClick={() => toggleTag(tagInfo.tag)}
							>
								{tagInfo.tag}
							</Tag>
						))}
					</HBox>
				</Panel>
			)}
		</VBox>
	)
})

// vim: ts=4
