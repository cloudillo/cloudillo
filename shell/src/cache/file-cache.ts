// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * File-specific cache operations: index field extraction and offline query mapping.
 *
 * Records are keyed by the TENANT THAT SERVED THE LISTING, which is what
 * `createCachedFileFetchPage` also queries by. The cache's whole job is to
 * reproduce one tenant's `GET /api/files` listing offline, and a mirrored row
 * (`upstream` set) is still that tenant's row, so it must be filed with the rest
 * of its listing — keying it by `upstream.idTag` files it under a tenant no
 * reader queries. Dedupe is not an alternative motive: `fileId` is node-local,
 * so two tenants' rows can never collide.
 *
 * NOT `f.owner`: since backend migration 49 that is the profile with owner
 * AUTHORITY, so a community member's own file carries the member's idTag while
 * being served by the community.
 */

import type { FileView } from '@cloudillo/core'

import { putRecords, queryRecords } from './encrypted-store.js'
import type { OfflineQuerySpec } from './types.js'

const STORE = 'files'

/**
 * Extract unencrypted index fields from a FileView for IDB indexing.
 */
export function extractFileIndexFields(f: FileView): Record<string, unknown> {
	return {
		entryId: f.entryId,
		fileId: f.fileId,
		parentId: f.parentId ?? '__root__',
		fileTp: f.fileTp ?? 'BLOB',
		contentType: f.contentType,
		starred: f.userData?.starred ? 1 : 0,
		pinned: f.userData?.pinned ? 1 : 0,
		createdAt: typeof f.createdAt === 'string' ? f.createdAt : f.createdAt.toISOString()
	}
}

/**
 * Cache a batch of file records under the tenant that served them — mirrored rows
 * included, see the module doc.
 */
export async function cacheFiles(scopeIdTag: string, files: FileView[]): Promise<void> {
	await putRecords(
		STORE,
		files.map((f) => ({
			indexFields: { ...extractFileIndexFields(f), ownerIdTag: scopeIdTag },
			payload: f,
			cacheKey: `${scopeIdTag}:${f.entryId}`
		}))
	)
}

/**
 * Build an offline query spec from file list parameters.
 */
export function buildFileOfflineQuery(
	srcIdTag: string,
	params: {
		parentId?: string | null
		fileTp?: string
		starred?: boolean
		pinned?: boolean
		contentType?: string
	}
): OfflineQuerySpec {
	if (params.starred) {
		return {
			indexName: 'by-owner-starred',
			range: IDBKeyRange.only([srcIdTag, 1])
		}
	}

	if (params.pinned) {
		return {
			indexName: 'by-owner-pinned',
			range: IDBKeyRange.only([srcIdTag, 1])
		}
	}

	if (params.contentType) {
		return {
			indexName: 'by-owner-content-type',
			range: IDBKeyRange.only([srcIdTag, params.contentType])
		}
	}

	if (params.fileTp) {
		// Handle comma-separated fileTp (e.g., "CRDT,RTDB")
		// For compound types, fall back to a node-level query + client filter
		if (params.fileTp.includes(',')) {
			return {
				indexName: 'by-owner',
				range: IDBKeyRange.only(srcIdTag)
			}
		}
		return {
			indexName: 'by-owner-type',
			range: IDBKeyRange.only([srcIdTag, params.fileTp])
		}
	}

	if (params.parentId !== undefined) {
		return {
			indexName: 'by-owner-parent',
			range: IDBKeyRange.only([srcIdTag, params.parentId ?? '__root__'])
		}
	}

	// Default: all files for the serving node, newest first
	return {
		indexName: 'by-owner-created',
		range: IDBKeyRange.bound([srcIdTag], [srcIdTag, '￿']),
		direction: 'prev'
	}
}

/**
 * Query cached files with the given parameters.
 */
export async function queryCachedFiles(
	srcIdTag: string,
	params: {
		parentId?: string | null
		fileTp?: string
		starred?: boolean
		pinned?: boolean
		contentType?: string
	},
	limit?: number
): Promise<FileView[]> {
	const query = buildFileOfflineQuery(srcIdTag, params)
	let results = await queryRecords<FileView>(STORE, query, limit)

	// Client-side filter for compound fileTp
	if (params.fileTp?.includes(',')) {
		const types = params.fileTp.split(',')
		results = results.filter((f) => types.includes(f.fileTp ?? 'BLOB'))
	}

	return results
}

/** Look up a cached file by its content id — what a CRDT docId names, not the entryId key. */
export async function getCachedFileByFileId(
	srcIdTag: string,
	fileId: string
): Promise<FileView | null> {
	const range = IDBKeyRange.only([srcIdTag, fileId])
	return (
		(await queryRecords<FileView>(STORE, { indexName: 'by-owner-file', range }, 1))[0] ?? null
	)
}

// vim: ts=4
