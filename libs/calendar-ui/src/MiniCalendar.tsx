// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { dayjs, localeFirstDay, monthGridDays, type WeekStart } from './utils/dates.js'

export interface MiniCalendarProps {
	/** Selected date (YYYY-MM-DD); the shown month follows it when it changes */
	date: string
	onDateChange: (date: string) => void
	locale?: string
	/** 0 = Sunday, 1 = Monday; defaults to the locale's first day */
	firstDayOfWeek?: WeekStart
	prevLabel?: string
	nextLabel?: string
	className?: string
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
	return (
		<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
			<polyline
				points={dir === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'}
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	)
}

/** Compact month navigator: prev/next month, click a day to pick it. */
export function MiniCalendar({
	date,
	onDateChange,
	locale,
	firstDayOfWeek,
	prevLabel = 'Previous month',
	nextLabel = 'Next month',
	className
}: MiniCalendarProps) {
	const firstDay = firstDayOfWeek ?? localeFirstDay(locale)
	const [viewMonth, setViewMonth] = React.useState(() => dayjs(date).startOf('month'))

	React.useEffect(
		function syncMonth() {
			setViewMonth(dayjs(date).startOf('month'))
		},
		[date]
	)

	const anchor = viewMonth.format('YYYY-MM-DD')
	const cells = monthGridDays(anchor, firstDay)
	const selected = dayjs(date).format('YYYY-MM-DD')
	const today = dayjs().format('YYYY-MM-DD')
	const label = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
		viewMonth.toDate()
	)
	const dowFormat = new Intl.DateTimeFormat(locale, { weekday: 'narrow' })
	// Sun Jan 7 2024 is a known Sunday; advance by weekday index.
	const dowHeaders = Array.from({ length: 7 }, (_, i) =>
		dowFormat.format(
			dayjs('2024-01-07')
				.add((firstDay + i) % 7, 'day')
				.toDate()
		)
	)

	return (
		<div className={className ? `c-cal-mini ${className}` : 'c-cal-mini'}>
			<div className="c-cal-mini__nav">
				<button
					type="button"
					className="c-cal-mini__step"
					onClick={() => setViewMonth((m) => m.subtract(1, 'month'))}
					aria-label={prevLabel}
				>
					<Chevron dir="left" />
				</button>
				<strong aria-live="polite">{label}</strong>
				<button
					type="button"
					className="c-cal-mini__step"
					onClick={() => setViewMonth((m) => m.add(1, 'month'))}
					aria-label={nextLabel}
				>
					<Chevron dir="right" />
				</button>
			</div>
			<div className="c-cal-mini__grid">
				{dowHeaders.map((dow, i) => (
					<div key={`h${i}`} className="c-cal-mini__header" aria-hidden="true">
						{dow}
					</div>
				))}
				{cells.map((iso) => {
					const d = dayjs(iso)
					const classes = ['c-cal-mini__cell']
					if (d.month() !== viewMonth.month()) classes.push('other-month')
					if (iso === today) classes.push('today')
					if (iso === selected) classes.push('selected')
					return (
						<button
							key={iso}
							type="button"
							className={classes.join(' ')}
							onClick={() => onDateChange(iso)}
							aria-current={iso === selected ? 'date' : undefined}
							aria-label={new Intl.DateTimeFormat(locale, {
								dateStyle: 'full'
							}).format(d.toDate())}
						>
							{d.date()}
						</button>
					)
				})}
			</div>
		</div>
	)
}

// vim: ts=4
