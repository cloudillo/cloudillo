// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Encrypted offline data cache — public API.
 */

export { cacheActions, queryCachedActions } from './action-cache.js'
export { resetKeyErrorState } from './crypto.js'
// Store management
export { clearAll as clearCache } from './encrypted-store.js'
// Direct cache access
export { cacheFiles, getCachedFile, queryCachedFiles } from './file-cache.js'
// Hook integration
export { createCachedActionFetchPage, createCachedFileFetchPage } from './hooks.js'
// Sync utilities
export { cacheActionsAsync, cacheFilesAsync } from './sync.js'
// Types
export type { CachedFetchResult } from './types.js'

// vim: ts=4
