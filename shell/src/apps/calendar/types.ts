// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { CalendarOutput, CalendarObjectOutput, CalendarObjectListItem } from '@cloudillo/core'

export type CalendarView = 'month' | 'week' | 'day' | 'agenda' | 'tasks'

export interface SelectedObjectRef {
	calId: number
	uid: string
	/** ISO-8601 start of the specific occurrence the user clicked — only set for
	 *  recurring events. Allows the scope dialog to show "on {date}" accurately
	 *  and route "this only" / "this and following" to the right override. */
	occurrenceStart?: string
	/** True when the clicked occurrence has an override row in the loaded list.
	 *  Lets the details pane skip the `getException` round-trip (which 404s on
	 *  every unmodified instance) and only fetch the override when one exists. */
	hasOverride?: boolean
}

/** An expanded event occurrence rendered on the grid. Master events with an RRULE
 *  are expanded client-side; non-recurring events produce a single occurrence. */
export interface EventOccurrence {
	/** Stable per-occurrence id (uid + start timestamp). */
	id: string
	calId: number
	uid: string
	etag: string
	title: string
	/** ISO-8601 start (date-time or date for all-day). */
	start: string
	/** ISO-8601 end. */
	end: string
	allDay: boolean
	location?: string
	status?: string
	color?: string
	textColor?: string
	/** Signals a recurring master (UI can show a repeat icon). */
	recurring: boolean
	/** Occurrence-specific RECURRENCE-ID (ISO) when an override row exists for this
	 *  slot. UI can render a subtle badge; scope routing uses this to find the
	 *  right override row. */
	recurrenceId?: string
	/** True when the occurrence was sourced from an override row, not from master
	 *  RRULE expansion. */
	hasOverride?: boolean
	/** True when this occurrence IS the master's anchor slot — i.e. its
	 *  RECURRENCE-ID matches the master's DTSTART. Dragging it re-anchors the
	 *  whole series, and the live preview should mirror that. */
	isSeriesAnchor?: boolean
	/** Non-interactive "ghost" rendering of an occurrence's original slot — shown
	 *  next to the override so the user can see where it moved from. Emitted by
	 *  `useEventRange` only when the user has enabled that setting. */
	ghost?: boolean
	/** True when the RRULE could not be parsed and we're surfacing only the
	 *  master slot as a single non-expanded occurrence. UI may show a warning
	 *  badge so users know the repeat pattern is missing. */
	recurrenceParseFailed?: boolean
}

export type { CalendarOutput, CalendarObjectOutput, CalendarObjectListItem }

// vim: ts=4
