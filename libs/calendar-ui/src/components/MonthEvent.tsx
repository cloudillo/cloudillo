// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { CalendarEvent } from '../types.js'
import { formatTimeRange } from '../utils/dates.js'

export interface MonthEventProps {
	event: CalendarEvent
	/** Column span within the week row (1-based start, 1-based span). */
	startCol: number
	span: number
	/** Vertical row inside the cell (0-based lane). */
	lane: number
	/** Continues beyond the left edge of the week row. */
	continuesLeft?: boolean
	continuesRight?: boolean
	selected?: boolean
	locale: string
	onSelect?: (id: string) => void
}

export function MonthEvent({
	event,
	startCol,
	span,
	lane,
	continuesLeft,
	continuesRight,
	selected,
	locale,
	onSelect
}: MonthEventProps) {
	const cls = [
		'c-cal-month-event',
		event.allDay ? 'is-allday' : '',
		event.recurring ? 'is-recurring' : '',
		event.hasOverride ? 'has-override' : '',
		event.ghost ? 'is-ghost' : '',
		selected ? 'is-selected' : '',
		continuesLeft ? 'continues-left' : '',
		continuesRight ? 'continues-right' : ''
	]
		.filter(Boolean)
		.join(' ')
	// Ghost markers get their muted palette from the stylesheet — skip the
	// inline background/color so the .is-ghost rules can win without !important.
	const style: React.CSSProperties = event.ghost
		? {
				gridColumn: `${startCol} / span ${span}`,
				gridRow: `${lane + 2}` // row 1 is the date number; events start at 2
			}
		: {
				gridColumn: `${startCol} / span ${span}`,
				gridRow: `${lane + 2}`,
				background: event.color || 'var(--col-primary)',
				color: event.textColor || 'var(--col-on-primary)'
			}
	const timeLabel = event.allDay ? '' : formatTimeRange(event.start, event.end, locale)
	return (
		<button
			type="button"
			className={cls}
			style={style}
			onClick={event.ghost ? undefined : () => onSelect?.(event.id)}
			aria-disabled={event.ghost || undefined}
			tabIndex={event.ghost ? -1 : undefined}
			data-event-id={event.id}
		>
			{timeLabel && <span className="c-cal-month-event__time">{timeLabel}</span>}
			<span className="c-cal-month-event__title">{event.title || '(untitled)'}</span>
		</button>
	)
}

// vim: ts=4
