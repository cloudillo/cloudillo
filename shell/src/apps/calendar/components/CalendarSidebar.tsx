// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { MiniCalendar } from '@cloudillo/calendar-ui'
import type { CalendarOutput } from '@cloudillo/core'
import {
	Button,
	ColorDot,
	HBox,
	Heading,
	List,
	ListItem,
	Menu,
	MenuItem,
	Panel,
	Text,
	Toggle,
	useDialog,
	VBox
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuPlus as IcAdd,
	LuTrash as IcDelete,
	LuPencil as IcEdit,
	LuEllipsisVertical as IcMore
} from 'react-icons/lu'

export interface CalendarSidebarProps {
	calendars: CalendarOutput[]
	visible: Set<number> | null
	currentDate: string
	/** 0 = Sunday, 1 = Monday; undefined = locale default */
	firstDayOfWeek?: 0 | 1
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
	firstDayOfWeek,
	onToggle,
	onEdit,
	onDelete,
	onCreate,
	onPickDate
}: CalendarSidebarProps) {
	const { t, i18n } = useTranslation()
	const dialog = useDialog()
	const [calMenu, setCalMenu] = React.useState<CalMenuState | null>(null)

	function openMenu(e: React.MouseEvent<HTMLElement>, cal: CalendarOutput) {
		e.stopPropagation()
		const rect = e.currentTarget.getBoundingClientRect()
		const MENU_WIDTH = 180
		const x = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8))
		setCalMenu({ cal, x, y: rect.bottom + 4 })
	}

	async function handleDelete(cal: CalendarOutput) {
		const confirmed = await dialog.confirm(
			t('Delete calendar?'),
			t('All events and tasks in "{{name}}" will be permanently removed.', {
				name: cal.name
			}),
			{ color: 'error', confirmLabel: t('Delete') }
		)
		if (!confirmed) return
		await onDelete(cal)
	}

	return (
		<Panel padding={0} className="flex-fill h-min-0 overflow-y-auto">
			<VBox>
				<MiniCalendar
					date={currentDate}
					onDateChange={onPickDate}
					locale={i18n.language}
					firstDayOfWeek={firstDayOfWeek}
					prevLabel={t('Previous month')}
					nextLabel={t('Next month')}
				/>

				<HBox align="center" justify="between" className="px-2 pt-2">
					<Heading level={2} size="xs" overline>
						{t('My calendars')}
					</Heading>
					<Button
						variant="ghost"
						size="sm"
						onClick={onCreate}
						aria-label={t('New calendar')}
						icon={<IcAdd />}
					/>
				</HBox>

				<List className="p-1">
					{calendars.map((cal) => {
						const isVisible = visible === null || visible.has(cal.calId)
						return (
							<ListItem
								key={cal.calId}
								leading={<ColorDot color={cal.color || 'var(--col-primary)'} />}
								title={
									<Text truncate emphasis={isVisible ? undefined : 'muted'}>
										{cal.name}
									</Text>
								}
								actions={
									<Button
										variant="ghost"
										size="sm"
										immediate
										aria-label={t('More actions for {{name}}', {
											name: cal.name
										})}
										aria-haspopup="menu"
										onClick={(e) => openMenu(e, cal)}
										icon={<IcMore />}
									/>
								}
								trailing={
									<Toggle
										checked={isVisible}
										onChange={() => onToggle(cal.calId)}
										aria-label={t('Show {{name}}', { name: cal.name })}
									/>
								}
							/>
						)
					})}
				</List>
			</VBox>

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
		</Panel>
	)
}

// vim: ts=4
