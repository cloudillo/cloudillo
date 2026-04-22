// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { dayjs } from '../utils/dates.js'

export interface MonthCellProps {
	date: string
	inMonth: boolean
	isToday: boolean
	isNonWorking?: boolean
	/** 1-based grid column. Pinning the cell to its column avoids CSS-Grid
	 *  auto-placement bumping the cell into an implicit column when an event
	 *  already occupies a row below it. */
	column?: number
	/** Locale used when generating the date's screen-reader label. */
	locale?: string
	onDateChange?: (date: string) => void
	onCreateAt?: (start: string, end: string, allDay: boolean) => void
	children?: React.ReactNode
}

/** Single cell in the month grid. Clicking the date number navigates (drill
 *  down to day view); clicking the empty hit-target behind the content
 *  creates a new all-day event for that date. */
export function MonthCell({
	date,
	inMonth,
	isToday,
	isNonWorking,
	column,
	locale,
	onDateChange,
	onCreateAt,
	children
}: MonthCellProps) {
	const cls = [
		'c-cal-month-cell',
		inMonth ? 'in-month' : 'out-of-month',
		isToday ? 'is-today' : '',
		isNonWorking ? 'is-non-working' : ''
	]
		.filter(Boolean)
		.join(' ')
	const dayNum = dayjs(date).date()
	// Build a full "weekday, month day, year" label so screen readers announce
	// context instead of just the number. Fall back to the ISO date if Intl
	// throws on an unknown locale tag.
	const dateLabel = React.useMemo(() => {
		try {
			return new Intl.DateTimeFormat(locale, {
				weekday: 'long',
				month: 'long',
				day: 'numeric',
				year: 'numeric'
			}).format(dayjs(date).toDate())
		} catch {
			return date
		}
	}, [date, locale])
	return (
		<div className={cls} style={column ? { gridColumn: column } : undefined}>
			<button
				type="button"
				className="c-cal-month-cell__hit"
				aria-label={`Create event on ${dateLabel}`}
				onClick={() => onCreateAt?.(date, date, true)}
			/>
			<button
				type="button"
				className="c-cal-month-cell__num"
				aria-label={dateLabel}
				onClick={(e) => {
					e.stopPropagation()
					onDateChange?.(date)
				}}
			>
				{dayNum}
			</button>
			{children}
		</div>
	)
}

// vim: ts=4
