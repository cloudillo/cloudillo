// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type {
	CalendarObjectInput,
	CalendarObjectOutput,
	CalendarOutput,
	TodoInput
} from '@cloudillo/core'
import dayjs from 'dayjs'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { toLocalInput } from '../utils.js'
import { CalendarEditorModal } from './CalendarEditorModal.js'

const TASK_STATUSES = ['NEEDS-ACTION', 'IN-PROCESS', 'COMPLETED'] as const
type TaskStatus = (typeof TASK_STATUSES)[number]

function coerceStatus(raw: unknown): TaskStatus {
	return TASK_STATUSES.includes(raw as TaskStatus) ? (raw as TaskStatus) : 'NEEDS-ACTION'
}

export interface TaskEditorProps {
	open: boolean
	calendars: CalendarOutput[]
	defaultCalendarId?: number
	task?: CalendarObjectOutput
	onClose: () => void
	onSave: (calId: number, data: CalendarObjectInput) => Promise<void>
}

export function TaskEditor({
	open,
	calendars,
	defaultCalendarId,
	task,
	onClose,
	onSave
}: TaskEditorProps) {
	const { t } = useTranslation()

	const [calId, setCalId] = React.useState<number | undefined>(defaultCalendarId)
	const [summary, setSummary] = React.useState('')
	const [description, setDescription] = React.useState('')
	const [due, setDue] = React.useState('')
	const [priority, setPriority] = React.useState<number | ''>('')
	const [status, setStatus] = React.useState<TaskStatus>('NEEDS-ACTION')
	const [submitting, setSubmitting] = React.useState(false)
	const [error, setError] = React.useState<string | undefined>()

	React.useEffect(() => {
		if (!open) return
		setError(undefined)
		if (task) {
			setCalId(task.calId)
			setSummary(task.summary ?? '')
			setDescription(task.description ?? '')
			setDue(toLocalInput(task.dtend, true))
			setPriority(task.priority ?? '')
			setStatus(coerceStatus(task.status))
		} else {
			setCalId(defaultCalendarId)
			setSummary('')
			setDescription('')
			setDue('')
			setPriority('')
			setStatus('NEEDS-ACTION')
		}
	}, [open, task, defaultCalendarId])

	async function handleSave(e?: React.FormEvent) {
		e?.preventDefault()
		if (!calId) {
			setError(t('Pick a calendar'))
			return
		}
		const trimmed = summary.trim()
		if (!trimmed) {
			setError(t('Task title is required'))
			return
		}
		setSubmitting(true)
		setError(undefined)
		try {
			const todo: TodoInput = {
				summary: trimmed,
				description: description.trim() || undefined,
				due: due || undefined,
				priority: priority === '' ? undefined : priority,
				status,
				completed: status === 'COMPLETED' ? dayjs().toISOString() : undefined
			}
			await onSave(calId, { todo })
			onClose()
		} catch (err) {
			setError(err instanceof Error ? err.message : t('Failed to save task'))
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<CalendarEditorModal
			open={open}
			title={task ? t('Edit task') : t('New task')}
			edit={!!task}
			submitting={submitting}
			error={error}
			onClose={onClose}
			onSubmit={handleSave}
		>
			<div className="mb-3">
				<label className="c-cal-detail-label">{t('Task title')}</label>
				<input
					className="c-input"
					value={summary}
					onChange={(e) => setSummary(e.target.value)}
					autoFocus
				/>
			</div>

			<div className="mb-3">
				<label className="c-cal-detail-label">{t('Calendar')}</label>
				<select
					className="c-input"
					value={calId ?? ''}
					onChange={(e) => setCalId(Number(e.target.value))}
				>
					<option value="">{t('Pick a calendar')}</option>
					{calendars.map((c) => (
						<option key={c.calId} value={c.calId}>
							{c.name}
						</option>
					))}
				</select>
			</div>

			<div className="mb-3">
				<label className="c-cal-detail-label">{t('Due')}</label>
				<input
					className="c-input"
					type="date"
					value={due}
					onChange={(e) => setDue(e.target.value)}
				/>
			</div>

			<div className="mb-3">
				<label className="c-cal-detail-label">{t('Priority')}</label>
				<select
					className="c-input"
					value={priority}
					onChange={(e) =>
						setPriority(e.target.value === '' ? '' : Number(e.target.value))
					}
				>
					<option value="">{t('None')}</option>
					<option value="1">{t('High')}</option>
					<option value="5">{t('Medium')}</option>
					<option value="9">{t('Low')}</option>
				</select>
			</div>

			<div className="mb-3">
				<label className="c-cal-detail-label">{t('Status')}</label>
				<select
					className="c-input"
					value={status}
					onChange={(e) => setStatus(coerceStatus(e.target.value))}
				>
					<option value="NEEDS-ACTION">{t('Not started')}</option>
					<option value="IN-PROCESS">{t('In progress')}</option>
					<option value="COMPLETED">{t('Completed')}</option>
				</select>
			</div>

			<div className="mb-3">
				<label className="c-cal-detail-label">{t('Description')}</label>
				<textarea
					className="c-input"
					rows={3}
					value={description}
					onChange={(e) => setDescription(e.target.value)}
				/>
			</div>
		</CalendarEditorModal>
	)
}

// vim: ts=4
