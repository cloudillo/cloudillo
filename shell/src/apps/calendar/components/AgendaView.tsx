// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import dayjs from 'dayjs'
import * as React from 'react'
import { useAtom } from 'jotai'
import { useTranslation } from 'react-i18next'
import { LuMapPin as IcPin, LuRepeat as IcRecur } from 'react-icons/lu'

import { LoadingSpinner, mergeClasses } from '@cloudillo/react'
import type { CalendarOutput } from '@cloudillo/core'

import { selectedObjectAtom } from '../atoms.js'
import type { EventOccurrence } from '../types.js'

export interface AgendaViewProps {
	occurrences: EventOccurrence[]
	calendars: CalendarOutput[]
	isLoading: boolean
}

export function AgendaView({ occurrences, isLoading }: AgendaViewProps) {
	const [selected, setSelected] = useAtom(selectedObjectAtom)
	const { t, i18n } = useTranslation()

	// Group occurrences by day (ISO yyyy-mm-dd)
	const groups = React.useMemo(() => {
		const map = new Map<string, EventOccurrence[]>()
		for (const occ of occurrences) {
			const day = occ.start.slice(0, 10)
			const list = map.get(day)
			if (list) list.push(occ)
			else map.set(day, [occ])
		}
		return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
	}, [occurrences])

	if (isLoading && occurrences.length === 0) {
		return (
			<div className="c-cal-agenda d-flex align-items-center justify-content-center p-4">
				<LoadingSpinner />
			</div>
		)
	}

	if (groups.length === 0) {
		return (
			<div className="c-cal-agenda p-4 text-center c-hint">
				{t('No events in this range')}
			</div>
		)
	}

	const fmtTime = new Intl.DateTimeFormat(i18n.language, { hour: 'numeric', minute: '2-digit' })
	const fmtDay = new Intl.DateTimeFormat(i18n.language, {
		weekday: 'long',
		month: 'short',
		day: 'numeric'
	})

	return (
		<div className="c-cal-agenda p-2 flex-fill" style={{ overflowY: 'auto', minHeight: 0 }}>
			{groups.map(([day, items]) => (
				<div key={day} className="mb-3">
					<div className="c-cal-detail-label px-2 pb-1">
						{fmtDay.format(dayjs(day).toDate())}
					</div>
					<div className="c-vbox g-1">
						{items.map((occ) => {
							const isActive = selected?.uid === occ.uid
							return (
								<button
									key={occ.id}
									type="button"
									className={mergeClasses('c-cal-task-row', isActive && 'active')}
									onClick={() =>
										setSelected({
											calId: occ.calId,
											uid: occ.uid,
											occurrenceStart: occ.recurring
												? (occ.recurrenceId ?? occ.start)
												: undefined
										})
									}
								>
									<span
										className="c-cal-item__swatch"
										style={{ background: occ.color, marginTop: '0.25rem' }}
										aria-hidden="true"
									/>
									<div className="flex-fill">
										<div className="c-cal-task-row__title">
											{occ.title}
											{occ.recurring && (
												<IcRecur
													className="ms-1"
													title={t('Recurring')}
													style={{ opacity: 0.6 }}
												/>
											)}
										</div>
										<div className="c-cal-task-row__meta">
											<span>
												{occ.allDay
													? t('All day')
													: `${fmtTime.format(dayjs(occ.start).toDate())} – ${fmtTime.format(dayjs(occ.end).toDate())}`}
											</span>
											{occ.location && (
												<span>
													<IcPin /> {occ.location}
												</span>
											)}
										</div>
									</div>
								</button>
							)
						})}
					</div>
				</div>
			))}
		</div>
	)
}

// vim: ts=4
