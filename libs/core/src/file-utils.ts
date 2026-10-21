// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

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
 * Replaces only characters filesystems reject (path separators, reserved punctuation,
 * control characters) with '_', so accented letters and spaces stay readable. Leading dots
 * are dropped (no hidden or `..` names), as are trailing dots and spaces and bidi/format
 * characters (no `exe.txt` spoofing); Windows device names get a '_' prefix. An empty result
 * becomes '_'.
 */
export function sanitizeFilename(name: string): string {
	const clean = name
		// biome-ignore lint/suspicious/noControlCharactersInRegex: control chars are invalid in filenames
		.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
		.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
		.trim()
		.replace(/^\.+/, '')
		.replace(/[. ]+$/, '')
		.trim()
	if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(clean)) return `_${clean}`
	return clean || '_'
}

/** Image variant exports embed (print quality) */
export const EXPORT_IMAGE_VARIANT = 'vis.hd'

export function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => {
			if (typeof reader.result === 'string') resolve(reader.result)
			else reject(new Error('Failed to convert blob to data URL'))
		}
		reader.onerror = () => reject(reader.error)
		reader.readAsDataURL(blob)
	})
}

/** Fetch a URL into a data URL; throws on a non-2xx response */
export async function fetchAsDataUrl(url: string): Promise<string> {
	const response = await fetch(url)
	// Not the URL itself: it may carry a token
	if (!response.ok) throw new Error(`Fetch failed: ${response.status}`)
	return blobToDataUrl(await response.blob())
}

// vim: ts=4
