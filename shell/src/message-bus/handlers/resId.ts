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

/** A DNS-shaped idTag: dot-separated labels of alphanumerics and inner hyphens, and nothing
 *  that could be read as a path segment. Stricter than the ad-hoc copies in
 *  `handlers/media.ts` and `apps/index.tsx`, deliberately: this one guards remote-peer input
 *  (`parseLiveDocContent`), where `.`, `..` and `-a.tld` all reach `appPath` and a token mint. */
export const ID_TAG_RE =
	/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/

/** Is this the `<idTag>` half of a resId, and nothing that could be read as a path? */
export function isIdTag(idTag: string | undefined): idTag is string {
	return !!idTag && ID_TAG_RE.test(idTag)
}

/** A fileId as it may appear in a resId: one path segment, and nothing that could be
 *  read as a path. The leading class excludes '.', so '.', '..' and '.foo' are all out
 *  while dots inside an id stay legal; ':' is legal after the first character because
 *  only the FIRST colon of a resId splits it (see `fileIdFromResId`). Guards remote-peer
 *  input (`parseLiveDocContent`), whose fileId half reaches `appPath` and a token mint. */
const FILE_ID_RE = /^[A-Za-z0-9_~][A-Za-z0-9._~:-]*$/

export function isFileId(fileId: string | undefined): fileId is string {
	return !!fileId && FILE_ID_RE.test(fileId)
}

// vim: ts=4
