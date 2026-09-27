// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, HBox, Input, Tag, VBox } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import type { SectionWithContent, SkillsContent } from '../types.js'
import { parseContent, stringifyContent } from '../types.js'

const EMPTY: SkillsContent = { tags: [] }

interface SkillsSectionViewProps {
	section: SectionWithContent
}

export function SkillsSectionView({ section }: SkillsSectionViewProps) {
	const data = parseContent<SkillsContent>(section.content, EMPTY)

	if (!data.tags.length) return null

	return (
		<HBox wrap gap={1}>
			{data.tags.map((tag) => (
				<Tag key={tag}>{tag}</Tag>
			))}
		</HBox>
	)
}

interface SkillsSectionEditProps {
	section: SectionWithContent
	onChange: (content: string) => void
}

export function SkillsSectionEdit({ section, onChange }: SkillsSectionEditProps) {
	const { t } = useTranslation()
	const [data, setData] = React.useState<SkillsContent>(() =>
		parseContent<SkillsContent>(section.content, EMPTY)
	)
	const [input, setInput] = React.useState('')

	function updateTags(tags: string[]) {
		const next = { tags }
		setData(next)
		onChange(stringifyContent(next))
	}

	function addTag() {
		const tag = input.trim()
		if (!tag || data.tags.includes(tag)) return
		updateTags([...data.tags, tag])
		setInput('')
	}

	function removeTag(tag: string) {
		updateTags(data.tags.filter((t) => t !== tag))
	}

	function onKeyDown(e: React.KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault()
			addTag()
		}
	}

	return (
		<VBox gap={2}>
			<HBox wrap gap={1}>
				{data.tags.map((tag) => (
					<Tag key={tag} onRemove={() => removeTag(tag)}>
						{tag}
					</Tag>
				))}
			</HBox>
			<HBox gap={1}>
				<Input
					className="flex-fill"
					aria-label={t('Add a tag...')}
					placeholder={t('Add a tag...')}
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={onKeyDown}
				/>
				<Button variant="ghost" onClick={addTag} disabled={!input.trim()}>
					{t('Add')}
				</Button>
			</HBox>
		</VBox>
	)
}

// vim: ts=4
