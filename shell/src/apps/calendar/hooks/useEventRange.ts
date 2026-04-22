// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { CalendarOutput } from '@cloudillo/core'
import { useToast } from '@cloudillo/react'
import dayjs from 'dayjs'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { type RRule, rrulestr } from 'rrule'
import { useContextAwareApi } from '../../../context/index.js'
import type { CalendarView, EventOccurrence } from '../types.js'
import { pickContrastText, toRfc5545Utc } from '../utils.js'

export interface UseEventRangeOptions {
	calendars: CalendarOutput[]
	currentDate: string
	view: CalendarView
	searchQuery?: string
	/** When true, each overridden occurrence is rendered twice: the live override
	 *  at its new time/date AND a translucent ghost at the original RRULE slot.
	 *  Off by default — most users don't want the extra visual density. */
	showOverrideGhosts?: boolean
}

export interface UseEventRangeResult {
	occurrences: EventOccurrence[]
	isLoading: boolean
	error: Error | null
	refresh: () => void
	/** Locally apply a field update to a single occurrence — used after a
	 *  successful drag/resize PUT so the grid reflects the new time without
	 *  a full list refetch. */
	updateOccurrence: (id: string, updates: Partial<EventOccurrence>) => void
}

/** Returns the [start, end) window the current view needs loaded. Grid views
 *  pad a little beyond the visible range to avoid re-fetching on every slide.
 *  All arithmetic is local-time to stay consistent with how ISO strings are
 *  written elsewhere in the calendar (see libs/calendar-ui/src/utils/dates.ts). */
function computeWindow(currentDate: string, view: CalendarView): { start: Date; end: Date } {
	const base = dayjs(currentDate).startOf('day')
	if (view === 'day') {
		return { start: base.toDate(), end: base.add(1, 'day').toDate() }
	}
	if (view === 'week') {
		const start = base.subtract(base.day(), 'day')
		return { start: start.toDate(), end: start.add(7, 'day').toDate() }
	}
	if (view === 'agenda') {
		return { start: base.toDate(), end: base.add(30, 'day').toDate() }
	}
	// month — include leading/trailing days shown on a 6x7 grid
	const monthFirst = base.startOf('month')
	const start = monthFirst.subtract(monthFirst.day(), 'day')
	return { start: start.toDate(), end: start.add(42, 'day').toDate() }
}

/** Return an RRULE-compatible parseable date for the given iCal-style value. */
function parseEventDate(iso: string | undefined, allDay: boolean | undefined): Date | null {
	if (!iso) return null
	// The server serializes DATE-only as YYYY-MM-DD; DATE-TIME as full ISO.
	// For all-day, force local-midnight parsing so users west of UTC don't slip a day.
	const d = dayjs(iso)
	return d.isValid() ? (allDay ? d.startOf('day').toDate() : d.toDate()) : null
}

/** Query VEVENTs across all visible calendars for the active window and expand
 *  recurring masters with `rrule.js`. Callers re-run this when window or
 *  calendar-visibility changes; list results are not cached beyond the hook
 *  lifetime. */
