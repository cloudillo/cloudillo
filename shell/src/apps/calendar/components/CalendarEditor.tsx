// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import type { CalendarOutput, CalendarCreate, CalendarPatch } from '@cloudillo/core'

import { CalendarEditorModal } from './CalendarEditorModal.js'

const DEFAULT_COLORS = [
	'#3b82f6',
	'#10b981',
	'#f59e0b',
	'#ef4444',
	'#8b5cf6',
	'#ec4899',
	'#06b6d4',
	'#84cc16'
]

export interface CalendarEditorProps {
	open: boolean
	calendar?: CalendarOutput
	onClose: () => void
	onSave: (data: CalendarCreate | CalendarPatch) => Promise<void>
}

export function CalendarEditor({ open, calendar, onClose, onSave }: CalendarEditorProps) {
	const { t } = useTranslation()
	const [name, setName] = React.useState('')
	const [description, setDescription] = React.useState('')
	const [color, setColor] = React.useState(DEFAULT_COLORS[0])
	const [includeEvents, setIncludeEvents] = React.useState(true)
	const [includeTasks, setIncludeTasks] = React.useState(true)
	const [submitting, setSubmitting] = React.useState(false)
	const [error, setError] = React.useState<string | undefined>()

	React.useEffect(() => {
		if (open) {
			setName(calendar?.name ?? '')
			setDescription(calendar?.description ?? '')
			setColor(calendar?.color ?? DEFAULT_COLORS[0])
			const comps = (calendar?.components ?? 'VEVENT,VTODO').split(',').map((c) => c.trim())
			setIncludeEvents(comps.includes('VEVENT'))
			setIncludeTasks(comps.includes('VTODO'))
			setError(undefined)
		}
	}, [open, calendar])

	async function handleSave(e?: React.FormEvent) {
		e?.preventDefault()
		const trimmed = name.trim()
		if (!trimmed) {
			setError(t('Name is required'))
			return
		}
		if (!includeEvents && !includeTasks) {
			setError(t('Select at least one of events or tasks.'))
			return
		}
		setSubmitting(true)
		setError(undefined)
		try {
			const components: string[] = []
			if (includeEvents) components.push('VEVENT')
			if (includeTasks) components.push('VTODO')
			if (calendar) {
				await onSave({
					name: trimmed,
					description: description.trim() || null,
					color: color || null,
					components
				} satisfies CalendarPatch)
			} else {
				await onSave({
					name: trimmed,
					description: description.trim() || undefined,
					color: color || undefined,
					components
				} satisfies CalendarCreate)
			}
			onClose()
		} catch (err) {
			setError(err instanceof Error ? err.message : t('Failed to save calendar'))
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<CalendarEditorModal
			open={open}
			title={calendar ? t('Edit calendar') : t('New calendar')}
			edit={!!calendar}
			submitting={submitting}
			error={error}
			onClose={onClose}
			onSubmit={handleSave}
		>
			<div className="mb-3">
				<label className="c-cal-detail-label">{t('Name')}</label>
				<input
					className="c-input"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder={t('e.g., Work')}
					autoFocus
				/>
			</div>

			<div className="mb-3">
				<label className="c-cal-detail-label">{t('Description (optional)')}</label>
				<input
					className="c-input"
					value={description}
					onChange={(e) => setDescription(e.target.value)}
				/>
			</div>

			<div className="mb-3">
				<label className="c-cal-detail-label">{t('Colour')}</label>
				<div className="d-flex align-items-center g-2">
					<input
						type="color"
						value={color}
						onChange={(e) => setColor(e.target.value)}
						style={{ width: '2.5rem', height: '2rem' }}
					/>
					<div className="d-flex g-1">
						{DEFAULT_COLORS.map((c) => (
							<button
								key={c}
								type="button"
								className="c-cal-item__swatch"
								style={{
									background: c,
									width: '1.5rem',
									height: '1.5rem',
									cursor: 'pointer'
								}}
								onClick={() => setColor(c)}
								aria-label={c}
							/>
						))}
					</div>
				</div>
			</div>

			<div className="mb-3">
				<label className="c-cal-detail-label">{t('Holds')}</label>
				<div className="d-flex g-3">
					<label className="d-flex align-items-center g-1">
						<input
							type="checkbox"
							checked={includeEvents}
							onChange={(e) => setIncludeEvents(e.target.checked)}
						/>
						{t('Events')}
					</label>
					<label className="d-flex align-items-center g-1">
						<input
							type="checkbox"
							checked={includeTasks}
							onChange={(e) => setIncludeTasks(e.target.checked)}
						/>
						{t('Tasks')}
					</label>
				</div>
			</div>
		</CalendarEditorModal>
	)
}

// vim: ts=4
