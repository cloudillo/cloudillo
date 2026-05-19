// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * File-specific cache operations: index field extraction and offline query mapping.
 *
 * Records are keyed by the file's owner (`f.owner.idTag`) rather than the
 * viewer's current context. The owner is context-invariant — the same
 * physical file reached from personal, community, or share-link contexts
 * resolves to the same cache row. Callers pass a `fallbackOwnerIdTag` for
 * rare cases where `f.owner` is absent from the API response.
 */

import type { FileView } from '@cloudillo/core'
import type { OfflineQuerySpec } from './types.js'
import { getRecord, putRecords, queryRecords } from './encrypted-store.js'

const STORE = 'files'

/**
 * Extract unencrypted index fields from a FileView for IDB indexing.
 */
export function extractFileIndexFields(f: FileView): Record<string, unknown> {
	return {
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
 * Cache a batch of file records keyed by owner.
 * `fallbackOwnerIdTag` is used only when a file lacks an `owner` field in
 * the API response (the runtype marks it optional).
 */
export async function cacheFiles(fallbackOwnerIdTag: string, files: FileView[]): Promise<void> {
	let warnedFallback = false
	await putRecords(
		STORE,
		files.map((f) => {
			const ownerIdTag = f.owner?.idTag ?? fallbackOwnerIdTag
			if (!f.owner?.idTag && !warnedFallback) {
				console.warn(
					'[Cache] FileView missing owner.idTag — using fallback owner',
					f.fileId
				)
				warnedFallback = true
			}
			return {
				indexFields: { ...extractFileIndexFields(f), ownerIdTag },
				payload: f,
				cacheKey: `${ownerIdTag}:${f.fileId}`
			}
		})
	)
}

/**
 * Build an offline query spec from file list parameters.
 */
export function buildFileOfflineQuery(
	ownerIdTag: string,
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
			range: IDBKeyRange.only([ownerIdTag, 1])
		}
	}

	if (params.pinned) {
		return {
			indexName: 'by-owner-pinned',
			range: IDBKeyRange.only([ownerIdTag, 1])
		}
	}

	if (params.contentType) {
		return {
			indexName: 'by-owner-content-type',
			range: IDBKeyRange.only([ownerIdTag, params.contentType])
		}
	}

	if (params.fileTp) {
		// Handle comma-separated fileTp (e.g., "CRDT,RTDB")
		// For compound types, fall back to owner-level query + client filter
		if (params.fileTp.includes(',')) {
			return {
				indexName: 'by-owner',
				range: IDBKeyRange.only(ownerIdTag)
			}
		}
		return {
			indexName: 'by-owner-type',
			range: IDBKeyRange.only([ownerIdTag, params.fileTp])
		}
	}

	if (params.parentId !== undefined) {
		return {
			indexName: 'by-owner-parent',
			range: IDBKeyRange.only([ownerIdTag, params.parentId ?? '__root__'])
		}
	}

	// Default: all files for owner, newest first
	return {
		indexName: 'by-owner-created',
		range: IDBKeyRange.bound([ownerIdTag], [ownerIdTag, '￿']),
		direction: 'prev'
	}
}

/**
 * Query cached files with the given parameters.
 */
export async function queryCachedFiles(
	ownerIdTag: string,
	params: {
		parentId?: string | null
		fileTp?: string
		starred?: boolean
		pinned?: boolean
		contentType?: string
	},
	limit?: number
): Promise<FileView[]> {
	const query = buildFileOfflineQuery(ownerIdTag, params)
	let results = await queryRecords<FileView>(STORE, query, limit)

	// Client-side filter for compound fileTp
	if (params.fileTp?.includes(',')) {
		const types = params.fileTp.split(',')
		results = results.filter((f) => types.includes(f.fileTp ?? 'BLOB'))
	}

	return results
}

/**
 * Look up a single cached file by its fileId. `ownerIdTag` is the file's
 * canonical owner (see module doc).
 */
export async function getCachedFile(ownerIdTag: string, fileId: string): Promise<FileView | null> {
	return getRecord<FileView>(STORE, `${ownerIdTag}:${fileId}`)
}

// vim: ts=4
