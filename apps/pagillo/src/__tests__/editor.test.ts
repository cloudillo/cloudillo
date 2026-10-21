// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { isInSnapZone, rotatePointAroundCenter } from '@cloudillo/canvas-tools'
import { FX, MAX_COLS } from '@cloudillo/typeset'
import * as Y from 'yjs'

import { openPublication } from '../crdt/document.js'
import {
	findInlineImage,
	inlineImageBid,
	insertImageParagraph,
	setInlineImage,
	soleInlineImage
} from '../crdt/frame-ops.js'
import { type GeomIndex, mapOffset, type PlacedLine } from '../editor/caret.js'
import { sliceDelta } from '../editor/clipboard.js'
import {
	containsPoint,
	gutterEdges,
	type PageInfo,
	moveDrop,
	type PageItem,
	reachBoxes,
	reachShift,
	rotArcRadius,
	rotatedBounds,
	rotateTo,
	sameBox,
	snapTargets
} from '../editor/frames.js'
import { hitText, type TextArea } from '../editor/hit-test.js'
import { deleteRange, insertText } from '../editor/text-edit.js'

describe('mapOffset', () => {
	it('shifts past inserts and clamps into deletes', () => {
		expect(mapOffset([{ retain: 2 }, { insert: 'abc' }], 5)).toBe(8)
		expect(mapOffset([{ retain: 5 }, { insert: 'abc' }], 2)).toBe(2)
		expect(mapOffset([{ retain: 1 }, { delete: 4 }], 3)).toBe(1)
	})
})

describe('sliceDelta', () => {
	it('cuts text ops and keeps embeds whole', () => {
		const ops = [
			{ insert: 'ab', attributes: { bold: true } },
			{ insert: { img: 1 } },
			{ insert: 'cd' }
		]
		expect(sliceDelta(ops, 1, 4)).toEqual([
			{ insert: 'b', attributes: { bold: true } },
			{ insert: { img: 1 } },
			{ insert: 'c' }
		])
	})
})

describe('rotArcRadius', () => {
	it('puts the rotate snap zone inside the drawn arc', () => {
		const fr = { x: 100 * FX, y: 50 * FX, w: 80 * FX, h: 40 * FX }
		const r = rotArcRadius(fr, 1)
		const c = { x: fr.x + fr.w / 2, y: fr.y + fr.h / 2 }
		expect(r).toBeGreaterThan(0)
		expect(isInSnapZone({ x: c.x + 0.5 * r, y: c.y }, c, r)).toBe(true)
		expect(isInSnapZone({ x: c.x + 1.5 * r, y: c.y }, c, r)).toBe(false)
	})
})

describe('containsPoint', () => {
	it('honours rotation', () => {
		const box = { x: 0, y: 0, w: 100, h: 10, rot: 90 }
		expect(containsPoint(box, 50, 40)).toBe(true)
		expect(containsPoint(box, 5, 5)).toBe(false)
	})
})

describe('rotatedBounds', () => {
	it('keeps an unrotated box', () => {
		const box = { x: 1, y: 2, w: 3, h: 4, rot: 0 }
		expect(rotatedBounds(box)).toEqual(box)
	})

	it('swaps extents at 90°', () => {
		const r = rotatedBounds({ x: 0, y: 0, w: 100, h: 20, rot: 90 })
		expect(r.x).toBeCloseTo(40)
		expect(r.y).toBeCloseTo(-40)
		expect(r.w).toBeCloseTo(20)
		expect(r.h).toBeCloseTo(100)
	})

	it('centres on the floored centre for an odd size', () => {
		const r = rotatedBounds({ x: 0, y: 0, w: 101, h: 20, rot: 90 })
		expect(r.x).toBeCloseTo(40)
		expect(r.y).toBeCloseTo(-40.5)
	})

	it('ignores a non-finite rotation', () => {
		const box = { x: 1, y: 2, w: 3, h: 4, rot: Infinity }
		expect(rotatedBounds(box)).toEqual(box)
	})
})

