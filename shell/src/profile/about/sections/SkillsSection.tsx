// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { LuX as IcRemove } from 'react-icons/lu'

import { Button } from '@cloudillo/react'

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
		<div className="c-hbox wrap g-1">
			{data.tags.map((tag) => (
				<span key={tag} className="c-tag">
					{tag}
				</span>
			))}
		</div>
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
		<div className="c-vbox g-2">
			<div className="c-hbox wrap g-1">
				{data.tags.map((tag) => (
					<span key={tag} className="c-tag c-hbox g-1 align-items-center">
						{tag}
						<Button link className="p-0" onClick={() => removeTag(tag)}>
							<IcRemove size="0.8rem" />
						</Button>
					</span>
				))}
			</div>
			<div className="c-hbox g-1">
				<input
					className="c-input flex-fill"
					placeholder={t('Add a tag...')}
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={onKeyDown}
				/>
				<Button link onClick={addTag} disabled={!input.trim()}>
					{t('Add')}
				</Button>
			</div>
		</div>
	)
}

// vim: ts=4
