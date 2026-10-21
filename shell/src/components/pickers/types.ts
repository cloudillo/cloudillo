// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

export type PickerViewMode = 'browse' | 'connected' | 'recent' | 'starred' | 'managed'

export interface BreadcrumbItem {
	id: string | null
	name: string
}

/** Maximum number of connected file IDs to fetch in a single batch request */
export const MAX_CONNECTED_FILE_BATCH = 50

// vim: ts=4
