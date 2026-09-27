// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { CalendarObjectOutput, CalendarOutput } from '@cloudillo/core'
import {
	ActionBar,
	Alert,
	Badge,
	Button,
	ColorDot,
	DescriptionList,
	Disclosure,
	EmptyState,
	Heading,
	HBox,
	Icon,
	LoadingSpinner,
	Text,
	useDialog,
	VBox
} from '@cloudillo/react'
import dayjs from 'dayjs'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuBell as IcAlarm,
	LuUsers as IcAttendees,
	LuClock as IcClock,
	LuTrash as IcDelete,
	LuPencil as IcEdit,
	LuMapPin as IcPin,
	LuRepeat as IcRecur,
	LuRotateCcw as IcReset
} from 'react-icons/lu'

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

type StatusPill = { label: string; color: 'success' | 'primary' | 'secondary' | 'warning' }

function statusPill(status: string | undefined, t: (k: string) => string): StatusPill | null {
	if (!status) return null
	switch (status) {
		case 'COMPLETED':
			return { label: t('Done'), color: 'success' }
		case 'IN-PROCESS':
			return { label: t('In progress'), color: 'primary' }
		case 'NEEDS-ACTION':
			return { label: t('To do'), color: 'secondary' }
		case 'CANCELLED':
			return { label: t('Cancelled'), color: 'warning' }
		case 'CONFIRMED':
			return { label: t('Confirmed'), color: 'success' }
		case 'TENTATIVE':
			return { label: t('Tentative'), color: 'secondary' }
		default:
			return { label: status, color: 'secondary' }
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
		return (
			<Text emphasis="muted" className="flex-fill">
				{t('Details')}
			</Text>
		)
	}
	const cal = calendars.find((c) => c.calId === object.calId)
	return (
		<>
			{cal && <ColorDot color={cal.color || 'var(--col-primary)'} />}
			<Heading level={3} className="flex-fill m-0">
				{object.summary || t('(untitled)')}
			</Heading>
			{object.rrule && <Icon as={IcRecur} label={t('Recurring')} />}
		</>
	)
}

function Term({ icon, children }: { icon?: React.ComponentType; children: React.ReactNode }) {
	return (
		<HBox gap={1} align="center">
			{icon && <Icon as={icon} />}
			{children}
		</HBox>
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
		return <LoadingSpinner fill />
	}

	if (!object) {
		return <EmptyState fill description={t('Select an event or task to see details.')} />
	}

	const isTask = object.component === 'VTODO'

	async function handleDelete() {
		const confirmed = await dialog.confirm(
			isTask ? t('Delete task?') : t('Delete event?'),
			t('This cannot be undone.'),
			{ color: 'error', confirmLabel: t('Delete') }
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
		<VBox gap={2} padding={3}>
			{!hideHeader && (
				<HBox gap={2} align="center">
					<ObjectDetailsHeader object={object} calendars={calendars} />
				</HBox>
			)}

			{pill && (
				<HBox>
					<Badge color={pill.color}>{pill.label}</Badge>
				</HBox>
			)}

			{object.parseError && (
				<Alert color="error" compact>
					{t('Could not fully parse this entry: {{err}}', { err: object.parseError })}
				</Alert>
			)}

			<DescriptionList
				items={[
					{
						key: 'when',
						term: <Term icon={IcClock}>{isTask ? t('Due') : t('When')}</Term>,
						description: formatRange() || (
							<Text emphasis="muted">{t('No time set')}</Text>
						)
					},
					...(object.location
						? [
								{
									key: 'location',
									term: <Term icon={IcPin}>{t('Location')}</Term>,
									description: object.location
								}
							]
						: []),
					...(object.description
						? [
								{
									key: 'description',
									term: <Term>{t('Description')}</Term>,
									description: <Text preWrap>{object.description}</Text>
								}
							]
						: []),
					...(object.organizer
						? [
								{
									key: 'organizer',
									term: <Term icon={IcAttendees}>{t('Organizer')}</Term>,
									description: object.organizer
								}
							]
						: []),
					...(priority
						? [
								{
									key: 'priority',
									term: <Term icon={IcAlarm}>{t('Priority')}</Term>,
									description: (
										<HBox gap={2} align="center">
											<ColorDot color={priority.color} />
											{priority.label}
										</HBox>
									)
								}
							]
						: []),
					...(object.rrule
						? [
								{
									key: 'rrule',
									term: <Term icon={IcRecur}>{t('Recurrence')}</Term>,
									description: rruleHuman || (
										<Disclosure summary={t('Custom rule')}>
											<Text as="div" mono size="sm">
												{object.rrule}
											</Text>
										</Disclosure>
									)
								}
							]
						: [])
				]}
			/>

			{hasOverride && onReset && (
				<Alert
					color="neutral"
					compact
					actions={
						<Button size="sm" onClick={() => onReset()} icon={<IcReset />}>
							{t('Reset to series default')}
						</Button>
					}
				>
					{t('This occurrence has been modified.')}
				</Alert>
			)}

			<ActionBar>
				<Button onClick={onEdit} icon={<IcEdit />}>
					{t('Edit')}
				</Button>
				<Button color="error" onClick={handleDelete} icon={<IcDelete />}>
					{t('Delete')}
				</Button>
			</ActionBar>
		</VBox>
	)
}

// vim: ts=4
