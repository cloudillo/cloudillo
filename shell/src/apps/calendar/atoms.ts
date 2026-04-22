// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import dayjs from 'dayjs'
import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { CalendarView, SelectedObjectRef } from './types.js'

export const currentDateAtom = atom<string>(dayjs().format('YYYY-MM-DD'))
/** Persisted per-device last-used / default calendar view. Matches the
 *  convention used for other per-device UI preferences (e.g. files display
 *  mode). Sessions resume in whatever view the user was last in. */
export const viewModeAtom = atomWithStorage<CalendarView>('cloudillo:calendar-view', 'week')
/** Jotai set of calendar IDs that are currently visible on the grid. `null` means
 *  "visibility hasn't been initialised yet" — initialise to all calendars on first load. */
export const visibleCalendarsAtom = atom<Set<number> | null>(null)
export const selectedObjectAtom = atom<SelectedObjectRef | null>(null)
export const searchQueryAtom = atom<string>('')

// vim: ts=4
