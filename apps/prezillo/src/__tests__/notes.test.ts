// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Speaker notes in `doc.vn`: migration from `StoredView.notes`, duplicate copies, delete removes,
 * a concurrent first-time create keeps the losing side's typing.
 */

import * as Y from 'yjs'

import {
	appendNotesDelta,
	deleteView,
	duplicateView,
	getOrCreateDocument,
	getOrCreateViewNotes,
	lostConcurrentCreate,
	toViewId
} from '../crdt'

function seed(yDoc: Y.Doc, notes?: string) {
	const id = toViewId('V1')
	yDoc.getMap('v').set(id, {
		name: 'Slide',
		x: 0,
		y: 0,
		width: 1920,
		height: 1080,
		...(notes && { notes })
	})
	yDoc.getArray<string>('vo').push([id])
	// Not empty: no initializeDocument
	yDoc.getArray('r').push([[0, 'X']])
	return id
}

describe('speaker notes', () => {
	it('migrate, follow duplicate, go with delete and come back on undo', () => {
		const yDoc = new Y.Doc()
		const id = toViewId('V1')
		yDoc.getMap('v').set(id, {
			name: 'Slide',
			x: 0,
			y: 0,
			width: 1920,
			height: 1080,
			notes: 'Hello'
		})
		yDoc.getArray<string>('vo').push([id])

		const doc = getOrCreateDocument(yDoc, true)
		expect(doc.vn.get(id)?.toString()).toBe('Hello')
		expect(doc.v.get(id)).not.toHaveProperty('notes')

		const dupId = duplicateView(yDoc, doc, id)
		const dup = doc.vn.get(dupId)
		expect(dup?.toString()).toBe('Hello')
		expect(dup).not.toBe(doc.vn.get(id))

		const undo = new Y.UndoManager([doc.v, doc.vo, doc.vn], {
			trackedOrigins: new Set([yDoc.clientID])
		})
		const original = doc.vn.get(id)!
		deleteView(yDoc, doc, id)
		expect(doc.vn.has(id)).toBe(false)

		undo.undo()
		const restored = doc.vn.get(id)!
		expect(restored.toString()).toBe('Hello')
		// A NotesEditor holding `original` must not append it again
		expect(restored).not.toBe(original)
		expect(lostConcurrentCreate(restored, original)).toBe(false)
	})

	it('read-only load does not migrate', () => {
		const yDoc = new Y.Doc()
		const id = seed(yDoc, 'Hello')
		const doc = getOrCreateDocument(yDoc, true, false)
		expect(doc.vn.has(id)).toBe(false)
		expect(doc.v.get(id)?.notes).toBe('Hello')
	})

	it('non-string notes do not break the load', () => {
		const yDoc = new Y.Doc()
		const id = seed(yDoc)
		yDoc.getMap('v').set(id, { name: 'Slide', width: 1920, height: 1080, notes: 42 })
		expect(() => getOrCreateDocument(yDoc, true)).not.toThrow()
	})

	it('migration replaces an existing empty entry', () => {
		const yDoc = new Y.Doc()
		const id = seed(yDoc, 'Hello')
		const empty = new Y.Text()
		yDoc.getMap<Y.Text>('vn').set(id, empty)

		const doc = getOrCreateDocument(yDoc, true)
		expect(doc.vn.get(id)).not.toBe(empty)
		expect(doc.vn.get(id)?.toString()).toBe('Hello')
		expect(doc.v.get(id)).not.toHaveProperty('notes')
	})

	it('concurrent migrations do not duplicate the text', () => {
		const a = new Y.Doc()
		const id = seed(a, 'Hello')
		a.getMap<Y.Text>('vn').set(id, new Y.Text())
		const b = new Y.Doc()
		Y.applyUpdate(b, Y.encodeStateAsUpdate(a))

		getOrCreateDocument(a, true)
		getOrCreateDocument(b, true)
		Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
		Y.applyUpdate(b, Y.encodeStateAsUpdate(a))

		expect(a.getMap<Y.Text>('vn').get(id)?.toString()).toBe('Hello')
		expect(b.getMap<Y.Text>('vn').get(id)?.toString()).toBe('Hello')
	})

	it('migration is not on the canvas undo stack', () => {
		const yDoc = new Y.Doc()
		const id = seed(yDoc, 'Hello')
		const pre = getOrCreateDocument(yDoc, false)
		const undo = new Y.UndoManager([pre.v, pre.vn], {
			trackedOrigins: new Set([yDoc.clientID])
		})

		const doc = getOrCreateDocument(yDoc, true)
		expect(doc.vn.get(id)?.toString()).toBe('Hello')
		expect(undo.undoStack).toHaveLength(0)
	})

	it('appendNotesDelta carries the losing create over to the winner', () => {
		const a = new Y.Doc()
		const b = new Y.Doc()
		const id = seed(a)
		Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
		const docA = getOrCreateDocument(a, false)
		const docB = getOrCreateDocument(b, false)

		const textA = getOrCreateViewNotes(a, docA, id)
		const textB = getOrCreateViewNotes(b, docB, id)
		textA.insert(0, 'from A')
		textB.insert(0, 'from B')
		const snapshots = new Map([
			[a, textA.toDelta()],
			[b, textB.toDelta()]
		])

		Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
		Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
		const [loser, loserDoc] = docA.vn.get(id) === textA ? [b, docB] : [a, docA]
		const winner = loserDoc.vn.get(id)!
		expect(lostConcurrentCreate(winner, loser === a ? textA : textB)).toBe(true)
		appendNotesDelta(loser, winner, snapshots.get(loser)!)
		Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
		Y.applyUpdate(a, Y.encodeStateAsUpdate(b))

		for (const doc of [docA, docB]) {
			const text = doc.vn.get(id)!.toString()
			expect(text).toContain('from A')
			expect(text).toContain('from B')
		}
	})
})

// vim: ts=4
