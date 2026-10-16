// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// DL == PDF glyph positions within 1/1024 pt.
//
// Extraction: pdfjs `getTextContent` merges TJ chunks into runs, so we walk the operator list
// instead. `setTextMatrix` gives the run origin (e, f) in text space (`Tm` is `1 0 0 -1 x y`).
// Each `showText` arg is a glyph object (`.width` in thousandths of the font size, from the PDF's
// `/W`) or a number (TJ kern); the pen moves by `(width − kern) · size / 1000`. Each origin is then
// mapped by the CTM (`q`/`Q`/`cm`) relative to the page's first `cm`, the `1 0 0 -1 0 h` flip, so
// it lands in the DL's space (pt, y down) — rotated frames included. The DL side rotates its
// origins by `rot` (clockwise in y-down, as pdfkit's `rotate`). Glyphs are matched to the DL by
// order: the subset remaps gids, but the writer emits every glyph of every run in paint order.

import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals'

import type { PageDL } from '../display-list.js'
import { FX } from '../fixed.js'
import { layoutPublication } from '../layout/paginate.js'
import { writePdf } from '../pdf/writer.js'
import { CORPUS, fetchBytes, layoutCase, loadPublication, PUB_CORPUS } from './corpus.js'

type Pdfjs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let pdfjs: Pdfjs

beforeAll(async () => {
	// Fake worker in-process: pdfjs uses `globalThis.pdfjsWorker` before trying to import workerSrc.
	// @ts-expect-error the worker entry ships no typings
	const worker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
	;(globalThis as Record<string, unknown>).pdfjsWorker = worker
	pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
})

// Missing image bytes → grey placeholder + console.warn; the warning is expected here.
const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
afterAll(() => warn.mockRestore())

const env = {
	fonts: fetchBytes,
	fetchImage: () => Promise.reject(new Error('no images in the parity test'))
}

type Pos = [x: number, y: number]
type Mat = [a: number, b: number, c: number, d: number, e: number, f: number]

/** `m` then `n` (PDF row-vector order: `cm m` on CTM `n` gives `mul(m, n)`). */
const mul = (m: Mat, n: Mat): Mat => [
	m[0] * n[0] + m[1] * n[2],
	m[0] * n[1] + m[1] * n[3],
	m[2] * n[0] + m[3] * n[2],
	m[2] * n[1] + m[3] * n[3],
	m[4] * n[0] + m[5] * n[2] + n[4],
	m[4] * n[1] + m[5] * n[3] + n[5]
]
const apply = (m: Mat, x: number, y: number): Pos => [
	m[0] * x + m[2] * y + m[4],
	m[1] * x + m[3] * y + m[5]
]
const ID: Mat = [1, 0, 0, 1, 0, 0]

/** Expected baseline origin of every glyph, in pt, page by page in paint order. */
function dlPositions(pages: PageDL[]): Pos[][] {
	return pages.map((pg) => {
		const out: Pos[] = []
		for (const it of pg.items) {
			if (it.k !== 'glyphs') continue
			let rot = ID
			if (it.rot) {
				const a = (it.rot.deg * Math.PI) / 180
				const [cx, cy] = [it.rot.cx / FX, it.rot.cy / FX]
				rot = mul(
					mul(
						[1, 0, 0, 1, -cx, -cy],
						[Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]
					),
					[1, 0, 0, 1, cx, cy]
				)
			}
			let pen = 0
			for (let g = 0; g < it.glyphs.length; g++) {
				out.push(
					apply(
						rot,
						(it.x + pen + (it.offsets?.[2 * g] ?? 0)) / FX,
						(it.y + (it.offsets?.[2 * g + 1] ?? 0)) / FX
					)
				)
				pen += it.advances[g]
			}
		}
		return out
	})
}

/** Glyph origins as pdfjs reads them from the content stream (see the header). */
async function pdfPositions(bytes: Uint8Array): Promise<Pos[][]> {
	const { OPS } = pdfjs
	const task = pdfjs.getDocument({ data: bytes.slice() })
	const doc = await task.promise
	const out: Pos[][] = []
	try {
		for (let n = 1; n <= doc.numPages; n++) {
			const page = await doc.getPage(n)
			const ops = await page.getOperatorList()
			const pos: Pos[] = []
			let size = 0
			let x = 0
			let y = 0
			let ctm = ID
			let flipped = false
			const stack: Mat[] = []
			for (let i = 0; i < ops.fnArray.length; i++) {
				const args = ops.argsArray[i] as unknown[]
				switch (ops.fnArray[i]) {
					case OPS.save:
						stack.push(ctm)
						break
					case OPS.restore:
						ctm = stack.pop() ?? ID
						break
					case OPS.transform:
						// The first `cm` is the page flip: the base everything is relative to.
						if (flipped) ctm = mul(args as Mat, ctm)
						flipped = true
						break
					case OPS.setFont:
						size = args[1] as number
						break
					case OPS.setTextMatrix: {
						const m = (args.length === 1 ? args[0] : args) as ArrayLike<number>
						x = m[4]
						y = m[5]
						break
					}
					case OPS.showText:
						for (const g of args[0] as (number | { width: number })[]) {
							if (typeof g === 'number') {
								x -= (g * size) / 1000
							} else {
								pos.push(apply(ctm, x, y))
								x += (g.width * size) / 1000
							}
						}
						break
				}
			}
			out.push(pos)
		}
	} finally {
		await task.destroy()
	}
	return out
}

