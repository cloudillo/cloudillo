// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Encrypted offline data cache — public API.
 */

// Types
export type { CachedFetchResult } from './types.js'

// Hook integration
export { createCachedFileFetchPage, createCachedActionFetchPage } from './hooks.js'

// Direct cache access
export { cacheFiles, queryCachedFiles } from './file-cache.js'
export { cacheActions, queryCachedActions } from './action-cache.js'
export {
	cacheProfile,
	getCachedProfile,
	getCachedProfiles,
	prefetchProfilePic
} from './profile-cache.js'

// Sync utilities
export { cacheFilesAsync, cacheActionsAsync, evictAsync } from './sync.js'

// Store management
export { clearAll as clearCache } from './encrypted-store.js'

// vim: ts=4
