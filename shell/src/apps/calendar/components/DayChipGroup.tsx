// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Segmented, SegmentedItem } from '@cloudillo/react'
import dayjs from 'dayjs'
import * as React from 'react'

import { ICAL_DOW_CODES, type IcalDayCode } from '../utils'

interface Props {
	value: IcalDayCode[]
	onChange: (next: IcalDayCode[]) => void
	/** 0 = Sunday-first (en-US), 1 = Monday-first (most of Europe). Defaults to 1. */
	firstDayOfWeek?: 0 | 1
	locale?: string
	'aria-label'?: string
}

/** Weekday multi-toggle for the recurrence builder. Locale-aware narrow weekday labels
 *  ("M"/"п"/...) via `Intl.DateTimeFormat`. */
export function DayChipGroup({
	value,
	onChange,
	firstDayOfWeek = 1,
	locale,
	'aria-label': ariaLabel
}: Props) {
	// Ordered list of ICAL codes in locale-appropriate display order.
	const codes = React.useMemo<IcalDayCode[]>(() => {
		const reordered: IcalDayCode[] = []
		for (let i = 0; i < 7; i++) {
			reordered.push(ICAL_DOW_CODES[(firstDayOfWeek + i) % 7])
		}
		return reordered
	}, [firstDayOfWeek])

	const labels = React.useMemo(() => {
		const fmt = new Intl.DateTimeFormat(locale, { weekday: 'narrow' })
		// Anchor on a known Sunday (2024-01-07); advance by weekday index.
		const sunday = dayjs('2024-01-07')
		return codes.map((_, i) => fmt.format(sunday.add((firstDayOfWeek + i) % 7, 'day').toDate()))
	}, [codes, firstDayOfWeek, locale])

	return (
		<Segmented
			multiple
			size="sm"
			aria-label={ariaLabel ?? 'Repeat days'}
			value={value}
			onChange={(next) => {
				// Preserve a stable order so the stored RRULE is deterministic.
				onChange(ICAL_DOW_CODES.filter((c) => next.includes(c)))
			}}
		>
			{codes.map((code, idx) => (
				<SegmentedItem key={code} value={code}>
					{labels[idx]}
				</SegmentedItem>
			))}
		</Segmented>
	)
}
