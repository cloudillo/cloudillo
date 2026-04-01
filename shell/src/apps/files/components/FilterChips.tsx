// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuX as IcRemove } from 'react-icons/lu'
import { Button } from '@cloudillo/react'
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
		<div className="d-flex flex-wrap align-items-center g-1">
			{fileTypeFilter !== 'all' && (
				<span className="c-tag accent">
					{fileTypeFilter === 'live' ? t('Live') : t('Static')}
					<button
						type="button"
						className="c-tag-remove"
						onClick={() => onFileTypeFilterChange('all')}
						aria-label={t('Remove type filter')}
					>
						<IcRemove />
					</button>
				</span>
			)}

			{ownerFilter !== 'anyone' && (
				<span className="c-tag accent">
					{ownerFilter === 'me' ? t('Owner: Me') : t('Owner: Others')}
					<button
						type="button"
						className="c-tag-remove"
						onClick={() => onOwnerFilterChange('anyone')}
						aria-label={t('Remove owner filter')}
					>
						<IcRemove />
					</button>
				</span>
			)}

			{searchQuery.trim() !== '' && (
				<span className="c-tag accent">
					&ldquo;{searchQuery.trim()}&rdquo;
					<button
						type="button"
						className="c-tag-remove"
						onClick={() => onSearchQueryChange('')}
						aria-label={t('Remove search filter')}
					>
						<IcRemove />
					</button>
				</span>
			)}

			{selectedTags.map((tag) => (
				<span key={tag} className="c-tag accent">
					#{tag}
					<button
						type="button"
						className="c-tag-remove"
						onClick={() => removeTag(tag)}
						aria-label={t('Remove tag filter')}
					>
						<IcRemove />
					</button>
				</span>
			))}

			<Button size="small" onClick={clearAll}>
				{t('Clear all')}
			</Button>
		</div>
	)
}

// vim: ts=4
