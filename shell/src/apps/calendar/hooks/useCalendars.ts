// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import type { CalendarOutput, CalendarCreate, CalendarPatch } from '@cloudillo/core'
import { useContextAwareApi } from '../../../context/index.js'

export interface UseCalendarsResult {
	calendars: CalendarOutput[]
	isLoading: boolean
	error: Error | null
	refresh: () => void
	create: (data: CalendarCreate) => Promise<CalendarOutput | undefined>
	update: (calId: number, data: CalendarPatch) => Promise<CalendarOutput | undefined>
	remove: (calId: number) => Promise<void>
}

export function useCalendars(): UseCalendarsResult {
	const { api } = useContextAwareApi()
	const [calendars, setCalendars] = React.useState<CalendarOutput[]>([])
	const [isLoading, setIsLoading] = React.useState(false)
	const [error, setError] = React.useState<Error | null>(null)
	const [refreshCounter, setRefreshCounter] = React.useState(0)

	React.useEffect(
		function loadCalendars() {
			if (!api) return
			let cancelled = false
			setIsLoading(true)
			setError(null)
			api.calendars
				.listCalendars()
				.then((list) => {
					if (cancelled) return
					setCalendars(list)
				})
				.catch((err) => {
					if (cancelled) return
					setError(err instanceof Error ? err : new Error(String(err)))
				})
				.finally(() => {
					if (!cancelled) setIsLoading(false)
				})
			return () => {
				cancelled = true
			}
		},
		[api, refreshCounter]
	)

	const refresh = React.useCallback(function refresh() {
		setRefreshCounter((c) => c + 1)
	}, [])

	const create = React.useCallback(
		async function create(data: CalendarCreate) {
			if (!api) return undefined
			const created = await api.calendars.createCalendar(data)
			refresh()
			return created
		},
		[api, refresh]
	)

	const update = React.useCallback(
		async function update(calId: number, data: CalendarPatch) {
			if (!api) return undefined
			const updated = await api.calendars.updateCalendar(calId, data)
			refresh()
			return updated
		},
		[api, refresh]
	)

	const remove = React.useCallback(
		async function remove(calId: number) {
			if (!api) return
			await api.calendars.deleteCalendar(calId)
			refresh()
		},
		[api, refresh]
	)

	return { calendars, isLoading, error, refresh, create, update, remove }
}

// vim: ts=4
