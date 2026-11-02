// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

// Text-anchored frames: marker resolution, legacy float migration, the load-time sweep, deletion
// with the text, paste, and the section / anchor operations.

import { FX, type Publication } from '@cloudillo/typeset'
import * as Y from 'yjs'

import { openPublication } from '../crdt/document.js'
import {
	FULL_CROP,
	isFlow,
	newFrameMap,
	newSectionMap,
	readFrame,
	sectionOf
} from '../crdt/entities.js'
import {
	anchorFrame,
	canLinkTarget,
	embedPara,
	inlineToFrame,
	linkFrame
} from '../crdt/frame-ops.js'
import {
	dedupeMarkers,
	migrateFloats,
	NORMALIZE_ORIGIN,
	normalizeStory,
	sweepOrphanStories
} from '../crdt/normalize.js'
import { deleteSection, duplicateSection } from '../crdt/section-ops.js'
import type { StoredFrame, StoredSection, StoredTextFrameData } from '../crdt/stored-types.js'
import {
	type DeltaOp,
	deltaToParagraphs,
	floatFrameId,
	type MarkerWins,
	markerWins,
	toEnginePublication
} from '../crdt/type-converters.js'
import { copyFrames, pasteDelta, readDelta, readFrames } from '../editor/clipboard.js'
import { type PageInfo, positionOf } from '../editor/frames.js'
import { deleteRange } from '../editor/text-edit.js'

/** A "moves with text" image frame anchored to story `story`. */
const img = (story: string, extra: Partial<StoredFrame> = {}): StoredFrame => ({
	t: 'img',
	anchor: { txt: story, rel: 'text' },
	x: 0,
	y: 0,
	w: 100,
	h: 50,
	rot: 0,
	z: 0,
	wrap: { mode: 'box', off: 0 },
	data: { fileId: 'file', crop: FULL_CROP, fit: 'contain', alt: '' },
	...extra
})

/** A text box with `data`, anchored by `anchor`. */
const box = (anchor: StoredFrame['anchor'], data: StoredTextFrameData): StoredFrame => ({
	...img('S'),
	t: 'txt',
	anchor,
	data
})

/** Story `id` holding `s` (a `'\n'`-terminated string). */
const story = (doc: ReturnType<typeof setup>['doc'], id: string, s = '\n') => {
	const t = new Y.Text()
	doc.tx.set(id, t)
	t.insert(0, s)
	return t
}

const marker = (id: string): DeltaOp => ({ insert: { frame: id } })
const IMG: DeltaOp = { insert: { img: { fileId: 'f', w: 10, h: 10, alt: '' } } }
const end: DeltaOp = { insert: '\n', attributes: { bid: 'P' } }
const FLOAT: DeltaOp = {
	insert: { img: { fileId: 'f', w: 10, h: 10, alt: '', float: { side: 'r', w: 0.5 } } }
}

/** Section s1 → story S holding `ops`. */
function setup(ops: DeltaOp[], yDoc = new Y.Doc()) {
	const doc = openPublication(yDoc)
	const t = new Y.Text()
	doc.tx.set('S', t)
	doc.s.set('s1', newSectionMap({ story: 'S' } as StoredSection))
	doc.secs.push(['s1'])
	t.applyDelta(ops)
	return { yDoc, doc, t }
}

/** `{ frame }` ids of the engine story's runs, in order (`''` = ignored marker). */
const frameRuns = (pub: Publication) =>
	pub.sections[0].story.paragraphs.flatMap((p) =>
		Array.isArray(p.runs)
			? p.runs.flatMap((r) => (r.embed && 'frame' in r.embed ? [r.embed.frame] : []))
			: []
	)

/** Story `t`'s `{ frame }` marker ids, in order. */
const markers = (t: Y.Text) =>
	(t.toDelta() as DeltaOp[]).flatMap((op) =>
		typeof op.insert === 'object' && 'frame' in op.insert ? [op.insert.frame as string] : []
	)

