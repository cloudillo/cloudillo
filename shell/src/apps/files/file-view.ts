// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type * as Types from '@cloudillo/core'

import type { File } from './types.js'

export function convertFileView(f: Types.FileView): File {
	return {
		...f,
		contentId: f.contentId ?? null,
		preset: f.preset || '',
		tags: f.tags?.filter((t) => t && t.length > 0),
		owner: f.owner ? { ...f.owner, name: f.owner.name || '' } : undefined,
		upstream: f.upstream ? { ...f.upstream, name: f.upstream.name || '' } : undefined,
		variantId: undefined
	}
}

/** Fields a single-entry view may lack although the row has them (list includes, the caller's
 *  level, client-side variant choice); an absent one keeps the row's value */
const LIST_ONLY = ['accessLevel', 'tags', 'path', 'parentName', 'owner', 'variantId'] as const

/** Merges a single-entry FileView (getMetadata, restore) into a list row. List-only fields stay
 *  when absent, and so do preset '' and contentId null (convertFileView's fallbacks); any other
 *  absent field is cleared - the server dropped it. */
export function mergeFileView(prev: File, view: Types.FileView): File {
	const merged: File = convertFileView(view)
	for (const k of LIST_ONLY) {
		if (merged[k] === undefined) (merged as unknown as Record<string, unknown>)[k] = prev[k]
	}
	if (merged.preset === '') merged.preset = prev.preset
	if (merged.contentId == null) merged.contentId = prev.contentId
	return merged
}

// vim: ts=4
