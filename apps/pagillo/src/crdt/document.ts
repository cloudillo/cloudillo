// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Root handles of a publication Y.Doc (short keys).
 *
 * Unlike prezillo's `getOrCreateDocument`, opening never initialises anything: a new
 * publication stays empty (`secs.length === 0`) until a writer applies a template from the
 * gallery (`templates.ts`). Local writes use `yDoc.clientID` as transaction origin.
 */

import type * as Y from 'yjs'

import type { StoredMeta, YPagilloDocument } from './stored-types'

export function openPublication(yDoc: Y.Doc): YPagilloDocument {
	return {
		m: yDoc.getMap('m'),
		st: yDoc.getMap('st'),
		ms: yDoc.getMap('ms'),
		secs: yDoc.getArray('secs'),
		s: yDoc.getMap('s'),
		tx: yDoc.getMap('tx'),
		ln: yDoc.getMap('ln'),
		f: yDoc.getMap('f')
	}
}

/** True while no template has been applied (the gallery shows). */
export function isEmptyPublication(doc: YPagilloDocument): boolean {
	return doc.secs.length === 0
}

/** Write meta keys; `undefined` deletes the key. */
export function setMeta(yDoc: Y.Doc, doc: YPagilloDocument, patch: Partial<StoredMeta>): void {
	yDoc.transact(() => {
		for (const [k, v] of Object.entries(patch)) {
			if (v === undefined) doc.m.delete(k)
			else doc.m.set(k, v)
		}
	}, yDoc.clientID)
}

// vim: ts=4
