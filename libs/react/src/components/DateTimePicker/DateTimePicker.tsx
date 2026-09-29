// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { TimePicker } from '../TimePicker/TimePicker.js'
import { mergeClasses } from '../utils.js'

export interface DateTimePickerProps {
	/** `datetime`: local `YYYY-MM-DDTHH:MM`; `month`: `YYYY-MM`. Empty when unset. */
	value: string
	onChange: (value: string) => void
	/** `month` renders a month/year input only (no time half). Default `datetime`. */
	mode?: 'datetime' | 'month'
	/** Time applied when a date is picked while the time half is empty.
	 *  Defaults to `09:00`. */
	defaultTime?: string
	/** Lower bound for the date input (`YYYY-MM-DD`, or `YYYY-MM` in month mode). */
	min?: string
	/** Upper bound for the date input (`YYYY-MM-DD`, or `YYYY-MM` in month mode). */
	max?: string
	/** Minutes step for the TimePicker. Default 15. */
	step?: number
	/** Accessible labels for the two halves. */
	dateLabel?: string
	timeLabel?: string
	className?: string
	disabled?: boolean
}

function splitValue(v: string): { date: string; time: string } {
	if (!v) return { date: '', time: '' }
	const [d = '', t = ''] = v.split('T')
	return { date: d, time: t }
}

/**
 * Combined date + time input. Pairs the browser's native `<input type="date">`
 * (which renders a real popover calendar on desktop) with the library's
 * `TimePicker`, and emits a single `YYYY-MM-DDTHH:MM` string. `mode="month"`
 * swaps in a native `<input type="month">` and emits `YYYY-MM`.
 */
export function DateTimePicker({
	value,
	onChange,
	mode = 'datetime',
	defaultTime = '09:00',
	min,
	max,
	step,
	dateLabel = 'Date',
	timeLabel = 'Time',
	className,
	disabled
}: DateTimePickerProps) {
	const { date, time } = splitValue(value)

	function emit(nextDate: string, nextTime: string) {
		if (!nextDate) {
			onChange('')
			return
		}
		const t = nextTime || defaultTime
		onChange(`${nextDate}T${t}`)
	}

	if (mode === 'month') {
		return (
			<input
				className={mergeClasses('c-input c-datetime-picker', className)}
				type="month"
				value={value}
				min={min}
				max={max}
				disabled={disabled}
				aria-label={dateLabel}
				onChange={(e) => onChange(e.target.value)}
			/>
		)
	}

	return (
		<div className={mergeClasses('c-hbox wrap g-2 ai-start c-datetime-picker', className)}>
			<input
				className="c-input"
				type="date"
				value={date}
				min={min}
				max={max}
				disabled={disabled}
				aria-label={dateLabel}
				onChange={(e) => emit(e.target.value, time)}
				style={{ minWidth: '9.5rem', flex: '1 1 auto' }}
			/>
			<div style={{ flex: '0 0 7.5rem' }}>
				<TimePicker
					value={time}
					onChange={(t) => emit(date, t)}
					step={step}
					label={timeLabel}
					disabled={disabled}
				/>
			</div>
		</div>
	)
}

// vim: ts=4
