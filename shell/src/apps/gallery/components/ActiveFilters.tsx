// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuX as IcClose } from 'react-icons/lu'

import { Button, mergeClasses } from '@cloudillo/react'

import type { TimeFilter, GalleryViewMode } from '../types.js'

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
		<div
			className={mergeClasses('d-flex align-items-center flex-wrap g-2 px-3 py-2', className)}
		>
			<span className="text-muted">{t('Active filters:')}</span>

			{/* View mode chip */}
			{viewMode !== 'all' && (
				<span className="c-tag accent">
					{t(VIEW_MODE_LABELS[viewMode])}
					<button
						type="button"
						className="c-tag-close ms-1"
						onClick={onClearViewMode}
						aria-label={t('Remove filter')}
					>
						<IcClose size={12} />
					</button>
				</span>
			)}

			{/* Time filter chip */}
			{timeFilter !== 'all' && (
				<span className="c-tag accent">
					{t(TIME_FILTER_LABELS[timeFilter])}
					<button
						type="button"
						className="c-tag-close ms-1"
						onClick={onClearTimeFilter}
						aria-label={t('Remove filter')}
					>
						<IcClose size={12} />
					</button>
				</span>
			)}

			{/* Tag chips */}
			{selectedTags.map((tag) => (
				<span key={tag} className="c-tag accent">
					#{tag}
					<button
						type="button"
						className="c-tag-close ms-1"
						onClick={() => onRemoveTag(tag)}
						aria-label={t('Remove tag')}
					>
						<IcClose size={12} />
					</button>
				</span>
			))}

			{/* Clear all button */}
			{multipleFilters && (
				<Button size="small" link onClick={onClearAll}>
					{t('Clear all')}
				</Button>
			)}

			{/* Photo count */}
			{filteredCount !== undefined && totalCount !== undefined && (
				<span className="ms-auto text-muted">
					{t('Showing {{filtered}} of {{total}} photos', {
						filtered: filteredCount,
						total: totalCount
					})}
				</span>
			)}
		</div>
	)
}

// vim: ts=4
