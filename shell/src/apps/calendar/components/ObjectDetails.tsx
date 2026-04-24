// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuPencil as IcEdit,
	LuTrash as IcDelete,
	LuMapPin as IcPin,
	LuClock as IcClock,
	LuRepeat as IcRecur,
	LuUsers as IcAttendees,
	LuBell as IcAlarm,
	LuRotateCcw as IcReset
} from 'react-icons/lu'

import { Button, LoadingSpinner, useDialog } from '@cloudillo/react'
import type { CalendarOutput, CalendarObjectOutput } from '@cloudillo/core'
import dayjs from 'dayjs'

import { rruleToHuman } from '../utils.js'

type PriorityBucket = { key: 'high' | 'normal' | 'low'; label: string; color: string }

function bucketPriority(
	priority: number | undefined,
	t: (k: string) => string
): PriorityBucket | null {
	if (priority == null) return null
	if (priority >= 1 && priority <= 3)
		return { key: 'high', label: t('High'), color: 'var(--col-error)' }
	if (priority >= 4 && priority <= 6)
		return { key: 'normal', label: t('Normal'), color: 'var(--col-warning)' }
	if (priority >= 7 && priority <= 9)
		return { key: 'low', label: t('Low'), color: 'var(--col-accent)' }
	return null
}

type StatusPill = { label: string; className: string }

function statusPill(status: string | undefined, t: (k: string) => string): StatusPill | null {
	if (!status) return null
	switch (status) {
		case 'COMPLETED':
			return { label: t('Done'), className: 'bg-container-success' }
		case 'IN-PROCESS':
			return { label: t('In progress'), className: 'bg-container-primary' }
		case 'NEEDS-ACTION':
			return { label: t('To do'), className: 'bg-container-secondary' }
		case 'CANCELLED':
			return { label: t('Cancelled'), className: 'bg-container-warning' }
		case 'CONFIRMED':
			return { label: t('Confirmed'), className: 'bg-container-success' }
		case 'TENTATIVE':
			return { label: t('Tentative'), className: 'bg-container-secondary' }
		default:
			return { label: status, className: 'bg-container-secondary' }
	}
}

export interface ObjectDetailsProps {
	object: CalendarObjectOutput | undefined
	calendars: CalendarOutput[]
	loading: boolean
	onEdit: () => void
	onDelete: () => Promise<void> | void
	/** True when the currently shown occurrence of a recurring series has a
	 *  per-instance override. Shows the "Reset to series default" action. */
	hasOverride?: boolean
	onReset?: () => Promise<void> | void
	/** Skip rendering the built-in title row (swatch + title + recurring icon).
	 *  Use when the parent provides the header externally (e.g. via
	 *  `FcdDetails`'s `header` slot). */
	hideHeader?: boolean
}

export interface ObjectDetailsHeaderProps {
	object: CalendarObjectOutput | undefined
	calendars: CalendarOutput[]
}

/** Title row of the object details pane — swatch + summary + recurring icon.
 *  Rendered internally by `ObjectDetails` by default; or externally by callers
 *  who pass `hideHeader` and need to drop it into `FcdDetails.header`. */
export function ObjectDetailsHeader({ object, calendars }: ObjectDetailsHeaderProps) {
	const { t } = useTranslation()
	if (!object) {
		return <span className="flex-fill c-hint">{t('Details')}</span>
	}
	const cal = calendars.find((c) => c.calId === object.calId)
	return (
		<>
			{cal && (
				<span
					className="c-cal-item__swatch"
					style={{ background: cal.color || 'var(--col-primary)' }}
					aria-hidden="true"
				/>
			)}
			<h3 className="flex-fill m-0">{object.summary || t('(untitled)')}</h3>
			{object.rrule && (
				<span title={t('Recurring')} aria-label={t('Recurring')}>
					<IcRecur />
				</span>
			)}
		</>
	)
}

