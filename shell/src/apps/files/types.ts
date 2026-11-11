// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { ApiClient, FileVisibility } from '@cloudillo/core'

export interface FileUserData {
	accessedAt?: string
	modifiedAt?: string
	pinned?: boolean
	starred?: boolean
}

// File visibility words (wire vocabulary); 'direct' = owner only.
export type { FileVisibility }

export interface File {
	/** Entry (placement) id: selection, row keys, rename/move/trash/star/tags/visibility/shares. */
	id: string
	/** Content id: resId, file URLs, variants, app open. `null` for local folders; the upstream
	 *  folder id for a remote folder. */
	contentId: string | null
	fileName: string
	/** The profile with owner authority. Falls back to the serving tenant, so effectively always
	 *  present — NOT a cross-context signal, use `upstream` for that. */
	owner?: {
		idTag: string
		name?: string
		profilePic?: string
	}
	/** Where the canonical copy lives. Absent ⇒ the row originates on the serving node. */
	upstream?: {
		idTag: string
		name?: string
		profilePic?: string
	}
	fileType?: string
	/** Room the file was posted in (`name` or `@tenant~name`); absent = open floor. */
	channel?: string
	contentType: string
	createdAt: string
	accessedAt?: string // Global access timestamp
	modifiedAt?: string // Global modification timestamp
	userData?: FileUserData // User-specific data (pinned, starred, etc.)
	preset: string
	tags?: string[]
	variantId?: string
	parentId?: string | null
	/** See `FileAccessLevel` in ./utils — 'admin' is write plus share management.
	 *  Compare with `canWrite()`, never `=== 'write'`. */
	accessLevel?: 'read' | 'comment' | 'write' | 'admin' | 'none' | 'unknown'
	/** `'unknown'`: a level newer than this client; never a request value. */
	visibility?: FileVisibility | 'unknown'
	parentName?: string
	path?: { id: string; name: string }[]
	brokenAt?: string
	brokenReason?: 'revoked' | 'deleted' | 'unreachable' | 'unknown'
	status?: 'active' | 'pending' | 'deleted' | 'unknown'
}

/** A file still being processed/transcoded has only a temporary `@<f_id>` id and a
 *  'pending' status; its variants 404 until FileIdGeneratorTask finalizes it.
 *  Only stored blobs go through transcode/variant generation — folders and live
 *  docs (CRDT/RTDB) also start with a temp id / 'pending' status but never need
 *  processing, so they must not be treated as such. */
export function isFileProcessing(file: Pick<File, 'contentId' | 'status' | 'fileType'>): boolean {
	if (file.fileType && file.fileType !== 'BLOB') return false
	return !!file.contentId?.startsWith('@') || file.status === 'pending'
}

export interface FileView extends File {
	actions: undefined
}

/** Every id here is an entry `id` — ops look up the row; content ids are read off it. */
export interface FileOps {
	setFile?: (file: File) => void
	openFile: (entryId: string, access?: 'read' | 'comment' | 'write') => void
	openFileWithApp?: (
		entryId: string,
		appId: string,
		access?: 'read' | 'comment' | 'write',
		params?: string
	) => void
	renameFile: (entryId?: string) => void
	setRenameFileName: (name?: string) => void
	doRenameFile: (entryId: string, fileName: string) => void
	doDeleteFile: (entryId: string) => void
	doRestoreFile?: (entryId: string, parentId?: string) => void
	doPermanentDeleteFile?: (entryId: string) => void
	toggleStarred?: (entryId: string) => void
	togglePinned?: (entryId: string) => void
	// Batch operations for multi-select
	doDeleteFiles?: (entryIds: string[]) => void
	doRestoreFiles?: (entryIds: string[], parentId?: string) => void
	doPermanentDeleteFiles?: (entryIds: string[]) => void
	toggleStarredBatch?: (entryIds: string[], starred: boolean) => void
	togglePinnedBatch?: (entryIds: string[], pinned: boolean) => void
	/**
	 * `api` overrides the node the update is sent to, and callers that have an owner-scoped client
	 * must pass it: while remote-browsing, the local context's client does not hold the row, so the
	 * update 403/404s with nothing on screen to explain it. Omitted means the local client.
	 */
	setVisibility?: (entryId: string, visibility: FileVisibility, api?: ApiClient) => void
	doDuplicateFile?: (entryId: string) => void
	doRefreshFile?: (entryId: string) => void
}

export const VIEW_MODES = ['browse', 'trash', 'managed'] as const
export type ViewMode = (typeof VIEW_MODES)[number]

export const TRASH_FOLDER_ID = '__trash__'
export const MANAGED_FOLDER_ID = '__managed__'

// vim: ts=4