describe('rotateTo', () => {
	const it0 = { x: 0, y: 0, w: 100 * FX, h: 100 * FX, rot: 0 }
	const c = { x: 50 * FX, y: 50 * FX }
	const arc = rotArcRadius(it0, 1)
	/** Point at `deg` (screen angle, as getAngleFromCenter) and distance `d` from the centre. */
	const at = (deg: number, d: number) => {
		const a = (deg * Math.PI) / 180
		return { x: c.x + d * Math.cos(a), y: c.y + d * Math.sin(a) }
	}
	const far = 3 * arc

	it('passes the raw angle through away from the arc', () => {
		const r = rotateTo(it0, 0, at(37, far), arc, false)
		expect(r.snap).toBe(false)
		expect(r.rot).toBeCloseTo(37)
	})

	it('snaps to 15° on shift', () => {
		expect(rotateTo(it0, 0, at(37, far), arc, true)).toEqual({ rot: 30, snap: true })
	})

	it('snaps inside the snap zone', () => {
		const p = at(37, 0.5 * arc)
		expect(isInSnapZone(p, c, arc)).toBe(true)
		expect(rotateTo(it0, 0, p, arc, false).rot).toBeCloseTo(30)
	})

	it('wraps to (−180, 180]', () => {
		expect(rotateTo({ ...it0, rot: 170 }, 0, at(30, far), arc, false).rot).toBeCloseTo(-160)
		expect(rotateTo({ ...it0, rot: 150 }, 0, at(30, far), arc, true).rot).toBe(180)
	})
})

describe('gutterEdges', () => {
	it('clamps peer-controlled track counts', () => {
		expect(gutterEdges(0, 1000, 1e9, 0)).toHaveLength(2 * (MAX_COLS - 1))
		expect(gutterEdges(0, 1000, Number.NaN, 0)).toEqual([])
	})
})

describe('reachShift', () => {
	const page = { w: 600, h: 800 }
	const b = (x: number, y: number, w = 100, h = 50, rot = 0) => ({ x, y, w, h, rot })

	it('does not shift boxes on the page, even partly off', () => {
		expect(reachShift([b(10, 10), b(-90, 790)], page, 12)).toEqual({ dx: 0, dy: 0 })
	})

	it('pulls a box fully off each edge back by the minimum', () => {
		expect(reachShift([b(700, 10)], page, 12)).toEqual({ dx: -112, dy: 0 })
		expect(reachShift([b(-200, 10)], page, 12)).toEqual({ dx: 112, dy: 0 })
		expect(reachShift([b(10, 900)], page, 12)).toEqual({ dx: 0, dy: -112 })
		expect(reachShift([b(10, -80)], page, 12)).toEqual({ dx: 0, dy: 42 })
	})

	it('uses the rotated bounds', () => {
		// Unrotated it overlaps x 0..35; rotated 90° its bounds are x -25..-5.
		expect(reachShift([b(-65, 100, 100, 20)], page, 12)).toEqual({ dx: 0, dy: 0 })
		const r = reachShift([b(-65, 100, 100, 20, 90)], page, 12)
		expect(r.dx).toBeCloseTo(17)
		expect(r.dy).toBeCloseTo(0)
	})

	it('shifts the group as one, keeping every box reachable', () => {
		// The off box needs dx <= -32; the other allows it.
		expect(reachShift([b(620, 10), b(100, 10)], page, 12)).toEqual({ dx: -32, dy: 0 })
		// Two boxes off the left edge: the farther one sets the shift.
		expect(reachShift([b(-200, 10), b(-150, 10)], page, 12)).toEqual({ dx: 112, dy: 0 })
	})

	it('centres a group too spread out to fit', () => {
		// Bounds -1000..1100, centre 50 → 300.
		expect(reachShift([b(-1000, 10), b(1000, 10)], page, 12)).toEqual({ dx: 250, dy: 0 })
	})
})