describe('adapter marker resolution', () => {
	it('lets the first marker of a frame win; later ones and frame-less ones are ignored', () => {
		const { doc } = setup([{ insert: 'a' }, marker('A'), marker('A'), marker('X'), end])
		doc.f.set('A', newFrameMap(img('S')))
		doc.f.set('B', newFrameMap(img('S')))
		const marks = new Map<string, MarkerWins>()
		const pub = toEnginePublication(doc, marks)
		expect(frameRuns(pub)).toEqual(['A', '', ''])
		expect(marks.get('S')?.get('A')).toEqual({ at: 1 })
		expect(pub.frames.A?.anchor).toMatchObject({ txt: 'S', rel: 'text' })
		// No winning marker: not drawn.
		expect(pub.frames.B).toBeUndefined()
	})

	it('ignores a marker of a frame anchored to another story', () => {
		const { doc } = setup([marker('A'), end])
		doc.f.set('A', newFrameMap(img('T')))
		const pub = toEnginePublication(doc)
		expect(frameRuns(pub)).toEqual([''])
		expect(pub.frames.A).toBeUndefined()
	})

	it('reads a legacy float as a marker with a synthetic frame', () => {
		const { doc } = setup([FLOAT, end])
		const id = floatFrameId('S', 'P', 0)
		const pub = toEnginePublication(doc)
		expect(frameRuns(pub)).toEqual([id])
		expect(pub.frames[id]).toMatchObject({
			anchor: { txt: 'S', rel: 'text', side: 'r' },
			wCol: 0.5
		})
	})
})

describe('migrateFloats', () => {
	const migrate = (yDoc: Y.Doc) => {
		const doc = openPublication(yDoc)
		yDoc.transact(() => {
			const t = doc.tx.get('S') as Y.Text
			normalizeStory(t)
			migrateFloats(doc, 'S', true)
		}, NORMALIZE_ORIGIN)
	}

	it('writes the marker and the frame under the deterministic id', () => {
		const { yDoc, doc, t } = setup([FLOAT, end])
		migrate(yDoc)
		const id = floatFrameId('S', 'P', 0)
		expect(markers(t)).toEqual([id])
		expect(readFrame(doc.f.get(id))).toMatchObject({
			anchor: { txt: 'S', rel: 'text', side: 'r' },
			wCol: 0.5
		})
	})

	it('keeps a frame a peer already wrote under that id', () => {
		const { yDoc, doc } = setup([FLOAT, end])
		const id = floatFrameId('S', 'P', 0)
		doc.f.set(id, newFrameMap(img('S', { x: 7 })))
		migrate(yDoc)
		expect(readFrame(doc.f.get(id))?.x).toBe(7)
	})

	it('never overwrites an existing frame under that id, whatever its anchor', () => {
		const { yDoc, doc } = setup([FLOAT, end])
		const id = floatFrameId('S', 'P', 0)
		doc.f.set(id, newFrameMap(img('S', { anchor: { sec: 's1', page: 0 }, x: 7 })))
		const before = readFrame(doc.f.get(id))
		expect(toEnginePublication(doc).frames[id]?.anchor).toEqual({ sec: 's1', page: 0 })
		migrate(yDoc)
		expect(readFrame(doc.f.get(id))).toEqual(before)
	})

	it('converges when two peers migrate concurrently, one marker winning', () => {
		const { yDoc: a } = setup([FLOAT, end])
		const b = new Y.Doc()
		Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
		migrate(a)
		migrate(b)
		Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
		Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
		const doc = openPublication(a)
		const id = floatFrameId('S', 'P', 0)
		expect([...doc.f.keys()]).toEqual([id])
		expect(frameRuns(toEnginePublication(doc)).filter((x) => x)).toEqual([id])
		expect(markers(doc.tx.get('S') as Y.Text)).toEqual([id, id])
		// Every flush dedupes a touched flow story, so the losing duplicate goes at once.
		a.transact(() => dedupeMarkers(doc, 'S'), NORMALIZE_ORIGIN)
		expect(markers(doc.tx.get('S') as Y.Text)).toEqual([id])
	})
})

