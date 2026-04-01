// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Profile-specific cache operations.
 */

import type { ProfileInfo } from '@cloudillo/types'
import { getFileUrl } from '@cloudillo/core'
import { putRecord, getRecord, queryRecords } from './encrypted-store.js'

const STORE = 'profiles'

/**
 * Prefetch a profile picture blob so the SW caches it for offline use.
 * Fire-and-forget — errors are silently ignored.
 */
export function prefetchProfilePic(idTag: string, profilePicFileId: string): void {
	const url = getFileUrl(idTag, profilePicFileId, 'vis.pf')
	fetch(url, { mode: 'no-cors' }).catch(() => {})
}

/**
 * Cache a single profile.
 */
export async function cacheProfile(contextIdTag: string, profile: ProfileInfo): Promise<void> {
	await putRecord(
		STORE,
		{ idTag: profile.idTag },
		profile,
		`${contextIdTag}:${profile.idTag}`,
		contextIdTag
	)

	// Proactively cache profile picture for offline use
	if (profile.profilePic) {
		prefetchProfilePic(profile.idTag, profile.profilePic)
	}
}

/**
 * Get a cached profile by idTag.
 */
export async function getCachedProfile(
	contextIdTag: string,
	idTag: string
): Promise<ProfileInfo | null> {
	return getRecord<ProfileInfo>(STORE, `${contextIdTag}:${idTag}`)
}

/**
 * Get all cached profiles for a context.
 */
export async function getCachedProfiles(contextIdTag: string): Promise<ProfileInfo[]> {
	return queryRecords<ProfileInfo>(STORE, {
		indexName: 'by-context',
		range: IDBKeyRange.only(contextIdTag)
	})
}

// vim: ts=4