describe('reachBoxes', () => {
	const page = { w: 600 * FX, h: 800 * FX }
	const b = (x: number, y: number) => ({ x: x * FX, y: y * FX, w: 100 * FX, h: 50 * FX, rot: 0 })
	const onPage = (r: { x: number; y: number; w: number; h: number }) =>
		r.x < page.w && r.x + r.w > 0 && r.y < page.h && r.y + r.h > 0

	it('shifts the group as one', () => {
		const out = reachBoxes(
			new Map([
				['a', b(620, 10)],
				['b', b(100, 10)]
			]),
			page,
			() => true
		)
		expect(out.get('a')?.x).toBe(588 * FX)
		expect(out.get('b')?.x).toBe(68 * FX)
	})

	it('moves ids `keep` rejects with the group, never on their own', () => {
		const out = reachBoxes(
			new Map([
				['a', b(700, 10)],
				['m', b(-500, 10)]
			]),
			page,
			(id) => id !== 'm'
		)
		// The group shift comes from `a` alone (-112) and applies to `m` too: the group stays rigid.
		expect(out.get('a')?.x).toBe(588 * FX)
		expect(out.get('m')?.x).toBe(-612 * FX)
	})

	it('keeps every box of a too-spread group reachable', () => {
		const out = reachBoxes(
			new Map([
				['a', b(-1000, 10)],
				['b', b(1000, 10)],
				['c', b(-750, 10)]
			]),
			page,
			() => true
		)
		for (const r of out.values()) expect(onPage(r)).toBe(true)
	})
})

describe('moveDrop', () => {
	const pages = [{ key: 'p0' }, { key: 'p1' }, { key: 'p2' }]
	const d = { src: 'p0', target: 'p0', moved: true }

	it('drops on another rail page, not on the source', () => {
		expect(moveDrop({ ...d, rail: 'p2' }, pages)).toEqual({ k: 'rail', to: 2 })
		expect(moveDrop({ ...d, rail: 'p0' }, pages)).toEqual({ k: 'none' })
	})

	it('drops nothing on a page a peer deleted', () => {
		expect(moveDrop({ ...d, rail: 'gone' }, pages)).toEqual({ k: 'none' })
		expect(moveDrop({ ...d, target: 'gone' }, pages)).toEqual({ k: 'none' })
		expect(moveDrop({ ...d, src: 'gone', target: 'p1' }, pages)).toEqual({ k: 'none' })
	})

	it('moves to the target page, or commits on the source', () => {
		expect(moveDrop({ ...d, target: 'p1' }, pages)).toEqual({ k: 'cross', to: 1 })
		// Rail hover resets `target` to the source key: leaving the rail commits in place.
		expect(moveDrop(d, pages)).toEqual({ k: 'commit', page: 0 })
	})

	it('resolves the source by key after a peer inserted a page before it', () => {
		const shifted = [{ key: 'new' }, ...pages]
		expect(moveDrop(d, shifted)).toEqual({ k: 'commit', page: 1 })
		expect(moveDrop({ ...d, rail: 'p0' }, shifted)).toEqual({ k: 'none' })
	})

	it('picks an empty image on a click', () => {
		expect(moveDrop({ ...d, moved: false, pick: 'i' }, pages)).toEqual({ k: 'pick' })
		expect(moveDrop({ ...d, moved: false }, pages)).toEqual({ k: 'none' })
	})
})

describe('sameBox', () => {
	it('compares x, y, w, h, rot; a missing box never matches', () => {
		const a = { x: 1, y: 2, w: 3, h: 4, rot: 5 }
		expect(sameBox(a, { ...a })).toBe(true)
		expect(sameBox(a, { ...a, rot: 0 })).toBe(false)
		expect(sameBox(a, undefined)).toBe(false)
	})
})

