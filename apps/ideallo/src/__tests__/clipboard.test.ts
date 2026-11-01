// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

// Imports the codec from the BUILT @cloudillo/canvas-tools (`pnpm -C libs/canvas-tools build`)

import {
	canvasPasteOffset,
	decodeCanvasClipboard,
	encodeCanvasClipboard,
	isForeignClipboard,
	linkClipboardFiles,
	resolveForeignPaste
} from '@cloudillo/canvas-tools'
import * as Y from 'yjs'

import {
	CLIPBOARD_APP,
	clipboardFileRef,
	collectClipboard,
	type IdealloClipboard,
	pasteClipboard
} from '../clipboard.js'
import { getOrCreateDocument } from '../crdt/document.js'
import type { ObjectId, StoredObject } from '../crdt/index.js'

describe('canvas clipboard codec', () => {
	it('round-trips a payload for the same app', () => {
		const text = encodeCanvasClipboard('ideallo', { n: 1 })
		expect(text.startsWith('cloudillo-canvas:v1')).toBe(true)
		expect(decodeCanvasClipboard<{ n: number }>(text, 'ideallo')?.n).toBe(1)
	})

	it('ignores another app, garbage and broken JSON', () => {
		expect(decodeCanvasClipboard(encodeCanvasClipboard('prezillo', {}), 'ideallo')).toBeNull()
		expect(decodeCanvasClipboard('hello', 'ideallo')).toBeNull()
		expect(decodeCanvasClipboard('cloudillo-canvas:v1{bad', 'ideallo')).toBeNull()
	})

	it('centres on the pointer, or nudges without one', () => {
		const b = { x: 0, y: 0, width: 10, height: 20 }
		expect(canvasPasteOffset(b, null)).toEqual([20, 20])
		expect(canvasPasteOffset(b, [100, 100])).toEqual([95, 90])
	})
})

describe('ideallo collect / paste', () => {
	function source() {
		const yDoc = new Y.Doc()
		const doc = getOrCreateDocument(yDoc)
		const put = (id: string, rec: unknown) => {
			doc.o.set(id, rec as StoredObject)
			doc.r.push([id])
		}
		const shared = new Y.Text()
		shared.insert(0, 'hello')
		doc.txt.set('shared', shared)
		put('rect', { t: 'R', xy: [10, 20], wh: [100, 50], tid: 'shared' })
		put('other', { t: 'R', xy: [500, 500], wh: [10, 10] })
		doc.paths.set('fh', 'M0 0 L10 10')
		put('fh', { t: 'F', xy: [0, 0], wh: [10, 10] })
		const geo = new Y.Array<number>()
		geo.push([0, 0, 10, 0, 5, 10])
		doc.geo.set('poly', geo)
		put('poly', { t: 'P', xy: [0, 0], wh: [10, 10] })
		put('arrow', { t: 'C', xy: [0, 0], wh: [50, 50], so_: 'rect', eo: 'other' })
		return doc
	}

	it('pastes fresh, offset, independent copies into another document', () => {
		const src = source()
		const collected = collectClipboard(src, ['rect', 'fh', 'poly', 'arrow'] as ObjectId[])
		expect(collected?.objects).toHaveLength(4)
		// Through the real wire format
		const payload = decodeCanvasClipboard<IdealloClipboard>(
			encodeCanvasClipboard(CLIPBOARD_APP, collected as IdealloClipboard),
			CLIPBOARD_APP
		) as IdealloClipboard

		const yDoc = new Y.Doc()
		const doc = getOrCreateDocument(yDoc)
		const ids = pasteClipboard(yDoc, doc, payload, 5, 7)
		expect(ids).toHaveLength(4)
		expect(ids.some((id) => ['rect', 'fh', 'poly', 'arrow'].includes(id))).toBe(false)
		expect(doc.r.toArray()).toEqual(ids)

		const [rect, fh, poly, arrow] = ids
		const r = doc.o.get(rect) as { xy: number[]; tid?: string }
		expect(r.xy).toEqual([15, 27])
		expect(r.tid).toBeUndefined()
		expect(doc.txt.get(rect)?.toString()).toBe('hello')
		expect(doc.paths.get(fh)).toBe('M0 0 L10 10')
		expect(doc.geo.get(poly)?.toArray()).toEqual([5, 7, 15, 7, 10, 17])

		// Binding to a copied shape is remapped; the one to an uncopied shape is dropped
		const a = doc.o.get(arrow) as { so_?: string; eo?: string }
		expect(a.so_).toBe(rect)
		expect(a.eo).toBeUndefined()
	})

	it('drops link fields from a crafted payload, so the copy never shares data', () => {
		const yDoc = new Y.Doc()
		const doc = getOrCreateDocument(yDoc)
		const original = new Y.Text()
		original.insert(0, 'secret')
		doc.txt.set('victim', original)
		doc.o.set('victim', { t: 'R', xy: [0, 0], wh: [10, 10] } as unknown as StoredObject)
		doc.r.push(['victim'])

		const crafted = {
			objects: [
				{
					id: 'x',
					stored: {
						t: 'R',
						xy: [0, 0],
						wh: [10, 10],
						tid: 'victim',
						pid: 'v',
						gid: 'v',
						ed: 1
					}
				}
			],
			bounds: { x: 0, y: 0, width: 10, height: 10 }
		} as unknown as IdealloClipboard
		const [id] = pasteClipboard(yDoc, doc, crafted, 0, 0)
		const rec = doc.o.get(id) as unknown as Record<string, unknown>
		expect(rec.tid).toBeUndefined()
		expect(rec.pid).toBeUndefined()
		expect(rec.gid).toBeUndefined()
		expect(rec.ed).toBeUndefined()

		// Its text, if ever created, lives under its own id
		const own = new Y.Text()
		own.insert(0, 'edited')
		doc.txt.set(id, own)
		expect(doc.txt.get('victim')?.toString()).toBe('secret')
	})

	it('returns null for ids that do not exist', () => {
		expect(collectClipboard(source(), ['nope'] as ObjectId[])).toBeNull()
	})
})

