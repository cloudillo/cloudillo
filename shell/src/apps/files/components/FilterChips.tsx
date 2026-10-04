// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { Button, HBox, Tag } from '@cloudillo/react'
import { useTranslation } from 'react-i18next'

import type { FileTypeFilter, OwnerFilter } from '../types.js'

export interface FilterChipsProps {
	fileTypeFilter: FileTypeFilter
	ownerFilter: OwnerFilter
	searchQuery: string
	selectedTags: string[]
	onFileTypeFilterChange: (filter: FileTypeFilter) => void
	onOwnerFilterChange: (filter: OwnerFilter) => void
	onSearchQueryChange: (query: string) => void
	onTagFilter: (tags: string[]) => void
}

export function FilterChips({
	fileTypeFilter,
	ownerFilter,
	searchQuery,
	selectedTags,
	onFileTypeFilterChange,
	onOwnerFilterChange,
	onSearchQueryChange,
	onTagFilter
}: FilterChipsProps) {
	const { t } = useTranslation()

	const hasFilters =
		fileTypeFilter !== 'all' ||
		ownerFilter !== 'anyone' ||
		searchQuery.trim() !== '' ||
		selectedTags.length > 0

	if (!hasFilters) return null

	function clearAll() {
		onFileTypeFilterChange('all')
		onOwnerFilterChange('anyone')
		onSearchQueryChange('')
		onTagFilter([])
	}

	function removeTag(tag: string) {
		onTagFilter(selectedTags.filter((s) => s !== tag))
	}

	return (
		<HBox gap={1} align="center" wrap>
			{fileTypeFilter !== 'all' && (
				<Tag
					color="accent"
					onRemove={() => onFileTypeFilterChange('all')}
					removeLabel={t('Remove type filter')}
				>
					{fileTypeFilter === 'live' ? t('Live') : t('Static')}
				</Tag>
			)}

			{ownerFilter !== 'anyone' && (
				<Tag
					color="accent"
					onRemove={() => onOwnerFilterChange('anyone')}
					removeLabel={t('Remove owner filter')}
				>
					{ownerFilter === 'me' ? t('Owner: Me') : t('Owner: Others')}
				</Tag>
			)}

			{searchQuery.trim() !== '' && (
				<Tag
					color="accent"
					onRemove={() => onSearchQueryChange('')}
					removeLabel={t('Remove search filter')}
				>
					&ldquo;{searchQuery.trim()}&rdquo;
				</Tag>
			)}

			{selectedTags.map((tag) => (
				<Tag
					key={tag}
					color="accent"
					onRemove={() => removeTag(tag)}
					removeLabel={t('Remove tag filter')}
				>
					#{tag}
				</Tag>
			))}

			<Button variant="ghost" size="sm" onClick={clearAll}>
				{t('Clear all')}
			</Button>
		</HBox>
	)
}

// vim: ts=4