describe('snapTargets', () => {
	it('uses the rotated bounds of an item', () => {
		const doc = openPublication(new Y.Doc())
		const page: PageInfo = { sec: 's', index: 0, w: 600 * FX, h: 800 * FX, master: 'm' }
		const item = { id: 'a', kind: 'frame', z: 0, x: 1000, y: 0, w: 100, h: 20, rot: 90 }
		const { xs } = snapTargets(doc, page, [item as PageItem], new Set())
		const has = (v: number) => xs.some((x) => Math.abs(x - v) < 1e-6)
		expect(has(1040) && has(1060)).toBe(true)
		expect(has(1000) || has(1100)).toBe(false)
	})
})

describe('insertText / deleteRange', () => {
	it('splits with a fresh bid and merges keeping the first bid', () => {
		const t = new Y.Doc().getText('t')
		t.insert(0, 'abcd')
		t.insert(4, '\n', { bid: 'A' })
		expect(insertText(t, 2, '\n')).toBe(3)
		const bids = t
			.toDelta()
			.filter((op: { insert: unknown }) => op.insert === '\n')
			.map((op: { attributes?: { bid?: string } }) => op.attributes?.bid)
		expect(bids).toHaveLength(2)
		expect(new Set(bids).size).toBe(2)
		expect(bids).toContain('A')
		const first = bids[0]
		deleteRange(t, 2, 3)
		expect(t.toString()).toBe('abcd\n')
		expect(t.toDelta().at(-1).attributes.bid).toBe(first)
	})
})

describe('inline images', () => {
	it('maps a paragraph bid to its embed and back', () => {
		const doc = openPublication(new Y.Doc())
		const t = new Y.Text()
		doc.tx.set('main', t)
		t.insert(0, 'ab\n', { bid: 'p1' })
		const img = { fileId: 'f1', w: 10, h: 10, alt: '' }
		insertImageParagraph(t, 3, img)
		t.insert(5, 'cd\n', { bid: 'p3' })
		const bid = inlineImageBid(t, 3)
		expect(bid).toBeDefined()
		expect(findInlineImage(doc, bid as string)).toEqual({ story: 'main', offset: 3 })
		expect(findInlineImage(doc, 'p1')).toBeUndefined()
		expect(inlineImageBid(t, 0)).toBeUndefined()
		// Shift+→ from the paragraph above selects '\n' + embed.
		expect(soleInlineImage(t, 2, 4)).toBe(3)
		expect(soleInlineImage(t, 0, 2)).toBeUndefined()
		setInlineImage(t, 3, { ...img, alt: 'cat' })
		expect(inlineImageBid(t, 3)).toBe(bid)
		expect(t.toDelta()[1]).toEqual({ insert: { img: { ...img, alt: 'cat' } } })
	})
})

describe('image paragraphs stay intact', () => {
	/** 'ab\n' + image paragraph at 3 + 'cd\n'. */
	const setup = () => {
		const t = new Y.Doc().getText('t')
		t.insert(0, 'ab\n', { bid: 'p1' })
		insertImageParagraph(t, 3, { fileId: 'f1', w: 10, h: 10, alt: '' })
		t.insert(5, 'cd\n', { bid: 'p3' })
		return t
	}
	const text = (t: Y.Text) =>
		(t.toDelta() as { insert: unknown }[])
			.map((op) => (typeof op.insert === 'string' ? op.insert : '#'))
			.join('')
	/** Each embed alone in its paragraph. */
	const intact = (t: Y.Text) => {
		for (const p of text(t).split('\n')) if (p.includes('#')) expect(p).toBe('#')
	}

	it.each([
		['Backspace after it', 4, 5],
		['selected image', 3, 4],
		['Delete at the end of the paragraph before it', 2, 3],
		['Shift+→ twice', 2, 4]
	])('%s deletes the whole image paragraph', (_n, from, to) => {
		const t = setup()
		deleteRange(t, from, to)
		expect(text(t)).toBe('ab\ncd\n')
		const nl = (t.toDelta() as { insert: unknown; attributes?: { bid?: string } }[])
			.filter((op) => typeof op.insert === 'string' && op.insert.includes('\n'))
			.map((op) => op.attributes?.bid)
		expect(nl).toEqual(['p1', 'p3'])
	})

	it('a range ending before the image keeps its paragraph break', () => {
		const t = setup()
		deleteRange(t, 1, 3)
		expect(text(t)).toBe('a\n#\ncd\n')
	})

	it('typing beside the image opens a paragraph of its own', () => {
		const t = setup()
		expect(insertText(t, 3, 'x')).toBe(4)
		expect(text(t)).toBe('ab\nx\n#\ncd\n')
		intact(t)
		const u = setup()
		expect(insertText(u, 4, 'x')).toBe(6)
		expect(text(u)).toBe('ab\n#\nx\ncd\n')
		intact(u)
	})
})

