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
			if (now.getMonth() !== d.getMonth() || now.getDate() !== d.getDate()) {
				const todaySec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
				if (deltaSec > todaySec + 6 * 24 * 3600) {
					return dayjs(d).format('MM/DD')
				} else if (deltaSec > todaySec + 1 * 24 * 3600) {
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
					return 'yesterday'
				}
			}
			if (deltaSec > 2 * 3600) {
				return t('{{count}} hours', { count: Math.trunc(deltaSec / 3600) })
			}
			if (deltaSec > 3600) {
				return t('1 hour')
			}
			if (deltaSec > 2 * 60) {
				return t('{{count}} minutes', { count: Math.trunc(deltaSec / 60) })
			}
			if (deltaSec > 60) {
				return t('1 min')
			}
			return t('just now')
		} catch (err) {
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
