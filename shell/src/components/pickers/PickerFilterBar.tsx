// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import {
	LuSearch as IcSearch,
	LuFolderOpen as IcBrowse,
	LuLink as IcConnected,
	LuClock as IcRecent,
	LuStar as IcStarred,
	LuTag as IcTag,
	LuCheck as IcCheck
} from 'react-icons/lu'

import { mergeClasses, Popper } from '@cloudillo/react'
import type { TagInfo } from '@cloudillo/core'

import type { PickerViewMode } from './types.js'
import { PickerFilterChips } from './PickerFilterChips.js'

import './picker-filter.css'

export interface PickerFilterBarProps {
	viewMode: PickerViewMode
	onViewModeChange: (mode: PickerViewMode) => void
	searchQuery: string
	onSearchQueryChange: (query: string) => void
	selectedTags: string[]
	onTagFilter: (tags: string[]) => void
	contextFileId?: string
	searchPlaceholder?: string
	tags: TagInfo[]
}

export function PickerFilterBar({
	viewMode,
	onViewModeChange,
	searchQuery,
	onSearchQueryChange,
	selectedTags,
	onTagFilter,
	contextFileId,
	searchPlaceholder,
	tags
}: PickerFilterBarProps) {
	const { t } = useTranslation()

	const toggleTag = React.useCallback(
		function toggleTag(tag: string) {
			const newTags = selectedTags.includes(tag)
				? selectedTags.filter((s) => s !== tag)
				: [...selectedTags, tag]
			onTagFilter(newTags)
		},
		[selectedTags, onTagFilter]
	)

	return (
		<div className="picker-filter-bar">
			{/* Single row: view mode icons | search | tag filter */}
			<div className="picker-filter-row">
				{/* View mode icon buttons */}
				<div className="picker-view-modes">
					<button
						type="button"
						className={mergeClasses(
							'picker-view-btn',
							viewMode === 'browse' && 'active'
						)}
						onClick={() => onViewModeChange('browse')}
						title={t('Browse folders')}
					>
						<IcBrowse />
					</button>
					{contextFileId && (
						<button
							type="button"
							className={mergeClasses(
								'picker-view-btn',
								viewMode === 'connected' && 'active'
							)}
							onClick={() => onViewModeChange('connected')}
							title={t('Connected to this document')}
						>
							<IcConnected />
						</button>
					)}
					<button
						type="button"
						className={mergeClasses(
							'picker-view-btn',
							viewMode === 'recent' && 'active'
						)}
						onClick={() => onViewModeChange('recent')}
						title={t('Recent files')}
					>
						<IcRecent />
					</button>
					<button
						type="button"
						className={mergeClasses(
							'picker-view-btn',
							viewMode === 'starred' && 'active'
						)}
						onClick={() => onViewModeChange('starred')}
						title={t('Starred files')}
					>
						<IcStarred />
					</button>
				</div>

				{/* Search input */}
				<div className="c-input-group flex-fill">
					<span className="c-input-addon">
						<IcSearch />
					</span>
					<input
						type="text"
						className="c-input"
						placeholder={searchPlaceholder || t('Search files...')}
						value={searchQuery}
						onChange={(e) => onSearchQueryChange(e.target.value)}
					/>
				</div>

				{/* Tag filter */}
				{tags.length > 0 && (
					<Popper
						className="picker-tag-filter"
						menuClassName="picker-tag-trigger"
						icon={<IcTag size={16} />}
						label={
							selectedTags.length > 0 ? (
								<span className="c-badge xs">{selectedTags.length}</span>
							) : undefined
						}
						aria-label={t('Filter by tags')}
					>
						<div className="picker-tag-dropdown" onClick={(e) => e.stopPropagation()}>
							{tags.map((tagInfo) => (
								<button
									key={tagInfo.tag}
									type="button"
									className={mergeClasses(
										'picker-tag-option',
										selectedTags.includes(tagInfo.tag) && 'active'
									)}
									onClick={(e) => {
										e.stopPropagation()
										toggleTag(tagInfo.tag)
									}}
								>
									{selectedTags.includes(tagInfo.tag) && <IcCheck size={14} />}
									<span>{tagInfo.tag}</span>
									{tagInfo.count !== undefined && (
										<span className="c-badge xs ms-auto">{tagInfo.count}</span>
									)}
								</button>
							))}
						</div>
					</Popper>
				)}
			</div>

			{/* Filter chips (only shown when filters are active) */}
			<PickerFilterChips
				searchQuery={searchQuery}
				selectedTags={selectedTags}
				onSearchQueryChange={onSearchQueryChange}
				onTagFilter={onTagFilter}
			/>
		</div>
	)
}

// vim: ts=4
