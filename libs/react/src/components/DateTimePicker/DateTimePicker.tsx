// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { TimePicker } from '../TimePicker/TimePicker.js'
import { mergeClasses } from '../utils.js'

export interface DateTimePickerProps {
	/** Combined local datetime as `YYYY-MM-DDTHH:MM`, or empty when unset. */
	value: string
	onChange: (value: string) => void
	/** Time applied when a date is picked while the time half is empty.
	 *  Defaults to `09:00`. */
	defaultTime?: string
	/** `YYYY-MM-DD` lower bound for the date input. */
	min?: string
	/** `YYYY-MM-DD` upper bound for the date input. */
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
 * `TimePicker`, and emits a single `YYYY-MM-DDTHH:MM` string.
 */
export function DateTimePicker({
	value,
	onChange,
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

	return (
		<div className={mergeClasses('c-hbox g-2 ai-start c-datetime-picker', className)}>
			<input
				className="c-input flex-fill"
				type="date"
				value={date}
				min={min}
				max={max}
				disabled={disabled}
				aria-label={dateLabel}
				onChange={(e) => emit(e.target.value, time)}
				style={{ minWidth: 0 }}
			/>
			<div style={{ minWidth: '9rem', flex: '0 0 auto' }}>
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