describe('sweepOrphanStories (text anchors)', () => {
	const sweep = (yDoc: Y.Doc, doc: ReturnType<typeof setup>['doc']) =>
		yDoc.transact(() => sweepOrphanStories(doc), NORMALIZE_ORIGIN)

	it('drops duplicate markers, keeps frame-less ones, never drops frames', () => {
		const { yDoc, doc, t } = setup([marker('A'), marker('A'), marker('Z'), end])
		doc.f.set('A', newFrameMap(img('S')))
		doc.f.set('B', newFrameMap(img('S')))
		sweep(yDoc, doc)
		// `Z`'s frame may still arrive from a peer.
		expect(markers(t)).toEqual(['A', 'Z'])
		expect(doc.f.has('A')).toBe(true)
		expect(doc.f.has('B')).toBe(true)
	})

	it('keeps a non-winning marker whose frame is anchored elsewhere, and the frame', () => {
		const { yDoc, doc, t } = setup([marker('A'), end])
		doc.f.set('A', newFrameMap(img('S2')))
		sweep(yDoc, doc)
		expect(markers(t)).toEqual(['A'])
		expect(doc.f.has('A')).toBe(true)
	})

	it('drops a duplicate in an earlier section of a marker winning in a later one', () => {
		const { yDoc, doc, t } = setup([marker('A'), end])
		const t2 = story(doc, 'S2')
		t2.insertEmbed(0, { frame: 'A' })
		doc.s.set('s2', newSectionMap({ story: 'S2' } as StoredSection))
		doc.secs.push(['s2'])
		doc.f.set('A', newFrameMap(img('S2')))
		sweep(yDoc, doc)
		expect(markers(t)).toEqual([])
		expect(markers(t2)).toEqual(['A'])
	})

	it('keeps an unknown-anchor frame opaque: marker, frame and story stay, nothing drawn', () => {
		const { yDoc, doc, t } = setup([{ insert: 'a' }, marker('X'), end])
		story(doc, 'XS', 'x\n')
		doc.f.set(
			'X',
			new Y.Map<unknown>([
				['t', 'txt'],
				['anchor', { txt: 'S', rel: 'para' }],
				['story', 'XS']
			])
		)
		sweep(yDoc, doc)
		expect(markers(t)).toEqual(['X'])
		expect(doc.f.has('X')).toBe(true)
		expect(doc.tx.has('XS')).toBe(true)
		expect(frameRuns(toEnginePublication(doc))).not.toContain('X')
	})
})

describe('flowStories', () => {
	it('ignores a section that is not in secs', () => {
		const { yDoc, doc } = setup([end])
		story(doc, 'S2')
		doc.s.set('s2', newSectionMap({ story: 'S2' } as StoredSection))
		doc.f.set('A', newFrameMap({ ...img('S'), anchor: { sec: 's1', page: 0 } }))
		expect(isFlow(doc, 'S')).toBe(true)
		expect(isFlow(doc, 'S2')).toBe(false)
		expect(anchorFrame(yDoc, doc, 'A', { txt: 'S2', rel: 'text' }, {}, 0)).toBe(false)
	})
})

describe('deleteRange (text anchors)', () => {
	it('deletes the frame of a winning marker it deletes', () => {
		const { doc, t } = setup([{ insert: 'ab' }, marker('A'), { insert: 'cd' }, end])
		doc.f.set('A', newFrameMap(img('S')))
		deleteRange(t, 0, 1)
		expect(doc.f.has('A')).toBe(true)
		deleteRange(t, 0, 3)
		expect(t.toString()).toBe('d\n')
		expect(doc.f.has('A')).toBe(false)
	})

	it('keeps the frame when only a losing marker goes', () => {
		const { doc, t } = setup([{ insert: 'a' }, marker('A'), marker('A'), end])
		doc.f.set('A', newFrameMap(img('S')))
		deleteRange(t, 2, 3)
		expect(markers(t)).toEqual(['A'])
		expect(doc.f.has('A')).toBe(true)
	})
})

