// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Route resolution for full-text search hits.
 *
 * Pure module — no React, no shell state — so it is unit-testable in isolation.
 */

import type { SearchHit } from '@cloudillo/types'

import { appPath, type CtxBase, feedPath, profilePath } from './routes.js'

/**
 * Route path for a search hit, in the given URL context.
 *
 * Built directly rather than through `buildRef`/`resolveRef` because the short `cl:`
 * form drops the context (`refs.ts`, `resolveRef`) — a hit inside a community must
 * stay in its community.
 *
 * The shape comes from `routes.ts`, so the only injection surface is the interpolated
 * ids; they are percent-encoded. The `<owner>:<fileId>` colon stays literal, because
 * `ExternalApp` and `FileViewerApp` split the resId on it.
 *
 * @param hit - one result from `GET /search`
 * @param base - the context prefix (`'/~'` at home)
 * @param mimeMap - `appConfig.mime`, the contentType → `/app/<appId>` fallback
 * @param contextIdTag - the *real* idTag of the current context, deliberately not the
 *   base: `~` is a URL shorthand, never a tenant, and the resId's owner half must not
 *   inherit it — `mintAppToken` splits that half off and proxies to it, and
 *   `getProxyToken('~')` cannot succeed. Same split `FilesApp.navigateToFile` makes.
 * @returns a route path, or null when the hit cannot be navigated to
 */
export function searchHitTarget(
	hit: SearchHit,
	base: CtxBase,
	mimeMap?: Record<string, string>,
	contextIdTag?: string
): string | null {
	if (!hit.objId) return null

	if (hit.objTp === 'P') return profilePath(base, hit.objId)
	if (hit.objTp === 'A') return feedPath(base, hit.objId)

	// 'F' file / 'D' document part.
	// `hit.appId` is a bare app id; `appConfig.mime[ct]` is a `/app/<appId>` path, so
	// the fallback keeps only its last segment — as `FilesApp.openFile` does.
	const appId = hit.appId || mimeMap?.[hit.contentType ?? '']?.split('/').pop()
	// Files owned by the context itself carry no ownerTag; the viewer and ExternalApp
	// both default to the context then — the real idTag, never the URL's `~`.
	const owner = hit.ownerTag || contextIdTag
	if (!owner) return null
	// `appPath` encodes the whole resId as one segment, keeping the `<owner>:<fileId>` colon
	// literal — which is what the resId splitters expect.
	const target = appPath(base, appId || 'view', `${owner}:${hit.objId}`)

	if (hit.navParam && hit.partId) {
		const params = new URLSearchParams({ [hit.navParam]: hit.partId })
		return `${target}?${params}`
	}
	return target
}

// vim: ts=4
