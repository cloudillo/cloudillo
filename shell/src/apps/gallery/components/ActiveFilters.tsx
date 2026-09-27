// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { Button, HBox, Tag, Text } from '@cloudillo/react'
import { useTranslation } from 'react-i18next'

import type { GalleryViewMode, TimeFilter } from '../types.js'

interface ActiveFiltersProps {
	className?: string
	viewMode: GalleryViewMode
	selectedTags: string[]
	timeFilter: TimeFilter
	onRemoveTag: (tag: string) => void
	onClearTimeFilter: () => void
	onClearViewMode: () => void
	onClearAll: () => void
	totalCount?: number
	filteredCount?: number
}

const TIME_FILTER_LABELS: Record<TimeFilter, string> = {
	all: '',
	today: 'Today',
	week: 'This week',
	month: 'This month',
	year: 'This year'
}

const VIEW_MODE_LABELS: Record<GalleryViewMode, string> = {
	all: '',
	starred: 'Starred',
	recent: 'Recent'
}

export function ActiveFilters({
	className,
	viewMode,
	selectedTags,
	timeFilter,
	onRemoveTag,
	onClearTimeFilter,
	onClearViewMode,
	onClearAll,
	totalCount,
	filteredCount
}: ActiveFiltersProps) {
	const { t } = useTranslation()

	const hasFilters = viewMode !== 'all' || timeFilter !== 'all' || selectedTags.length > 0

	if (!hasFilters) return null

	const multipleFilters =
		(viewMode !== 'all' ? 1 : 0) + (timeFilter !== 'all' ? 1 : 0) + selectedTags.length > 1

	return (
		<HBox gap={2} padding={2} align="center" wrap className={className}>
			<Text emphasis="muted">{t('Active filters:')}</Text>

			{viewMode !== 'all' && (
				<Tag color="accent" onRemove={onClearViewMode} removeLabel={t('Remove filter')}>
					{t(VIEW_MODE_LABELS[viewMode])}
				</Tag>
			)}

			{timeFilter !== 'all' && (
				<Tag color="accent" onRemove={onClearTimeFilter} removeLabel={t('Remove filter')}>
					{t(TIME_FILTER_LABELS[timeFilter])}
				</Tag>
			)}

			{selectedTags.map((tag) => (
				<Tag
					key={tag}
					color="accent"
					onRemove={() => onRemoveTag(tag)}
					removeLabel={t('Remove tag')}
				>
					#{tag}
				</Tag>
			))}

			{multipleFilters && (
				<Button variant="ghost" size="sm" onClick={onClearAll}>
					{t('Clear all')}
				</Button>
			)}

			{filteredCount !== undefined && totalCount !== undefined && (
				<Text emphasis="muted" className="ms-auto">
					{t('Showing {{filtered}} of {{total}} photos', {
						filtered: filteredCount,
						total: totalCount
					})}
				</Text>
			)}
		</HBox>
	)
}

// vim: ts=4
