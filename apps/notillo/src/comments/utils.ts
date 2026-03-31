// This file is part of the Cloudillo Platform.
// Copyright (C) 2026  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

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
