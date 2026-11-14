// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import * as Y from 'yjs'

import { getOrCreateDocument, PREZILLO_SCHEMA } from '../crdt'

describe('prezillo document schema gate', () => {
	it('stamps a writable document with the current schema', () => {
		const yDoc = new Y.Doc()
		const doc = getOrCreateDocument(yDoc, true, true)
		expect(doc.m.get('schema')).toBe(PREZILLO_SCHEMA)
	})

	it('leaves a newer-schema document uninitialized and unstamped', () => {
		const yDoc = new Y.Doc()
		yDoc.getMap('m').set('schema', PREZILLO_SCHEMA + 1)
		const doc = getOrCreateDocument(yDoc, true, true)
		expect(doc.r.length).toBe(0)
		expect(doc.m.get('schema')).toBe(PREZILLO_SCHEMA + 1)
	})

	it('does not stamp a read-only open', () => {
		const yDoc = new Y.Doc()
		const doc = getOrCreateDocument(yDoc, true, false)
		expect(doc.m.get('schema')).toBeUndefined()
	})
})
