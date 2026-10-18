// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { TagInfo } from '@cloudillo/core'
import { HBox, IcTag, Popover, SearchInput, Tag, Text, VBox } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useContextAwareApi } from '../../../context/index.js'

const CLOUD_LIMIT = 30

export interface TagFilterProps {
	/** URL `tags` (AND) */
	selected: string[]
	onChange: (tags: string[]) => void
}

/** The filter bar's Tags button: up to 2 selected tags then `+n`; a popover with the tag cloud */
export function TagFilter({ selected, onChange }: TagFilterProps) {
	const { t } = useTranslation()
	const { api } = useContextAwareApi()
	const [open, setOpen] = React.useState(false)
	const [prefix, setPrefix] = React.useState('')
	const [cloud, setCloud] = React.useState<TagInfo[]>([])

	React.useEffect(
		function loadTags() {
			if (!open || !api) return
			let cancelled = false
			api.tags
				.list({ withCounts: true, limit: CLOUD_LIMIT, ...(prefix && { prefix }) })
				.then((res) => {
					if (!cancelled) setCloud(res.tags)
				})
				.catch(() => {
					// The cloud is optional; the selected tags still show
				})
			return () => {
				cancelled = true
			}
		},
		[open, api, prefix]
	)

	function toggle(tag: string) {
		onChange(selected.includes(tag) ? selected.filter((s) => s !== tag) : [...selected, tag])
	}

	const shown = selected.slice(0, 2).join(', ')
	const more = selected.length - 2
	const label =
		selected.length === 0
			? t('Tags')
			: more > 0
				? `${t('Tags')}: ${shown} +${more}`
				: `${t('Tags')}: ${shown}`

	return (
		<Popover
			open={open}
			onOpenChange={setOpen}
			width="md"
			aria-label={t('Tags')}
			trigger={
				<Tag color="accent" icon={<IcTag />} caret>
					{label}
				</Tag>
			}
		>
			<VBox gap={2} className="p-2">
				{selected.length > 0 && (
					<HBox gap={1} wrap>
						{selected.map((tag) => (
							<Tag
								key={tag}
								color="accent"
								onRemove={() => toggle(tag)}
								removeLabel={t('Remove tag filter')}
							>
								#{tag}
							</Tag>
						))}
					</HBox>
				)}
				<SearchInput
					aria-label={t('Search tags')}
					placeholder={t('Search tags')}
					debounce={300}
					onSearch={setPrefix}
				/>
				{cloud.length > 0 ? (
					<HBox gap={1} wrap>
						{cloud.map((info) => (
							<Tag
								key={info.tag}
								pressed={selected.includes(info.tag)}
								count={info.count}
								onClick={() => toggle(info.tag)}
							>
								{info.tag}
							</Tag>
						))}
					</HBox>
				) : (
					<Text size="sm" emphasis="muted">
						{t('No tags found')}
					</Text>
				)}
			</VBox>
		</Popover>
	)
}

// vim: ts=4