describe('hitText', () => {
	const line = (y: number, w: number, from: number): PlacedLine => ({
		line: {
			story: 's',
			x: 0,
			y,
			ascent: 8,
			descent: 2,
			carets: Array.from({ length: 11 }, (_, i) => (i * w) / 10)
		} as unknown as PlacedLine['line'],
		page: 0,
		from,
		to: from + 10
	})
	const lines = [line(10, 100, 0), line(30, 20, 11), line(50, 100, 22)]
	const index: GeomIndex = { stories: new Map([['s', lines]]), pages: new Map([[0, lines]]) }

	it('picks the line by y within the column and clamps x to its end', () => {
		expect(hitText(index, 0, 80, 28)).toEqual({ story: 's', offset: 21 })
		expect(hitText(index, 0, 80, 34)).toEqual({ story: 's', offset: 21 })
	})

	it('maps a click on a rotated line through its rotation', () => {
		const rot = { deg: 90, cx: 50, cy: 10 }
		const l = line(10, 100, 0)
		const r: PlacedLine = { ...l, line: { ...l.line, rot } }
		const idx: GeomIndex = { stories: new Map([['s', [r]]]), pages: new Map([[0, [r]]]) }
		// Unrotated (80, 8) — the 8th caret — drawn rotated 90° about (50, 10).
		const p = rotatePointAroundCenter({ x: 80, y: 8 }, { x: 50, y: 10 }, 90)
		expect(hitText(idx, 0, p.x, p.y)).toEqual({ story: 's', offset: 8 })
		const areas: TextArea[] = [{ x: 0, y: 0, w: 100, h: 20, story: 's', rot: 90 }]
		expect(hitText(idx, 0, p.x, p.y, undefined, areas)).toEqual({ story: 's', offset: 8 })
	})
})

describe('hitText with text areas (UX-22)', () => {
	const L = (story: string, y: number, w: number, from: number, page = 0): PlacedLine => ({
		line: {
			story,
			bid: story,
			row: y,
			x: 0,
			y,
			ascent: 8,
			descent: 2,
			carets: Array.from({ length: 11 }, (_, i) => (i * w) / 10)
		} as unknown as PlacedLine['line'],
		page,
		from,
		to: from + 10
	})
	const s = [L('s', 10, 100, 0), L('s', 30, 20, 11), L('s', 50, 100, 22)]
	const b = [L('b', 45, 40, 0)]
	const areas: TextArea[] = [
		{ x: 0, y: 0, w: 100, h: 60 },
		{ x: 0, y: 40, w: 50, h: 20, story: 'b' }
	]
	const idx = (more: PlacedLine[] = []): GeomIndex => ({
		stories: new Map([
			['s', [...s, ...more]],
			['b', b]
		]),
		pages: new Map([[0, [...s, ...b]]])
	})

	it('misses outside every area', () => {
		expect(hitText(idx(), 0, 150, 100, undefined, areas)).toBeUndefined()
	})

	it('accepts a point within slop of an area', () => {
		expect(hitText(idx(), 0, 105, 10, undefined, areas, 0)).toBeUndefined()
		expect(hitText(idx(), 0, 105, 10, undefined, areas, 8)).toEqual({ story: 's', offset: 10 })
	})

	it('a text box takes only its own story, a flow area never a box story', () => {
		expect(hitText(idx(), 0, 10, 45, undefined, areas)).toMatchObject({ story: 'b' })
		expect(hitText(idx(), 0, 80, 45, undefined, areas)).toEqual({ story: 's', offset: 30 })
	})

	it('below the last line goes to the story end only when that line ends the story', () => {
		expect(hitText(idx(), 0, 80, 58, undefined, areas)).toEqual({ story: 's', offset: 32 })
		const more = [L('s', 10, 100, 33, 1)]
		expect(hitText(idx(more), 0, 80, 58, undefined, areas)).toEqual({ story: 's', offset: 30 })
	})
})

