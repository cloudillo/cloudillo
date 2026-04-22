// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { CalendarObjectOutput, EventInput } from '@cloudillo/core'
import dayjs, { type ConfigType } from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat.js'
import utc from 'dayjs/plugin/utc.js'

dayjs.extend(customParseFormat)
dayjs.extend(utc)

/** Parse `#rgb` / `#rrggbb` to an `{r,g,b}` triple in 0–255, or null if invalid. */
export function parseHexColor(hex: string | undefined): { r: number; g: number; b: number } | null {
	if (!hex) return null
	const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
	if (!m) return null
	const h = m[1]
	if (h.length === 3) {
		return {
			r: Number.parseInt(h[0] + h[0], 16),
			g: Number.parseInt(h[1] + h[1], 16),
			b: Number.parseInt(h[2] + h[2], 16)
		}
	}
	return {
		r: Number.parseInt(h.slice(0, 2), 16),
		g: Number.parseInt(h.slice(2, 4), 16),
		b: Number.parseInt(h.slice(4, 6), 16)
	}
}

/** Pick black or white text for the given background colour per WCAG relative luminance.
 *  Defaults to white when the colour can't be parsed (matches accent-coloured chips). */
export function pickContrastText(bg: string | undefined): '#000000' | '#ffffff' {
	const c = parseHexColor(bg)
	if (!c) return '#ffffff'
	const toLin = (v: number) => {
		const x = v / 255
		return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
	}
	const L = 0.2126 * toLin(c.r) + 0.7152 * toLin(c.g) + 0.0722 * toLin(c.b)
	return L > 0.5 ? '#000000' : '#ffffff'
}

