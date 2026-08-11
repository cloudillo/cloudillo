// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The DocBar's document-identity rules, with no React and no context imports, so
 * they can be tested directly (`shell` has no `@testing-library/react`, and the
 * context barrel pulls in CSS jest cannot parse). {@link useDocInfo} owns the
 * wiring — which client, when to refetch — and delegates every decision here.
 */

import type { ApiClient, DocInfo, FileView } from '@cloudillo/core'

import { fileIdFromResId, idTagFromResId } from '../message-bus/handlers/resId.js'
import { isMissingError, isPermissionError } from '../utils.js'
import { canManageFile, isCrossOwnerFile, scopeFileToTenant } from './files/utils.js'

export interface RowResult {
	row?: FileView
	/** The request itself failed. NOT the same as "this node has no such row". */
	failed?: boolean
	/** Refused for lack of rights. A failure, but one the origin may still answer. */
	denied?: boolean
}

/**
 * Fetch one file row, telling "there is no such row" apart from "nobody answered".
 *
 * The distinction is the whole point: {@link resolveDocInfo} turns a missing row
 * into `state: 'unavailable'`, which must never be asserted on the strength of a
 * request that was refused, failed, or never sent.
 */
export async function fetchRow(client: ApiClient | null, fileId: string): Promise<RowResult> {
	// Having no credential to ask with is not an answer. The shell renders routes
	// while `auth` is still `undefined`, and a share-link guest has no client until
	// its token arrives — reporting `{}` there reads as "no such row".
	if (!client) return { failed: true }
	try {
		const files = await client.files.list({ fileId })
		return { row: files[0] }
	} catch (err) {
		// A genuine 404 is a legitimate answer (a foreign document never pinned
		// here) and stays `{}`. A 403 only says THIS credential may not read the
		// row, not that it is absent — and anything else is a plain failure that
		// must not read as "no row", or a network blip silently turns off rename
		// for the rest of the session.
		if (isMissingError(err)) return {}
		if (isPermissionError(err)) return { failed: true, denied: true }
		console.warn('[DocInfo] Row fetch failed', fileId, err)
		return { failed: true }
	}
}

export interface ResolveDocInfoInput {
	resId: string
	/** The row served by the ACTIVE context. Present → this is the rename target. */
	localRow?: FileView
	/** The origin row from the owner's node. Display only — never renamed. */
	remoteRow?: FileView
	authIdTag?: string
	/** The context whose node was asked for the local row */
	contextIdTag?: string
	/** Roles held on `contextIdTag` */
	contextRoles: string[]
}

/**
 * Decide what an app should show about the document it was launched with, and
 * whether it may rename it.
 */
export function resolveDocInfo({
	resId,
	localRow,
	remoteRow,
	authIdTag,
	contextIdTag,
	contextRoles
}: ResolveDocInfoInput): DocInfo {
	const fileId = fileIdFromResId(resId) ?? resId
	// Local first: the row served by the active context is the one we can act on,
	// and its name is the one this user chose. The origin is a display fallback.
	const row = localRow ?? remoteRow
	const hasLocalRow = !!localRow
	const ownerIdTag = row?.owner?.idTag ?? idTagFromResId(resId)
	const isCrossOwner = isCrossOwnerFile(ownerIdTag, contextIdTag, false)

	/*
	 * Rename targets the LOCAL row on the LOCAL node, so only standing on the node
	 * serving that row decides it — never the origin's.
	 *
	 * A pinned or placed foreign-owned row is this user's own copy, but
	 * `canManageFile` answers about the ORIGIN's ownership and would refuse it —
	 * unrenamable here while the Files app renames it happily (its ContextMenu
	 * gates Rename on "not remote browsing"). So a local copy qualifies on the
	 * strength of being local, and same-owner rows go through the shared
	 * predicate. Both branches are narrower than what the backend accepts; the 403
	 * toast on the write itself is the real backstop.
	 *
	 * A visitor with no signed-in identity never renames anything: a share-link
	 * guest reads the row with a file-scoped token, and the cross-owner arm would
	 * otherwise hand them an editable title that can only ever 403.
	 */
	const canRename =
		!!authIdTag &&
		hasLocalRow &&
		(isCrossOwner ||
			canManageFile(
				scopeFileToTenant(localRow as FileView, authIdTag, contextIdTag),
				authIdTag,
				contextRoles
			))

	const owner = row?.owner ?? (ownerIdTag ? { idTag: ownerIdTag } : undefined)

	return {
		resId,
		fileId,
		state: row ? 'ready' : 'unavailable',
		fileName: row?.fileName,
		owner: owner && {
			idTag: owner.idTag,
			name: owner.name,
			profilePic: owner.profilePic,
			// FileView types this as a free string; DocInfo only admits the two we render
			type:
				owner.type === 'community'
					? 'community'
					: owner.type === 'person'
						? 'person'
						: undefined
		},
		isCrossOwner,
		canRename
	}
}

// vim: ts=4
