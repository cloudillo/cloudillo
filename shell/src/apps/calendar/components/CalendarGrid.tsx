// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useAtom } from 'jotai'
import { useTranslation } from 'react-i18next'

import {
	type CalendarEvent,
	DayView,
	type EventPatch,
	MonthView,
	WeekView
} from '@cloudillo/calendar-ui'
import '@cloudillo/calendar-ui/calendar-ui.css'

import type { CalendarOutput } from '@cloudillo/core'
import { selectedObjectAtom } from '../atoms.js'
import type { CalendarView, EventOccurrence } from '../types.js'
import { normalizeHexColor, pickContrastText } from '../utils.js'

export interface CalendarGridProps {
	view: CalendarView
	currentDate: string
	occurrences: EventOccurrence[]
	calendars: CalendarOutput[]
	/** 0 = Sunday, 1 = Monday. Undefined lets the library fall back to the
	 *  locale default (via `localeFirstDay`). */
	firstDayOfWeek?: 0 | 1
	/** Working-hour range shown as the "focus zone" on day/week views. */
	workingHours?: { start: number; end: number }
	/** Working days (0 = Sunday … 6 = Saturday). Non-working days get a
	 *  subtle tint across all views. */
	workingDays?: readonly number[]
	onDateChange: (date: string) => void
	onCreateAt: (start: string, end: string, allDay: boolean) => void
	onEventUpdate?: (
		occ: EventOccurrence,
		patch: {
			start: string
			end: string
			allDay: boolean
			scope?: 'occurrence' | 'following' | 'series'
		}
	) => void | Promise<void>
	/** View to drill down into when a month-view day number is clicked. */
	onViewChange?: (view: CalendarView) => void
}

/** Thin adapter over @cloudillo/calendar-ui that maps our EventOccurrence
 *  shape to the library's CalendarEvent shape and routes callbacks back in
 *  the domain language (SelectedObjectRef, EventOccurrence). */
export function CalendarGrid({
	view,
	currentDate,
	occurrences,
	calendars,
	firstDayOfWeek,
	workingHours,
	workingDays,
	onDateChange,
	onCreateAt,
	onEventUpdate,
	onViewChange
}: CalendarGridProps) {
	const [selectedRef, setSelectedRef] = useAtom(selectedObjectAtom)
	const { i18n } = useTranslation()

	const calColors = React.useMemo(() => {
		const map = new Map<number, { color: string; textColor: string }>()
		for (const c of calendars) {
			const color = normalizeHexColor(c.color) || 'var(--col-primary)'
			map.set(c.calId, { color, textColor: pickContrastText(c.color) })
		}
		return map
	}, [calendars])

	const events = React.useMemo<CalendarEvent[]>(() => {
		return occurrences.map((occ) => {
			const col = calColors.get(occ.calId)
			return {
				id: occ.id,
				calendarId: `cal-${occ.calId}`,
				title: occ.title,
				start: occ.start,
				end: occ.end,
				allDay: occ.allDay,
				location: occ.location,
				recurring: occ.recurring,
				hasOverride: occ.hasOverride,
				// seriesId lets the library group sibling chips during drag so
				// "following" / "series" / first-slot shifts preview live.
				seriesId: occ.recurring ? occ.uid : undefined,
				isSeriesAnchor: occ.isSeriesAnchor,
				ghost: occ.ghost,
				color: col?.color,
				textColor: col?.textColor
			}
		})
	}, [occurrences, calColors])

	const selectedId = selectedRef && occurrences.find((o) => o.uid === selectedRef.uid)?.id

	const handleSelect = React.useCallback(
		(id: string) => {
			const occ = occurrences.find((o) => o.id === id)
			if (occ)
				setSelectedRef({
					calId: occ.calId,
					uid: occ.uid,
					// Use the RECURRENCE-ID when the occurrence has been modified —
					// it's the key the server stores the override under. `occ.start`
					// reflects the override's new time, which doesn't match any
					// RECURRENCE-ID row.
					occurrenceStart: occ.recurring ? (occ.recurrenceId ?? occ.start) : undefined,
					hasOverride: occ.hasOverride
				})
		},
		[occurrences, setSelectedRef]
	)

	const handleEventUpdate = React.useCallback(
		async (patch: EventPatch) => {
			if (!onEventUpdate) return
			const occ = occurrences.find((o) => o.id === patch.id)
			if (!occ) return
			await onEventUpdate(occ, {
				start: patch.start,
				end: patch.end,
				allDay: patch.allDay,
				scope: patch.scope
			})
		},
		[occurrences, onEventUpdate]
	)

	// Month-view day click: switch to day view for that date.
	const handleDateChange = React.useCallback(
		(date: string) => {
			onDateChange(date)
			if (view === 'month') onViewChange?.('day')
		},
		[onDateChange, onViewChange, view]
	)

	const commonProps = {
		date: currentDate,
		events,
		locale: i18n.language,
		firstDayOfWeek,
		workingHours,
		workingDays,
		selectedId: selectedId || undefined,
		onSelect: handleSelect,
		onCreateAt,
		onEventUpdate: handleEventUpdate,
		onDateChange: handleDateChange,
		showWeekNumbers: true
	}

	return (
		<div className="c-cal-grid">
			{view === 'day' && <DayView {...commonProps} />}
			{view === 'week' && <WeekView {...commonProps} />}
			{view === 'month' && <MonthView {...commonProps} />}
		</div>
	)
}

// vim: ts=4
