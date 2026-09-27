// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { TagInfo } from '@cloudillo/core'
import {
	Badge,
	Button,
	List,
	ListItem,
	Popover,
	SearchInput,
	Segmented,
	SegmentedItem,
	Toolbar,
	VBox
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuFolderOpen as IcBrowse,
	LuCheck as IcCheck,
	LuLink as IcConnected,
	LuPaperclip as IcManaged,
	LuClock as IcRecent,
	LuStar as IcStarred,
	LuTag as IcTag
} from 'react-icons/lu'

import { PickerFilterChips } from './PickerFilterChips.js'
import type { PickerViewMode } from './types.js'

export interface PickerFilterBarProps {
	viewMode: PickerViewMode
	onViewModeChange: (mode: PickerViewMode) => void
	searchQuery: string
	onSearchQueryChange: (query: string) => void
	selectedTags: string[]
	onTagFilter: (tags: string[]) => void
	contextFileId?: string
	showManaged?: boolean
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
	showManaged,
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
		<VBox gap={1}>
			<Toolbar padding={0}>
				<Segmented
					size="sm"
					aria-label={t('View')}
					value={viewMode}
					onChange={(v) => onViewModeChange(v as PickerViewMode)}
				>
					<SegmentedItem value="browse" icon={IcBrowse} label={t('Browse folders')} />
					{contextFileId && (
						<SegmentedItem
							value="connected"
							icon={IcConnected}
							label={t('This document')}
						/>
					)}
					{showManaged && (
						<SegmentedItem
							value="managed"
							icon={IcManaged}
							label={t('Managed files')}
						/>
					)}
					<SegmentedItem value="recent" icon={IcRecent} label={t('Recent files')} />
					<SegmentedItem value="starred" icon={IcStarred} label={t('Starred files')} />
				</Segmented>

				<SearchInput
					className="flex-fill"
					aria-label={searchPlaceholder || t('Search files...')}
					placeholder={searchPlaceholder || t('Search files...')}
					value={searchQuery}
					onChange={(e) => onSearchQueryChange(e.target.value)}
				/>

				{tags.length > 0 && (
					<Popover
						placement="bottom-end"
						role="listbox"
						trigger={
							<Button variant="ghost" aria-label={t('Filter by tags')}>
								<IcTag />
								{selectedTags.length > 0 && (
									<Badge size="xs" color="primary">
										{selectedTags.length}
									</Badge>
								)}
							</Button>
						}
					>
						<List selectable="multiple" scroll>
							{tags.map((tagInfo) => (
								<ListItem
									key={tagInfo.tag}
									selected={selectedTags.includes(tagInfo.tag)}
									leading={
										selectedTags.includes(tagInfo.tag) ? <IcCheck /> : undefined
									}
									title={tagInfo.tag}
									trailing={
										tagInfo.count !== undefined && (
											<Badge size="xs">{tagInfo.count}</Badge>
										)
									}
									onClick={() => toggleTag(tagInfo.tag)}
								/>
							))}
						</List>
					</Popover>
				)}
			</Toolbar>

			<PickerFilterChips
				searchQuery={searchQuery}
				selectedTags={selectedTags}
				onSearchQueryChange={onSearchQueryChange}
				onTagFilter={onTagFilter}
			/>
		</VBox>
	)
}

// vim: ts=4
