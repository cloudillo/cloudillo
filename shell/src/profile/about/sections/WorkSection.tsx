// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Button,
	Checkbox,
	DateTimePicker,
	HBox,
	Icon,
	Input,
	Panel,
	Text,
	VBox
} from '@cloudillo/react'
import type { WorkEntry } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuPlus as IcPlus, LuX as IcRemove, LuBriefcase as IcWork } from 'react-icons/lu'

import type { SectionWithContent, WorkContent } from '../types.js'
import { parseContent, stringifyContent } from '../types.js'

const EMPTY: WorkContent = { entries: [] }

// ============================================================================
// Shared entry parts (also used by EducationSection)
// ============================================================================

/** One view row: icon, title, subtitle, `from – to` range (empty `to` = present) */
export function EntryView({
	icon,
	title,
	subtitle,
	from,
	to
}: {
	icon: React.ComponentType<React.SVGAttributes<SVGElement>>
	title: string
	subtitle?: string
	from?: string
	to?: string
}) {
	const { t } = useTranslation()
	return (
		<HBox gap={2}>
			<Icon as={icon} className="text-muted mt-1" />
			<VBox>
				<Text weight="bold">{title}</Text>
				{subtitle && <Text>{subtitle}</Text>}
				{(from || to) && (
					<Text size="sm" emphasis="muted">
						{from || '?'} – {to || t('Present')}
					</Text>
				)}
			</VBox>
		</HBox>
	)
}

/** From/To month pickers with a "present" checkbox (empty `to` = present) */
export function EntryDates({
	from,
	to,
	onChange
}: {
	from?: string
	to?: string
	onChange: (patch: { from?: string; to?: string }) => void
}) {
	const { t } = useTranslation()
	const present = !to
	return (
		<HBox gap={2} wrap align="center">
			<DateTimePicker
				mode="month"
				dateLabel={t('From')}
				value={from || ''}
				max={to || undefined}
				onChange={(value) => onChange({ from: value || undefined })}
			/>
			{!present && (
				<DateTimePicker
					mode="month"
					dateLabel={t('To')}
					value={to || ''}
					min={from || undefined}
					onChange={(value) => onChange({ to: value || undefined })}
				/>
			)}
			<Checkbox
				label={t('Present')}
				checked={present}
				onChange={(e) =>
					onChange({
						to: e.target.checked ? undefined : new Date().toISOString().slice(0, 7)
					})
				}
			/>
		</HBox>
	)
}

// ============================================================================
// Work section
// ============================================================================

interface WorkSectionViewProps {
	section: SectionWithContent
}

export function WorkSectionView({ section }: WorkSectionViewProps) {
	const data = parseContent<WorkContent>(section.content, EMPTY)

	if (!data.entries.length) return null

	return (
		<VBox gap={2}>
			{data.entries.map((entry, i) => (
				<EntryView
					key={i}
					icon={IcWork}
					title={entry.org}
					subtitle={entry.role}
					from={entry.from}
					to={entry.to}
				/>
			))}
		</VBox>
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
							aria-label={t('Organization')}
							placeholder={t('Organization')}
							value={entry.org}
							onChange={(e) => updateEntry(i, { org: e.target.value })}
						/>
						<Input
							aria-label={t('Role / Position')}
							placeholder={t('Role / Position')}
							value={entry.role || ''}
							onChange={(e) => updateEntry(i, { role: e.target.value })}
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
