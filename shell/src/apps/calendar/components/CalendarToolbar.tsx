// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, HBox, SearchInput, Segmented, SegmentedItem, Spacer, Text } from '@cloudillo/react'
import dayjs from 'dayjs'
import type { TFunction } from 'i18next'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuChevronRight as IcNext, LuChevronLeft as IcPrev } from 'react-icons/lu'

import type { CalendarView } from '../types.js'

export interface CalendarToolbarProps {
	currentDate: string
	view: CalendarView
	searchQuery: string
	onDateChange: (date: string) => void
	onViewChange: (view: CalendarView) => void
	onSearchChange: (q: string) => void
}

export const getViews = (t: TFunction): { value: CalendarView; label: string }[] => [
	{ value: 'month', label: t('Month') },
	{ value: 'week', label: t('Week') },
	{ value: 'day', label: t('Day') },
	{ value: 'agenda', label: t('Agenda') },
	{ value: 'tasks', label: t('Tasks') }
]

/** One row. Below md only ‹ range › shows; Today and the view switch live in the ⋮ menu. */
export function CalendarToolbar({
	currentDate,
	view,
	searchQuery,
	onDateChange,
	onViewChange,
	onSearchChange
}: CalendarToolbarProps) {
	const { t, i18n } = useTranslation()
	const views = React.useMemo(() => getViews(t), [t])

	function step(delta: number) {
		const d = dayjs(currentDate).startOf('day')
		const next =
			view === 'day'
				? d.add(delta, 'day')
				: view === 'week' || view === 'agenda'
					? d.add(7 * delta, 'day')
					: d.add(delta, 'month')
		onDateChange(next.format('YYYY-MM-DD'))
	}

	function today() {
		onDateChange(dayjs().format('YYYY-MM-DD'))
	}

	const label = React.useMemo(() => {
		const d = dayjs(currentDate).startOf('day')
		if (view === 'day') {
			return new Intl.DateTimeFormat(i18n.language, {
				weekday: 'long',
				month: 'long',
				day: 'numeric',
				year: 'numeric'
			}).format(d.toDate())
		}
		if (view === 'week') {
			const start = d.subtract(d.day(), 'day')
			const end = start.add(6, 'day')
			const fmt = new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric' })
			return `${fmt.format(start.toDate())} – ${fmt.format(end.toDate())}, ${end.year()}`
		}
		return new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' }).format(
			d.toDate()
		)
	}, [currentDate, view, i18n.language])

	return (
		<HBox gap={2} padding={2} align="center" autoBg className="calendar-toolbar">
			<Button className="sm-hide" size="sm" onClick={today}>
				{t('Today')}
			</Button>
			<Button
				variant="ghost"
				size="sm"
				onClick={() => step(-1)}
				aria-label={t('Previous')}
				icon={<IcPrev />}
			/>
			<Text size="lg" weight="semibold" className="calendar-range">
				{label}
			</Text>
			<Button
				variant="ghost"
				size="sm"
				onClick={() => step(1)}
				aria-label={t('Next')}
				icon={<IcNext />}
			/>

			<Spacer />

			<Segmented
				className="sm-hide calendar-views"
				size="sm"
				aria-label={t('Calendar view')}
				value={view}
				onChange={(v) => onViewChange(v as CalendarView)}
			>
				{views.map((v) => (
					<SegmentedItem key={v.value} value={v.value}>
						{v.label}
					</SegmentedItem>
				))}
			</Segmented>

			<SearchInput
				className="sm-hide calendar-search"
				size="sm"
				placeholder={t('Search events')}
				aria-label={t('Search events')}
				defaultValue={searchQuery}
				debounce={250}
				onSearch={onSearchChange}
			/>
		</HBox>
	)
}

// vim: ts=4
