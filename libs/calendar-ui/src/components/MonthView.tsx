// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { CalendarEvent, CalendarViewProps } from '../types.js'
import {
	dayjs,
	isoWeekNumber,
	localDatePart,
	localeFirstDay,
	monthGridDays,
	sameDay
} from '../utils/dates.js'
import { MonthCell } from './MonthCell.js'
import { MonthEvent } from './MonthEvent.js'

/** Maximum event bars shown per cell before collapsing the rest into "+N more". */
const MAX_ROWS_PER_CELL = 4

interface PlacedMonthEvent {
	event: CalendarEvent
	weekIdx: number
	startCol: number // 1-based column within the 7-col week row
	span: number
	lane: number
	continuesLeft: boolean
	continuesRight: boolean
}

/** Slot events into 6 week rows, assigning each event a lane within its row.
 *  Events that cross a week boundary get a new segment per row. */
function placeMonthEvents(
	events: CalendarEvent[],
	days: string[]
): { placed: PlacedMonthEvent[]; hiddenByDay: Map<string, number> } {
	const placed: PlacedMonthEvent[] = []
	const hiddenByDay = new Map<string, number>()
	const weekRanges: [string, string][] = []
	for (let w = 0; w < 6; w++) {
		weekRanges.push([days[w * 7], days[w * 7 + 6]])
	}
	// O(1) column lookup per (day, week) during placement. Replaces repeated
	// `days.indexOf()` calls inside the per-event loop below.
	const dayToIndex = new Map<string, number>()
	for (let i = 0; i < days.length; i++) dayToIndex.set(days[i], i)
	// Track lane occupancy per (week, column).
	const busy: boolean[][][] = Array.from({ length: 6 }, () => Array.from({ length: 7 }, () => []))

	// Length delta used as the final tiebreaker — must be stable even if an
	// event has an invalid/missing end (NaN would make the comparator non-
	// transitive and yield nondeterministic row order).
	const safeLen = (ev: CalendarEvent): number => {
		const s = dayjs(ev.start)
		const e = dayjs(ev.end)
		if (!s.isValid() || !e.isValid()) return 0
		return e.valueOf() - s.valueOf()
	}

	// Stable sort: earliest start first; multi-day / all-day first within a day.
	const sorted = [...events].sort((a, b) => {
		const da = localDatePart(a.start)
		const db = localDatePart(b.start)
		if (da !== db) return da.localeCompare(db)
		const aAll = a.allDay ? 1 : 0
		const bAll = b.allDay ? 1 : 0
		if (aAll !== bAll) return bAll - aAll
		return safeLen(b) - safeLen(a)
	})

	for (const ev of sorted) {
		const sDate = localDatePart(ev.start)
		let eDate = localDatePart(ev.end) || sDate
		// iCal DTEND is exclusive for all-day events (an event Mon–Wed is
		// stored as DTSTART=Mon, DTEND=Thu). Without this, multi-day all-day
		// events span one extra column past their actual last day.
		if (ev.allDay && eDate > sDate) {
			eDate = dayjs(eDate).subtract(1, 'day').format('YYYY-MM-DD')
		}
		for (let w = 0; w < 6; w++) {
			const [wStart, wEnd] = weekRanges[w]
			if (eDate < wStart || sDate > wEnd) continue
			const segStart = sDate > wStart ? sDate : wStart
			const segEnd = eDate < wEnd ? eDate : wEnd
			const startCol = (dayToIndex.get(segStart) ?? 0) - w * 7 + 1
			const endCol = (dayToIndex.get(segEnd) ?? 0) - w * 7 + 1
			const span = endCol - startCol + 1
			// Find a lane that's free for [startCol..endCol].
			let lane = 0
			let done = false
			while (!done) {
				let collides = false
				for (let c = startCol - 1; c <= endCol - 1; c++) {
					if (busy[w][c][lane]) {
						collides = true
						break
					}
				}
				if (!collides) {
					for (let c = startCol - 1; c <= endCol - 1; c++) busy[w][c][lane] = true
					done = true
				} else {
					lane++
				}
			}
			if (lane >= MAX_ROWS_PER_CELL - 1) {
				// Reserve one row for the "+N more" label. Count the event as hidden
				// for each column it covers.
				for (let c = startCol - 1; c <= endCol - 1; c++) {
					const day = days[w * 7 + c]
					hiddenByDay.set(day, (hiddenByDay.get(day) ?? 0) + 1)
				}
				continue
			}
			placed.push({
				event: ev,
				weekIdx: w,
				startCol,
				span,
				lane,
				continuesLeft: sDate < wStart,
				continuesRight: eDate > wEnd
			})
		}
	}
	return { placed, hiddenByDay }
}

