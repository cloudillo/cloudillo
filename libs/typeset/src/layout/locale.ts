// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

// Deterministic locale formatting: the engine's own pinned patterns for en, hu and de,
// keyed by the publication language. Never `Intl`, never the viewer's locale.

type Locale = 'en' | 'hu' | 'de'

const MONTHS: Record<Locale, string[]> = {
	en: [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December'
	],
	hu: [
		'január',
		'február',
		'március',
		'április',
		'május',
		'június',
		'július',
		'augusztus',
		'szeptember',
		'október',
		'november',
		'december'
	],
	de: [
		'Januar',
		'Februar',
		'März',
		'April',
		'Mai',
		'Juni',
		'Juli',
		'August',
		'September',
		'Oktober',
		'November',
		'Dezember'
	]
}

/** Primary subtag of a BCP 47 tag; languages without pinned patterns fall back to en. */
function localeOf(lang: string): Locale {
	const l = lang.toLowerCase().split(/[-_]/)[0]
	return l === 'hu' || l === 'de' ? l : 'en'
}

/**
 * `YYYY-MM-DD…` (an ISO date or date-time) → long date: en "October 12, 2026",
 * hu "2026. október 12.", de "12. Oktober 2026". Unparsable input is returned unchanged.
 */
export function formatDate(iso: string, lang: string): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
	const loc = localeOf(lang)
	const name = m ? MONTHS[loc][Number(m[2]) - 1] : undefined
	if (!m || !name) return iso
	const y = m[1]
	const d = Number(m[3])
	return loc === 'hu'
		? `${y}. ${name} ${d}.`
		: loc === 'de'
			? `${d}. ${name} ${y}`
			: `${name} ${d}, ${y}`
}

const ROMAN: [number, string][] = [
	[1000, 'M'],
	[900, 'CM'],
	[500, 'D'],
	[400, 'CD'],
	[100, 'C'],
	[90, 'XC'],
	[50, 'L'],
	[40, 'XL'],
	[10, 'X'],
	[9, 'IX'],
	[5, 'V'],
	[4, 'IV'],
	[1, 'I']
]

function roman(n: number): string {
	let s = ''
	for (const [v, r] of ROMAN) {
		while (n >= v) {
			s += r
			n -= v
		}
	}
	return s
}

/** 1 → A, 26 → Z, 27 → AA (bijective base 26). */
function alpha(n: number): string {
	let s = ''
	while (n > 0) {
		n--
		s = String.fromCharCode(65 + (n % 26)) + s
		n = Math.floor(n / 26)
	}
	return s
}

/**
 * A counter in a list/page-number format: the first `1` (decimal), `a`/`A` (alphabetic) or
 * `i`/`I` (roman) is the counter, the rest is literal (`'1.'`, `'(a)'`, `'I'`). No token → decimal.
 * Roman beyond 1–3999 and alphabetic below 1 fall back to decimal.
 */
export function formatNumber(n: number, format: string): string {
	const i = format.search(/[1aAiI]/)
	if (i < 0) return String(n)
	const t = format[i]
	let v = String(n)
	if ((t === 'i' || t === 'I') && n >= 1 && n <= 3999) v = roman(n)
	else if ((t === 'a' || t === 'A') && n >= 1) v = alpha(n)
	if (t === 'a' || t === 'i') v = v.toLowerCase()
	return format.slice(0, i) + v + format.slice(i + 1)
}
