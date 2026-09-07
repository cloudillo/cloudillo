// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The DocBar's document-identity rules, with no React and no context imports, so
 * they can be tested directly in the node-environment suite (the context barrel
 * pulls in CSS nothing in the jest config maps). {@link useDocInfo} owns the
 * wiring — which client, when to refetch — and delegates every decision here.
 */

import type { ApiClient, DocInfo, FileView } from '@cloudillo/core'

import { fileIdFromResId, idTagFromResId } from '../message-bus/handlers/resId.js'
import { isMissingError, isPermissionError } from '../utils.js'
import { isSameDoc } from './feed/live-doc.js'
import { canManageFile, canWrite, isCrossOwnerFile, resolveAccessLevel } from './files/utils.js'

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
	/** The context whose node was asked for the local row. Two uses: it is the node
	 *  `localRowIsTarget` judges the local row against (`isSameDoc` below), and — when no
	 *  local row resolved — it decides whether the resId names somebody else's node. */
	contextIdTag?: string
	/** Roles held on the context whose node was asked for the local row */
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
	// Provenance RELATIVE TO US: where the canonical copy lives, when it is not this node.
	//
	// With a local row, `upstream` says it directly. Without one, whatever we have came from
	// another node — the origin's own row, or nothing at all — so the canonical copy is either
	// further upstream still (the origin had itself mirrored it: @cycling.club serving a row
	// @bob.me owns) or the origin node named by the resId. Either way it is not us, and hiding
	// the owner chip on a document we could not fetch is the worse failure.
	const resIdTag = idTagFromResId(resId)
	const upstreamIdTag = localRow
		? localRow.upstream?.idTag
		: (remoteRow?.upstream?.idTag ??
			(resIdTag && resIdTag !== contextIdTag ? resIdTag : undefined))
	/** Provenance only: the canonical copy lives on another node. Rename authority — NOT the
	 *  owner chip, which asks a different question (below). */
	const isMirrored = isCrossOwnerFile(upstreamIdTag, false)

	/*
	 * The row came back for a bare fileId asked of the CONTEXT node, and fileIds are
	 * node-local: an unrelated local row with the same id would otherwise be renamed, and
	 * posted, in place of the document the resId names. Same rule `FeedPostHost` applies —
	 * restated here so the DocBar cannot offer an action that gate will refuse.
	 *
	 * Skipped when either half is unknown: a bare-fileId resId names this node by
	 * definition, and with no `contextIdTag` there is nothing to compare against (the row
	 * fetch itself needs a context client, so this cannot be reached with a row in hand).
	 */
	const localRowIsTarget =
		!resIdTag || !contextIdTag || isSameDoc(localRow, { srcIdTag: resIdTag }, contextIdTag)

	/*
	 * Rename targets the LOCAL row on the LOCAL node, so only standing on the node
	 * serving that row decides it — never the origin's.
	 *
	 * A mirrored (pinned or placed) row is this user's own local copy, and the
	 * Files app renames it happily (its ContextMenu gates Rename on "not remote
	 * browsing"). `canManageFile` mostly agrees — the ABAC ownership branch is not
	 * upstream-gated — but it holds no answer for a mirrored row we did not place
	 * ourselves, so a local copy qualifies on the strength of being local and
	 * rows that originate here go through the shared predicate. Both branches are
	 * narrower than what the backend accepts; the 403 toast on the write itself is
	 * the real backstop.
	 *
	 * A visitor with no signed-in identity never renames anything: a share-link
	 * guest reads the row with a file-scoped token, and the cross-owner arm would
	 * otherwise hand them an editable title that can only ever 403.
	 */
	const canRename =
		!!authIdTag &&
		hasLocalRow &&
		localRowIsTarget &&
		(isMirrored || canManageFile(localRow as FileView, authIdTag, contextRoles))

	/*
	 * NOT `canRename`. Rename is record authority and reaches a mirrored copy; posting is a
	 * claim about what the AUDIENCE can reach. A row whose canonical copy lives upstream is a
	 * link this author cannot widen — `ComposePanel`'s visibility notice is gated on
	 * `!row.upstream` for exactly that reason — and a read-only grantee would publish a link
	 * most of their followers cannot open. So: a local row, originating here, that we may write.
	 */
	const canPost =
		!!authIdTag &&
		hasLocalRow &&
		localRowIsTarget &&
		!upstreamIdTag &&
		canWrite(resolveAccessLevel(localRow as FileView, authIdTag, contextRoles))

	/*
	 * Attribution, not authority. On a mirrored row `owner` is the LOCAL record holder: an
	 * accepted share leaves `files.owner_tag` NULL and the API resolves that to the SERVING
	 * TENANT (us), while a pin/place stamps whoever placed it. Either way it is never the
	 * author, so the origin profile is the only honest answer for the chip.
	 */
	const ownerProfile = row?.upstream ?? row?.owner
	const ownerIdTag = ownerProfile?.idTag ?? resIdTag
	const owner = ownerProfile ?? (ownerIdTag ? { idTag: ownerIdTag } : undefined)
	/*
	 * The chip answers "whose document is this?" for the VIEWER, so it is not the provenance
	 * test above: a community's own document is served by the context it belongs to and still
	 * is not ours. A visitor with no identity has nothing to compare against and always sees it.
	 */
	const isCrossOwner = !!ownerIdTag && ownerIdTag !== authIdTag

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
		canRename,
		canPost
	}
}

// vim: ts=4
