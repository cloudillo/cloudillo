// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import dayjs from 'dayjs'
import * as React from 'react'
import { useAtom } from 'jotai'
import { useTranslation } from 'react-i18next'

import { LoadingSpinner, mergeClasses } from '@cloudillo/react'
import type { CalendarOutput, CalendarObjectOutput } from '@cloudillo/core'

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
		return (
			<div className="c-cal-tasks d-flex align-items-center justify-content-center p-4">
				<LoadingSpinner />
			</div>
		)
	}

	if (error) {
		return (
			<div className="c-cal-tasks p-4 text-center text-error" role="alert">
				{error.message}
			</div>
		)
	}

	if (tasks.length === 0) {
		return <div className="c-cal-tasks p-4 text-center c-hint">{t('No tasks yet')}</div>
	}

	const fmtDate = new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric' })
	const calById = new Map(calendars.map((c) => [c.calId, c]))

	return (
		<div className="c-cal-tasks p-2 flex-fill" style={{ overflowY: 'auto', minHeight: 0 }}>
			<div className="c-vbox g-1">
				{tasks.map((task) => {
					const isActive = selected?.uid === task.uid
					const isDone = task.status === 'COMPLETED'
					const cal = calById.get(task.calId)
					return (
						<div
							key={`${task.calId}-${task.uid}`}
							className={mergeClasses(
								'c-cal-task-row',
								isActive && 'active',
								isDone && 'completed'
							)}
							onClick={() => setSelected({ calId: task.calId, uid: task.uid })}
							onKeyDown={(e) => {
								if (e.key === 'Enter')
									setSelected({ calId: task.calId, uid: task.uid })
							}}
							tabIndex={0}
							role="button"
						>
							<input
								type="checkbox"
								checked={isDone}
								onClick={(e) => e.stopPropagation()}
								onChange={async () => {
									// The parent expects CalendarObjectOutput — the list item has the
									// essential fields but not `component`. We pass a minimal shape with
									// `component: 'VTODO'` asserted via the cast.
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
							<div className="flex-fill">
								<div className="c-cal-task-row__title">
									{task.summary || '(untitled)'}
								</div>
								<div className="c-cal-task-row__meta">
									{task.dtend && (
										<span>{`${t('Due')}: ${fmtDate.format(dayjs(task.dtend).toDate())}`}</span>
									)}
									{cal && <span>{cal.name}</span>}
								</div>
							</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}

// vim: ts=4
