// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

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
