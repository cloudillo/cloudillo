// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

export function isAbsoluteUrl(s: string | undefined): s is string {
	return !!s && /^https?:\/\//.test(s)
}

/** Server returns absolute URLs for ProfileOverlay.profilePic / contact.photo;
 *  append a variant only if one isn't already present (backend may add its own). */
export function withVariant(url: string, variant: string): string {
	if (/[?&]variant=/.test(url)) return url
	return url.includes('?') ? `${url}&variant=${variant}` : `${url}?variant=${variant}`
}

// vim: ts=4
