// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Resolving this worker's own idTag — the own-vs-federated discriminator both
 * `onFetch` and `handleDownload` branch on.
 *
 * Memoized so concurrent first requests share one lookup; the promise is
 * dropped on failure so the next request retries rather than caching a miss.
 */

import { getIdTag, setIdTag } from './state.js'

let fetchIdTagPromise: Promise<string | undefined> | undefined

export async function fetchIdTag(): Promise<string | undefined> {
	try {
		const res = await fetch('/.well-known/cloudillo/id-tag')
		if (!res.ok) {
			console.error('[SW] failed to fetch idTag: HTTP', res.status)
			return undefined
		}
		const json = await res.json()
		const tag = json?.idTag
		if (typeof tag !== 'string') {
			console.error('[SW] invalid idTag response:', json)
			return undefined
		}
		return tag
	} catch (err) {
		console.error('[SW] failed to fetch idTag', err)
		return undefined
	}
}

/** The cached idTag, fetching it once if this is the first request to need it. */
export async function ensureIdTag(): Promise<string | undefined> {
	const existing = getIdTag()
	if (existing) return existing

	if (!fetchIdTagPromise) fetchIdTagPromise = fetchIdTag()
	const fetched = await fetchIdTagPromise
	if (fetched) {
		setIdTag(fetched)
	} else {
		fetchIdTagPromise = undefined
	}
	return fetched
}

/**
 * Is this a syntactically valid idTag (a DNS host name)?
 *
 * The `/cl-download` route takes its target from a query parameter, so this is what
 * keeps `https://cl-o.${targetTag}/...` from being steered somewhere else entirely
 * by a crafted value. It bounds the shape only — it cannot say whether the tenant is
 * one we actually federate with.
 */
export function isValidIdTag(tag: string): boolean {
	if (tag.length > 253) return false
	return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(tag)
}

// vim: ts=4
