// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import QuickLRU from 'quick-lru'
import type { Profile } from '@cloudillo/types'
import type { ApiClient } from '@cloudillo/core'

const cache = new QuickLRU<string, Promise<Profile | null>>({
	maxSize: 256,
	maxAge: 60 * 60 * 1000
})

export function getCachedProfile(api: ApiClient, idTag: string): Promise<Profile | null> {
	const hit = cache.get(idTag)
	if (hit) return hit
	const fetchPromise = api.profiles.get(idTag).then((p) => p ?? null)
	const stored: Promise<Profile | null> = fetchPromise.catch(() => null)
	fetchPromise.catch(() => {
		// Allow retries after transient failures.
		if (cache.get(idTag) === stored) cache.delete(idTag)
	})
	cache.set(idTag, stored)
	return stored
}

export function getCachedProfiles(
	api: ApiClient,
	idTags: readonly string[]
): Promise<Record<string, Profile>> {
	return Promise.all(
		idTags.map((idTag) => getCachedProfile(api, idTag).then((p) => [idTag, p] as const))
	).then((pairs) => {
		const out: Record<string, Profile> = {}
		for (const [idTag, p] of pairs) {
			if (p) out[idTag] = p
		}
		return out
	})
}

// Useful after profile mutations (e.g. after editing your own profile) — call to
// drop the stale entry so the next read re-fetches.
export function invalidateProfileCache(idTag?: string): void {
	if (idTag) cache.delete(idTag)
	else cache.clear()
}

// vim: ts=4