export function ObjectDetails({
	object,
	calendars,
	loading,
	onEdit,
	onDelete,
	hasOverride,
	onReset,
	hideHeader
}: ObjectDetailsProps) {
	const { t, i18n } = useTranslation()
	const dialog = useDialog()

	if (loading) {
		return (
			<div className="c-cal-details d-flex flex-column">
				<div className="flex-fill d-flex align-items-center justify-content-center p-4">
					<LoadingSpinner />
				</div>
			</div>
		)
	}

	if (!object) {
		return (
			<div className="c-cal-details d-flex flex-column">
				<div className="flex-fill p-4 c-hint text-center">
					{t('Select an event or task to see details.')}
				</div>
			</div>
		)
	}

	const isTask = object.component === 'VTODO'

	async function handleDelete() {
		const confirmed = await dialog.confirm(
			isTask ? t('Delete task?') : t('Delete event?'),
			t('This cannot be undone.')
		)
		if (!confirmed) return
		await onDelete()
	}

	const fmtDateTime = new Intl.DateTimeFormat(i18n.language, {
		dateStyle: 'full',
		timeStyle: 'short'
	})
	const fmtDate = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'full' })

	function formatRange(): string {
		if (!object) return ''
		if (object.allDay && object.dtstart) {
			const startDate = dayjs(object.dtstart).startOf('day').toDate()
			if (object.dtend && object.dtend !== object.dtstart) {
				const endDate = dayjs(object.dtend).startOf('day').toDate()
				return `${fmtDate.format(startDate)} – ${fmtDate.format(endDate)}`
			}
			return fmtDate.format(startDate)
		}
		if (object.dtstart && object.dtend)
			return `${fmtDateTime.format(dayjs(object.dtstart).toDate())} – ${fmtDateTime.format(dayjs(object.dtend).toDate())}`
		if (object.dtstart) return fmtDateTime.format(dayjs(object.dtstart).toDate())
		return ''
	}

	const pill = statusPill(object.status, t)
	const priority = bucketPriority(object.priority ?? undefined, t)
	const rruleHuman = rruleToHuman(object.rrule, i18n.language, t)

	return (
		<div className="c-cal-details p-3">
			{!hideHeader && (
				<div className="d-flex align-items-center g-2 mb-2">
					<ObjectDetailsHeader object={object} calendars={calendars} />
				</div>
			)}

			{pill && (
				<div className="mb-2">
					<span className={`c-cal-detail-pill ${pill.className}`}>{pill.label}</span>
				</div>
			)}

			{object.parseError && (
				<div className="c-panel bg-container-error p-2 mb-2" role="alert">
					<span className="text-error">
						{t('Could not fully parse this entry: {{err}}', { err: object.parseError })}
					</span>
				</div>
			)}

			<div className="c-cal-detail-field">
				<span className="c-cal-detail-label">
					<IcClock className="me-1" />
					{isTask ? t('Due') : t('When')}
				</span>
				<span className="c-cal-detail-value">
					{formatRange() || <em className="c-hint">{t('No time set')}</em>}
				</span>
			</div>

			{object.location && (
				<div className="c-cal-detail-field">
					<span className="c-cal-detail-label">
						<IcPin className="me-1" />
						{t('Location')}
					</span>
					<span className="c-cal-detail-value">{object.location}</span>
				</div>
			)}

			{object.description && (
				<div className="c-cal-detail-field">
					<span className="c-cal-detail-label">{t('Description')}</span>
					<span className="c-cal-detail-value" style={{ whiteSpace: 'pre-wrap' }}>
						{object.description}
					</span>
				</div>
			)}

			{object.organizer && (
				<div className="c-cal-detail-field">
					<span className="c-cal-detail-label">
						<IcAttendees className="me-1" />
						{t('Organizer')}
					</span>
					<span className="c-cal-detail-value">{object.organizer}</span>
				</div>
			)}

			{priority && (
				<div className="c-cal-detail-field">
					<span className="c-cal-detail-label">
						<IcAlarm className="me-1" />
						{t('Priority')}
					</span>
					<span className="c-cal-detail-value d-flex align-items-center g-2">
						<span
							className="c-cal-task-row__priority"
							style={{
								background: priority.color,
								marginTop: 0
							}}
							aria-hidden="true"
						/>
						{priority.label}
					</span>
				</div>
			)}

			{object.rrule && (
				<div className="c-cal-detail-field">
					<span className="c-cal-detail-label">
						<IcRecur className="me-1" />
						{t('Recurrence')}
					</span>
					{rruleHuman ? (
						<span className="c-cal-detail-value">{rruleHuman}</span>
					) : (
						<details>
							<summary className="c-cal-detail-value">{t('Custom rule')}</summary>
							<code
								className="d-block mt-1"
								style={{ fontFamily: 'monospace', fontSize: '0.85em' }}
							>
								{object.rrule}
							</code>
						</details>
					)}
				</div>
			)}

			{hasOverride && onReset && (
				<div className="c-panel bg-container-secondary p-2 mb-2" role="status">
					<div className="d-flex align-items-center g-2">
						<span className="flex-fill">{t('This occurrence has been modified.')}</span>
						<Button size="small" onClick={() => onReset()} icon={<IcReset />}>
							{t('Reset to series default')}
						</Button>
					</div>
				</div>
			)}

			<div className="d-flex justify-content-end g-2 mt-3">
				<Button onClick={onEdit} icon={<IcEdit />}>
					{t('Edit')}
				</Button>
				<Button variant="error" onClick={handleDelete} icon={<IcDelete />}>
					{t('Delete')}
				</Button>
			</div>
		</div>
	)
}

// vim: ts=4