describe('pasteDelta (text anchors)', () => {
	it('clones each snapshot once, under a fresh id, anchored to the target story', () => {
		const { doc, t } = setup([end])
		const frames = { old: { f: img('Other') } }
		pasteDelta(doc, t, 0, [marker('old'), { insert: 'x' }, marker('old')], frames)
		const [id, ...rest] = markers(t)
		expect(rest).toEqual([])
		expect(id).not.toBe('old')
		expect(doc.f.has('old')).toBe(false)
		expect(readFrame(doc.f.get(id))?.anchor).toMatchObject({ txt: 'S', rel: 'text' })
		// A second paste of the same clipboard: another fresh id.
		pasteDelta(doc, t, 0, [marker('old')], frames)
		const ids = markers(t)
		expect(new Set(ids).size).toBe(2)
	})

	it('creates at most 256 frames per paste', () => {
		const { doc, t } = setup([end])
		const frames = Object.fromEntries(
			Array.from({ length: 300 }, (_, i) => [`o${i}`, { f: img('Other') }])
		)
		pasteDelta(
			doc,
			t,
			0,
			Object.keys(frames).map((id) => marker(id)),
			frames
		)
		expect(doc.f.size).toBe(256)
		expect(markers(t)).toHaveLength(256)
	})

	it('clamps pasted geometry', () => {
		const { doc, t } = setup([end])
		const frames = { old: { f: img('Other', { w: 1e12, h: -5, x: -3, rot: 999 }) } }
		pasteDelta(doc, t, 0, [marker('old')], frames)
		const f = readFrame(doc.f.get(markers(t)[0]))
		expect(f).toMatchObject({ w: 14400 * FX, h: FX, x: 0, rot: 180 })
	})

	it('clamps z, wrap gap and wCol, and drops undeclared data keys', () => {
		const { doc, t } = setup([end])
		const hostile = img('Other', {
			z: 1e12,
			wCol: 7,
			wrap: { mode: 'box', off: 1e12 },
			data: {
				fileId: 'file',
				crop: FULL_CROP,
				fit: 'contain',
				alt: '',
				evil: 'x'
			} as StoredFrame['data']
		})
		pasteDelta(doc, t, 0, [marker('old')], { old: { f: hostile } })
		const f = readFrame(doc.f.get(markers(t)[0]))
		expect(f).toMatchObject({ z: 1e6, wCol: 1, wrap: { mode: 'box', off: FX } })
		expect(f?.data).not.toHaveProperty('evil')
		expect(f?.data).toMatchObject({ fileId: 'file', fit: 'contain' })
	})

	it('keeps only short colour strings and clamps sizes of a text box', () => {
		const { doc, t } = setup([end])
		const data = { fill: 'x'.repeat(65), stroke: 'red', strokeW: -3, inset: 1e12, evil: 1 }
		const frames = { old: { f: box({ txt: 'Other', rel: 'text' }, data) } }
		pasteDelta(doc, t, 0, [marker('old')], frames)
		const d = readFrame(doc.f.get(markers(t)[0]))?.data as Record<string, unknown>
		expect(d).toMatchObject({ stroke: 'red', strokeW: 0, inset: 14400 * FX })
		expect(d).not.toHaveProperty('fill')
		expect(d).not.toHaveProperty('evil')
	})

	it('round-trips a text box through the clipboard JSON', () => {
		const src = setup([{ insert: 'a' }, marker('A'), end])
		story(src.doc, 'AS', 'hi\n')
		src.doc.f.set('A', newFrameMap(box({ txt: 'S', rel: 'text' }, { story: 'AS' })))
		const frames = copyFrames(src.doc, 'S', 0, src.t.length)
		const json = JSON.stringify({ v: 1, ops: src.t.toDelta(), frames })
		const { doc, t } = setup([end])
		pasteDelta(doc, t, 0, readDelta(json) ?? [], readFrames(json))
		const [id, ...rest] = markers(t)
		expect(rest).toEqual([])
		expect(id).not.toBe('A')
		const f = readFrame(doc.f.get(id))
		expect(f?.anchor).toMatchObject({ txt: 'S', rel: 'text' })
		const d = f?.data as StoredTextFrameData
		expect(d.story).not.toBe('AS')
		expect(doc.tx.get(d.story ?? '')?.toString()).toBe('hi\n')
		expect(d.chain).toBeUndefined()
	})

	it('drops a snapshot chain and markers nested in its text', () => {
		const { doc, t } = setup([end])
		const f = box({ txt: 'Other', rel: 'text' }, { story: 'x', chain: ['y'] })
		const text = [{ insert: 'yo' }, marker('z'), { insert: '\n' }]
		pasteDelta(doc, t, 0, [marker('old')], { old: { f, text } })
		const d = readFrame(doc.f.get(markers(t)[0]))?.data as StoredTextFrameData
		expect(d.chain).toBeUndefined()
		expect(markers(doc.tx.get(d.story ?? '') as Y.Text)).toEqual([])
	})

	it('refuses emb and page-anchored snapshots', () => {
		const { doc, t } = setup([end])
		const emb = { ...img('Other'), t: 'emb', data: {} } as StoredFrame
		const page = { ...img('Other'), anchor: { sec: 's1', page: 0 } } as StoredFrame
		pasteDelta(doc, t, 0, [marker('e'), marker('p')], { e: { f: emb }, p: { f: page } })
		expect(markers(t)).toEqual([])
		expect(doc.f.size).toBe(0)
	})

	it('drops a marker without a snapshot', () => {
		const { doc, t } = setup([end])
		pasteDelta(doc, t, 0, [marker('A'), { insert: 'x' }])
		expect(markers(t)).toEqual([])
		expect(t.toString()).toBe('x\n')
	})
})

