// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * File-specific cache operations: index field extraction and offline query mapping.
 */

import type { FileView } from '@cloudillo/core'
import type { OfflineQuerySpec } from './types.js'
import { putRecords, queryRecords } from './encrypted-store.js'

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
 * Cache a batch of file records.
 */
export async function cacheFiles(contextIdTag: string, files: FileView[]): Promise<void> {
	await putRecords(
		STORE,
		files.map((f) => ({
			indexFields: extractFileIndexFields(f),
			payload: f,
			cacheKey: `${contextIdTag}:${f.fileId}`,
			contextIdTag
		}))
	)
}

/**
 * Build an offline query spec from file list parameters.
 */
export function buildFileOfflineQuery(
	contextIdTag: string,
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
			indexName: 'by-context-starred',
			range: IDBKeyRange.only([contextIdTag, 1])
		}
	}

	if (params.pinned) {
		return {
			indexName: 'by-context-pinned',
			range: IDBKeyRange.only([contextIdTag, 1])
		}
	}

	if (params.contentType) {
		return {
			indexName: 'by-context-content-type',
			range: IDBKeyRange.only([contextIdTag, params.contentType])
		}
	}

	if (params.fileTp) {
		// Handle comma-separated fileTp (e.g., "CRDT,RTDB")
		// For compound types, fall back to context-level query + client filter
		if (params.fileTp.includes(',')) {
			return {
				indexName: 'by-context',
				range: IDBKeyRange.only(contextIdTag)
			}
		}
		return {
			indexName: 'by-context-type',
			range: IDBKeyRange.only([contextIdTag, params.fileTp])
		}
	}

	if (params.parentId !== undefined) {
		return {
			indexName: 'by-context-parent',
			range: IDBKeyRange.only([contextIdTag, params.parentId ?? '__root__'])
		}
	}

	// Default: all files for context, newest first
	return {
		indexName: 'by-context-created',
		range: IDBKeyRange.bound([contextIdTag], [contextIdTag, '\uffff']),
		direction: 'prev'
	}
}

/**
 * Query cached files with the given parameters.
 */
export async function queryCachedFiles(
	contextIdTag: string,
	params: {
		parentId?: string | null
		fileTp?: string
		starred?: boolean
		pinned?: boolean
		contentType?: string
	},
	limit?: number
): Promise<FileView[]> {
	const query = buildFileOfflineQuery(contextIdTag, params)
	let results = await queryRecords<FileView>(STORE, query, limit)

	// Client-side filter for compound fileTp
	if (params.fileTp?.includes(',')) {
		const types = params.fileTp.split(',')
		results = results.filter((f) => types.includes(f.fileTp ?? 'BLOB'))
	}

	return results
}

// vim: ts=4
