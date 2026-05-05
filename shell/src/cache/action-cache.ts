// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Action-specific cache operations: index field extraction and offline query mapping.
 */

import type { ActionView } from '@cloudillo/types'
import type { OfflineQuerySpec } from './types.js'
import { putRecords, queryRecords } from './encrypted-store.js'

const STORE = 'actions'

/**
 * Extract unencrypted index fields from an ActionView for IDB indexing.
 */
export function extractActionIndexFields(a: ActionView): Record<string, unknown> {
	return {
		actionId: a.actionId,
		type: a.type,
		status: a.status ?? 'A',
		audienceTag: a.audience?.idTag ?? '',
		createdAt: typeof a.createdAt === 'string' ? a.createdAt : String(a.createdAt)
	}
}

/**
 * Cache a batch of action records.
 */
export async function cacheActions(contextIdTag: string, actions: ActionView[]): Promise<void> {
	await putRecords(
		STORE,
		actions.map((a) => ({
			indexFields: extractActionIndexFields(a),
			payload: a,
			cacheKey: `${contextIdTag}:${a.actionId}`,
			contextIdTag
		}))
	)
}

/**
 * Build an offline query spec from action list parameters.
 */
export function buildActionOfflineQuery(
	contextIdTag: string,
	params: {
		type?: string
		audience?: string
	}
): OfflineQuerySpec {
	if (params.audience) {
		return {
			indexName: 'by-context-audience',
			range: IDBKeyRange.only([contextIdTag, params.audience])
		}
	}

	if (params.type) {
		return {
			indexName: 'by-context-type-created',
			range: IDBKeyRange.bound(
				[contextIdTag, params.type],
				[contextIdTag, params.type, '\uffff']
			),
			direction: 'prev'
		}
	}

	// Default: all actions for context
	return {
		indexName: 'by-context',
		range: IDBKeyRange.only(contextIdTag),
		direction: 'prev'
	}
}

/**
 * Query cached actions with the given parameters. `audienceType`,
 * `visibility`, and `issuer` are not in the IDB index so they're applied as
 * post-filters; the index narrows by context+type+audience first.
 */
export async function queryCachedActions(
	contextIdTag: string,
	params: {
		type?: string
		audience?: string
		audienceType?: 'personal' | 'community'
		visibility?: string | string[]
		issuer?: string
	},
	limit?: number
): Promise<ActionView[]> {
	const query = buildActionOfflineQuery(contextIdTag, params)
	const rows = await queryRecords<ActionView>(STORE, query, limit)
	const visibilityList = params.visibility
		? Array.isArray(params.visibility)
			? params.visibility
			: [params.visibility]
		: undefined
	if (!params.audienceType && !visibilityList && !params.issuer) return rows
	return rows.filter((a) => {
		if (params.audienceType && a.audience?.type !== params.audienceType) return false
		if (visibilityList && (!a.visibility || !visibilityList.includes(a.visibility))) {
			return false
		}
		if (params.issuer && a.issuer.idTag !== params.issuer) return false
		return true
	})
}

// vim: ts=4