export function useEventRange(options: UseEventRangeOptions): UseEventRangeResult {
	const { api } = useContextAwareApi()
	const { t } = useTranslation()
	const toast = useToast()
	const { calendars, currentDate, view, searchQuery, showOverrideGhosts } = options
	const trimmedSearch = searchQuery?.trim() || undefined

	const [occurrences, setOccurrences] = React.useState<EventOccurrence[]>([])
	const [isLoading, setIsLoading] = React.useState(false)
	const [error, setError] = React.useState<Error | null>(null)
	const [refreshCounter, setRefreshCounter] = React.useState(0)

	// Key on every field consumed inside the effect so the dep array stays a
	// string (stable across unrelated re-renders) rather than the array ref.
	const calendarsKey = React.useMemo(
		() => calendars.map((c) => `${c.calId}:${c.color ?? ''}`).join(','),
		[calendars]
	)

	React.useEffect(
		function loadEvents() {
			if (!api || calendars.length === 0 || view === 'tasks') {
				setOccurrences([])
				return
			}
			let cancelled = false
			setIsLoading(true)
			setError(null)

			const { start, end } = computeWindow(currentDate, view)
			const startIso = start.toISOString()
			const endIso = end.toISOString()

			Promise.allSettled(
				calendars.map(async (cal) => {
					const res = await api.calendars.listObjects(cal.calId, {
						component: 'VEVENT',
						start: startIso,
						end: endIso,
						q: trimmedSearch,
						limit: 500,
						includeExceptions: true
					})
					return { cal, items: res.data }
				})
			)
				.then((settled) => {
					if (cancelled) return
					// Partial failures shouldn't blank the grid — render what
					// succeeded and only surface an error when every calendar failed.
					// The per-calendar failure is represented in the UI by that
					// calendar's events being absent from the range.
					const perCal = settled.flatMap((r) => {
						if (r.status === 'fulfilled') return [r.value]
						return []
					})
					if (perCal.length === 0 && settled.length > 0) {
						const firstFail = settled.find(
							(r): r is PromiseRejectedResult => r.status === 'rejected'
						)
						const reason = firstFail?.reason
						setError(reason instanceof Error ? reason : new Error(String(reason)))
						setOccurrences([])
						return
					}
					// Some-but-not-all failed: render the partial view but warn the user
					// so a half-populated grid doesn't get mistaken for a quiet day.
					if (perCal.length < settled.length) {
						toast.warning(t('Some calendars failed to load'))
					}
					const all: EventOccurrence[] = []
					for (const { cal, items } of perCal) {
						const color = cal.color || 'var(--col-primary)'
						const textColor = pickContrastText(cal.color)
						// Split masters (no recurrenceId) from overrides, index overrides
						// by uid + RECURRENCE-ID timestamp (milliseconds). Keying by timestamp
						// instead of ISO string avoids format mismatches — the server emits
						// `2026-04-23T07:00:00Z` while `Date.prototype.toISOString()` produces
						// `2026-04-23T07:00:00.000Z`.
						const masters = items.filter((it) => !it.recurrenceId)
						const overridesByUid = new Map<
							string,
							Map<number, (typeof items)[number]>
						>()
						for (const it of items) {
							if (!it.recurrenceId) continue
							const ridDayjs = dayjs(it.recurrenceId)
							if (!ridDayjs.isValid()) continue
							const ridMs = ridDayjs.valueOf()
							const byRid = overridesByUid.get(it.uid) ?? new Map()
							byRid.set(ridMs, it)
							overridesByUid.set(it.uid, byRid)
						}
						for (const item of masters) {
							const masterStart = parseEventDate(item.dtstart, item.allDay)
							const masterEnd = parseEventDate(item.dtend, item.allDay)
							if (!masterStart) continue
							const durationMs = masterEnd
								? masterEnd.getTime() - masterStart.getTime()
								: 60 * 60 * 1000
							const overrides = overridesByUid.get(item.uid)
							const exdateSet = new Set(
								(item.exdate ?? []).map((iso) => dayjs(iso).valueOf())
							)
							if (item.rrule) {
								try {
									// rrule.js needs a DTSTART line to anchor the rule.
									// All-day events use `VALUE=DATE:YYYYMMDD` (floating
									// calendar date) — without it, a UTC conversion of
									// local midnight can slip a day for users west of UTC.
									const dtstartLine = item.allDay
										? `DTSTART;VALUE=DATE:${dayjs(masterStart).format('YYYYMMDD')}`
										: `DTSTART:${toRfc5545Utc(masterStart, false)}`
									const rule = rrulestr(`${dtstartLine}\nRRULE:${item.rrule}`, {
										forceset: false
									}) as RRule
									const dates = rule.between(start, end, true)
									for (const dt of dates) {
										if (exdateSet.has(dt.getTime())) continue
										const rid = dt.toISOString()
										const override = overrides?.get(dt.getTime())
										if (override) {
											const ovStart = parseEventDate(
												override.dtstart,
												override.allDay
											)
											const ovEnd = parseEventDate(
												override.dtend,
												override.allDay
											)
											const ovDuration =
												ovStart && ovEnd
													? ovEnd.getTime() - ovStart.getTime()
													: durationMs
											const effectiveStart = ovStart ?? dt
											const isAnchor = dt.getTime() === masterStart.getTime()
											all.push({
												// Keep master's coId in the stable id so the
												// occurrence doesn't "jump" when an override appears.
												id: makeOccurrenceId(item.coId, item.uid, dt),
												calId: item.calId,
												uid: item.uid,
												etag: override.etag,
												title:
													override.summary ??
													item.summary ??
													'(untitled)',
												start: effectiveStart.toISOString(),
												end: dayjs(effectiveStart)
													.add(ovDuration, 'millisecond')
													.toISOString(),
												allDay: override.allDay ?? item.allDay ?? false,
												location: override.location ?? item.location,
												status: override.status ?? item.status,
												color,
												textColor,
												recurring: true,
												recurrenceId: rid,
												hasOverride: true,
												isSeriesAnchor: isAnchor
											})
											// Ghost at the original RRULE slot — opt-in via
											// `showOverrideGhosts`. Skip when the override
											// didn't actually move the time (e.g., only title
											// or location changed) so the ghost wouldn't
											// visually overlap the live chip.
											if (
												showOverrideGhosts &&
												ovStart &&
												ovStart.getTime() !== dt.getTime()
											) {
												all.push({
													id: `${makeOccurrenceId(item.coId, item.uid, dt)}-ghost`,
													calId: item.calId,
													uid: item.uid,
													etag: item.etag,
													title: item.summary || '(untitled)',
													start: dt.toISOString(),
													end: dayjs(dt)
														.add(durationMs, 'millisecond')
														.toISOString(),
													allDay: item.allDay ?? false,
													location: item.location,
													status: item.status,
													color,
													textColor,
													recurring: true,
													recurrenceId: rid,
													ghost: true
												})
											}
										} else {
											all.push({
												id: makeOccurrenceId(item.coId, item.uid, dt),
												calId: item.calId,
												uid: item.uid,
												etag: item.etag,
												title: item.summary || '(untitled)',
												start: dt.toISOString(),
												end: dayjs(dt)
													.add(durationMs, 'millisecond')
													.toISOString(),
												allDay: item.allDay ?? false,
												location: item.location,
												status: item.status,
												color,
												textColor,
												recurring: true,
												recurrenceId: rid,
												isSeriesAnchor:
													dt.getTime() === masterStart.getTime()
											})
										}
									}
								} catch {
									// Unparseable RRULE — surface the master only and flag
									// it so the UI can warn the user that the repeat
									// pattern was dropped.
									const fallback = masterToOccurrence(
										item,
										masterStart,
										durationMs,
										color,
										textColor,
										true
									)
									fallback.recurrenceParseFailed = true
									all.push(fallback)
								}
							} else {
								all.push(
									masterToOccurrence(
										item,
										masterStart,
										durationMs,
										color,
										textColor,
										false
									)
								)
							}
						}
					}
					all.sort((a, b) => a.start.localeCompare(b.start))
					setOccurrences(all)
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
		// `calendars` is read through the closure but its identity-relevant
		// fields are captured by `calendarsKey`; the array ref itself is not in
		// the deps so unrelated parent renders don't re-fire the effect.
		[api, calendarsKey, currentDate, view, trimmedSearch, refreshCounter, showOverrideGhosts]
	)

	const refresh = React.useCallback(function refresh() {
		setRefreshCounter((c) => c + 1)
	}, [])

	const updateOccurrence = React.useCallback(function updateOccurrence(
		id: string,
		updates: Partial<EventOccurrence>
	) {
		setOccurrences((prev) => prev.map((o) => (o.id === id ? { ...o, ...updates } : o)))
	}, [])

	return { occurrences, isLoading, error, refresh, updateOccurrence }
}

function masterToOccurrence(
	item: {
		coId: number
		calId: number
		uid: string
		etag: string
		summary?: string
		location?: string
		status?: string
		allDay?: boolean
	},
	start: Date,
	durationMs: number,
	color: string,
	textColor: string,
	recurring: boolean
): EventOccurrence {
	return {
		id: makeOccurrenceId(item.coId, item.uid, start),
		calId: item.calId,
		uid: item.uid,
		etag: item.etag,
		title: item.summary || '(untitled)',
		start: start.toISOString(),
		end: dayjs(start).add(durationMs, 'millisecond').toISOString(),
		allDay: item.allDay ?? false,
		location: item.location,
		status: item.status,
		color,
		textColor,
		recurring
	}
}

/** URL- and CSS-ident-safe base64 alphabet (RFC 4648 §5). */
const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** 64-bit FNV-1a hash → 10 chars × 6 bits = 60 bits of the hash. Sync,
 *  deterministic, collision-resistant enough for one view's occurrences. */
function hashToShortId(input: string): string {
	const FNV_PRIME = 0x100000001b3n
	const FNV_OFFSET = 0xcbf29ce484222325n
	const MASK_64 = 0xffffffffffffffffn
	let h = FNV_OFFSET
	for (let i = 0; i < input.length; i++) {
		h ^= BigInt(input.charCodeAt(i))
		h = (h * FNV_PRIME) & MASK_64
	}
	let result = ''
	for (let i = 0; i < 10; i++) {
		result = ID_CHARS[Number(h & 63n)] + result
		h >>= 6n
	}
	return result
}

/** Deterministic 10-char base64url id per (coId, uid, occurrence-start).
 *  Including `coId` ensures distinct server records render distinctly even
 *  when a backend sync glitch gives two records the same iCal UID. */
function makeOccurrenceId(coId: number, uid: string, start: Date): string {
	return hashToShortId(`${coId}:${uid}@${start.getTime()}`)
}

// vim: ts=4