describe('hitText on a split row', () => {
	/** A line of 10 clusters, `step` wide each, starting at `x`. */
	const L = (x: number, y: number, from: number, step = 10): PlacedLine => ({
		line: {
			story: 's',
			bid: 's',
			row: y,
			x,
			y,
			ascent: 8,
			descent: 2,
			carets: Array.from({ length: 11 }, (_, i) => x + i * step)
		} as unknown as PlacedLine['line'],
		page: 0,
		from,
		to: from + 10
	})
	const idx = (lines: PlacedLine[]): GeomIndex => ({
		stories: new Map([['s', lines]]),
		pages: new Map([[0, lines]])
	})

	it('a click right of the frame hits the right line', () => {
		const lines = [L(0, 10, 0, 30), L(0, 30, 10), L(200, 30, 20), L(0, 50, 30, 30)]
		expect(hitText(idx(lines), 0, 250, 30)).toEqual({ story: 's', offset: 25 })
		expect(hitText(idx(lines), 0, 50, 30)).toEqual({ story: 's', offset: 15 })
	})

	it('below a story ending in a split row goes to the story end', () => {
		const lines = [L(0, 10, 0), L(0, 30, 10), L(200, 30, 20)]
		const areas: TextArea[] = [{ x: 0, y: 0, w: 300, h: 60 }]
		expect(hitText(idx(lines), 0, 80, 50, undefined, areas)).toEqual({ story: 's', offset: 30 })
	})

	it('below a story sharing its last baseline with another story goes to its end', () => {
		const s = [L(0, 10, 0), L(0, 30, 10)]
		const t0 = { ...L(200, 30, 0), line: { ...L(200, 30, 0).line, story: 't', bid: 't' } }
		const t1 = { ...t0, page: 1, from: 10, to: 20 }
		const index: GeomIndex = {
			stories: new Map([
				['s', s],
				['t', [t0, t1]]
			]),
			pages: new Map([
				[0, [...s, t0]],
				[1, [t1]]
			])
		}
		const areas: TextArea[] = [{ x: 0, y: 0, w: 300, h: 60 }]
		expect(hitText(index, 0, 50, 50, undefined, areas)).toEqual({ story: 's', offset: 20 })
	})
})

describe('hitText in table cells', () => {
	/** A short cell line (text 4..24 past the cell's left edge) in a 100-wide cell at `cx`. */
	const C = (cx: number, from: number): PlacedLine => ({
		line: {
			story: 's',
			bid: 's',
			row: 0,
			x: cx + 4,
			y: 30,
			ascent: 8,
			descent: 2,
			carets: Array.from({ length: 11 }, (_, i) => cx + 4 + i * 2),
			cell: { x: cx, w: 100 }
		} as unknown as PlacedLine['line'],
		page: 0,
		from,
		to: from + 10
	})
	const lines = [C(0, 0), C(100, 20)]
	const index: GeomIndex = { stories: new Map([['s', lines]]), pages: new Map([[0, lines]]) }

	it('a click in the right half of a cell stays in that cell', () => {
		expect(hitText(index, 0, 75, 30)).toEqual({ story: 's', offset: 10 })
	})

	it('a click in the next cell’s left padding goes to that cell', () => {
		expect(hitText(index, 0, 102, 30)).toEqual({ story: 's', offset: 20 })
	})
})