describe('paste from another board', () => {
	const payload = {
		source: { fileId: 'BOARD1', ownerTag: 'home.example' },
		objects: [
			{ id: 'a', stored: { t: 'I', xy: [0, 0], wh: [10, 10], fid: 'IMG1' } },
			{ id: 'b', stored: { t: 'R', xy: [0, 0], wh: [10, 10] } },
			{ id: 'c', stored: { t: 'D', xy: [0, 0], wh: [10, 10], fid: '@tmp' } }
		],
		bounds: { x: 0, y: 0, width: 10, height: 10 }
	} as unknown as IdealloClipboard

	it('detects a different source board; same board needs no linking', () => {
		expect(isForeignClipboard(payload.source, 'BOARD1')).toBe(false)
		expect(isForeignClipboard(payload.source, 'BOARD2')).toBe(true)
		expect(isForeignClipboard(undefined, 'BOARD2')).toBe(true)
	})

	it('links each referenced file and drops the objects whose link failed', async () => {
		// No `jest` global under ESM: record the calls by hand
		const refs: string[] = []
		const link = async (ref: string) => {
			refs.push(ref)
			return ref.endsWith(':IMG1') ? {} : undefined
		}
		const res = await resolveForeignPaste(
			payload,
			'BOARD2',
			clipboardFileRef,
			link,
			new Set(),
			'me.example'
		)
		// A temp id is never sent: it cannot be linked
		expect(refs).toEqual(['cl:file/home.example:IMG1'])
		expect(res.failed).toBe(1)
		expect(res.payload.objects.map((o) => o.id)).toEqual(['a', 'b'])
	})

	it('pastes a same-board payload of known files unchanged, without linking', async () => {
		const link = async () => {
			throw new Error('must not link')
		}
		const res = await resolveForeignPaste(
			payload,
			'BOARD1',
			clipboardFileRef,
			link,
			new Set(['IMG1']),
			'me.example'
		)
		expect(res).toEqual({ payload, failed: 0 })
	})

	it('links nothing when the owner tag or a file id is not id-shaped', async () => {
		const refs: string[] = []
		const link = async (ref: string) => {
			refs.push(ref)
			return {}
		}
		const badOwner = await linkClipboardFiles(['IMG1'], '../evil', link)
		expect([...badOwner]).toEqual(['IMG1'])
		const badId = await linkClipboardFiles(['../x', 'IMG1'], 'home.example', link)
		expect([...badId]).toEqual(['../x'])
		expect(refs).toEqual(['cl:file/home.example:IMG1'])
	})

	it('skips an item whose file ref is not id-shaped on a same-board paste', () => {
		const bad = {
			objects: [
				{ id: 'a', stored: { t: 'I', xy: [0, 0], wh: [10, 10], fid: '../x' } },
				{ id: 'b', stored: { t: 'I', xy: [0, 0], wh: [10, 10], fid: 'IMG1' } }
			],
			bounds: { x: 0, y: 0, width: 10, height: 10 }
		} as unknown as IdealloClipboard
		const yDoc = new Y.Doc()
		const doc = getOrCreateDocument(yDoc)
		const ids = pasteClipboard(yDoc, doc, bad, 0, 0)
		expect(ids).toHaveLength(1)
		expect((doc.o.get(ids[0]) as { fid?: string }).fid).toBe('IMG1')
	})

	it('skips unknown types, a missing wh and non-numeric geometry', () => {
		const yDoc = new Y.Doc()
		const doc = getOrCreateDocument(yDoc)
		const crafted = {
			objects: [
				{ id: 'a', stored: { t: 'Z', xy: [0, 0], wh: [10, 10] } },
				{ id: 'b', stored: { t: 'R', xy: [0, 0] } },
				{ id: 'c', stored: { t: 'P', xy: [0, 0] }, geo: ['1', '2'] },
				{ id: 'd', stored: { t: 'P', xy: [0, 0] }, geo: [1, 2, 3] },
				{ id: 'e', stored: { t: 'R', xy: [0, 0], wh: [10, 10] } }
			],
			bounds: { x: 0, y: 0, width: 10, height: 10 }
		} as unknown as IdealloClipboard
		const ids = pasteClipboard(yDoc, doc, crafted, 0, 0)
		expect(ids).toHaveLength(1)
		expect(doc.o.get(ids[0])?.t).toBe('R')
	})

	it('skips an item without a string id', () => {
		const yDoc = new Y.Doc()
		const doc = getOrCreateDocument(yDoc)
		const crafted = {
			objects: [
				{ id: 7, stored: { t: 'R', xy: [0, 0], wh: [10, 10] } },
				{ id: 'b', stored: { t: 'R', xy: [0, 0], wh: [10, 10] } }
			],
			bounds: { x: 0, y: 0, width: 10, height: 10 }
		} as unknown as IdealloClipboard
		expect(pasteClipboard(yDoc, doc, crafted, 0, 0)).toHaveLength(1)
	})
})

// vim: ts=4