describe('section ops (text anchors)', () => {
	const two = () => {
		const r = setup([{ insert: 'a' }, end, { insert: 'b' }, marker('A'), end])
		r.doc.f.set('A', newFrameMap(img('S')))
		return r
	}

	it('duplicateSection clones text-anchored frames with winning markers', () => {
		const { yDoc, doc } = two()
		const copy = duplicateSection(yDoc, doc, 's1', ' (copy)') as string
		const story = sectionOf(doc, copy)?.story ?? ''
		const [[id]] = [...markerWins(doc, story)]
		expect(id).not.toBe('A')
		expect(readFrame(doc.f.get(id))?.anchor).toMatchObject({ txt: story })
		expect(markerWins(doc, 'S').has('A')).toBe(true)
		expect(readFrame(doc.f.get('A'))?.anchor).toMatchObject({ txt: 'S' })
	})

	it('deleteSection deletes its text-anchored frames', () => {
		const { yDoc, doc } = two()
		deleteSection(yDoc, doc, 's1')
		expect(doc.f.has('A')).toBe(false)
	})
})

describe('anchorFrame', () => {
	it('refuses a marker inside a table cell', () => {
		const cell = { 'table-cell': { 'data-row': 'r1' }, 'table-cell-block': 'c1', bid: 'C' }
		const { yDoc, doc, t } = setup([{ insert: 'x' }, { insert: '\n', attributes: cell }, end])
		doc.f.set('A', newFrameMap({ ...img('S'), anchor: { sec: 's1', page: 0 } }))
		expect(anchorFrame(yDoc, doc, 'A', { txt: 'S', rel: 'text' }, {}, 1)).toBe(false)
		expect(markers(t)).toEqual([])
		expect(anchorFrame(yDoc, doc, 'A', { txt: 'S', rel: 'text' }, {}, 2)).toBe(true)
	})

	it('refuses a marker inside an embed-only paragraph', () => {
		const { yDoc, doc, t } = setup([{ insert: 'a\n' }, IMG, end])
		doc.f.set('A', newFrameMap({ ...img('S'), anchor: { sec: 's1', page: 0 } }))
		expect(embedPara(t, 1)).toBe(false)
		expect(embedPara(t, 2)).toBe(true)
		expect(embedPara(t, 3)).toBe(true)
		expect(anchorFrame(yDoc, doc, 'A', { txt: 'S', rel: 'text' }, {}, 2)).toBe(false)
		expect(anchorFrame(yDoc, doc, 'A', { txt: 'S', rel: 'text' }, {}, 3)).toBe(false)
		expect(markers(t)).toEqual([])
		expect(anchorFrame(yDoc, doc, 'A', { txt: 'S', rel: 'text' }, {}, 1)).toBe(true)
	})

	it("refuses a marker after the story's final newline", () => {
		const { yDoc, doc, t } = setup([{ insert: 'ab' }, end])
		doc.f.set('A', newFrameMap({ ...img('S'), anchor: { sec: 's1', page: 0 } }))
		expect(anchorFrame(yDoc, doc, 'A', { txt: 'S', rel: 'text' }, {}, t.length)).toBe(false)
		expect(markers(t)).toEqual([])
		expect(anchorFrame(yDoc, doc, 'A', { txt: 'S', rel: 'text' }, {}, t.length - 1)).toBe(true)
	})

	const wins = (doc: ReturnType<typeof setup>['doc']) => markerWins(doc, 'S').get('A')?.at

	it('page → text writes the marker, anchor and wCol; text → page removes them', () => {
		const { yDoc, doc, t } = setup([{ insert: 'ab' }, end])
		doc.f.set('A', newFrameMap({ ...img('S'), anchor: { sec: 's1', page: 0 } }))
		expect(anchorFrame(yDoc, doc, 'A', { txt: 'S', rel: 'text' }, { wCol: 0.5 }, 1)).toBe(true)
		expect(wins(doc)).toBe(1)
		expect(readFrame(doc.f.get('A'))).toMatchObject({
			anchor: { txt: 'S', rel: 'text' },
			wCol: 0.5
		})
		expect(anchorFrame(yDoc, doc, 'A', { sec: 's1', page: 0 })).toBe(true)
		expect(markers(t)).toEqual([])
		expect(readFrame(doc.f.get('A'))?.wCol).toBeUndefined()
	})

	it('moves the marker forward and backward in its story', () => {
		const { yDoc, doc, t } = setup([{ insert: 'a' }, marker('A'), { insert: 'bc' }, end])
		doc.f.set('A', newFrameMap(img('S')))
		expect(anchorFrame(yDoc, doc, 'A', { txt: 'S', rel: 'text' }, {}, 3)).toBe(true)
		expect((t.toDelta() as DeltaOp[])[0].insert).toBe('ab')
		expect(wins(doc)).toBe(2)
		// Dropped right after itself: unchanged.
		anchorFrame(yDoc, doc, 'A', { txt: 'S', rel: 'text' }, {}, 3)
		expect(wins(doc)).toBe(2)
		anchorFrame(yDoc, doc, 'A', { txt: 'S', rel: 'text' }, {}, 1)
		expect(wins(doc)).toBe(1)
		expect(markers(t)).toEqual(['A'])
	})

	it('switches rel without at, keeping the offset', () => {
		const { yDoc, doc } = setup([{ insert: 'a' }, marker('A'), end])
		doc.f.set('A', newFrameMap(img('S', { wCol: 0.5 })))
		expect(anchorFrame(yDoc, doc, 'A', { txt: 'S', rel: 'page' })).toBe(true)
		expect(wins(doc)).toBe(1)
		expect(readFrame(doc.f.get('A'))?.wCol).toBeUndefined()
		expect(anchorFrame(yDoc, doc, 'A', { txt: 'S', rel: 'text' })).toBe(true)
		expect(wins(doc)).toBe(1)
	})

	it('removes every marker of the frame when moving it', () => {
		const { yDoc, doc, t } = setup([
			marker('A'),
			{ insert: 'ab' },
			marker('A'),
			{ insert: 'cd' },
			end
		])
		doc.f.set('A', newFrameMap(img('S')))
		expect(anchorFrame(yDoc, doc, 'A', { txt: 'S', rel: 'text' }, {}, 6)).toBe(true)
		expect(markers(t)).toEqual(['A'])
		expect(wins(doc)).toBe(4)
	})
})

