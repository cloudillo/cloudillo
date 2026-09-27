// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, Input, Panel, VBox } from '@cloudillo/react'
import type { EducationEntry } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuGraduationCap as IcEducation, LuPlus as IcPlus, LuX as IcRemove } from 'react-icons/lu'

import type { EducationContent, SectionWithContent } from '../types.js'
import { parseContent, stringifyContent } from '../types.js'
import { EntryDates, EntryView } from './WorkSection.js'

const EMPTY: EducationContent = { entries: [] }

interface EducationSectionViewProps {
	section: SectionWithContent
}

export function EducationSectionView({ section }: EducationSectionViewProps) {
	const data = parseContent<EducationContent>(section.content, EMPTY)

	if (!data.entries.length) return null

	return (
		<VBox gap={2}>
			{data.entries.map((entry, i) => (
				<EntryView
					key={i}
					icon={IcEducation}
					title={entry.school}
					subtitle={entry.degree}
					from={entry.from}
					to={entry.to}
				/>
			))}
		</VBox>
	)
}

interface EducationSectionEditProps {
	section: SectionWithContent
	onChange: (content: string) => void
}

export function EducationSectionEdit({ section, onChange }: EducationSectionEditProps) {
	const { t } = useTranslation()
	const [data, setData] = React.useState<EducationContent>(() =>
		parseContent<EducationContent>(section.content, EMPTY)
	)

	function updateEntries(entries: EducationEntry[]) {
		const next = { entries }
		setData(next)
		onChange(stringifyContent(next))
	}

	function updateEntry(index: number, patch: Partial<EducationEntry>) {
		const entries = data.entries.map((e, i) => (i === index ? { ...e, ...patch } : e))
		updateEntries(entries)
	}

	function addEntry() {
		updateEntries([...data.entries, { school: '', degree: '' }])
	}

	function removeEntry(index: number) {
		updateEntries(data.entries.filter((_, i) => i !== index))
	}

	return (
		<VBox gap={3}>
			{data.entries.map((entry, i) => (
				<Panel
					key={i}
					padding={2}
					actions={
						<Button
							variant="ghost"
							size="sm"
							icon={<IcRemove />}
							aria-label={t('Remove entry')}
							onClick={() => removeEntry(i)}
						/>
					}
				>
					<VBox gap={1}>
						<Input
							aria-label={t('School / University')}
							placeholder={t('School / University')}
							value={entry.school}
							onChange={(e) => updateEntry(i, { school: e.target.value })}
						/>
						<Input
							aria-label={t('Degree / Field of study')}
							placeholder={t('Degree / Field of study')}
							value={entry.degree || ''}
							onChange={(e) => updateEntry(i, { degree: e.target.value })}
						/>
						<EntryDates
							from={entry.from}
							to={entry.to}
							onChange={(patch) => updateEntry(i, patch)}
						/>
					</VBox>
				</Panel>
			))}
			<Button variant="ghost" icon={<IcPlus />} onClick={addEntry}>
				{t('Add entry')}
			</Button>
		</VBox>
	)
}

// vim: ts=4
