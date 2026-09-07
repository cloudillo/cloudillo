// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The `POST` / `LDOC` content shape: a reference to a live collaborative document
 * carried in the action's `content` instead of a plain string. No React, no DOM, so
 * it can be tested directly and imported from anywhere in the shell.
 *
 * A malformed or hostile payload must degrade to "this is an ordinary post", never
 * throw — {@link parseLiveDocContent} returns `undefined` for everything it cannot
 * read.
 */

import type { FileView } from '@cloudillo/core'
import type { LiveDocPostContent } from '@cloudillo/types'

import {
	fileIdFromResId,
	idTagFromResId,
	isFileId,
	isIdTag
} from '../../message-bus/handlers/resId.js'
// Type-only, so this module stays runtime-free of jotai.
import type { FileHandItem } from '../../state/hand.js'

export interface LiveDocRef {
	/** '<idTag>:<fileId>' as it appeared on the wire. */
	doc: string
	/** The node that SERVES the document — `upstream` for a mirrored row, else the
	 *  serving tenant. The `<idTag>` half of the resId. */
	srcIdTag: string
	fileId: string
	contentType: string
	title?: string
	text?: string
}

/**
 * Read a `POST` action's `content` as a live-document reference.
 *
 * Returns `undefined` for a plain string (an ordinary TEXT post), a non-object, a
 * `doc` with no colon or an empty half, a `doc` whose owner half is not idTag-shaped
 * or whose fileId half carries path syntax, or a non-string `contentType`. The
 * `contentType` is deliberately *not* checked against a bundle list — `shellEmbedAppName`
 * (`shell/src/shell-embed.ts`) owns that, and duplicating it invites drift.
 */
export function parseLiveDocContent(content: unknown): LiveDocRef | undefined {
	if (typeof content !== 'object' || content === null) return undefined
	const { doc, contentType, title, text } = content as Record<string, unknown>
	if (typeof doc !== 'string' || typeof contentType !== 'string') return undefined

	const srcIdTag = idTagFromResId(doc)
	const fileId = fileIdFromResId(doc)
	// A federated post's `doc` is remote-peer input. The idTag half reaches `appPath`
	// (`shell/src/routes.ts`), whose `joinTail` splits on '/' and leaves '..' intact, and
	// it is the tenant the shell mints an embed token against. Both halves must look like
	// themselves and nothing that could be read as a path — `..` is one segment too.
	if (!isIdTag(srcIdTag) || !isFileId(fileId)) return undefined

	return {
		doc,
		srcIdTag,
		fileId,
		contentType,
		title: typeof title === 'string' ? title : undefined,
		text: typeof text === 'string' ? text : undefined
	}
}

/**
 * Is `row` — fetched from the node `nodeIdTag` names — actually the document `ref` points at?
 *
 * A bare fileId match proves nothing: ids are node-local, so a foreign document's id can collide
 * with an unrelated local row. The row is the same document only when its canonical copy is the
 * one `ref` names: either it originates on the serving node and that node IS the owner, or it is
 * our mirror of the owner's copy (`upstream`).
 */
export function isSameDoc(
	row: Pick<FileView, 'upstream'> | undefined,
	ref: Pick<LiveDocRef, 'srcIdTag'>,
	nodeIdTag: string | undefined
): boolean {
	if (!row) return false
	return (row.upstream?.idTag ?? nodeIdTag) === ref.srcIdTag
}

/**
 * May a document carried in the hand be attached to a post?
 *
 * The `canPost` rule (`shell/src/apps/doc-info.ts`): a post must name a row that
 * ORIGINATES on the node it points at and that this author may widen. A mirrored row is
 * a link they cannot widen; a read-only one is a dead link for their followers. For a
 * hand item `idTag !== sourceContext` is exactly "mirrored" — `idTag` is the upstream
 * node for a mirror and the serving context otherwise. A tombstoned or trashed row would
 * post a card that resolves to nothing.
 *
 * `writable === true`, not `!== false`: `handAtom` is in-memory only (`shell/src/state/hand.ts`),
 * so there is no persisted hand from before the field existed, and `doPickUp`
 * (`apps/files/components/ContextMenu.tsx`) stamps it on every pick-up.
 */
export function isPostableHandDoc(item: FileHandItem): boolean {
	return (
		!!item.contentType &&
		(item.fileTp === 'CRDT' || item.fileTp === 'RTDB') &&
		!item.brokenAt &&
		!item.inTrash &&
		item.idTag === item.sourceContext &&
		item.writable === true
	)
}

/** Build the `content` object for a new `POST` / `LDOC` action. */
export function buildLiveDocContent(args: {
	srcIdTag: string
	fileId: string
	contentType: string
	title?: string
	text?: string
}): LiveDocPostContent {
	return {
		doc: `${args.srcIdTag}:${args.fileId}`,
		contentType: args.contentType,
		title: args.title,
		text: args.text
	}
}

// vim: ts=4
