// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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

/** Weekday toggle chips for the recurrence builder. Implements the WAI-ARIA roving-tabindex
 *  pattern so screen readers announce pressed state and the group is reachable as a single
 *  tab stop. Locale-aware short weekday labels ("Mon"/"M"/"пн"/...) via `Intl.DateTimeFormat`. */
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

	// Roving tabindex: exactly one chip at a time is in the tab order.
	const [focusIdx, setFocusIdx] = React.useState(() => {
		const first = codes.findIndex((c) => value.includes(c))
		return first >= 0 ? first : 0
	})
	const refs = React.useRef<(HTMLButtonElement | null)[]>([])

	const toggle = (code: IcalDayCode) => {
		const next = value.includes(code) ? value.filter((c) => c !== code) : [...value, code]
		// Preserve a stable order so the stored RRULE is deterministic.
		const sorted = ICAL_DOW_CODES.filter((c) => next.includes(c))
		onChange(sorted)
	}

	const handleKey = (idx: number) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
		switch (e.key) {
			case 'ArrowLeft': {
				e.preventDefault()
				const next = (idx - 1 + codes.length) % codes.length
				setFocusIdx(next)
				refs.current[next]?.focus()
				break
			}
			case 'ArrowRight': {
				e.preventDefault()
				const next = (idx + 1) % codes.length
				setFocusIdx(next)
				refs.current[next]?.focus()
				break
			}
			case 'Home': {
				e.preventDefault()
				setFocusIdx(0)
				refs.current[0]?.focus()
				break
			}
			case 'End': {
				e.preventDefault()
				setFocusIdx(codes.length - 1)
				refs.current[codes.length - 1]?.focus()
				break
			}
			case ' ':
			case 'Enter': {
				e.preventDefault()
				toggle(codes[idx])
				break
			}
			default:
				break
		}
	}

	return (
		<div className="c-cal-daychips" role="group" aria-label={ariaLabel ?? 'Repeat days'}>
			{codes.map((code, idx) => {
				const pressed = value.includes(code)
				return (
					<button
						key={code}
						ref={(el) => {
							refs.current[idx] = el
						}}
						type="button"
						className="c-cal-daychips__chip"
						aria-pressed={pressed}
						tabIndex={idx === focusIdx ? 0 : -1}
						onClick={() => {
							setFocusIdx(idx)
							toggle(code)
						}}
						onFocus={() => setFocusIdx(idx)}
						onKeyDown={handleKey(idx)}
					>
						{labels[idx]}
					</button>
				)
			})}
		</div>
	)
}
