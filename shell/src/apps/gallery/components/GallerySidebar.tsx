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

import {
	LuImage as IcAll,
	LuStar as IcStarred,
	LuClock as IcRecent,
	LuCalendar as IcTime,
	LuTag as IcTag
} from 'react-icons/lu'

import { useApi, Button, mergeClasses } from '@cloudillo/react'
import type { TagInfo } from '@cloudillo/base'

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

	return (
		<ul className={mergeClasses('c-nav vertical low', className)}>
			{/* View mode section */}
			<li className="c-nav-item">
				<a
					className={mergeClasses('c-nav-link', viewMode === 'all' && 'active')}
					href="#"
					onClick={(e) => {
						e.preventDefault()
						onViewModeChange('all')
					}}
				>
					<IcAll /> {t('All photos')}
				</a>
			</li>
			<li className="c-nav-item">
				<a
					className={mergeClasses('c-nav-link', viewMode === 'starred' && 'active')}
					href="#"
					onClick={(e) => {
						e.preventDefault()
						onViewModeChange('starred')
					}}
				>
					<IcStarred /> {t('Starred')}
				</a>
			</li>
			<li className="c-nav-item">
				<a
					className={mergeClasses('c-nav-link', viewMode === 'recent' && 'active')}
					href="#"
					onClick={(e) => {
						e.preventDefault()
						onViewModeChange('recent')
					}}
				>
					<IcRecent /> {t('Recent')}
				</a>
			</li>

			<hr className="w-100" />

			{/* Time filter section */}
			<li className="c-nav-item">
				<span className="c-nav-link text-muted">
					<IcTime /> {t('Time')}
				</span>
			</li>
			<li className="c-nav-item">
				<a
					className={mergeClasses('c-nav-link ps-4', timeFilter === 'all' && 'active')}
					href="#"
					onClick={(e) => {
						e.preventDefault()
						onTimeFilterChange('all')
					}}
				>
					{t('All time')}
				</a>
			</li>
			<li className="c-nav-item">
				<a
					className={mergeClasses('c-nav-link ps-4', timeFilter === 'today' && 'active')}
					href="#"
					onClick={(e) => {
						e.preventDefault()
						onTimeFilterChange('today')
					}}
				>
					{t('Today')}
				</a>
			</li>
			<li className="c-nav-item">
				<a
					className={mergeClasses('c-nav-link ps-4', timeFilter === 'week' && 'active')}
					href="#"
					onClick={(e) => {
						e.preventDefault()
						onTimeFilterChange('week')
					}}
				>
					{t('This week')}
				</a>
			</li>
			<li className="c-nav-item">
				<a
					className={mergeClasses('c-nav-link ps-4', timeFilter === 'month' && 'active')}
					href="#"
					onClick={(e) => {
						e.preventDefault()
						onTimeFilterChange('month')
					}}
				>
					{t('This month')}
				</a>
			</li>
			<li className="c-nav-item">
				<a
					className={mergeClasses('c-nav-link ps-4', timeFilter === 'year' && 'active')}
					href="#"
					onClick={(e) => {
						e.preventDefault()
						onTimeFilterChange('year')
					}}
				>
					{t('This year')}
				</a>
			</li>

			{/* Tag Cloud */}
			{tags.length > 0 && (
				<>
					<hr className="w-100" />
					<li className="c-nav-item">
						<span className="c-nav-link text-muted">
							<IcTag /> {t('Tags')}
							{selectedTags.length > 0 && (
								<Button className="ms-auto" size="small" onClick={onClearTags}>
									{t('Clear')}
								</Button>
							)}
						</span>
					</li>
					<div className="d-flex flex-wrap g-1 px-2">
						{tags.map((tagInfo) => (
							<button
								key={tagInfo.tag}
								type="button"
								className={mergeClasses(
									'c-tag',
									selectedTags.includes(tagInfo.tag) && 'accent'
								)}
								onClick={() => onTagToggle(tagInfo.tag)}
							>
								{tagInfo.tag}
								{tagInfo.count !== undefined && (
									<span className="c-badge xs ms-1">{tagInfo.count}</span>
								)}
							</button>
						))}
					</div>
				</>
			)}
		</ul>
	)
})

// vim: ts=4
