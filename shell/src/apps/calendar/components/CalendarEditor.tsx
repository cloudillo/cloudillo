// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { CalendarCreate, CalendarOutput, CalendarPatch } from '@cloudillo/core'
import {
	Button,
	Checkbox,
	ColorDot,
	ColorInput,
	Field,
	Fieldset,
	HBox,
	Input,
	VBox
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

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
			<VBox gap={3}>
				<Field label={t('Name')}>
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder={t('e.g., Work')}
						autoFocus
					/>
				</Field>

				<Field label={t('Description (optional)')}>
					<Input value={description} onChange={(e) => setDescription(e.target.value)} />
				</Field>

				<Field label={t('Colour')}>
					<HBox gap={2} align="center" wrap>
						<ColorInput value={color} onChange={setColor} />
						<HBox gap={1} wrap>
							{DEFAULT_COLORS.map((c) => (
								<Button
									key={c}
									type="button"
									variant="ghost"
									size="sm"
									icon={<ColorDot color={c} size="lg" />}
									onClick={() => setColor(c)}
									aria-label={c}
								/>
							))}
						</HBox>
					</HBox>
				</Field>

				<Fieldset legend={t('Holds')}>
					<HBox gap={3}>
						<Checkbox
							label={t('Events')}
							checked={includeEvents}
							onChange={(e) => setIncludeEvents(e.target.checked)}
						/>
						<Checkbox
							label={t('Tasks')}
							checked={includeTasks}
							onChange={(e) => setIncludeTasks(e.target.checked)}
						/>
					</HBox>
				</Fieldset>
			</VBox>
		</CalendarEditorModal>
	)
}

// vim: ts=4
