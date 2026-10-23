// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

const SAFE = new Set(['http:', 'https:', 'mailto:', 'tel:'])

/**
 * The URL as it may appear in an exported file, or undefined to drop it. Relative/#anchor links
 * are kept as written; a `token` query param (file URLs carry the session token) is removed.
 */
export function cleanExportUrl(value: string, attr: 'src' | 'href'): string | undefined {
	let url: URL
	try {
		url = new URL(value)
	} catch {
		if (!/[?&]token=/.test(value)) return value
		// Edit the string itself: resolving against a dummy base would lose `../` and `//host`
		const hashAt = value.indexOf('#')
		const hash = hashAt < 0 ? '' : value.slice(hashAt)
		const beforeHash = hashAt < 0 ? value : value.slice(0, hashAt)
		const q = beforeHash.indexOf('?')
		// No query before the hash: nothing to strip
		if (q < 0) return value
		const params = new URLSearchParams(beforeHash.slice(q + 1))
		params.delete('token')
		const search = params.toString()
		return beforeHash.slice(0, q) + (search ? `?${search}` : '') + hash
	}
	const dataImage = attr === 'src' && /^data:image\//i.test(value)
	if (!SAFE.has(url.protocol) && !dataImage) return undefined
	if (!url.searchParams.has('token')) return value
	url.searchParams.delete('token')
	return url.href
}

/** An absolute link with a scheme that is safe to put in a document */
export function isSafeLink(value: string): boolean {
	try {
		return SAFE.has(new URL(value).protocol)
	} catch {
		return false
	}
}

// vim: ts=4
