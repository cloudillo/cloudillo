// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Document initialization and structure access
 */

import * as Y from 'yjs'
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