describe('inlineToFrame', () => {
	const box10 = { anchor: { txt: 'S', rel: 'text' as const }, x: 0, y: 0, w: 10, h: 10 }

	it('keeps the last paragraph intact when its solo image goes', () => {
		const { yDoc, doc, t } = setup([
			{ insert: 'a' },
			end,
			IMG,
			{ insert: '\n', attributes: { bid: 'Q' } }
		])
		const id = inlineToFrame(yDoc, doc, 'S', 2, box10) as string
		expect(normalizeStory(t)).toBe(false)
		expect(t.toString()).toBe('a\n')
		expect(markerWins(doc, 'S').get(id)?.at).toBe(1)
	})

	const blocks = (t: Y.Text) =>
		deltaToParagraphs(t.toDelta() as DeltaOp[]).map((p) =>
			Array.isArray(p.runs) ? 'text' : p.runs.k
		)

	it('keeps the next image paragraph a block when a solo image goes', () => {
		const { yDoc, doc, t } = setup([
			IMG,
			{ insert: '\n', attributes: { bid: 'Q' } },
			IMG,
			{ insert: '\n', attributes: { bid: 'R' } },
			IMG,
			end
		])
		const id = inlineToFrame(yDoc, doc, 'S', 2, box10) as string
		expect(blocks(t)).toEqual(['emb', 'text', 'emb'])
		expect(markerWins(doc, 'S').get(id)?.at).toBe(2)
	})

	it('keeps the marker out of a following table cell', () => {
		const cell = { 'table-cell': { 'data-row': 'r1' }, 'table-cell-block': 'c1', bid: 'C' }
		const { yDoc, doc } = setup([
			{ insert: 'a' },
			{ insert: '\n', attributes: { bid: 'Q' } },
			IMG,
			{ insert: '\n', attributes: { bid: 'R' } },
			{ insert: 'x' },
			{ insert: '\n', attributes: cell },
			end
		])
		const id = inlineToFrame(yDoc, doc, 'S', 2, box10) as string
		expect(markerWins(doc, 'S').get(id)?.at).toBe(2)
	})

	it("keeps the story's only paragraph", () => {
		const { yDoc, doc, t } = setup([IMG, end])
		inlineToFrame(yDoc, doc, 'S', 0, box10)
		expect(markers(t)).toHaveLength(1)
		expect(t.toString().endsWith('\n')).toBe(true)
	})
})

