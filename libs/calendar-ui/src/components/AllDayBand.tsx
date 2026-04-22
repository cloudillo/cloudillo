// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { CalendarEvent } from '../types.js'
import { localDatePart } from '../utils/dates.js'

export interface AllDayBandProps {
	days: string[]
	events: CalendarEvent[]
	selectedId?: string
	onSelect?: (id: string) => void
	onCreateAt?: (start: string, end: string, allDay: boolean) => void
}

/** Horizontal band above the time grid for all-day and multi-day events.
 *  Chips span the day columns they cover. Empty-cell clicks create a new
 *  all-day event for that date. */
export function AllDayBand({ days, events, selectedId, onSelect, onCreateAt }: AllDayBandProps) {
	// An all-day event occupies day columns [start..end] inclusive — see
	// CalendarEvent.end in types.ts for the library contract. `end <= start`
	// degrades to a single-day event.
	const bars = React.useMemo(() => {
		const out: { ev: CalendarEvent; startIdx: number; endIdx: number; row: number }[] = []
		const lastEndByRow: number[] = []
		const allday = events.filter((e) => e.allDay)
		const firstDay = days[0]
		const lastDay = days[days.length - 1]
		for (const ev of allday.sort((a, b) => a.start.localeCompare(b.start))) {
			const sDate = localDatePart(ev.start)
			const eDate = localDatePart(ev.end) || sDate
			// Skip events that lie entirely outside the visible range.
			if (eDate < firstDay || sDate > lastDay) continue
			// Events that start before the window or end after it are clamped to
			// the edge. `indexOf` is only used for dates we already know are in
			// the visible range — a -1 back from that would mean `days` has a
			// gap, so drop the event rather than silently mis-render it.
			const startIdx = sDate <= firstDay ? 0 : days.indexOf(sDate)
			const endIdx = eDate >= lastDay ? days.length - 1 : days.indexOf(eDate)
			if (startIdx < 0 || endIdx < 0 || endIdx < startIdx) continue
			let row = lastEndByRow.findIndex((end) => end < startIdx)
			if (row === -1) {
				row = lastEndByRow.length
				lastEndByRow.push(endIdx)
			} else {
				lastEndByRow[row] = endIdx
			}
			out.push({ ev, startIdx, endIdx, row })
		}
		return { bars: out, rows: Math.max(1, lastEndByRow.length) }
	}, [events, days])

	return (
		<div
			className="c-cal-view__allday"
			style={
				{
					'--cols': days.length,
					'--allday-rows': bars.rows
				} as React.CSSProperties
			}
		>
			<div className="c-cal-view__allday-gutter" aria-hidden="true" />
			<div className="c-cal-view__allday-grid">
				{days.map((day, dayIdx) => (
					<button
						type="button"
						key={day}
						className="c-cal-view__allday-cell"
						aria-label="Create all-day event"
						onClick={() => onCreateAt?.(day, day, true)}
						style={{ gridColumn: `${dayIdx + 1} / span 1` }}
					/>
				))}
				{bars.bars.map(({ ev, startIdx, endIdx, row }) => (
					<button
						type="button"
						key={ev.id}
						className={`c-cal-event c-cal-event--allday${selectedId === ev.id ? ' is-selected' : ''}${ev.recurring ? ' is-recurring' : ''}${ev.hasOverride ? ' has-override' : ''}`}
						style={{
							gridColumn: `${startIdx + 1} / span ${endIdx - startIdx + 1}`,
							gridRow: `${row + 1}`,
							background: ev.color || 'var(--col-primary)',
							color: ev.textColor || 'var(--col-on-primary)'
						}}
						onClick={() => onSelect?.(ev.id)}
						data-event-id={ev.id}
					>
						<span className="c-cal-event__title">{ev.title || '(untitled)'}</span>
					</button>
				))}
			</div>
		</div>
	)
}

// vim: ts=4
