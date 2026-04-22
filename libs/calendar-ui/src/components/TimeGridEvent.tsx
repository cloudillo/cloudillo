// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { CalendarEvent } from '../types.js'
import { dayjs, formatDuration, formatTimeRange } from '../utils/dates.js'

export interface TimeGridEventProps {
	event: CalendarEvent
	/** Vertical position in the day column, as a percentage of column height. */
	top: number
	height: number
	lane: number
	totalLanes: number
	selected?: boolean
	dragging?: boolean
	locale: string
	onSelect?: (id: string) => void
	/** Shared drag handler from TimeGrid's usePointerDrag; wired on both the
	 *  chip body (move) and the resize handle. */
	onPointerDown?: (e: React.PointerEvent) => void
	onResizePointerDown?: (e: React.PointerEvent) => void
}

function TimeGridEventInner({
	event,
	top,
	height,
	lane,
	totalLanes,
	selected,
	dragging,
	locale,
	onSelect,
	onPointerDown,
	onResizePointerDown
}: TimeGridEventProps) {
	const widthPct = 100 / totalLanes
	const leftPct = lane * widthPct
	// Ghost markers get their muted palette from the stylesheet — skip the
	// inline background/color so the .is-ghost rules can win without !important.
	const style: React.CSSProperties = event.ghost
		? {
				top: `${top}%`,
				height: `${height}%`,
				left: `calc(${leftPct}% + 1px)`,
				width: `calc(${widthPct}% - 2px)`
			}
		: {
				top: `${top}%`,
				height: `${height}%`,
				left: `calc(${leftPct}% + 1px)`,
				width: `calc(${widthPct}% - 2px)`,
				background: event.color || 'var(--col-primary)',
				color: event.textColor || 'var(--col-on-primary)'
			}
	const isTimed = !event.allDay && event.start.length > 10
	const timeLabel = isTimed ? formatTimeRange(event.start, event.end, locale) : ''
	const durationLabel = isTimed
		? formatDuration(dayjs(event.end).diff(event.start, 'minute'))
		: ''
	const classes = [
		'c-cal-event',
		event.recurring ? 'is-recurring' : '',
		event.hasOverride ? 'has-override' : '',
		event.ghost ? 'is-ghost' : '',
		selected ? 'is-selected' : '',
		dragging ? 'is-dragging' : ''
	]
		.filter(Boolean)
		.join(' ')

	// Drag is allowed on timed events (recurring included). For recurring events
	// the scope is determined by the keyboard modifier at pointerup time — the
	// grid picks "this occurrence only" by default, Shift → this and following,
	// Alt → the whole series. A tap below the drag threshold still falls through
	// to the button's onClick (usePointerDrag exits silently in that case).
	// Ghost markers are non-interactive — they're informational only.
	const draggable = !event.allDay && !event.ghost && onPointerDown

	return (
		<button
			type="button"
			className={classes}
			style={style}
			onPointerDown={draggable ? onPointerDown : undefined}
			onClick={event.ghost ? undefined : () => onSelect?.(event.id)}
			aria-pressed={selected}
			aria-disabled={event.ghost || undefined}
			tabIndex={event.ghost ? -1 : undefined}
			data-event-id={event.id}
		>
			<span className="c-cal-event__title">{event.title || '(untitled)'}</span>
			{timeLabel && <span className="c-cal-event__time">{timeLabel}</span>}
			{dragging && durationLabel && (
				<span className="c-cal-event__duration" aria-hidden="true">
					{durationLabel}
				</span>
			)}
			{draggable && onResizePointerDown && (
				<span
					className="c-cal-event__resize-handle"
					onPointerDown={(e) => {
						e.stopPropagation()
						onResizePointerDown(e)
					}}
					aria-label="Resize"
					role="presentation"
					data-event-id={event.id}
				/>
			)}
		</button>
	)
}

/** Memoised — during a drag, the parent re-renders every rAF and passes a
 *  fresh `event` object (shallow copy with new start/end). Memoising on the
 *  primitive positioning props stops the render cost from fanning out to every
 *  non-dragging chip on the day. */
export const TimeGridEvent = React.memo(TimeGridEventInner)

// vim: ts=4