/** `#34a` → `#3344aa`. Leaves 6-digit hex and non-hex strings alone. */
export function normalizeHexColor(hex: string | undefined): string | undefined {
	if (!hex) return hex
	const m = hex.trim().match(/^#?([0-9a-f]{3})$/i)
	if (!m) return hex.startsWith('#') ? hex : `#${hex}`
	const h = m[1]
	return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`
}

/** True if the calendar advertises support for the given component type. */
export function calendarSupports(components: string, comp: 'VEVENT' | 'VTODO'): boolean {
	return components.split(',').some((c) => c.trim().toUpperCase() === comp)
}

/** Recurrence presets. Keeps the common cases out of the raw RRULE editor. */
export type RecurrencePreset =
	| 'none'
	| 'daily'
	| 'weekdays'
	| 'weekly'
	| 'monthly'
	| 'yearly'
	| 'custom'

export function rrulePreset(preset: RecurrencePreset, start: ConfigType): string | undefined {
	const d = dayjs(start)
	switch (preset) {
		case 'none':
			return undefined
		case 'daily':
			return 'FREQ=DAILY'
		case 'weekdays':
			return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'
		case 'weekly':
			return `FREQ=WEEKLY;BYDAY=${ICAL_DOW_CODES[d.day()]}`
		case 'monthly':
			return `FREQ=MONTHLY;BYMONTHDAY=${d.date()}`
		case 'yearly':
			return `FREQ=YEARLY;BYMONTH=${d.month() + 1};BYMONTHDAY=${d.date()}`
		case 'custom':
			return 'FREQ=WEEKLY'
	}
}

/** Classify an existing RRULE string as one of the presets (for display in editors). */
export function detectRrulePreset(rrule: string | undefined): RecurrencePreset {
	if (!rrule) return 'none'
	const parts = parseRrulePairs(rrule)
	const freq = parts.get('FREQ')?.toUpperCase()
	const byday = parts.get('BYDAY')?.toUpperCase()
	const bymonth = parts.get('BYMONTH')
	const bymonthday = parts.get('BYMONTHDAY')
	// Any interval / count / until / extra constraints push us into custom.
	if (parts.has('INTERVAL') || parts.has('COUNT') || parts.has('UNTIL')) return 'custom'
	if (freq === 'DAILY' && parts.size === 1) return 'daily'
	if (freq === 'WEEKLY' && byday === 'MO,TU,WE,TH,FR') return 'weekdays'
	if (freq === 'WEEKLY' && byday && byday.split(',').length === 1) return 'weekly'
	if (freq === 'MONTHLY' && bymonthday && !parts.has('BYDAY')) return 'monthly'
	if (freq === 'YEARLY' && bymonth && bymonthday) return 'yearly'
	return 'custom'
}

const ICAL_DOW_MAP: Record<string, number> = {
	SU: 0,
	MO: 1,
	TU: 2,
	WE: 3,
	TH: 4,
	FR: 5,
	SA: 6
}

export const ICAL_DOW_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const
export type IcalDayCode = (typeof ICAL_DOW_CODES)[number]

export type RruleFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
export type MonthlyMode = 'day' | 'weekday'
export type EndMode = 'never' | 'count' | 'until'

/** Structured view of the RRULE bits our inline builder can render. Exotic patterns
 *  (BYSETPOS + BYMONTH, BYWEEKNO, BYYEARDAY, ...) return `null` from the parser so the
 *  caller can fall back to a raw RRULE textbox. */
export interface RruleState {
	freq: RruleFreq
	/** Repeat interval; always ≥ 1. */
	interval: number
	/** ICAL day codes when `freq === 'WEEKLY'`. */
	byday: IcalDayCode[]
	/** Monthly: either a day-of-month or the Nth weekday. */
	monthlyMode: MonthlyMode
	/** Monthly `day` mode: 1–31. */
	bymonthday: number
	/** Monthly `weekday` mode: the weekday code. */
	byday1: IcalDayCode
	/** Monthly `weekday` mode: which occurrence (1 = first, 2 = second, ..., -1 = last). */
	bysetpos: number
	/** Yearly month 1–12. */
	bymonth: number
	/** Yearly day-of-month (1–31). Named separately from `bymonthday` so switching
	 *  between MONTHLY and YEARLY modes doesn't stomp the user's picked value.
	 *  Not to be confused with iCal's `BYYEARDAY` (day-of-year 1–366), which this
	 *  builder doesn't support — on the wire this value is emitted as `BYMONTHDAY`. */
	yearlyDay: number
	endMode: EndMode
	/** `endMode === 'count'`. */
	count: number
	/** `endMode === 'until'` — stored as RFC 5545 compact form (YYYYMMDD or YYYYMMDDTHHMMSSZ). */
	until: string
}

/** Build a default RRULE state anchored at the given start date. Weekly picks the
 *  start's weekday, monthly picks the start's day-of-month, yearly picks start's month+day. */
export function defaultRruleState(start: ConfigType): RruleState {
	const d = dayjs(start)
	const dayCode = ICAL_DOW_CODES[d.day()]
	const week = Math.min(Math.ceil(d.date() / 7), 4)
	return {
		freq: 'WEEKLY',
		interval: 1,
		byday: [dayCode],
		monthlyMode: 'day',
		bymonthday: d.date(),
		byday1: dayCode,
		bysetpos: week,
		bymonth: d.month() + 1,
		yearlyDay: d.date(),
		endMode: 'never',
		count: 10,
		until: ''
	}
}

/** Format a date into RFC 5545 compact form (UTC Z). */
export function toRfc5545Utc(d: ConfigType, allDay: boolean): string {
	const u = dayjs(d).utc()
	return allDay ? u.format('YYYYMMDD') : u.format('YYYYMMDD[T]HHmmss[Z]')
}

/** ISO → `YYYY-MM-DD` (allDay) or `YYYY-MM-DDTHH:MM` (local). For `<input type=date|datetime-local>`. */
export function toLocalInput(iso: string | undefined, allDay: boolean): string {
	if (!iso) return ''
	if (allDay) return iso.slice(0, 10)
	const d = dayjs(iso)
	return d.isValid() ? d.format('YYYY-MM-DDTHH:mm') : ''
}

/** `YYYYMMDD[…]` RFC 5545 compact string → `YYYY-MM-DD` date-input form. Inverse of `toRfc5545Utc(_, true)`. */
export function rfc5545ToDateInput(compact: string): string {
	if (compact.length >= 8) {
		return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`
	}
	return ''
}

/** `YYYY-MM-DD` (from `<input type=date>`) → RFC 5545 compact UTC string.
 *  For non-allDay values, pins the time to `T235959Z` so an RRULE `UNTIL` is inclusive of the whole day. */
export function dateInputToRfc5545EndOfDay(dateInput: string, allDay: boolean): string {
	const d = dayjs(dateInput, 'YYYY-MM-DD')
	if (!d.isValid()) return ''
	const compact = d.format('YYYYMMDD')
	return allDay ? compact : `${compact}T235959Z`
}

