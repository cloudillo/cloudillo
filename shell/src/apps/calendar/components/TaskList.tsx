// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { CalendarObjectOutput, CalendarOutput } from '@cloudillo/core'
import { Checkbox, EmptyState, List, ListItem, LoadingSpinner, Panel, Text } from '@cloudillo/react'
import dayjs from 'dayjs'
import { useAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { selectedObjectAtom } from '../atoms.js'
import type { ListedTask } from '../hooks/useTaskList.js'

export interface TaskListProps {
	tasks: ListedTask[]
	calendars: CalendarOutput[]
	isLoading: boolean
	hasMore: boolean
	error: Error | null
	loadMore: () => void
	sentinelRef: React.RefObject<HTMLElement | null>
	onToggleComplete: (obj: CalendarObjectOutput) => Promise<void>
}

export function TaskList({ tasks, calendars, isLoading, error, onToggleComplete }: TaskListProps) {
	const [selected, setSelected] = useAtom(selectedObjectAtom)
	const { t, i18n } = useTranslation()

	if (isLoading && tasks.length === 0) {
		return <LoadingSpinner fill className="auto-bg" />
	}

	if (error) {
		return <EmptyState fill className="auto-bg" color="error" description={error.message} />
	}

	if (tasks.length === 0) {
		return (
			<Text as="p" emphasis="muted" align="center" className="auto-bg p-4">
				{t('No tasks yet')}
			</Text>
		)
	}

	const fmtDate = new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric' })
	const calById = new Map(calendars.map((c) => [c.calId, c]))

	return (
		<Panel padding={2} className="flex-fill h-min-0 overflow-y-auto">
			<List>
				{tasks.map((task) => {
					const isDone = task.status === 'COMPLETED'
					const cal = calById.get(task.calId)
					const meta = [
						task.dtend && `${t('Due')}: ${fmtDate.format(dayjs(task.dtend).toDate())}`,
						cal?.name
					]
						.filter(Boolean)
						.join(' · ')
					return (
						<ListItem
							key={`${task.calId}-${task.uid}`}
							selected={selected?.uid === task.uid}
							title={
								<Text emphasis={isDone ? 'muted' : undefined}>
									{task.summary || '(untitled)'}
								</Text>
							}
							subtitle={meta || undefined}
							onClick={() => setSelected({ calId: task.calId, uid: task.uid })}
							trailing={
								<Checkbox
									checked={isDone}
									onClick={(e) => e.stopPropagation()}
									onChange={async () => {
										// The list item lacks CalendarObjectOutput's detail fields, hence the cast.
										await onToggleComplete({
											...task,
											component: task.component,
											description: undefined,
											priority: undefined,
											organizer: undefined,
											parseError: undefined,
											createdAt: task.updatedAt
										} as CalendarObjectOutput)
									}}
									aria-label={t('Mark complete')}
								/>
							}
						/>
					)
				})}
			</List>
		</Panel>
	)
}

// vim: ts=4
