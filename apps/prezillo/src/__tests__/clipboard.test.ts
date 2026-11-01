// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Clipboard: a prezillo payload survives the codec, another app's does not, and collect → paste
 * into another document lands on the target view under new ids with rich text intact.
 */

import {
	decodeCanvasClipboard,
	encodeCanvasClipboard,
	isForeignClipboard,
	resolveForeignPaste
} from '@cloudillo/canvas-tools'
import * as Y from 'yjs'

import {
	CLIPBOARD_APP,
	clipboardFileRef,
	collectClipboard,
	type PrezilloClipboard,
	pasteClipboard
} from '../clipboard'
import { getOrCreateDocument, type StoredObject, toObjectId, toViewId, type ViewId } from '../crdt'

function makeDoc(viewId: ViewId) {
	const yDoc = new Y.Doc()
	yDoc.getMap('v').set(viewId, {
		name: 'Slide',
		x: 0,
		y: 0,
		width: 1920,
		height: 1080,
		showBorder: false
	})
	yDoc.getArray<string>('vo').push([viewId])
	return { yDoc, doc: getOrCreateDocument(yDoc, true) }
}

describe('prezillo clipboard', () => {
	it('round-trips through the codec and ignores other apps and garbage', () => {
		const payload = { objects: [], bounds: { x: 0, y: 0, width: 0, height: 0 } }
		const text = encodeCanvasClipboard(CLIPBOARD_APP, payload)
		expect(decodeCanvasClipboard<PrezilloClipboard>(text, CLIPBOARD_APP)).toMatchObject(payload)
		expect(
			decodeCanvasClipboard(encodeCanvasClipboard('ideallo', payload), CLIPBOARD_APP)
		).toBe(null)
		expect(decodeCanvasClipboard('cloudillo-canvas:v1{oops', CLIPBOARD_APP)).toBe(null)
		expect(decodeCanvasClipboard('hello', CLIPBOARD_APP)).toBe(null)
	})

	it('pastes onto the target view with new ids, offset and rich text', () => {
		const v1 = toViewId('V1')
		const src = makeDoc(v1)
		src.doc.o.set('R1', { t: 'R', vi: v1, xy: [10, 20], wh: [100, 50], si: 'MISSING' })
		src.doc.o.set('T1', { t: 'T', vi: v1, xy: [30, 40], wh: [200, 60] })
		const rt = new Y.Text()
		src.doc.rt.set('T1', rt)
		rt.insert(0, 'Hello', { bold: true })
		rt.insert(5, ' world\n')

		const payload = collectClipboard(src.doc, [toObjectId('R1'), toObjectId('T1')])
		expect(payload?.objects).toHaveLength(2)
		expect(payload?.bounds).toEqual({ x: 10, y: 20, width: 220, height: 80 })

		// Through JSON, as the system clipboard carries it
		const decoded = decodeCanvasClipboard<PrezilloClipboard>(
			encodeCanvasClipboard(CLIPBOARD_APP, payload as PrezilloClipboard),
			CLIPBOARD_APP
		) as PrezilloClipboard

		const v2 = toViewId('V2')
		const dst = makeDoc(v2)
		const ids = pasteClipboard(dst.yDoc, dst.doc, decoded, 5, 7, v2)
		expect(ids).toHaveLength(2)
		expect(ids).not.toContain('R1')
		expect(ids).not.toContain('T1')

		const rect = dst.doc.o.get(ids[0])
		expect(rect?.vi).toBe(v2)
		expect(rect?.xy).toEqual([15, 27])
		// A style the target document does not have is dropped
		expect((rect as { si?: string }).si).toBeUndefined()
		// Appended on top, after whatever the initialized document already holds
		expect(
			dst.doc.r
				.toArray()
				.map((ref) => ref[1])
				.slice(-ids.length)
		).toEqual(ids)

		expect(dst.doc.rt.get(ids[1])?.toDelta()).toEqual(rt.toDelta())
	})

	it('detects a different source document and drops objects whose file failed to link', async () => {
		const payload = {
			source: { fileId: 'PRES1', ownerTag: 'home.example' },
			objects: [
				{ object: { type: 'image', x: 0, y: 0, width: 1, height: 1, fileId: 'IMG1' } },
				{ object: { type: 'document', x: 0, y: 0, width: 1, height: 1, fileId: 'DOC1' } },
				{ object: { type: 'rect', x: 0, y: 0, width: 1, height: 1 } }
			],
			bounds: { x: 0, y: 0, width: 1, height: 1 }
		} as unknown as PrezilloClipboard
		expect(isForeignClipboard(payload.source, 'PRES1')).toBe(false)
		expect(isForeignClipboard(payload.source, 'PRES2')).toBe(true)

		const refs: string[] = []
		const res = await resolveForeignPaste(
			payload,
			'PRES2',
			clipboardFileRef,
			async (ref) => {
				refs.push(ref)
				return ref.endsWith(':DOC1') ? undefined : {}
			},
			new Set(),
			'me.example'
		)
		expect(refs).toEqual(['cl:file/home.example:IMG1', 'cl:file/home.example:DOC1'])
		expect(res.failed).toBe(1)
		expect(res.payload.objects.map((o) => o.object.type)).toEqual(['image', 'rect'])
	})

	it('drops id / prototype / container links from a crafted payload', () => {
		const v1 = toViewId('V1')
		const dst = makeDoc(v1)
		const payload = {
			objects: [
				{
					object: {
						type: 'rect',
						x: 0,
						y: 0,
						width: 1,
						height: 1,
						id: 'EXISTING',
						prototypeId: 'P1',
						parentId: 'C1'
					}
				}
			],
			bounds: { x: 0, y: 0, width: 1, height: 1 }
		} as unknown as PrezilloClipboard
		const [id] = pasteClipboard(dst.yDoc, dst.doc, payload, 0, 0, v1)
		expect(id).not.toBe('EXISTING')
		const stored = dst.doc.o.get(id) as unknown as Record<string, unknown>
		expect(stored.proto).toBeUndefined()
		expect(stored.p).toBeUndefined()
		expect(dst.doc.o.has(toObjectId('EXISTING'))).toBe(false)
	})

	it('skips an item whose file ref is not id-shaped', () => {
		const v1 = toViewId('V1')
		const dst = makeDoc(v1)
		const payload = {
			objects: [
				{ object: { type: 'image', x: 0, y: 0, width: 1, height: 1, fileId: '../x' } },
				{ object: { type: 'rect', x: 0, y: 0, width: 1, height: 1 } }
			],
			bounds: { x: 0, y: 0, width: 1, height: 1 }
		} as unknown as PrezilloClipboard
		const ids = pasteClipboard(dst.yDoc, dst.doc, payload, 0, 0, v1)
		expect(ids).toHaveLength(1)
		expect(dst.doc.o.get(ids[0])?.t).toBe('R')
	})

	it('copies a template instance as a standalone object', () => {
		const v1 = toViewId('V1')
		const { yDoc, doc } = makeDoc(v1)
		doc.o.set('P1', { t: 'R', xy: [10, 20], wh: [100, 50] })
		doc.o.set('I1', { t: 'R', vi: v1, proto: 'P1' } as unknown as StoredObject)

		const payload = collectClipboard(doc, [toObjectId('I1')])
		expect(payload?.bounds).toEqual({ x: 10, y: 20, width: 100, height: 50 })

		const [id] = pasteClipboard(yDoc, doc, payload as PrezilloClipboard, 0, 0, v1)
		const stored = doc.o.get(id)
		expect(stored?.xy).toEqual([10, 20])
		expect(stored?.proto).toBeUndefined()
	})
})

// vim: ts=4
