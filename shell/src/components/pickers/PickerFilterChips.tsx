// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, HBox, Tag } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

export interface PickerFilterChipsProps {
	searchQuery: string
	selectedTags: string[]
	onSearchQueryChange: (query: string) => void
	onTagFilter: (tags: string[]) => void
}

export function PickerFilterChips({
	searchQuery,
	selectedTags,
	onSearchQueryChange,
	onTagFilter
}: PickerFilterChipsProps) {
	const { t } = useTranslation()

	const hasFilters = searchQuery.trim() !== '' || selectedTags.length > 0

	if (!hasFilters) return null

	function clearAll() {
		onSearchQueryChange('')
		onTagFilter([])
	}

	function removeTag(tag: string) {
		onTagFilter(selectedTags.filter((s) => s !== tag))
	}

	return (
		<HBox gap={1} wrap align="center">
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

			<Button size="sm" variant="ghost" onClick={clearAll}>
				{t('Clear all')}
			</Button>
		</HBox>
	)
}

// vim: ts=4
