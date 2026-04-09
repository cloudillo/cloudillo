// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { LuBriefcase as IcWork, LuPlus as IcPlus, LuX as IcRemove } from 'react-icons/lu'

import { Button } from '@cloudillo/react'
import type { WorkEntry } from '@cloudillo/types'

import type { SectionWithContent, WorkContent } from '../types.js'
import { parseContent, stringifyContent } from '../types.js'

const EMPTY: WorkContent = { entries: [] }

interface WorkSectionViewProps {
	section: SectionWithContent
}

export function WorkSectionView({ section }: WorkSectionViewProps) {
	const data = parseContent<WorkContent>(section.content, EMPTY)

	if (!data.entries.length) return null

	return (
		<div className="c-vbox g-2">
			{data.entries.map((entry, i) => (
				<div key={i} className="c-hbox g-2">
					<IcWork className="c-section-icon mt-1 f-none" />
					<div className="c-vbox">
						<strong>{entry.org}</strong>
						{entry.role && <span>{entry.role}</span>}
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

interface WorkSectionEditProps {
	section: SectionWithContent
	onChange: (content: string) => void
}

export function WorkSectionEdit({ section, onChange }: WorkSectionEditProps) {
	const { t } = useTranslation()
	const [data, setData] = React.useState<WorkContent>(() =>
		parseContent<WorkContent>(section.content, EMPTY)
	)

	function updateEntries(entries: WorkEntry[]) {
		const next = { entries }
		setData(next)
		onChange(stringifyContent(next))
	}

	function updateEntry(index: number, patch: Partial<WorkEntry>) {
		const entries = data.entries.map((e, i) => (i === index ? { ...e, ...patch } : e))
		updateEntries(entries)
	}

	function addEntry() {
		updateEntries([...data.entries, { org: '', role: '' }])
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
						placeholder={t('Organization')}
						value={entry.org}
						onChange={(e) => updateEntry(i, { org: e.target.value })}
					/>
					<input
						className="c-input"
						placeholder={t('Role / Position')}
						value={entry.role || ''}
						onChange={(e) => updateEntry(i, { role: e.target.value })}
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
