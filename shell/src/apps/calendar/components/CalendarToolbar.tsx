// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import dayjs from 'dayjs'
import type { TFunction } from 'i18next'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuChevronLeft as IcPrev,
	LuChevronRight as IcNext,
	LuSearch as IcSearch
} from 'react-icons/lu'

import { Button, useDebouncedValue } from '@cloudillo/react'

import type { CalendarView } from '../types.js'

export interface CalendarToolbarProps {
	currentDate: string
	view: CalendarView
	searchQuery: string
	onDateChange: (date: string) => void
	onViewChange: (view: CalendarView) => void
	onSearchChange: (q: string) => void
	/** Rendered at the leading edge of row 1 (typically the mobile filter toggle). */
	lead?: React.ReactNode
	/** Rendered at the trailing edge of row 1 (typically the primary "New…" action and overflow menu). */
	trail?: React.ReactNode
}

const getGridViews = (t: TFunction): { value: CalendarView; label: string }[] => [
	{ value: 'month', label: t('Month') },
	{ value: 'week', label: t('Week') },
	{ value: 'day', label: t('Day') }
]

const getListViews = (t: TFunction): { value: CalendarView; label: string }[] => [
	{ value: 'agenda', label: t('Agenda') },
	{ value: 'tasks', label: t('Tasks') }
]

export function CalendarToolbar({
	currentDate,
	view,
	searchQuery,
	onDateChange,
	onViewChange,
	onSearchChange,
	lead,
	trail
}: CalendarToolbarProps) {
	const { t, i18n } = useTranslation()
	const [input, setInput] = React.useState(searchQuery)
	const debounced = useDebouncedValue(input, 250)
	const gridViews = React.useMemo(() => getGridViews(t), [t])
	const listViews = React.useMemo(() => getListViews(t), [t])

	React.useEffect(
		function commitSearch() {
			onSearchChange(debounced)
		},
		[debounced, onSearchChange]
	)

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
		<div className="c-cal-toolbar">
			<div className="c-cal-toolbar__row">
				{lead}
				<div className="d-flex align-items-center g-1">
					<Button size="small" onClick={today}>
						{t('Today')}
					</Button>
					<Button
						mode="icon"
						size="small"
						onClick={() => step(-1)}
						aria-label={t('Previous')}
						icon={<IcPrev />}
					/>
					<Button
						mode="icon"
						size="small"
						onClick={() => step(1)}
						aria-label={t('Next')}
						icon={<IcNext />}
					/>
				</div>

				<strong className="c-cal-toolbar__label">{label}</strong>

				<div className="flex-fill" />

				{trail}
			</div>

			<div className="c-cal-toolbar__row">
				<div role="tablist" aria-label={t('Calendar view')} className="c-cal-view-switcher">
					<div className="c-cal-view-group">
						{gridViews.map((v) => (
							<button
								key={v.value}
								type="button"
								role="tab"
								aria-selected={view === v.value}
								className="c-cal-view-tab"
								onClick={() => onViewChange(v.value)}
							>
								{v.label}
							</button>
						))}
					</div>
					<div className="c-cal-view-group">
						{listViews.map((v) => (
							<button
								key={v.value}
								type="button"
								role="tab"
								aria-selected={view === v.value}
								className="c-cal-view-tab"
								onClick={() => onViewChange(v.value)}
							>
								{v.label}
							</button>
						))}
					</div>
				</div>

				<div className="flex-fill" />

				<div className="c-input-group c-cal-toolbar__search">
					<span className="d-flex align-items-center px-2" aria-hidden="true">
						<IcSearch />
					</span>
					<input
						className="c-input"
						type="search"
						placeholder={t('Search events')}
						value={input}
						onChange={(e) => setInput(e.target.value)}
						aria-label={t('Search events')}
					/>
				</div>
			</div>
		</div>
	)
}

// vim: ts=4
