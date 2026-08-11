// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** Extract the context idTag from a resId of the form "<idTag>:<fileId>". */
export function idTagFromResId(resId: string | undefined): string | undefined {
	if (!resId) return undefined
	const i = resId.indexOf(':')
	return i > 0 ? resId.slice(0, i) : undefined
}

/**
 * Extract the file ID from a resId of the form "<idTag>:<fileId>".
 *
 * Splits on the FIRST colon only — an idTag never contains one, a fileId may.
 */
export function fileIdFromResId(resId: string | undefined): string | undefined {
	if (!resId) return undefined
	const i = resId.indexOf(':')
	return i > 0 ? resId.slice(i + 1) || undefined : undefined
}

// vim: ts=4
