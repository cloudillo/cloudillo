// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import dayjs from 'dayjs'

// Tolerant of invalid stored dates (legacy rows) — returns undefined instead of Invalid Date.
export function parseRefDate(value: string | Date | undefined): Date | undefined {
	if (!value) return undefined
	const d = value instanceof Date ? value : new Date(value)
	return Number.isFinite(d.getTime()) ? d : undefined
}

export function formatRefDate(
	value: string | Date | undefined,
	fmt = 'YYYY-MM-DD'
): string | undefined {
	const d = parseRefDate(value)
	return d ? dayjs(d).format(fmt) : undefined
}

export function dateInputToExpiryIso(value: string): string | undefined {
	if (!value) return undefined
	return dayjs(value).endOf('day').toISOString()
}

// vim: ts=4
