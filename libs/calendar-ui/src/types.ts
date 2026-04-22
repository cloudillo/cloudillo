// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** A single rendered occurrence. Consumers who expand RRULE masters do so
 *  upstream — the library takes a flat list. */
export interface CalendarEvent {
	id: string
	/** Grouping key; typically a stable identifier of the owning calendar. */
	calendarId?: string
	title: string
	/** ISO-8601. Timed events use full datetime; all-day events use YYYY-MM-DD. */
	start: string
	/** ISO-8601. **Inclusive** for all-day events — a three-day event spanning
	 *  Feb 1-3 uses `start='2025-02-01'`, `end='2025-02-03'`. This differs from
	 *  iCalendar DTEND, which is exclusive; consumers bridging from iCal must
	 *  subtract one day on read and add one on write. Timed events use the
	 *  natural ISO datetime. */
	end: string
	allDay: boolean
	/** CSS colour for the chip fill. Defaults to --col-primary when unset. */
	color?: string
	/** CSS colour for the chip text. The consumer computes this from `color`. */
	textColor?: string
	/** Marks an occurrence expanded from an RRULE master. Drag is now allowed
	 *  on timed recurring events — the scope (this-only vs. this-and-following
	 *  vs. series) is picked by the keyboard modifier at pointerup. */
	recurring?: boolean
	/** True when this recurring occurrence has a per-instance override applied.
	 *  Surfaces the "modified" indicator on the chip and unlocks the "Reset"
	 *  action in consumer UIs. */
	hasOverride?: boolean
	/** Stable identifier shared by all occurrences of a recurring series (the
	 *  iCalendar UID on the Cloudillo side). Used during drag to find sibling
	 *  chips that should shift together under "following" / "series" scope. */
	seriesId?: string
	/** True when this occurrence represents the master's anchor slot (the first
	 *  expansion, whose RECURRENCE-ID equals the master's DTSTART). Dragging it
	 *  re-anchors the whole series, so the drag preview mirrors that. */
	isSeriesAnchor?: boolean
	/** Non-interactive ghost marker. Rendered translucent with a dashed outline
	 *  and ignores drag/select interactions. Used to show the original position
	 *  of an overridden recurring occurrence when that setting is on. */
	ghost?: boolean
	location?: string
}

/** Scope for a drag/resize commit. Consumers interpret this against their
 *  series model — the library itself treats all drags the same. */
export type EventPatchScope = 'occurrence' | 'following' | 'series'

export interface EventPatch {
	id: string
	start: string
	end: string
	allDay: boolean
	/** Intent hint from the pointer release (modifier keys). Absent on
	 *  non-recurring drags; consumers route on this for recurring ones. */
	scope?: EventPatchScope
}

export interface CalendarViewProps {
	/** Anchor date (YYYY-MM-DD). Day view shows this day; week shows the week
	 *  containing it; month shows its month. */
	date: string
	events: CalendarEvent[]
	/** 0 = Sunday, 1 = Monday. Defaults to dayjs locale data. */
	firstDayOfWeek?: 0 | 1
	locale?: string
	/** Week numbers: column in month view, label in week view. */
	showWeekNumbers?: boolean
	/** Snap minutes for drag/resize. Default 15. */
	snapMinutes?: number
	/** Visible time range in day/week. Default 0 to 24. */
	dayStartHour?: number
	dayEndHour?: number
	/** Working-hour range used for visual de-emphasis of off-hours in day/week
	 *  views. `{ start: 9, end: 17 }` tints the bands before 9 and after 17.
	 *  Undefined = no tinting. */
	workingHours?: { start: number; end: number }
	/** Day-of-week numbers (0 = Sunday … 6 = Saturday) considered working.
	 *  Non-working days get a dimmed background in every view. Undefined =
	 *  no tinting. */
	workingDays?: readonly number[]
	selectedId?: string
	onSelect?: (id: string) => void
	onCreateAt?: (start: string, end: string, allDay: boolean) => void
	onEventUpdate?: (patch: EventPatch) => void | Promise<void>
	onDateChange?: (date: string) => void
	className?: string
}

// vim: ts=4
