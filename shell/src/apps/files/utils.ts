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
import type { IconType } from 'react-icons'
import {
	LuLock as IcDirect,
	LuGlobe as IcPublic,
	LuShieldCheck as IcVerified,
	LuUsers as Ic2ndDegree,
	LuUserPlus as IcFollowers,
	LuUserCheck as IcConnected
} from 'react-icons/lu'
import type { File, FileVisibility } from './types.js'

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

/**
 * Visibility options configuration
 */
export interface VisibilityOption {
	value: FileVisibility
	labelKey: string // Translation key
	icon: IconType
}

export const VISIBILITY_OPTIONS: VisibilityOption[] = [
	{ value: null, labelKey: 'Direct', icon: IcDirect },
	{ value: 'D', labelKey: 'Direct', icon: IcDirect },
	{ value: 'P', labelKey: 'Public', icon: IcPublic },
	{ value: 'V', labelKey: 'Verified', icon: IcVerified },
	{ value: '2', labelKey: '2nd Degree', icon: Ic2ndDegree },
	{ value: 'F', labelKey: 'Followers', icon: IcFollowers },
	{ value: 'C', labelKey: 'Connected', icon: IcConnected }
]

/**
 * Get visibility option by value (normalized: null and 'D' both mean Direct)
 */
export function getVisibilityOption(visibility: FileVisibility): VisibilityOption {
	const normalizedValue = visibility === 'D' ? null : visibility
	return VISIBILITY_OPTIONS.find((opt) => opt.value === normalizedValue) || VISIBILITY_OPTIONS[0]
}

/**
 * Get the label key for a visibility value (for translation)
 */
export function getVisibilityLabelKey(visibility: FileVisibility): string {
	return getVisibilityOption(visibility).labelKey
}

/**
 * Get the icon component for a visibility value
 */
export function getVisibilityIcon(visibility: FileVisibility): IconType {
	return getVisibilityOption(visibility).icon
}

/**
 * Visibility options for dropdown (excludes duplicate 'D' since null is the same)
 */
export const VISIBILITY_DROPDOWN_OPTIONS: VisibilityOption[] = VISIBILITY_OPTIONS.filter(
	(opt) => opt.value !== 'D'
)

/**
 * Check if the current user can manage a file (change visibility, sharing, etc.)
 *
 * A user can manage a file if:
 * - They are the file owner (for shared files with explicit owner_tag)
 * - They have leader or moderator role in the current context (for tenant-owned files)
 */
export function canManageFile(
	file: File,
	authIdTag: string | undefined,
	contextRoles: string[]
): boolean {
	// File owner can always manage (for shared files with explicit owner)
	if (file.owner?.idTag && file.owner.idTag === authIdTag) return true
	// Leader/moderator roles can manage in community context
	if (contextRoles.some((r) => r === 'leader' || r === 'moderator')) return true
	return false
}

// vim: ts=4
