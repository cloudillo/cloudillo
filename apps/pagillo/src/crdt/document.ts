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

/** `m` collections stored flat as `<name>/<entry>` keys (`spellIgnore/<word>`: 1). */
const META_COLLECTIONS = new Set(['fonts', 'styleMap', 'spellIgnore'])

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

/**
 * Write meta keys; `undefined` deletes the key. `fonts`/`styleMap`/`spellIgnore` **merge** as
 * flat `<name>/<entry>` keys on `m` (no nested types, which concurrent creators would race to
 * create): each given entry is set (a `spellIgnore` word sets `spellIgnore/<word>` to 1), an
 * `undefined` entry value deletes that entry, unlisted entries stay. An `undefined` collection
 * deletes all its entries.
 */
export function setMeta(yDoc: Y.Doc, doc: YPagilloDocument, patch: Partial<StoredMeta>): void {
	yDoc.transact(() => {
		for (const [k, v] of Object.entries(patch)) {
			if (!META_COLLECTIONS.has(k)) {
				if (v === undefined) doc.m.delete(k)
				else doc.m.set(k, v)
				continue
			}
			const pre = `${k}/`
			if (v === undefined) {
				for (const key of [...doc.m.keys()]) if (key.startsWith(pre)) doc.m.delete(key)
				continue
			}
			const entries = Array.isArray(v)
				? v.map((w): [string, unknown] => [String(w), 1])
				: Object.entries(v as object)
			for (const [ek, ev] of entries) {
				if (ev === undefined) doc.m.delete(pre + ek)
				else if (doc.m.get(pre + ek) !== ev) doc.m.set(pre + ek, ev)
			}
		}
	}, yDoc.clientID)
}

// vim: ts=4
