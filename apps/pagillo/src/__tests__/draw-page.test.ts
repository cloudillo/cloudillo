// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { DLItem, PageDL } from '@cloudillo/typeset'

import { drawPage } from '../view/draw-page.js'

class FakePath2D {
	constructor(public d?: string) {}
}
;(globalThis as unknown as { Path2D: unknown }).Path2D = FakePath2D

const FX = 1024
type Call = [string, ...unknown[]]
type M = { a: number; b: number; c: number; d: number; e: number; f: number }

/** Records every method call and property write; `getTransform` returns the last `setTransform`. */
function fakeCtx() {
	const calls: Call[] = []
	let m: M = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
	const ctx = new Proxy(
		{},
		{
			get(_, k: string) {
				if (k === 'getTransform') return () => ({ ...m })
				return (...args: unknown[]) => {
					calls.push([k, ...args])
					if (k !== 'setTransform') return
					if (typeof args[0] === 'object') m = { ...(args[0] as M) }
					else {
						const [a, b, c, d, e, f] = args as number[]
						m = { a, b, c, d, e, f }
					}
				}
			},
			set(_, k: string, v) {
				calls.push([`=${k}`, v])
				return true
			}
		}
	)
	return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

const font = {
	family: 'F',
	weight: 400,
	italic: false,
	file: 'f/F.ttf',
	sha256: 'abc',
	upem: 1000
}

function page(items: DLItem[]): PageDL {
	return {
		page: { sec: 's', index: 0, w: 100 * FX, h: 100 * FX, master: 'm' },
		items,
		lines: [],
		tags: [],
		rev: 0
	}
}

const run = (glyphs: number[]): DLItem => ({
	k: 'glyphs',
	font,
	size: 12 * FX,
	color: '#123',
	x: 10 * FX,
	y: 20 * FX,
	glyphs: Uint16Array.from(glyphs),
	advances: Int32Array.from(glyphs.map(() => 6 * FX)),
	text: 'ab',
	clusters: Uint32Array.from(glyphs.map((_, i) => i)),
	tag: 1
})

const opts = (glyphs: Record<string, string>) => ({
	scale: 2,
	glyphs: new Map(Object.entries(glyphs)),
	images: new Map<string, HTMLImageElement>(),
	embeds: new Map<string, HTMLImageElement>()
})

const expectMatrix = (got: unknown[], want: number[]) => {
	expect(got).toHaveLength(6)
	got.forEach((v, i) => {
		expect(v as number).toBeCloseTo(want[i], 9)
	})
}

describe('drawPage', () => {
	it('fills each glyph at base · translate(pen) · scale(s, -s)', () => {
		const { ctx, calls } = fakeCtx()
		const res = drawPage(ctx, page([run([1, 2])]), opts({ 'g-abc-1': 'M1', 'g-abc-2': 'M2' }))
		expect(res.missingGlyphs).toBe(false)
		expect(calls).toContainEqual(['=fillStyle', '#123'])
		const sets = calls.filter((c) => c[0] === 'setTransform').map((c) => c.slice(1))
		// clear identity, base scale(2), glyph 1, glyph 2, base restored
		expect(sets).toHaveLength(5)
		const s = 12 / 1000
		expectMatrix(sets[1], [2, 0, 0, 2, 0, 0])
		expectMatrix(sets[2], [2 * s, 0, 0, -2 * s, 20, 40])
		expectMatrix(sets[3], [2 * s, 0, 0, -2 * s, 32, 40])
		const fills = calls.filter((c) => c[0] === 'fill').map((c) => (c[1] as FakePath2D).d)
		expect(fills).toEqual(['M1', 'M2'])
	})

	it('wraps a rotated item in save / rotate about its centre / restore', () => {
		const { ctx, calls } = fakeCtx()
		const rect: DLItem = {
			k: 'rect',
			box: { x: 0, y: 0, w: 10 * FX, h: 10 * FX },
			fill: '#f00',
			rot: { deg: 90, cx: 50 * FX, cy: 40 * FX }
		}
		drawPage(ctx, page([rect]), opts({}))
		const seq = calls.filter((c) =>
			['save', 'translate', 'rotate', 'fillRect', 'restore'].includes(c[0])
		)
		expect(seq.map((c) => c[0])).toEqual([
			'save',
			'translate',
			'rotate',
			'translate',
			'fillRect',
			'restore'
		])
		expect(seq[1].slice(1)).toEqual([50, 40])
		expect(seq[2][1] as number).toBeCloseTo(Math.PI / 2, 9)
		expect(seq[3].slice(1)).toEqual([-50, -40])
	})

	it('contain-fits an embed render into its box, else draws the placeholder', () => {
		const emb: DLItem = {
			k: 'embed',
			frameId: 'e1',
			box: { x: 0, y: 0, w: 40 * FX, h: 20 * FX },
			tag: 0
		}
		const { ctx, calls } = fakeCtx()
		const o = opts({})
		o.embeds.set('e1', { naturalWidth: 10, naturalHeight: 10 } as HTMLImageElement)
		drawPage(ctx, page([emb]), o)
		const draws = calls.filter((c) => c[0] === 'drawImage').map((c) => c.slice(2))
		expect(draws).toEqual([[10, 0, 20, 20]])
		expect(calls.some((c) => c[0] === 'fillRect')).toBe(false)
		const bare = fakeCtx()
		drawPage(bare.ctx, page([emb]), opts({}))
		expect(bare.calls.some((c) => c[0] === 'fillRect')).toBe(true)
		expect(bare.calls.some((c) => c[0] === 'drawImage')).toBe(false)
	})

	it('skips a missing outline and reports it', () => {
		const { ctx, calls } = fakeCtx()
		const res = drawPage(ctx, page([run([1, 2])]), opts({ 'g-abc-1': 'M1' }))
		expect(res.missingGlyphs).toBe(true)
		expect(calls.filter((c) => c[0] === 'fill')).toHaveLength(1)
	})
})

// vim: ts=4
