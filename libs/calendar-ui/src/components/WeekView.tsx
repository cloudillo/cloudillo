// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { CalendarViewProps } from '../types.js'
import { dayjs, isoWeekNumber, localeFirstDay, weekDays } from '../utils/dates.js'
import { AllDayBand } from './AllDayBand.js'
import { TimeGrid } from './TimeGrid.js'

export function WeekView(props: CalendarViewProps) {
	const {
		date,
		events,
		snapMinutes = 15,
		dayStartHour = 0,
		dayEndHour = 24,
		workingHours,
		workingDays,
		showWeekNumbers,
		selectedId,
		onSelect,
		onCreateAt,
		onEventUpdate,
		onDateChange,
		className
	} = props
	const locale = props.locale || 'en'
	const firstDay = props.firstDayOfWeek ?? localeFirstDay(locale)
	const days = React.useMemo(() => weekDays(date, firstDay), [date, firstDay])
	const headerFmt = React.useMemo(
		() => new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric' }),
		[locale]
	)
	const weekNo = isoWeekNumber(days[0])

	return (
		<div
			className={`c-cal-view c-cal-view--week${className ? ` ${className}` : ''}`}
			style={{ '--cols': days.length } as React.CSSProperties}
		>
			<div className="c-cal-view__scroll">
				<div className="c-cal-view__sticky-head">
					<div className="c-cal-view__head">
						<div className="c-cal-view__gutter-head">
							{showWeekNumbers && (
								<span className="c-cal-weekno" title={`ISO week ${weekNo}`}>
									W{weekNo}
								</span>
							)}
						</div>
						{days.map((d) => (
							<button
								type="button"
								key={d}
								className="c-cal-view__day-head"
								onClick={() => onDateChange?.(d)}
							>
								{headerFmt.format(dayjs(d).toDate())}
							</button>
						))}
					</div>
					<AllDayBand
						days={days}
						events={events}
						selectedId={selectedId}
						onSelect={onSelect}
						onCreateAt={onCreateAt}
					/>
				</div>
				<TimeGrid
					days={days}
					dayStartHour={dayStartHour}
					dayEndHour={dayEndHour}
					snapMinutes={snapMinutes}
					events={events}
					selectedId={selectedId}
					locale={locale}
					workingHours={workingHours}
					workingDays={workingDays}
					onSelect={onSelect}
					onCreateAt={onCreateAt}
					onEventUpdate={onEventUpdate}
				/>
			</div>
		</div>
	)
}

// vim: ts=4
