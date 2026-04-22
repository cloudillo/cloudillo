// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import dayjs, { type Dayjs } from 'dayjs'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuPencil as IcEdit,
	LuTrash as IcDelete,
	LuPlus as IcAdd,
	LuEllipsisVertical as IcMore,
	LuChevronLeft as IcPrev,
	LuChevronRight as IcNext
} from 'react-icons/lu'

import { Menu, MenuItem, useDialog, mergeClasses } from '@cloudillo/react'
import type { CalendarOutput } from '@cloudillo/core'

export interface CalendarSidebarProps {
	calendars: CalendarOutput[]
	visible: Set<number> | null
	currentDate: string
	onToggle: (calId: number) => void
	onEdit: (cal: CalendarOutput) => void
	onDelete: (cal: CalendarOutput) => Promise<void>
	onCreate: () => void
	onPickDate: (date: string) => void
}

interface CalMenuState {
	cal: CalendarOutput
	x: number
	y: number
}

export function CalendarSidebar({
	calendars,
	visible,
	currentDate,
	onToggle,
	onEdit,
	onDelete,
	onCreate,
	onPickDate
}: CalendarSidebarProps) {
	const { t } = useTranslation()
	const dialog = useDialog()
	const [calMenu, setCalMenu] = React.useState<CalMenuState | null>(null)

	function openMenu(e: React.MouseEvent<HTMLButtonElement>, cal: CalendarOutput) {
		e.stopPropagation()
		const rect = e.currentTarget.getBoundingClientRect()
		const MENU_WIDTH = 180
		const x = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8))
		setCalMenu({ cal, x, y: rect.bottom + 4 })
	}

	async function handleDelete(cal: CalendarOutput) {
		const confirmed = await dialog.confirm(
			t('Delete calendar?'),
			t('All events and tasks in "{{name}}" will be permanently removed.', { name: cal.name })
		)
		if (!confirmed) return
		await onDelete(cal)
	}

	return (
		<div className="c-cal-sidebar">
			<MiniNavigator currentDate={currentDate} onPickDate={onPickDate} />

			<div className="c-cal-sidebar__section-header">
				<span className="c-cal-sidebar__section-title">{t('My calendars')}</span>
				<button
					type="button"
					className="c-link"
					onClick={onCreate}
					aria-label={t('New calendar')}
					title={t('New calendar')}
				>
					<IcAdd />
				</button>
			</div>

			<div className="c-cal-list flex-fill">
				{calendars.map((cal) => {
					const isVisible = visible === null || visible.has(cal.calId)
					return (
						<div
							key={cal.calId}
							className={mergeClasses('c-cal-item', !isVisible && 'dimmed')}
							onClick={() => onToggle(cal.calId)}
							onKeyDown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault()
									onToggle(cal.calId)
								}
							}}
							tabIndex={0}
							role="button"
							aria-pressed={isVisible}
							aria-label={
								isVisible
									? t('Hide {{name}}', { name: cal.name })
									: t('Show {{name}}', { name: cal.name })
							}
						>
							<span
								className="c-cal-item__swatch"
								style={{
									background: isVisible
										? cal.color || 'var(--col-primary)'
										: 'transparent',
									borderColor: cal.color || 'var(--col-primary)'
								}}
								aria-hidden="true"
							/>
							<span className="c-cal-item__name" title={cal.name}>
								{cal.name}
							</span>
							<button
								type="button"
								className="c-link c-cal-item__more"
								title={t('More actions')}
								aria-label={t('More actions for {{name}}', { name: cal.name })}
								aria-haspopup="menu"
								onClick={(e) => openMenu(e, cal)}
							>
								<IcMore />
							</button>
						</div>
					)
				})}
			</div>

			{calMenu && (
				<Menu position={{ x: calMenu.x, y: calMenu.y }} onClose={() => setCalMenu(null)}>
					<MenuItem
						icon={<IcEdit />}
						label={t('Edit')}
						onClick={() => {
							const cal = calMenu.cal
							setCalMenu(null)
							onEdit(cal)
						}}
					/>
					<MenuItem
						icon={<IcDelete />}
						label={t('Delete')}
						danger
						onClick={() => {
							const cal = calMenu.cal
							setCalMenu(null)
							void handleDelete(cal)
						}}
					/>
				</Menu>
			)}
		</div>
	)
}

function MiniNavigator({
	currentDate,
	onPickDate
}: {
	currentDate: string
	onPickDate: (date: string) => void
}) {
	const { t, i18n } = useTranslation()
	const [viewMonth, setViewMonth] = React.useState<Dayjs>(() => dayjs(currentDate).startOf('day'))

	React.useEffect(
		function syncMonth() {
			setViewMonth(dayjs(currentDate).startOf('day'))
		},
		[currentDate]
	)

	const monthStart = viewMonth.startOf('month')
	const gridStart = monthStart.subtract(monthStart.day(), 'day')
	const cells: Dayjs[] = []
	for (let i = 0; i < 42; i++) cells.push(gridStart.add(i, 'day'))

	const selected = dayjs(currentDate).startOf('day')
	const today = dayjs()
	const label = new Intl.DateTimeFormat(i18n.language, {
		month: 'long',
		year: 'numeric'
	}).format(viewMonth.toDate())
	const dowFormat = new Intl.DateTimeFormat(i18n.language, { weekday: 'narrow' })
	const dowHeaders = Array.from({ length: 7 }, (_, i) => {
		// Sun Jan 7 2024 is a known Sunday; advance by weekday index.
		const anchor = dayjs('2024-01-07').add(i, 'day').toDate()
		return dowFormat.format(anchor)
	})

	function stepMonth(delta: number) {
		setViewMonth((m) => m.add(delta, 'month'))
	}

	return (
		<div className="c-vbox">
			<div className="d-flex align-items-center justify-content-between px-2 pt-2">
				<button
					type="button"
					className="c-link"
					onClick={() => stepMonth(-1)}
					aria-label={t('Previous month')}
				>
					<IcPrev />
				</button>
				<strong className="text-center" aria-live="polite">
					{label}
				</strong>
				<button
					type="button"
					className="c-link"
					onClick={() => stepMonth(1)}
					aria-label={t('Next month')}
				>
					<IcNext />
				</button>
			</div>
			<div className="c-cal-mini">
				{dowHeaders.map((dow, i) => (
					<div key={`h${i}`} className="c-cal-mini__header">
						{dow}
					</div>
				))}
				{cells.map((d) => {
					const iso = d.format('YYYY-MM-DD')
					const isOther = d.month() !== monthStart.month()
					const isToday = d.isSame(today, 'day')
					const isSelected = d.isSame(selected, 'day')
					return (
						<button
							key={iso}
							type="button"
							className={mergeClasses(
								'c-cal-mini__cell',
								isOther && 'other-month',
								isToday && 'today',
								isSelected && 'selected'
							)}
							onClick={() => onPickDate(iso)}
							aria-current={isSelected ? 'date' : undefined}
							aria-label={iso}
						>
							{d.date()}
						</button>
					)
				})}
			</div>
		</div>
	)
}

// vim: ts=4
