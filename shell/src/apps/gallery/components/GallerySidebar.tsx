// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { TagInfo } from '@cloudillo/core'
import { Button, Divider, HBox, Nav, Tag, Text, useApi, VBox } from '@cloudillo/react'
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
	viewMode: GalleryViewMode
	onViewModeChange: (mode: GalleryViewMode) => void
	timeFilter: TimeFilter
	onTimeFilterChange: (filter: TimeFilter) => void
	selectedTags: string[]
	onTagToggle: (tag: string) => void
	onClearTags: () => void
}

export const GallerySidebar = React.memo(function GallerySidebar({
	className,
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
		<VBox gap={2} className={className} autoBg>
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
				<Nav.Section
					label={
						<>
							<IcTime /> {t('Time')}
						</>
					}
				>
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
				<>
					<Divider />
					<HBox gap={1} align="center">
						<Text size="sm" emphasis="muted" className="flex-fill">
							<IcTag /> {t('Tags')}
						</Text>
						{selectedTags.length > 0 && (
							<Button variant="ghost" size="sm" onClick={onClearTags}>
								{t('Clear')}
							</Button>
						)}
					</HBox>
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
				</>
			)}
		</VBox>
	)
})

// vim: ts=4
