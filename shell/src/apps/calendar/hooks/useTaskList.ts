// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useInfiniteScroll } from '@cloudillo/react'
import type { CalendarOutput, CalendarObjectListItem } from '@cloudillo/core'
import { useContextAwareApi } from '../../../context/index.js'
import { calendarSupports } from '../utils.js'

const PAGE_SIZE = 50

export interface UseTaskListOptions {
	calendars: CalendarOutput[]
	searchQuery?: string
}

export interface ListedTask extends CalendarObjectListItem {
	/** Calendar name for list labelling when multiple calendars are visible. */
	calName?: string
}

export interface UseTaskListResult {
	objects: ListedTask[]
	isLoading: boolean
	isLoadingMore: boolean
	error: Error | null
	hasMore: boolean
	loadMore: () => void
	refresh: () => void
	sentinelRef: React.RefObject<HTMLElement | null>
}

/**
 * Drains all task-capable calendars (VTODO support) into a single list.
 * Cursor pagination is aggregated per-call — the first page pulls from every
 * calendar's first page, sort-merged by `due`/`updatedAt`. Acceptable for the
 * common case (tens of tasks); if the list grows large we'd move to a true
 * server-side aggregated endpoint.
 */
export function useTaskList(options: UseTaskListOptions): UseTaskListResult {
	const { api } = useContextAwareApi()
	const { calendars, searchQuery } = options
	const trimmedSearch = searchQuery?.trim() || undefined
	const [refreshCounter, setRefreshCounter] = React.useState(0)

	const taskCalendars = React.useMemo(
		() => calendars.filter((c) => calendarSupports(c.components, 'VTODO')),
		[calendars]
	)
	const taskCalendarsKey = taskCalendars.map((c) => c.calId).join(',')

	const fetchPage = React.useCallback(
		async function fetchPage(_cursor: string | null, limit: number) {
			if (!api || taskCalendars.length === 0) {
				return { items: [] as ListedTask[], nextCursor: null, hasMore: false }
			}
			const items: ListedTask[] = []
			for (const cal of taskCalendars) {
				const result = await api.calendars.listObjects(cal.calId, {
					component: 'VTODO',
					q: trimmedSearch,
					limit
				})
				for (const item of result.data) {
					items.push({ ...item, calName: cal.name })
				}
			}
			// Sort: incomplete first, then by due date ascending, then by updatedAt descending.
			items.sort((a, b) => {
				const aDone = a.status === 'COMPLETED' ? 1 : 0
				const bDone = b.status === 'COMPLETED' ? 1 : 0
				if (aDone !== bDone) return aDone - bDone
				if (a.dtend && b.dtend) return a.dtend.localeCompare(b.dtend)
				if (a.dtend) return -1
				if (b.dtend) return 1
				return b.updatedAt.localeCompare(a.updatedAt)
			})
			return { items, nextCursor: null, hasMore: false }
		},
		[api, taskCalendars, trimmedSearch]
	)

	const { items, isLoading, isLoadingMore, error, hasMore, loadMore, sentinelRef } =
		useInfiniteScroll<ListedTask>({
			fetchPage,
			pageSize: PAGE_SIZE,
			deps: [taskCalendarsKey, trimmedSearch, refreshCounter],
			enabled: !!api && taskCalendars.length > 0
		})

	const refresh = React.useCallback(function refresh() {
		setRefreshCounter((c) => c + 1)
	}, [])

	return {
		objects: items,
		isLoading,
		isLoadingMore,
		error,
		hasMore,
		loadMore,
		refresh,
		sentinelRef
	}
}

// vim: ts=4
