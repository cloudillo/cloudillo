// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { LuX as IcClose } from 'react-icons/lu'

import { Button } from '@cloudillo/react'

export interface SchedulePickerProps {
	value: Date | undefined
	onChange: (date: Date | undefined) => void
}

function toLocalDateString(d: Date): string {
	const y = d.getFullYear()
	const m = String(d.getMonth() + 1).padStart(2, '0')
	const day = String(d.getDate()).padStart(2, '0')
	return `${y}-${m}-${day}`
}

function toLocalTimeString(d: Date): string {
	const h = String(d.getHours()).padStart(2, '0')
	const m = String(d.getMinutes()).padStart(2, '0')
	return `${h}:${m}`
}

function formatRelativeTime(
	date: Date,
	t: (key: string, opts?: Record<string, unknown>) => string
): string {
	const now = new Date()
	const diffMs = date.getTime() - now.getTime()
	if (diffMs <= 0) return t('in the past')

	const diffMin = Math.floor(diffMs / 60000)
	if (diffMin < 60) return t('in {{count}} minutes', { count: diffMin })

	const diffHours = Math.floor(diffMin / 60)
	if (diffHours < 24) return t('in {{count}} hours', { count: diffHours })

	const diffDays = Math.floor(diffHours / 24)
	return t('in {{count}} days', { count: diffDays })
}

export function SchedulePicker({ value, onChange }: SchedulePickerProps) {
	const { t } = useTranslation()
	const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

	// Minimum date: today
	const minDate = toLocalDateString(new Date())

	function parseLocalDateTime(dateStr: string, timeStr: string): Date {
		const [y, m, d] = dateStr.split('-').map(Number)
		const [h, min] = timeStr.split(':').map(Number)
		return new Date(y, m - 1, d, h, min)
	}

	function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
		const dateStr = e.target.value
		if (!dateStr) {
			onChange(undefined)
			return
		}
		const timeStr = value ? toLocalTimeString(value) : '12:00'
		onChange(parseLocalDateTime(dateStr, timeStr))
	}

	function handleTimeChange(e: React.ChangeEvent<HTMLInputElement>) {
		const timeStr = e.target.value
		if (!timeStr) return
		const dateStr = value ? toLocalDateString(value) : minDate
		onChange(parseLocalDateTime(dateStr, timeStr))
	}

	function handleClear() {
		onChange(undefined)
	}

	return (
		<div className="c-hbox g-2 align-items-center flex-wrap">
			<input
				type="date"
				className="c-input"
				min={minDate}
				value={value ? toLocalDateString(value) : ''}
				onChange={handleDateChange}
				aria-label={t('Schedule date')}
				style={{ width: 'auto' }}
			/>
			<input
				type="time"
				className="c-input"
				value={value ? toLocalTimeString(value) : ''}
				onChange={handleTimeChange}
				aria-label={t('Schedule time')}
				style={{ width: 'auto' }}
			/>
			{value && (
				<>
					<span
						className="text-sm"
						style={{ color: 'var(--col-on-container)', opacity: 0.7 }}
					>
						{formatRelativeTime(value, t)} ({timezone})
					</span>
					<Button link onClick={handleClear} aria-label={t('Clear schedule')}>
						<IcClose />
					</Button>
				</>
			)}
		</div>
	)
}

// vim: ts=4
