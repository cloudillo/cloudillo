// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { CalendarViewProps } from '../types.js'
import { dayjs } from '../utils/dates.js'
import { AllDayBand } from './AllDayBand.js'
import { TimeGrid } from './TimeGrid.js'

export function DayView(props: CalendarViewProps) {
	const {
		date,
		events,
		snapMinutes = 15,
		dayStartHour = 0,
		dayEndHour = 24,
		workingHours,
		workingDays,
		selectedId,
		onSelect,
		onCreateAt,
		onEventUpdate,
		className
	} = props
	const locale = props.locale || 'en'
	const days = React.useMemo(() => [date], [date])
	const headerFmt = React.useMemo(
		() =>
			new Intl.DateTimeFormat(locale, {
				weekday: 'long',
				month: 'long',
				day: 'numeric',
				year: 'numeric'
			}),
		[locale]
	)
	return (
		<div className={`c-cal-view c-cal-view--day${className ? ` ${className}` : ''}`}>
			<div className="c-cal-view__scroll">
				<div className="c-cal-view__sticky-head">
					<div className="c-cal-view__head">
						<div className="c-cal-view__gutter-head" />
						<div className="c-cal-view__day-head">
							{headerFmt.format(dayjs(date).toDate())}
						</div>
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
