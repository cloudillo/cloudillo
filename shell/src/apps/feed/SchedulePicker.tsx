// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, DateTimePicker, HBox, Text } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuX as IcClose } from 'react-icons/lu'

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

// Short zone name at the given date (e.g. "CET", "GMT+2"), so DST is reflected
function shortTimeZone(d: Date): string | undefined {
	return new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
		.formatToParts(d)
		.find((p) => p.type === 'timeZoneName')?.value
}

export function SchedulePicker({ value, onChange }: SchedulePickerProps) {
	const { t } = useTranslation()

	// Minimum date: today
	const minDate = toLocalDateString(new Date())

	function handleChange(str: string) {
		const [dateStr, timeStr] = str.split('T')
		if (!dateStr) {
			onChange(undefined)
			return
		}
		const [y, m, d] = dateStr.split('-').map(Number)
		const [h, min] = (timeStr || '12:00').split(':').map(Number)
		onChange(new Date(y, m - 1, d, h, min))
	}

	return (
		<HBox gap={2} align="center" wrap>
			<Text size="sm" emphasis="muted">
				{t('Publish on')}
			</Text>
			<DateTimePicker
				className="f-none"
				value={value ? `${toLocalDateString(value)}T${toLocalTimeString(value)}` : ''}
				onChange={handleChange}
				min={minDate}
				defaultTime="12:00"
				dateLabel={t('Schedule date')}
				timeLabel={t('Schedule time')}
			/>
			{value && (
				<>
					<Text
						size="sm"
						{...(value.getTime() <= Date.now()
							? { color: 'warning' }
							: { emphasis: 'muted' })}
					>
						{formatRelativeTime(value, t)} · {shortTimeZone(value)}
					</Text>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => onChange(undefined)}
						aria-label={t('Clear schedule')}
					>
						<IcClose />
					</Button>
				</>
			)}
		</HBox>
	)
}

// vim: ts=4
