// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import dayjs, { type Dayjs } from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek.js'
import localeData from 'dayjs/plugin/localeData.js'
import weekOfYear from 'dayjs/plugin/weekOfYear.js'

dayjs.extend(isoWeek)
dayjs.extend(localeData)
dayjs.extend(weekOfYear)

export { dayjs }
export type { Dayjs }

export type WeekStart = 0 | 1

/** First day of the 6×7 month grid: the Sunday or Monday on or before the
 *  first of `anchor`'s month. */
export function monthGridStart(anchor: string, firstDay: WeekStart): Dayjs {
	const first = dayjs(anchor).startOf('month')
	return startOfWeek(first.format('YYYY-MM-DD'), firstDay)
}

/** Array of 42 ISO date strings (YYYY-MM-DD) covering the 6×7 month grid. */
export function monthGridDays(anchor: string, firstDay: WeekStart): string[] {
	const start = monthGridStart(anchor, firstDay)
	const out: string[] = []
	for (let i = 0; i < 42; i++) out.push(start.add(i, 'day').format('YYYY-MM-DD'))
	return out
}

export function startOfWeek(date: string, firstDay: WeekStart): Dayjs {
	if (firstDay === 1) return dayjs(date).startOf('isoWeek')
	// Sunday-start: dayjs .startOf('week') is locale-dependent. Force Sunday.
	const d = dayjs(date)
	const dow = d.day() // 0 = Sunday
	return d.subtract(dow, 'day').startOf('day')
}

/** Array of 7 ISO date strings for the week containing `date`. */
export function weekDays(date: string, firstDay: WeekStart): string[] {
	const start = startOfWeek(date, firstDay)
	const out: string[] = []
	for (let i = 0; i < 7; i++) out.push(start.add(i, 'day').format('YYYY-MM-DD'))
	return out
}

/** ISO 8601 week number (1-53) for `date`. */
export function isoWeekNumber(date: string): number {
	return dayjs(date).isoWeek()
}

export function sameDay(a: string, b: string): boolean {
	return a.slice(0, 10) === b.slice(0, 10)
}

/** Minutes since local midnight for an ISO datetime string, or 0 for a pure
 *  date (YYYY-MM-DD). Uses dayjs so DST-adjacent values render at their
 *  wall-clock position, not their UTC offset. */
export function minutesOfDay(iso: string): number {
	if (iso.length <= 10) return 0
	const d = dayjs(iso)
	return d.hour() * 60 + d.minute()
}

/** Local date portion (YYYY-MM-DD) of an ISO datetime string. */
export function localDatePart(iso: string): string {
	if (iso.length <= 10) return iso
	return dayjs(iso).format('YYYY-MM-DD')
}

/** Convert minutes-since-midnight + date-part into an ISO datetime with 'Z'
 *  suffix (UTC). Uses dayjs arithmetic so DST transitions on the target day
 *  survive the round-trip through minutesOfDay/localDatePart. */
export function toIsoDateTime(datePart: string, minutes: number): string {
	return dayjs(datePart).startOf('day').add(minutes, 'minute').toISOString()
}

export function addMinutesIso(iso: string, minutes: number): string {
	return dayjs(iso).add(minutes, 'minute').toISOString()
}

export function addDaysIso(datePart: string, days: number): string {
	return dayjs(datePart).add(days, 'day').format('YYYY-MM-DD')
}

/** Locale-aware first day of week. Falls back to 1 (Monday) when the
 *  runtime locale data isn't loaded. */
export function localeFirstDay(locale?: string): WeekStart {
	try {
		const d = locale ? dayjs().locale(locale) : dayjs()
		const first = d.localeData().firstDayOfWeek()
		return first === 0 ? 0 : 1
	} catch {
		return 1
	}
}

/** Formats "09:00" — 24-hour fixed, not locale-dependent, because our UI
 *  uses 24h throughout (matches the EventEditor TimePicker convention). */
export function formatHourLabel(hour: number): string {
	return `${hour.toString().padStart(2, '0')}:00`
}

export function formatTimeRange(startIso: string, endIso: string, locale: string): string {
	const fmt = new Intl.DateTimeFormat(locale, {
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	})
	return `${fmt.format(dayjs(startIso).toDate())} – ${fmt.format(dayjs(endIso).toDate())}`
}

/** 24-hour `HH:MM` for a minutes-since-midnight value. */
export function formatMinutes(min: number): string {
	const h = Math.floor(min / 60) % 24
	const m = ((min % 60) + 60) % 60
	return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

/** Short duration label: `30m`, `1h`, `1h 30m`, `2h`. Returns `—` for NaN
 *  so an upstream bug (invalid start/end) is visible instead of silently 0m. */
export function formatDuration(min: number): string {
	if (!Number.isFinite(min)) return '—'
	const abs = Math.max(0, Math.round(min))
	const h = Math.floor(abs / 60)
	const m = abs % 60
	if (h === 0) return `${m}m`
	if (m === 0) return `${h}h`
	return `${h}h ${m}m`
}

// vim: ts=4
