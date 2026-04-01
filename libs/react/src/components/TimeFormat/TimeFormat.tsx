// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useLibTranslation } from '../../i18n.js'
import dayjs from 'dayjs'

import { LuClock as IcClock } from 'react-icons/lu'

export interface TimeFormatProps {
	time: number | string | Date
}

export function TimeFormat({ time }: TimeFormatProps) {
	const { t } = useLibTranslation()

	function timeFormat(time: number | string | Date) {
		try {
			const d = new Date(time)
			const now = new Date()
			if (now.getFullYear() !== d.getFullYear()) {
				return dayjs(d).format('YYYY/MM/DD')
			}
			const deltaSec = (now.getTime() - d.getTime()) / 1000
			const absDelta = Math.abs(deltaSec)
			const isPast = deltaSec > 0
			if (now.getMonth() !== d.getMonth() || now.getDate() !== d.getDate()) {
				const todaySec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
				const dayBoundarySec = isPast ? todaySec : 86400 - todaySec
				if (absDelta > dayBoundarySec + 6 * 24 * 3600) {
					return dayjs(d).format('MM/DD')
				} else if (absDelta > dayBoundarySec + 1 * 24 * 3600) {
					switch (d.getDay()) {
						case 0:
							return t('sunday')
						case 1:
							return t('monday')
						case 2:
							return t('tuesday')
						case 3:
							return t('wednesday')
						case 4:
							return t('thursday')
						case 5:
							return t('friday')
						case 6:
							return t('saturday')
					}
				} else {
					return isPast ? t('yesterday') : t('tomorrow')
				}
			}
			if (absDelta > 2 * 3600) {
				return t('{{count}} hours', { count: Math.trunc(absDelta / 3600) })
			}
			if (absDelta > 3600) {
				return t('1 hour')
			}
			if (absDelta > 2 * 60) {
				return t('{{count}} minutes', { count: Math.trunc(absDelta / 60) })
			}
			if (absDelta > 60) {
				return t('1 min')
			}
			return t('just now')
		} catch (_err) {
			return ''
		}
	}

	return (
		<span className="c-hbox align-items-center">
			<IcClock /> {timeFormat(time)}
		</span>
	)
}

// vim: ts=4
