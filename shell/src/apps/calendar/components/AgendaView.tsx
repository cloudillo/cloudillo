// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { CalendarOutput } from '@cloudillo/core'
import {
	ColorDot,
	Heading,
	IconText,
	List,
	ListItem,
	LoadingSpinner,
	Panel,
	Text,
	VBox
} from '@cloudillo/react'
import dayjs from 'dayjs'
import { useAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuMapPin as IcPin, LuRepeat as IcRecur } from 'react-icons/lu'

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
		return <LoadingSpinner fill className="auto-bg" />
	}

	if (groups.length === 0) {
		return (
			<Text as="p" emphasis="muted" align="center" className="auto-bg p-4">
				{t('No events in this range')}
			</Text>
		)
	}

	const fmtTime = new Intl.DateTimeFormat(i18n.language, { hour: 'numeric', minute: '2-digit' })
	const fmtDay = new Intl.DateTimeFormat(i18n.language, {
		weekday: 'long',
		month: 'short',
		day: 'numeric'
	})

	return (
		<Panel padding={2} className="flex-fill h-min-0 overflow-y-auto">
			<VBox gap={3}>
				{groups.map(([day, items]) => (
					<VBox key={day} gap={1}>
						<Heading level={2} size="xs" overline className="px-2">
							{fmtDay.format(dayjs(day).toDate())}
						</Heading>
						<List>
							{items.map((occ) => (
								<ListItem
									key={occ.id}
									selected={selected?.uid === occ.uid}
									leading={<ColorDot color={occ.color || 'var(--col-primary)'} />}
									title={
										<>
											{occ.title}
											{occ.recurring && (
												<IcRecur
													className="ms-1"
													aria-label={t('Recurring')}
												/>
											)}
										</>
									}
									subtitle={
										<>
											{occ.allDay
												? t('All day')
												: `${fmtTime.format(dayjs(occ.start).toDate())} – ${fmtTime.format(dayjs(occ.end).toDate())}`}
											{occ.location && (
												<IconText className="ms-2" icon={<IcPin />}>
													{occ.location}
												</IconText>
											)}
										</>
									}
									onClick={() =>
										setSelected({
											calId: occ.calId,
											uid: occ.uid,
											occurrenceStart: occ.recurring
												? (occ.recurrenceId ?? occ.start)
												: undefined
										})
									}
								/>
							))}
						</List>
					</VBox>
				))}
			</VBox>
		</Panel>
	)
}

// vim: ts=4