function expectParity(pages: PageDL[], pdf: Pos[][]) {
	const dl = dlPositions(pages)
	expect(pdf.map((p) => p.length)).toEqual(dl.map((p) => p.length))
	const tol = 1 / FX
	let worst = 0
	for (let p = 0; p < dl.length; p++) {
		for (let g = 0; g < dl[p].length; g++) {
			const d = Math.max(
				Math.abs(dl[p][g][0] - pdf[p][g][0]),
				Math.abs(dl[p][g][1] - pdf[p][g][1])
			)
			if (d > worst) worst = d
		}
	}
	expect(worst).toBeLessThanOrEqual(tol)
}

describe.each(CORPUS.map((c) => [c.name, c] as const))('pdf parity %s', (_name, c) => {
	it('glyph positions match the display list', async () => {
		const pages = await layoutCase(c)
		const bytes = await writePdf(pages, { pdfa: false, downsample: 'none' }, env)
		expectParity(pages, await pdfPositions(bytes))
	})
})

describe.each(PUB_CORPUS.map((c) => [c.name, c.pub] as const))('pdf parity %s', (_name, pub) => {
	it('glyph positions match the display list (frames, masters, rotation)', async () => {
		const { pages } = layoutPublication(pub, await loadPublication(pub))
		const bytes = await writePdf(pages, { pdfa: false, downsample: 'none' }, env)
		expectParity(pages, await pdfPositions(bytes))
	})
})

describe('pdf parity rotated', () => {
	// The corpus rotates a shape only: rotate laid-out glyph runs to pin the writer's direction.
	it('glyph positions match under rot', async () => {
		const pages = (await layoutCase(CORPUS[0])).map((pg) => ({
			...pg,
			items: pg.items.map((it) =>
				it.k === 'glyphs' ? { ...it, rot: { deg: 20, cx: it.x, cy: it.y - 50 * FX } } : it
			)
		}))
		const bytes = await writePdf(pages, { pdfa: false, downsample: 'none' }, env)
		expectParity(pages, await pdfPositions(bytes))
	})
})

describe('pdf parity embed', () => {
	// Embed text is shaped by the engine and written as glyph runs after the page's own: the DL
	// glyphs keep their positions, the SVG's land at their x/y mapped through the viewBox. A
	// transparent fill is render mode 3; a failed render prints its title + "Content unavailable".
	it('writes embed render SVG text as selectable glyph runs', async () => {
		const [first] = await layoutCase(CORPUS[0])
		const box = (y: number) => ({ x: 100 * FX, y: y * FX, w: 200 * FX, h: 100 * FX })
		const page: PageDL = {
			...first,
			items: [
				...first.items,
				{ k: 'embed', frameId: 'e1', box: box(200), tag: 0 },
				{ k: 'embed', frameId: 'e2', box: box(400), tag: 0 }
			]
		}
		const svg =
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">' +
			'<defs><linearGradient id="g"><stop offset="0" stop-color="red"/>' +
			'<stop offset="1" stop-color="blue"/></linearGradient></defs>' +
			'<rect x="10" y="10" width="100" height="50" fill="url(#g)"/>' +
			'<g transform="translate(20 0)"><text x="0" y="100" font-size="24">Hello</text>' +
			'<text x="0" y="150" font-size="24" fill="transparent">World</text></g></svg>'
		const bytes = await writePdf(
			[page],
			{ pdfa: false, downsample: 'none' },
			{
				...env,
				embeds: { e1: { svg }, e2: { title: 'Sheet', address: 'cl:calcillo/a.b:f1' } }
			}
		)
		const [pdf] = await pdfPositions(bytes)
		const [dl] = dlPositions([page])
		expectParity([page], [pdf.slice(0, dl.length)])
		expect(pdf.length).toBe(dl.length + 'HelloWorldSheetContent unavailable'.length)
		// viewBox 400×200 in 200×100 pt: scale ½.
		const [hx, hy] = pdf[dl.length]
		const [wx, wy] = pdf[dl.length + 5]
		expect([hx, hy, wx, wy].map((v) => Math.round(v * 1000) / 1000)).toEqual([
			110, 250, 110, 275
		])

		const task = pdfjs.getDocument({ data: bytes.slice() })
		try {
			const p1 = await (await task.promise).getPage(1)
			const ops = await p1.getOperatorList()
			const modes = ops.fnArray.flatMap((fn, i) =>
				fn === pdfjs.OPS.setTextRenderingMode ? [(ops.argsArray[i] as number[])[0]] : []
			)
			expect(modes).toContain(3)
			const annots = (await p1.getAnnotations()) as { url?: string; unsafeUrl?: string }[]
			expect(annots.some((a) => (a.unsafeUrl ?? a.url) === 'cl:calcillo/a.b:f1')).toBe(true)
		} finally {
			await task.destroy()
		}
	})

	it('writes the plain placeholder when no embeds are given', async () => {
		const [first] = await layoutCase(CORPUS[0])
		const page: PageDL = {
			...first,
			items: [
				...first.items,
				{ k: 'embed', frameId: 'e1', box: { x: 0, y: 0, w: 100 * FX, h: 50 * FX }, tag: 0 }
			]
		}
		const bytes = await writePdf([page], { pdfa: false, downsample: 'none' }, env)
		const [pdf] = await pdfPositions(bytes)
		const [dl] = dlPositions([page])
		// No "Content unavailable" glyphs.
		expect(pdf.length).toBe(dl.length)
	})

	it('links no embed address that is not a cl: document ref', async () => {
		const [first] = await layoutCase(CORPUS[0])
		const page: PageDL = {
			...first,
			items: [
				{ k: 'embed', frameId: 'e1', box: { x: 0, y: 0, w: 100 * FX, h: 50 * FX }, tag: 0 }
			]
		}
		const bytes = await writePdf(
			[page],
			{ pdfa: false, downsample: 'none' },
			{ ...env, embeds: { e1: { title: 'X', address: 'javascript:alert(1)' } } }
		)
		expect(Buffer.from(bytes).includes('/URI')).toBe(false)
	})
})