/** Serialise state to an RRULE string. Only emits what's meaningful for the selected freq. */
export function buildRruleFromState(s: RruleState): string {
	const parts: string[] = [`FREQ=${s.freq}`]
	if (s.interval > 1) parts.push(`INTERVAL=${s.interval}`)
	if (s.freq === 'WEEKLY' && s.byday.length > 0) {
		parts.push(`BYDAY=${s.byday.join(',')}`)
	} else if (s.freq === 'MONTHLY') {
		if (s.monthlyMode === 'day') {
			parts.push(`BYMONTHDAY=${s.bymonthday}`)
		} else {
			parts.push(`BYDAY=${s.byday1}`)
			parts.push(`BYSETPOS=${s.bysetpos}`)
		}
	} else if (s.freq === 'YEARLY') {
		parts.push(`BYMONTH=${s.bymonth}`)
		parts.push(`BYMONTHDAY=${s.yearlyDay}`)
	}
	if (s.endMode === 'count' && s.count > 0) parts.push(`COUNT=${s.count}`)
	if (s.endMode === 'until' && s.until) parts.push(`UNTIL=${s.until}`)
	return parts.join(';')
}

/** Split an RRULE string into an uppercase-key → raw-value map. Keys are
 *  uppercased (iCal identifiers are case-insensitive); values are preserved
 *  as-is so callers can choose whether to normalize them. */
export function parseRrulePairs(rrule: string): Map<string, string> {
	return new Map(
		rrule.split(';').map((p) => {
			const [k, v] = p.split('=')
			return [k.trim().toUpperCase(), (v ?? '').trim()]
		})
	)
}

/** Parse an RRULE string into state the builder can edit. Returns `null` when the rule
 *  uses constructs outside the builder's vocabulary — the caller should drop to a raw
 *  textbox so the rule survives the round-trip unchanged. */
export function parseRruleToState(rrule: string, start: ConfigType): RruleState | null {
	const parts = parseRrulePairs(rrule)
	const freqRaw = parts.get('FREQ')
	if (!freqRaw) return null
	const freq = freqRaw.toUpperCase() as RruleFreq
	if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null

	// Reject keys the builder doesn't model.
	const allowed = new Set([
		'FREQ',
		'INTERVAL',
		'BYDAY',
		'BYMONTHDAY',
		'BYMONTH',
		'BYSETPOS',
		'COUNT',
		'UNTIL',
		'WKST'
	])
	for (const k of parts.keys()) if (!allowed.has(k)) return null

	const state = defaultRruleState(start)
	state.freq = freq
	const interval = Number(parts.get('INTERVAL') ?? 1)
	if (!Number.isFinite(interval) || interval < 1) return null
	state.interval = interval

	const bydayRaw = parts.get('BYDAY')
	const bymonthdayRaw = parts.get('BYMONTHDAY')
	const bymonthRaw = parts.get('BYMONTH')
	const bysetposRaw = parts.get('BYSETPOS')

	if (freq === 'WEEKLY') {
		if (bydayRaw) {
			const codes = bydayRaw.split(',').map((s) => s.trim().toUpperCase())
			if (codes.some((c) => !ICAL_DOW_CODES.includes(c as IcalDayCode))) return null
			state.byday = codes as IcalDayCode[]
		}
	} else if (freq === 'MONTHLY') {
		if (bymonthdayRaw && !bydayRaw && !bysetposRaw) {
			const n = Number(bymonthdayRaw)
			if (!Number.isFinite(n) || n < 1 || n > 31) return null
			state.monthlyMode = 'day'
			state.bymonthday = n
		} else if (bydayRaw && bysetposRaw && !bymonthdayRaw) {
			const codes = bydayRaw.split(',')
			if (codes.length !== 1) return null
			const code = codes[0].trim().toUpperCase() as IcalDayCode
			if (!ICAL_DOW_CODES.includes(code)) return null
			const pos = Number(bysetposRaw)
			if (!Number.isFinite(pos)) return null
			state.monthlyMode = 'weekday'
			state.byday1 = code
			state.bysetpos = pos
		} else {
			return null
		}
	} else if (freq === 'YEARLY') {
		if (!bymonthRaw || !bymonthdayRaw) return null
		const m = Number(bymonthRaw)
		const d = Number(bymonthdayRaw)
		if (!Number.isFinite(m) || !Number.isFinite(d)) return null
		state.bymonth = m
		state.yearlyDay = d
	} else if (freq === 'DAILY') {
		if (bydayRaw || bymonthdayRaw || bymonthRaw || bysetposRaw) return null
	}

	const countRaw = parts.get('COUNT')
	const untilRaw = parts.get('UNTIL')
	if (countRaw && untilRaw) return null
	if (countRaw) {
		const n = Number(countRaw)
		if (!Number.isFinite(n) || n < 1) return null
		state.endMode = 'count'
		state.count = n
	} else if (untilRaw) {
		state.endMode = 'until'
		state.until = untilRaw
	}

	return state
}

