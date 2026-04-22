// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type {
	CalendarObjectInput,
	CalendarObjectOutput,
	CalendarOutput,
	EventInput
} from '@cloudillo/core'
import { DateTimePicker } from '@cloudillo/react'
import dayjs from 'dayjs'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { toLocalInput } from '../utils.js'

import { CalendarEditorModal } from './CalendarEditorModal.js'
import { RecurrenceBuilder } from './RecurrenceBuilder.js'

export interface EventEditorProps {
	open: boolean
	calendars: CalendarOutput[]
	defaultCalendarId?: number
	event?: CalendarObjectOutput
	draft?: { start: string; end: string; allDay: boolean } | null
	/** 0 = Sunday, 1 = Monday. Forwarded to the RecurrenceBuilder's weekday
	 *  chip group so weekly recurrence matches the user's calendar setting.
	 *  Omit to inherit the locale default. */
	firstDayOfWeek?: 0 | 1
	onClose: () => void
	onSave: (calId: number, data: CalendarObjectInput) => Promise<void>
}

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120, 180, 240, 480] as const

function localInputDiffMinutes(a: string, b: string): number | null {
	if (!a || !b) return null
	const start = dayjs(a)
	const end = dayjs(b)
	if (!start.isValid() || !end.isValid()) return null
	return end.diff(start, 'minute')
}

function durationLabel(
	min: number,
	start: string,
	locale: string,
	t: (key: string, opts?: Record<string, unknown>) => string
): string {
	const base =
		min < 60
			? t('{{n}} minutes', { n: min })
			: min === 60
				? t('1 hour')
				: min % 60 === 0
					? t('{{n}} hours', { n: min / 60 })
					: t('{{n}} hours', { n: Number((min / 60).toFixed(1)) })
	const s = dayjs(start)
	if (!s.isValid()) return base
	const e = s.add(min, 'minute')
	const fmt = s.isSame(e, 'day')
		? new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' })
		: new Intl.DateTimeFormat(locale, {
				weekday: 'short',
				hour: '2-digit',
				minute: '2-digit'
			})
	return t('{{base}} — ends {{end}}', { base, end: fmt.format(e.toDate()) })
}

function formatEndHint(start: string, end: string, locale: string): string {
	if (!end) return ''
	const s = dayjs(start)
	const e = dayjs(end)
	if (!e.isValid()) return ''
	const sameDay = s.isValid() && s.isSame(e, 'day')
	const fmt = sameDay
		? new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' })
		: new Intl.DateTimeFormat(locale, {
				weekday: 'short',
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			})
	return fmt.format(e.toDate())
}

