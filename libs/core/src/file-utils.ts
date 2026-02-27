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
