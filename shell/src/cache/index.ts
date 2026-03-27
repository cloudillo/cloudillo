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
