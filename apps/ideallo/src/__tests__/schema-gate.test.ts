// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import * as Y from 'yjs'

import { getOrCreateDocument, IDEALLO_SCHEMA } from '../crdt/document.js'

describe('ideallo document schema gate', () => {
	it('stamps a writable document with the current schema', () => {
		const doc = getOrCreateDocument(new Y.Doc(), true, true)
		expect(doc.m.get('schema')).toBe(IDEALLO_SCHEMA)
	})

	it('does not stamp a read-only open', () => {
		const doc = getOrCreateDocument(new Y.Doc(), true, false)
		expect(doc.m.get('schema')).toBeUndefined()
	})

	it('leaves a newer-schema document uninitialized and unstamped', () => {
		const yDoc = new Y.Doc()
		yDoc.getMap('m').set('schema', IDEALLO_SCHEMA + 1)
		const doc = getOrCreateDocument(yDoc, true, true)
		expect(doc.m.get('initialized')).toBeUndefined()
		expect(doc.m.get('schema')).toBe(IDEALLO_SCHEMA + 1)
	})
})

// vim: ts=4