describe('linking (text anchors)', () => {
	const page = { sec: 's1', page: 0 }
	const text = { txt: 'S', rel: 'text' as const }
	const boxes = (head: StoredFrame['anchor'], target: StoredFrame['anchor']) => {
		const r = setup([marker('H'), marker('T'), end])
		story(r.doc, 'HS', 'hi\n')
		story(r.doc, 'TS')
		r.doc.f.set('H', newFrameMap(box(head, { story: 'HS' })))
		r.doc.f.set('T', newFrameMap(box(target, { story: 'TS' })))
		return r
	}

	it('refuses a text-anchored target and keeps its story', () => {
		const { yDoc, doc } = boxes(page, text)
		expect(canLinkTarget(doc, 'H', 'T')).toBe('anchored')
		expect(linkFrame(yDoc, doc, 'H', 'T')).toBe(false)
		expect(doc.tx.has('TS')).toBe(true)
	})

	it('refuses a text-anchored head', () => {
		const { doc } = boxes(text, page)
		expect(canLinkTarget(doc, 'H', 'T')).toBe('anchored')
	})

	it('keeps a threaded head out of text anchoring', () => {
		const { yDoc, doc } = boxes(page, page)
		expect(linkFrame(yDoc, doc, 'H', 'T')).toBe(true)
		expect(anchorFrame(yDoc, doc, 'H', text, {}, 0)).toBe(false)
	})
})

describe('positionOf', () => {
	const pg = (side?: 'l' | 'r'): PageInfo => ({
		sec: 's1',
		index: 2,
		w: 1000,
		h: 1400,
		master: 'm',
		side
	})
	const b = { x: 100, y: 200, w: 300, h: 100, rot: 0 }
	const ts = { side: 'r' as const, x: 7 }

	it('fixed: the page anchor and the box unchanged', () => {
		expect(positionOf('fixed', 'S', pg(), b, ts)).toEqual({
			anchor: { sec: 's1', page: 2 },
			geo: b
		})
	})

	it('page: right-hand-page coordinates', () => {
		expect(positionOf('page', 'S', pg('r'), b, ts).geo).toEqual(b)
		expect(positionOf('page', 'S', pg('l'), b, ts)).toEqual({
			anchor: { txt: 'S', rel: 'page' },
			geo: { ...b, x: 600 }
		})
	})

	it('text: the column side, right below the marker line', () => {
		expect(positionOf('text', 'S', pg(), b, ts)).toEqual({
			anchor: { txt: 'S', rel: 'text', side: 'r' },
			geo: { ...b, x: 7, y: 0 }
		})
	})
})

// vim: ts=4
