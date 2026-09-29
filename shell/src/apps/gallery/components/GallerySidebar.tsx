// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { TagInfo } from '@cloudillo/core'
import {
	Button,
	HBox,
	IconText,
	Nav,
	Panel,
	SearchInput,
	Tag,
	useApi,
	VBox
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuImage as IcAll,
	LuClock as IcRecent,
	LuStar as IcStarred,
	LuTag as IcTag,
	LuCalendar as IcTime
} from 'react-icons/lu'

import type { GalleryViewMode, TimeFilter } from '../types.js'

interface GallerySidebarProps {
	className?: string
	searchQuery: string
	onSearchQueryChange: (query: string) => void
	viewMode: GalleryViewMode
	onViewModeChange: (mode: GalleryViewMode) => void
	timeFilter: TimeFilter
	onTimeFilterChange: (filter: TimeFilter) => void
	selectedTags: string[]
	onTagToggle: (tag: string) => void
	onClearTags: () => void
}

// Rail recipe: padded VBox → SearchInput → Nav → `Panel variant="plain"` facets.
export const GallerySidebar = React.memo(function GallerySidebar({
	className,
	searchQuery,
	onSearchQueryChange,
	viewMode,
	onViewModeChange,
	timeFilter,
	onTimeFilterChange,
	selectedTags,
	onTagToggle,
	onClearTags
}: GallerySidebarProps) {
	const { t } = useTranslation()
	const { api } = useApi()

	// Tags with counts for tag cloud
	const [tags, setTags] = React.useState<TagInfo[]>([])

	// Load tags with counts
	React.useEffect(
		function loadTags() {
			if (!api) return

			;(async function () {
				try {
					const res = await api.tags.list({ withCounts: true, limit: 10 })
					setTags(res.tags)
				} catch {
					// Ignore errors loading tags
				}
			})()
		},
		[api]
	)

	const viewItems: { mode: GalleryViewMode; icon: React.ReactNode; label: string }[] = [
		{ mode: 'all', icon: <IcAll />, label: t('All photos') },
		{ mode: 'starred', icon: <IcStarred />, label: t('Starred') },
		{ mode: 'recent', icon: <IcRecent />, label: t('Recent') }
	]
	const timeItems: { filter: TimeFilter; label: string }[] = [
		{ filter: 'all', label: t('All time') },
		{ filter: 'today', label: t('Today') },
		{ filter: 'week', label: t('This week') },
		{ filter: 'month', label: t('This month') },
		{ filter: 'year', label: t('This year') }
	]

	return (
		<VBox gap={2} padding={2} className={className}>
			<SearchInput
				aria-label={t('Search photos...')}
				placeholder={t('Search photos...')}
				value={searchQuery}
				onChange={(e) => onSearchQueryChange(e.target.value)}
			/>
			<Nav aria-label={t('Gallery')}>
				{viewItems.map(({ mode, icon, label }) => (
					<Nav.Item
						key={mode}
						icon={icon}
						label={label}
						active={viewMode === mode}
						onClick={() => onViewModeChange(mode)}
					/>
				))}
				<Nav.Divider />
				<Nav.Section label={<IconText icon={<IcTime />}>{t('Time')}</IconText>}>
					{timeItems.map(({ filter, label }) => (
						<Nav.Item
							key={filter}
							label={label}
							active={timeFilter === filter}
							onClick={() => onTimeFilterChange(filter)}
						/>
					))}
				</Nav.Section>
			</Nav>

			{tags.length > 0 && (
				<Panel
					variant="plain"
					title={<IconText icon={<IcTag />}>{t('Tags')}</IconText>}
					actions={
						selectedTags.length > 0 && (
							<Button variant="ghost" size="sm" onClick={onClearTags}>
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
								onClick={() => onTagToggle(tagInfo.tag)}
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