export function EventEditor({
	open,
	calendars,
	defaultCalendarId,
	event,
	draft,
	firstDayOfWeek,
	onClose,
	onSave
}: EventEditorProps) {
	const { t, i18n } = useTranslation()

	const [calId, setCalId] = React.useState<number | undefined>(defaultCalendarId)
	const [summary, setSummary] = React.useState('')
	const [location, setLocation] = React.useState('')
	const [description, setDescription] = React.useState('')
	const [allDay, setAllDay] = React.useState(false)
	const [start, setStart] = React.useState('')
	const [end, setEnd] = React.useState('')
	const [durationMin, setDurationMin] = React.useState<number | 'custom'>(60)
	const [rrule, setRrule] = React.useState<string | undefined>(undefined)
	const [organizer, setOrganizer] = React.useState('')
	const [attendees, setAttendees] = React.useState<string[]>([])
	const [attendeeInput, setAttendeeInput] = React.useState('')
	const [reminderMin, setReminderMin] = React.useState<number | ''>('')
	const [submitting, setSubmitting] = React.useState(false)
	const [error, setError] = React.useState<string | undefined>()

	// Reset the form whenever the modal opens or its subject (event being edited
	// or the draft range) changes. `defaultCalendarId` is intentionally NOT a
	// dep — it would wipe user input if the parent pushes a new default while
	// the modal is open. A separate effect below tracks it for create mode.
	React.useEffect(() => {
		if (!open) return
		setError(undefined)
		if (event) {
			const evtAllDay = event.allDay ?? false
			const startLocal = toLocalInput(event.dtstart, evtAllDay)
			const endLocal = toLocalInput(event.dtend, evtAllDay)
			setCalId(event.calId)
			setSummary(event.summary ?? '')
			setLocation(event.location ?? '')
			setDescription(event.description ?? '')
			setAllDay(evtAllDay)
			setStart(startLocal)
			setEnd(endLocal)
			if (!evtAllDay) {
				const diff = localInputDiffMinutes(startLocal, endLocal)
				setDurationMin(
					diff != null && (DURATION_PRESETS as readonly number[]).includes(diff)
						? diff
						: 'custom'
				)
			} else {
				setDurationMin(60)
			}
			setRrule(event.rrule ?? undefined)
			setOrganizer(event.organizer ?? '')
			setAttendees([])
			setReminderMin('')
		} else {
			const draftAllDay = draft?.allDay ?? false
			const startLocal = toLocalInput(draft?.start, draftAllDay)
			const endLocal = toLocalInput(draft?.end, draftAllDay)
			setCalId(defaultCalendarId)
			setSummary('')
			setLocation('')
			setDescription('')
			setAllDay(draftAllDay)
			setStart(startLocal)
			setEnd(endLocal)
			if (!draftAllDay && startLocal && endLocal) {
				const diff = localInputDiffMinutes(startLocal, endLocal)
				setDurationMin(
					diff != null && (DURATION_PRESETS as readonly number[]).includes(diff)
						? diff
						: 'custom'
				)
			} else {
				setDurationMin(60)
			}
			setRrule(undefined)
			setOrganizer('')
			setAttendees([])
			setReminderMin('')
		}
	}, [open, event, draft])

	// Create-mode only: follow the sidebar's default-calendar selection so a
	// newly-picked default populates the form. Editing `calId` manually before
	// the sidebar changes again will still be overwritten — an acceptable
	// trade-off for keeping the sidebar-driven default in sync.
	React.useEffect(() => {
		if (!open || event) return
		setCalId(defaultCalendarId)
	}, [open, event, defaultCalendarId])

	// Keep end in sync with start + duration preset, leaving custom mode alone.
	React.useEffect(() => {
		if (allDay || durationMin === 'custom' || !start) return
		const s = dayjs(start)
		if (!s.isValid()) return
		const next = s.add(durationMin, 'minute').format('YYYY-MM-DDTHH:mm')
		if (next !== end) setEnd(next)
	}, [start, durationMin, allDay, end])

	function addAttendee() {
		const v = attendeeInput.trim()
		if (!v) return
		const normalized = v.includes(':') ? v : `mailto:${v}`
		setAttendees((prev) => [...prev, normalized])
		setAttendeeInput('')
	}

	async function handleSave(e?: React.FormEvent) {
		e?.preventDefault()
		if (!calId) {
			setError(t('Pick a calendar'))
			return
		}
		const trimmed = summary.trim()
		if (!trimmed) {
			setError(t('Event title is required'))
			return
		}
		if (!start) {
			setError(t('Start time is required'))
			return
		}
		if (end) {
			if (allDay) {
				// date strings compare lexicographically correctly (YYYY-MM-DD)
				if (end < start) {
					setError(t('End date must be on or after the start date'))
					return
				}
			} else {
				const diff = localInputDiffMinutes(start, end)
				if (diff == null) {
					setError(t('End time is invalid'))
					return
				}
				if (diff <= 0) {
					setError(t('End time must be after the start time'))
					return
				}
			}
		}
		setSubmitting(true)
		setError(undefined)
		try {
			const startIso = allDay ? start : dayjs(start).toISOString()
			const endIso = allDay ? end || start : dayjs(end || start).toISOString()

			const eventInput: EventInput = {
				summary: trimmed,
				description: description.trim() || undefined,
				location: location.trim() || undefined,
				dtstart: startIso,
				dtend: endIso,
				allDay,
				rrule: rrule?.trim() || undefined,
				organizer: organizer.trim() || undefined,
				attendees: attendees.length
					? attendees.map((address) => ({ address, partstat: 'NEEDS-ACTION' }))
					: undefined,
				alarms:
					reminderMin !== ''
						? [
								{
									action: 'DISPLAY',
									trigger: `-PT${reminderMin}M`,
									description: trimmed
								}
							]
						: undefined
			}
			await onSave(calId, { event: eventInput })
			onClose()
		} catch (err) {
			setError(err instanceof Error ? err.message : t('Failed to save event'))
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<CalendarEditorModal
			open={open}
			title={event ? t('Edit event') : t('New event')}
			edit={!!event}
			submitting={submitting}
			error={error}
			onClose={onClose}
			onSubmit={handleSave}
			maxWidth="540px"
		>
			<div className="mb-3">
				<input
					className="c-input c-cal-editor__title"
					value={summary}
					onChange={(e) => setSummary(e.target.value)}
					placeholder={t('Event title')}
					aria-label={t('Event title')}
					autoFocus
				/>
				<select
					className="c-input mt-2"
					value={calId ?? ''}
					onChange={(e) => setCalId(Number(e.target.value))}
					aria-label={t('Calendar')}
				>
					<option value="">{t('Pick a calendar')}</option>
					{calendars.map((c) => (
						<option key={c.calId} value={c.calId}>
							{c.name}
						</option>
					))}
				</select>
			</div>

			<section className="c-cal-section">
				<div className="c-cal-section__label">{t('When')}</div>

				<div className="mb-2">
					<label className="d-flex align-items-center g-2">
						<input
							type="checkbox"
							checked={allDay}
							onChange={(e) => setAllDay(e.target.checked)}
						/>
						{t('All day')}
					</label>
				</div>

				<div className="mb-2">
					<label className="c-cal-detail-label">{t('Starts')}</label>
					{allDay ? (
						<input
							className="c-input"
							type="date"
							value={start}
							onChange={(e) => setStart(e.target.value)}
							aria-label={t('Start date')}
						/>
					) : (
						<DateTimePicker
							value={start}
							onChange={setStart}
							defaultTime="09:00"
							dateLabel={t('Start date')}
							timeLabel={t('Start time')}
						/>
					)}
				</div>

				{allDay ? (
					<div className="mb-2">
						<label className="c-cal-detail-label">{t('Ends')}</label>
						<input
							className="c-input"
							type="date"
							value={end}
							onChange={(e) => setEnd(e.target.value)}
							min={start || undefined}
							aria-label={t('End date')}
						/>
					</div>
				) : (
					<div className="mb-2">
						<label className="c-cal-detail-label">{t('Duration')}</label>
						<select
							className="c-input"
							value={durationMin === 'custom' ? 'custom' : String(durationMin)}
							onChange={(e) =>
								setDurationMin(
									e.target.value === 'custom' ? 'custom' : Number(e.target.value)
								)
							}
						>
							{DURATION_PRESETS.map((m) => (
								<option key={m} value={String(m)}>
									{durationLabel(m, start, i18n.language, t)}
								</option>
							))}
							<option value="custom">{t('Custom end time…')}</option>
						</select>
						{durationMin === 'custom' ? (
							<div className="mt-1">
								<DateTimePicker
									value={end}
									onChange={setEnd}
									defaultTime="10:00"
									min={start ? start.slice(0, 10) : undefined}
									dateLabel={t('End date')}
									timeLabel={t('End time')}
								/>
							</div>
						) : (
							start && (
								<div
									className="c-hint"
									style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}
								>
									{t('Ends {{when}}', {
										when: formatEndHint(start, end, i18n.language)
									})}
								</div>
							)
						)}
					</div>
				)}

				<div className="mb-2">
					<label className="c-cal-detail-label">{t('Repeat')}</label>
					<RecurrenceBuilder
						value={rrule}
						onChange={setRrule}
						startDate={start || undefined}
						allDay={allDay}
						locale={i18n.language}
						firstDayOfWeek={firstDayOfWeek}
					/>
				</div>
			</section>

			<section className="c-cal-section">
				<div className="c-cal-section__label">{t('Where & details')}</div>
				<div className="mb-2">
					<label className="c-cal-detail-label">{t('Location')}</label>
					<input
						className="c-input"
						value={location}
						onChange={(e) => setLocation(e.target.value)}
					/>
				</div>
				<div className="mb-2">
					<label className="c-cal-detail-label">{t('Description')}</label>
					<textarea
						className="c-input"
						rows={3}
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
				</div>
			</section>

			<section className="c-cal-section">
				<div className="c-cal-section__label">{t('People')}</div>
				<div className="mb-2">
					<label className="c-cal-detail-label">{t('Organizer')}</label>
					<input
						className="c-input"
						placeholder="mailto:alice@example.com"
						value={organizer}
						onChange={(e) => setOrganizer(e.target.value)}
					/>
				</div>
				<div className="mb-2">
					<label className="c-cal-detail-label">{t('Attendees')}</label>
					<div className="c-cal-chips">
						{attendees.map((addr, i) => (
							<span key={`${i}-${addr}`} className="c-cal-chip">
								{addr.replace(/^mailto:/, '')}
								<button
									type="button"
									className="c-cal-chip__remove"
									onClick={() =>
										setAttendees((prev) => prev.filter((_, j) => j !== i))
									}
									aria-label={t('Remove')}
								>
									×
								</button>
							</span>
						))}
						<input
							className="c-input"
							style={{ border: 'none', flex: 1, minWidth: '10ch' }}
							placeholder="bob@example.com"
							value={attendeeInput}
							onChange={(e) => setAttendeeInput(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter' || e.key === ',') {
									e.preventDefault()
									addAttendee()
								}
							}}
							onBlur={() => addAttendee()}
						/>
					</div>
					<div className="c-hint" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
						{t('Press Enter or comma to add')}
					</div>
				</div>
			</section>

			<section className="c-cal-section">
				<div className="c-cal-section__label">{t('Alerts')}</div>
				<div className="mb-2">
					<label className="c-cal-detail-label">{t('Reminder')}</label>
					<select
						className="c-input"
						value={reminderMin === '' ? '' : String(reminderMin)}
						onChange={(e) =>
							setReminderMin(e.target.value === '' ? '' : Number(e.target.value))
						}
						style={{ maxWidth: '16rem' }}
					>
						<option value="">{t('None')}</option>
						<option value="5">{t('5 minutes before')}</option>
						<option value="15">{t('15 minutes before')}</option>
						<option value="30">{t('30 minutes before')}</option>
						<option value="60">{t('1 hour before')}</option>
						<option value="1440">{t('1 day before')}</option>
						<option value="10080">{t('1 week before')}</option>
					</select>
				</div>
			</section>
		</CalendarEditorModal>
	)
}

// vim: ts=4