export function MonthView(props: CalendarViewProps) {
	const {
		date,
		events,
		showWeekNumbers,
		workingDays,
		selectedId,
		onSelect,
		onCreateAt,
		onDateChange,
		className
	} = props
	const locale = props.locale || 'en'
	const firstDay = props.firstDayOfWeek ?? localeFirstDay(locale)
	const days = React.useMemo(() => monthGridDays(date, firstDay), [date, firstDay])
	// Ghost markers (the original RRULE slot of an overridden occurrence) add
	// visual noise in the month grid where there's no room to show the move
	// relationship. They stay visible on day/week views.
	const placeable = React.useMemo(() => events.filter((ev) => !ev.ghost), [events])
	const { placed, hiddenByDay } = React.useMemo(
		() => placeMonthEvents(placeable, days),
		[placeable, days]
	)
	const headerFmt = React.useMemo(
		() => new Intl.DateTimeFormat(locale, { weekday: 'short' }),
		[locale]
	)
	const anchorMonth = dayjs(date).month()
	const today = dayjs().format('YYYY-MM-DD')

	const weekdayHeaders = Array.from({ length: 7 }, (_, i) =>
		headerFmt.format(dayjs(days[i]).toDate())
	)

	return (
		<div
			className={`c-cal-view c-cal-view--month${showWeekNumbers ? ' with-weekno' : ''}${className ? ` ${className}` : ''}`}
		>
			<div className="c-cal-view__scroll">
				<div className="c-cal-view__month-head c-cal-view__sticky-head">
					{showWeekNumbers && <div className="c-cal-weekno">Wk</div>}
					{weekdayHeaders.map((label, i) => (
						<div key={i} className="c-cal-view__day-head">
							{label}
						</div>
					))}
				</div>
				<div className="c-cal-view__month-body">
					{Array.from({ length: 6 }).map((_, w) => (
						<div key={w} className="c-cal-view__month-row">
							{showWeekNumbers && (
								<div className="c-cal-weekno c-cal-weekno--col">
									{isoWeekNumber(days[w * 7])}
								</div>
							)}
							<div className="c-cal-view__month-week">
								{Array.from({ length: 7 }).map((_, d) => {
									const day = days[w * 7 + d]
									const inMonth = dayjs(day).month() === anchorMonth
									const isToday = sameDay(day, today)
									const hidden = hiddenByDay.get(day) ?? 0
									const dow = dayjs(day).day()
									const isNonWorking = !!workingDays && !workingDays.includes(dow)
									return (
										<MonthCell
											key={d}
											date={day}
											inMonth={inMonth}
											isToday={isToday}
											isNonWorking={isNonWorking}
											column={d + 1}
											locale={locale}
											onDateChange={onDateChange}
											onCreateAt={onCreateAt}
										>
											{hidden > 0 && (
												<button
													type="button"
													className="c-cal-month-more"
													onClick={() => onDateChange?.(day)}
												>
													+{hidden} more
												</button>
											)}
										</MonthCell>
									)
								})}
								{placed
									.filter((p) => p.weekIdx === w)
									.map((p) => (
										<MonthEvent
											key={`${p.event.id}-${w}`}
											event={p.event}
											startCol={p.startCol}
											span={p.span}
											lane={p.lane}
											continuesLeft={p.continuesLeft}
											continuesRight={p.continuesRight}
											selected={selectedId === p.event.id}
											locale={locale}
											onSelect={onSelect}
										/>
									))}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	)
}

// vim: ts=4
