// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { isIdTag } from '@cloudillo/types'

/** Extract the context idTag from a resId of the form "<idTag>:<fileId>"; undefined unless valid. */
export function idTagFromResId(resId: string | undefined): string | undefined {
	if (!resId) return undefined
	const i = resId.indexOf(':')
	const tag = i > 0 ? resId.slice(0, i) : undefined
	return tag && isIdTag(tag) ? tag : undefined
}

/**
 * Extract the file ID from a resId of the form "<idTag>:<fileId>".
 *
 * Splits on the FIRST colon only — an idTag never contains one, a fileId may.
 */
export function fileIdFromResId(resId: string | undefined): string | undefined {
	if (!idTagFromResId(resId)) return undefined
	const i = resId!.indexOf(':')
	return resId!.slice(i + 1) || undefined
}

/** The two halves of a resId. Defined in `@cloudillo/types` because `getFileUrl` in
 *  `@cloudillo/core` validates against the same patterns. */
export { isFileId, isIdTag } from '@cloudillo/types'

// vim: ts=4
