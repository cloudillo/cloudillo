// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
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

import dayjs from 'dayjs'
import type { File } from './types.js'

/**
 * Format a date/timestamp as a relative time string
 */
export function formatRelativeTime(dateInput: string | number): string {
	try {
		// Handle Unix timestamp (seconds) - if it's a number or looks like one
		let d: Date
		if (typeof dateInput === 'number') {
			// Unix timestamp in seconds
			d = new Date(dateInput * 1000)
		} else if (/^\d+$/.test(dateInput)) {
			// String that looks like a Unix timestamp
			d = new Date(parseInt(dateInput, 10) * 1000)
		} else {
			// ISO string or other date format
			d = new Date(dateInput)
		}

		// Check for invalid date
		if (isNaN(d.getTime())) return ''

		const now = new Date()
		const deltaSec = (now.getTime() - d.getTime()) / 1000

		if (deltaSec < 0) return dayjs(d).format('MMM D') // Future date
		if (deltaSec < 60) return 'just now'
		if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`
		if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}h ago`
		if (deltaSec < 604800) return `${Math.floor(deltaSec / 86400)}d ago`
		if (now.getFullYear() === d.getFullYear()) {
			return dayjs(d).format('MMM D')
		}
		return dayjs(d).format('MMM D, YYYY')
	} catch {
		return ''
	}
}

/**
 * Smart timestamp result with optional label
 */
export interface SmartTimestamp {
	label: string // 'Edited', 'Opened', or ''
	time: string // Relative time string
}

/**
 * Get a smart timestamp that shows the most relevant activity for the file.
 * - If user modified recently (< 7 days), shows "Edited X ago"
 * - If user accessed recently (< 7 days), shows "Opened X ago"
 * - Otherwise shows creation date
 */
export function getSmartTimestamp(file: File): SmartTimestamp {
	const now = Date.now()
	const WEEK_MS = 7 * 24 * 60 * 60 * 1000

	const userModified = file.userData?.modifiedAt
	const userAccessed = file.userData?.accessedAt

	// If user modified recently (< 7 days), show "Edited X ago"
	if (userModified) {
		const modifiedTime = new Date(userModified).getTime()
		if (now - modifiedTime < WEEK_MS) {
			return { label: 'Edited', time: formatRelativeTime(userModified) }
		}
	}

	// If user accessed recently (< 7 days), show "Opened X ago"
	if (userAccessed) {
		const accessedTime = new Date(userAccessed).getTime()
		if (now - accessedTime < WEEK_MS) {
			return { label: 'Opened', time: formatRelativeTime(userAccessed) }
		}
	}

	// Otherwise show created date
	return { label: '', time: formatRelativeTime(file.createdAt) }
}

// vim: ts=4