function parseIcalDateTime(s: string): Date | null {
	// Accepts YYYYMMDD or YYYYMMDDTHHMMSS[Z]
	if (/^\d{8}$/.test(s)) {
		const d = dayjs(s, 'YYYYMMDD')
		return d.isValid() ? d.toDate() : null
	}
	if (/^\d{8}T\d{6}Z$/.test(s)) {
		const d = dayjs.utc(s, 'YYYYMMDD[T]HHmmss[Z]')
		return d.isValid() ? d.toDate() : null
	}
	if (/^\d{8}T\d{6}$/.test(s)) {
		const d = dayjs(s, 'YYYYMMDD[T]HHmmss')
		return d.isValid() ? d.toDate() : null
	}
	return null
}

/** Produce a human-readable summary of an RRULE, e.g. "Every 2 weeks on Tuesday".
 *  Falls back to null when the rule is too exotic — callers should show the raw
 *  RRULE string in that case. */
export function rruleToHuman(
	rrule: string | undefined,
	locale: string,
	t: (key: string, opts?: Record<string, unknown>) => string
): string | null {
	if (!rrule) return null
	const parts = parseRrulePairs(rrule)
	const freq = parts.get('FREQ')?.toUpperCase()
	const interval = Number(parts.get('INTERVAL') ?? 1) || 1
	const byday = parts.get('BYDAY')?.toUpperCase()
	const bymonth = parts.get('BYMONTH')
	const bymonthday = parts.get('BYMONTHDAY')
	const count = parts.get('COUNT')
	const until = parts.get('UNTIL')

	const dayFmt = new Intl.DateTimeFormat(locale, { weekday: 'long' })
	const dayName = (code: string): string => {
		const dow = ICAL_DOW_MAP[code]
		if (dow == null) return code
		// Anchor on a known Sunday (2024-01-07).
		const anchor = dayjs('2024-01-07', 'YYYY-MM-DD').add(dow, 'day').toDate()
		return dayFmt.format(anchor)
	}

	let base: string | null = null
	if (freq === 'DAILY') {
		base = interval === 1 ? t('Every day') : t('Every {{n}} days', { n: interval })
	} else if (freq === 'WEEKLY') {
		if (byday === 'MO,TU,WE,TH,FR') {
			base = t('Every weekday')
		} else if (byday && byday.split(',').length > 0) {
			const days = byday.split(',').map(dayName).join(', ')
			base =
				interval === 1
					? t('Weekly on {{days}}', { days })
					: t('Every {{n}} weeks on {{days}}', { n: interval, days })
		} else {
			base = interval === 1 ? t('Every week') : t('Every {{n}} weeks', { n: interval })
		}
	} else if (freq === 'MONTHLY') {
		if (bymonthday) {
			base =
				interval === 1
					? t('Monthly on day {{d}}', { d: bymonthday })
					: t('Every {{n}} months on day {{d}}', { n: interval, d: bymonthday })
		} else {
			base = interval === 1 ? t('Every month') : t('Every {{n}} months', { n: interval })
		}
	} else if (freq === 'YEARLY') {
		if (bymonth && bymonthday) {
			const anchor = dayjs()
				.year(2024)
				.month(Number(bymonth) - 1)
				.date(Number(bymonthday))
				.toDate()
			const dateLabel = new Intl.DateTimeFormat(locale, {
				month: 'long',
				day: 'numeric'
			}).format(anchor)
			base =
				interval === 1
					? t('Yearly on {{date}}', { date: dateLabel })
					: t('Every {{n}} years on {{date}}', { n: interval, date: dateLabel })
		} else {
			base = interval === 1 ? t('Every year') : t('Every {{n}} years', { n: interval })
		}
	}

	if (!base) return null

	if (count) {
		base = t('{{rule}}, {{n}} times', { rule: base, n: count })
	}
	if (until) {
		const untilDate = parseIcalDateTime(until)
		if (untilDate) {
			const untilLabel = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
				untilDate
			)
			base = t('{{rule}}, until {{date}}', { rule: base, date: untilLabel })
		}
	}
	return base
}

/** Round-trip the fields we can read back from a CalendarObjectOutput into an EventInput,
 *  so callers like drag/resize can PUT a full body without losing the non-date fields.
 *  Attendees, alarms and categories aren't exposed on the output shape today and will
 *  be dropped — same limitation the editor already has. */
export function eventObjectToInput(obj: CalendarObjectOutput): EventInput {
	return {
		summary: obj.summary,
		description: obj.description,
		location: obj.location,
		dtstart: obj.dtstart,
		dtend: obj.dtend,
		allDay: obj.allDay,
		rrule: obj.rrule,
		status: obj.status,
		organizer: obj.organizer
	}
}

// vim: ts=4
