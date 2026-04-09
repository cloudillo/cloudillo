// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { LuGraduationCap as IcEducation, LuPlus as IcPlus, LuX as IcRemove } from 'react-icons/lu'

import { Button } from '@cloudillo/react'
import type { EducationEntry } from '@cloudillo/types'

import type { SectionWithContent, EducationContent } from '../types.js'
import { parseContent, stringifyContent } from '../types.js'

const EMPTY: EducationContent = { entries: [] }

interface EducationSectionViewProps {
	section: SectionWithContent
}

export function EducationSectionView({ section }: EducationSectionViewProps) {
	const data = parseContent<EducationContent>(section.content, EMPTY)

	if (!data.entries.length) return null

	return (
		<div className="c-vbox g-2">
			{data.entries.map((entry, i) => (
				<div key={i} className="c-hbox g-2">
					<IcEducation className="c-section-icon mt-1 f-none" />
					<div className="c-vbox">
						<strong>{entry.school}</strong>
						{entry.degree && <span>{entry.degree}</span>}
						{(entry.from || entry.to) && (
							<small className="text-muted">
								{entry.from || '?'} – {entry.to || 'Present'}
							</small>
						)}
					</div>
				</div>
			))}
		</div>
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
		<div className="c-vbox g-3">
			{data.entries.map((entry, i) => (
				<div key={i} className="c-panel p-2 c-vbox g-1 pos-relative">
					<Button
						link
						className="pos-absolute top-0 right-0 m-1"
						onClick={() => removeEntry(i)}
					>
						<IcRemove />
					</Button>
					<input
						className="c-input"
						placeholder={t('School / University')}
						value={entry.school}
						onChange={(e) => updateEntry(i, { school: e.target.value })}
					/>
					<input
						className="c-input"
						placeholder={t('Degree / Field of study')}
						value={entry.degree || ''}
						onChange={(e) => updateEntry(i, { degree: e.target.value })}
					/>
					<div className="c-hbox g-2">
						<input
							className="c-input flex-fill"
							placeholder={t('From')}
							value={entry.from || ''}
							onChange={(e) => updateEntry(i, { from: e.target.value })}
						/>
						<input
							className="c-input flex-fill"
							placeholder={t('To')}
							value={entry.to || ''}
							onChange={(e) => updateEntry(i, { to: e.target.value })}
						/>
					</div>
				</div>
			))}
			<Button link onClick={addEntry}>
				<IcPlus /> {t('Add entry')}
			</Button>
		</div>
	)
}

// vim: ts=4
