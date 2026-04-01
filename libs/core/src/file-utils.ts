// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Generic file/download utilities for browser-based Cloudillo apps.
 */

/**
 * Trigger a file download from a Blob in the browser.
 *
 * Creates a temporary anchor element to trigger the download,
 * then cleans up the object URL.
 */
export function downloadBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	URL.revokeObjectURL(url)
}

/**
 * Sanitize a string for use as a filename.
 *
 * Replaces any character that isn't alphanumeric, hyphen, or underscore with '_'.
 */
export function sanitizeFilename(name: string): string {
	return name.replace(/[^a-zA-Z0-9-_]/g, '_')
}

// vim: ts=4
