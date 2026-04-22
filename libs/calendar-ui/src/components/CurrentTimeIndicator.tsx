// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { dayjs } from '../utils/dates.js'

export interface CurrentTimeIndicatorProps {
	/** The range of minutes rendered in the day column (e.g. 0 / 1440). */
	dayStartMinutes: number
	dayEndMinutes: number
}

/** Red horizontal rule at the current time, refreshed once a minute. */
export function CurrentTimeIndicator({
	dayStartMinutes,
	dayEndMinutes
}: CurrentTimeIndicatorProps) {
	const [now, setNow] = React.useState(() => dayjs())
	React.useEffect(() => {
		const id = setInterval(() => setNow(dayjs()), 60_000)
		return () => clearInterval(id)
	}, [])

	const nowMin = now.hour() * 60 + now.minute()
	if (nowMin < dayStartMinutes || nowMin >= dayEndMinutes) return null
	const top = ((nowMin - dayStartMinutes) / (dayEndMinutes - dayStartMinutes)) * 100
	return <div className="c-cal-now-indicator" style={{ top: `${top}%` }} aria-hidden="true" />
}

// vim: ts=4
