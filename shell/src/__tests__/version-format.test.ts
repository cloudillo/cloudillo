// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/** Version row time formatting, the same-minute seconds rule, and "restore as copy" names */

import type { TFunction } from 'i18next'

import {
	fileExt,
	formatVersionFullTime,
	formatVersionTime,
	needsSeconds,
	versionCopyParts
} from '../apps/files/version-format.js'

const t = ((k: string) => k) as unknown as TFunction
// Local-time constructors: the helper formats in local time
const now = new Date(2026, 10, 19, 15, 0)
const iso = (y: number, mo: number, d: number, h: number, mi: number, s = 0) =>
	new Date(y, mo, d, h, mi, s).toISOString()

describe('formatVersionTime', () => {
	it('says Today with a 24-hour time', () => {
		expect(formatVersionTime(iso(2026, 10, 19, 9, 12), now, 'en', t, false)).toBe('Today 09:12')
	})

	it('says Yesterday, also across a month boundary', () => {
		expect(formatVersionTime(iso(2026, 10, 18, 18, 5), now, 'en', t, false)).toBe(
			'Yesterday 18:05'
		)
		expect(
			formatVersionTime(
				iso(2026, 10, 30, 23, 59),
				new Date(2026, 11, 1, 8, 0),
				'en',
				t,
				false
			)
		).toBe('Yesterday 23:59')
	})

	it('drops the year within this year and keeps it otherwise', () => {
		expect(formatVersionTime(iso(2026, 10, 17, 14, 32), now, 'en', t, false)).toBe(
			'Nov 17, 14:32'
		)
		const other = formatVersionTime(iso(2025, 2, 3, 8, 15), now, 'en', t, false)
		expect(other).toContain('2025')
		expect(other).toContain('Mar 3')
		expect(other).toContain('08:15')
	})

	it('adds seconds on request', () => {
		expect(formatVersionTime(iso(2026, 10, 19, 9, 12, 7), now, 'en', t, true)).toBe(
			'Today 09:12:07'
		)
	})

	it('passes an invalid time through as its label', () => {
		expect(formatVersionTime('bogus', now, 'en', t, false)).toBe('bogus')
	})
})

describe('fileExt', () => {
	it('keeps the dot and case; dotfiles and bare names have none', () => {
		expect(fileExt('a.PDF')).toBe('.PDF')
		expect(fileExt('.env')).toBe('')
		expect(fileExt('noext')).toBe('')
	})
})

describe('versionCopyParts', () => {
	const at = '2026-03-04T05:06:00Z'
	it('splits on the last dot only', () => {
		expect(versionCopyParts('report.pdf', at)).toMatchObject({ stem: 'report', ext: '.pdf' })
		expect(versionCopyParts('README', at)).toMatchObject({ stem: 'README', ext: '' })
		expect(versionCopyParts('.env', at)).toMatchObject({ stem: '.env', ext: '' })
		expect(versionCopyParts('a.tar.gz', at)).toMatchObject({ stem: 'a.tar', ext: '.gz' })
	})

	it('formats the date without : or /', () => {
		expect(versionCopyParts('a', at).date).toMatch(/^\d{4}-\d\d-\d\d \d\d\.\d\d$/)
	})

	it('never yields NaN for an invalid date', () => {
		const { date } = versionCopyParts('a', 'bogus:12/3')
		expect(date).not.toContain('NaN')
		expect(date).not.toMatch(/[:/]/)
	})
})

describe('needsSeconds', () => {
	it('flags entries whose neighbour falls in the same minute', () => {
		expect(
			needsSeconds([
				'2026-11-19T09:12:50Z',
				'2026-11-19T09:12:10Z',
				'2026-11-19T09:10:00Z',
				'2026-11-19T09:12:30Z'
			])
		).toEqual([true, true, false, false])
	})

	it('handles empty and single lists', () => {
		expect(needsSeconds([])).toEqual([])
		expect(needsSeconds(['2026-11-19T09:12:00Z'])).toEqual([false])
	})
})

describe('formatVersionFullTime', () => {
	it('formats a valid time with date and seconds', () => {
		const out = formatVersionFullTime('2025-03-03T08:15:42', 'en-US')
		expect(out).toContain('2025')
		expect(out).toContain('42')
	})

	it('returns an unparseable time as is', () => {
		expect(formatVersionFullTime('not-a-date', 'en')).toBe('not-a-date')
	})
})

// vim: ts=4
