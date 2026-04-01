// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Document initialization and structure access
 */

import type * as Y from 'yjs'
import type { YIdealloDocument, StoredObject, StoredMeta } from './stored-types.js'

/**
 * Get or create the document structure from a Y.Doc
 *
 * @param yDoc - The Yjs document
 * @param initializeIfEmpty - Whether to initialize with default values if empty
 */
export function getOrCreateDocument(
	yDoc: Y.Doc,
	initializeIfEmpty: boolean = true
): YIdealloDocument {
	const doc: YIdealloDocument = {
		o: yDoc.getMap<StoredObject>('o'),
		r: yDoc.getArray<string>('r'),
		m: yDoc.getMap<unknown>('m'),
		txt: yDoc.getMap<Y.Text>('txt'),
		geo: yDoc.getMap<Y.Array<number>>('geo'),
		paths: yDoc.getMap<string>('paths')
	}

	if (initializeIfEmpty && doc.m.get('initialized') !== true) {
		yDoc.transact(() => {
			doc.m.set('initialized', true)
			doc.m.set('name', 'Untitled Board')
			doc.m.set('backgroundColor', '#f8f9fa')
		})
	}

	// Migration: populate order array from existing objects (preserves insertion order)
	if (initializeIfEmpty && doc.r.length === 0 && doc.o.size > 0) {
		yDoc.transact(() => {
			const ids: string[] = []
			doc.o.forEach((_value, key) => {
				ids.push(key)
			})
			doc.r.push(ids)
		})
	}

	return doc
}

/**
 * Get document metadata
 */
export function getDocumentMeta(doc: YIdealloDocument): StoredMeta {
	return {
		name: doc.m.get('name') as string | undefined,
		backgroundColor: doc.m.get('backgroundColor') as string | undefined,
		gridSize: doc.m.get('gridSize') as number | undefined,
		snapToGrid: doc.m.get('snapToGrid') as boolean | undefined
	}
}

/**
 * Update document metadata
 */
export function updateDocumentMeta(
	yDoc: Y.Doc,
	doc: YIdealloDocument,
	updates: Partial<StoredMeta>
): void {
	yDoc.transact(() => {
		if (updates.name !== undefined) {
			doc.m.set('name', updates.name)
		}
		if (updates.backgroundColor !== undefined) {
			doc.m.set('backgroundColor', updates.backgroundColor)
		}
		if (updates.gridSize !== undefined) {
			doc.m.set('gridSize', updates.gridSize)
		}
		if (updates.snapToGrid !== undefined) {
			doc.m.set('snapToGrid', updates.snapToGrid)
		}
	}, yDoc.clientID)
}

// vim: ts=4
