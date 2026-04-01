// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** Extract blockId from anchor string like "b:abc123" */
export function anchorBlockId(anchor: string): string | null {
	if (anchor.startsWith('b:') && anchor.length > 2) return anchor.slice(2)
	return null
}

/** Compact relative time: "now", "3m", "2h", "Mon", "03/15", "2024/03/15" */
export function shortTimeFormat(time: number | string | Date): string {
	try {
		const d = new Date(time)
		const now = new Date()
		const sec = (now.getTime() - d.getTime()) / 1000

		if (sec < 60) return 'now'
		if (sec < 3600) return `${Math.floor(sec / 60)}m`
		if (sec < 86400) return `${Math.floor(sec / 3600)}h`

		// Within last week (check before year boundary so "3 days ago" shows weekday even across Jan 1)
		if (sec < 7 * 86400)
			return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(d)

		// Different year
		if (now.getFullYear() !== d.getFullYear()) {
			return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
		}

		// Same year
		return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
	} catch {
		return ''
	}
}

// vim: ts=4
