// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { TFunction } from 'i18next'

function sameDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	)
}

/**
 * Version row time: "Today 09:12", "Yesterday 18:05", "Nov 17, 14:32", "Mar 3, 2025, 08:15".
 * 24-hour clock in every locale; `withSeconds` adds seconds (used when adjacent rows collide).
 * An unparseable time comes back as is, so the row never has an empty label.
 */
export function formatVersionTime(
	iso: string,
	now: Date,
	lang: string,
	t: TFunction,
	withSeconds: boolean
): string {
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) return iso

	const time: Intl.DateTimeFormatOptions = {
		hour: '2-digit',
		minute: '2-digit',
		second: withSeconds ? '2-digit' : undefined,
		hourCycle: 'h23'
	}
	const yesterday = new Date(now)
	yesterday.setDate(now.getDate() - 1)
	const day = sameDay(d, now) ? t('Today') : sameDay(d, yesterday) ? t('Yesterday') : undefined

	if (day) return `${day} ${new Intl.DateTimeFormat(lang, time).format(d)}`
	return new Intl.DateTimeFormat(lang, {
		month: 'short',
		day: 'numeric',
		year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
		...time
	}).format(d)
}

/** Full date and time for a tooltip; an unparseable time comes back as is */
export function formatVersionFullTime(iso: string, lang: string): string {
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) return iso
	return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'medium' }).format(d)
}

/** The extension with its dot ('.PDF'), '' for none; a dotfile ('.env') has none */
export function fileExt(name: string): string {
	const dot = name.lastIndexOf('.')
	return dot > 0 ? name.slice(dot) : ''
}

/** Name parts for a "restore as copy"; `at` is the version's time. No ':' or '/' in the date -
 *  the name may land on a filesystem. */
export function versionCopyParts(fileName: string, at: string) {
	const ext = fileExt(fileName)
	const stem = fileName.slice(0, fileName.length - ext.length)
	const d = new Date(at)
	const pad = (n: number) => String(n).padStart(2, '0')
	const date = Number.isNaN(d.getTime())
		? at.replace(/[:/]/g, '.')
		: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}`
	return { stem, ext, date }
}

/** For each time, whether an adjacent entry falls in the same minute (so seconds are needed) */
export function needsSeconds(times: string[]): boolean[] {
	const minutes = times.map((iso) => Math.floor(new Date(iso).getTime() / 60000))
	return minutes.map((m, i) => m === minutes[i - 1] || m === minutes[i + 1])
}
