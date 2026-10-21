// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

// Book-sized layout benchmark (measurement probe, not a gate). Opt-in:
//   BENCH=1 pnpm -C libs/typeset test -- bench-book

import { describe, expect, it } from '@jest/globals'

import { Engine } from '../engine.js'
import { ptToFx } from '../fixed.js'
import type { Master, Paragraph, Publication } from '../model.js'
import { DE, EN, HU, loadPublication, p, PUB_STYLES } from './corpus.js'

const PARAGRAPHS = 4000

/** One A4 master, single column, no items. */
const A4: Master = {
	id: 'm-a4',
	w: ptToFx(595),
	h: ptToFx(842),
	margins: { t: ptToFx(72), b: ptToFx(72), in: ptToFx(72), out: ptToFx(72) },
	cols: 1,
	gutter: ptToFx(12),
	regions: [],
	items: []
}

/** Paragraph `i` of the book: a chapter heading every 200, a sub-heading every 20, list runs. */
function bookParagraph(i: number): Paragraph {
	if (i % 200 === 0) return p('h1', `Chapter ${i / 200 + 1}`)
	if (i % 20 === 0) return p('h2', `Section ${i / 20 + 1}`)
	const k = i % 20
	if (k >= 15 && k <= 16) return p('ol', `Numbered item ${k}: ${EN.slice(0, 80)}`)
	if (k === 17) return p('ol2', `Nested item: ${DE.slice(0, 60)}`)
	if (k === 18) return p('ul', `Bullet item: ${HU.slice(0, 70)}`)
	if (k === 1) return p('body', `${EN} ${HU}`)
	return p(i % 3 === 0 ? 'left' : 'body', [EN, HU, DE][i % 3])
}

function book(): Publication {
	return {
		lang: 'en',
		styles: PUB_STYLES,
		masters: { [A4.id]: A4 },
		sections: [
			{
				id: 's1',
				story: {
					id: 's1',
					paragraphs: Array.from({ length: PARAGRAPHS }, (_, i) => bookParagraph(i))
				},
				first: A4.id,
				rest: A4.id,
				start: 'any'
			}
		],
		frames: {},
		facing: false,
		title: 'Bench book'
	}
}

const ms = (t0: number) => `${(performance.now() - t0).toFixed(1)} ms`

/** A `set` patch appending one char to paragraph `i` of the book's section story. */
function appendChar(pub: Publication, i: number, ch: string) {
	const q = pub.sections[0].story.paragraphs[i]
	const old = q.runs
	if (!Array.isArray(old)) throw new Error(`paragraph ${i} is not a text paragraph`)
	const runs = old.map((r, j) => (j === old.length - 1 ? { ...r, text: r.text + ch } : r))
	const paragraph: Paragraph = { ...q, runs }
	pub.sections[0].story.paragraphs[i] = paragraph
	return { story: 's1', bid: q.bid, op: 'set' as const, paragraph }
}

;(process.env.BENCH ? describe : describe.skip)('bench: book layout', () => {
	it('lays out and relays out a ~200-page A4 book', async () => {
		const pub = book()
		const env = await loadPublication(pub)
		const engine = new Engine(env)
		engine.setPublication(structuredClone(pub))

		let t0 = performance.now()
		const first = engine.layout([0, 2])
		console.log(`(a) first layout: ${ms(t0)}, ${first.pageCount} pages`)
		expect(first.pageCount).toBeGreaterThanOrEqual(200)

		const mid = PARAGRAPHS >> 1
		for (const [n, ch] of ['x', 'y', 'z'].entries()) {
			engine.patch([appendChar(pub, mid + n, ch)])
			t0 = performance.now()
			const r = engine.layout([100, 102])
			console.log(`(b) edit #${n + 1} + layout: ${ms(t0)}; (d) changed: ${r.changed.length}`)
		}
	}, 600_000)

	it('(c) edit + layout limited to viewport end + 2 pages', async () => {
		const pub = book()
		const engine = new Engine(await loadPublication(pub))
		engine.setPublication(structuredClone(pub))
		engine.layout([0, 2])
		engine.patch([appendChar(pub, PARAGRAPHS >> 1, 'x')])
		const t0 = performance.now()
		const r = engine.layout([100, 102], { limit: 104 })
		console.log(`(c) edit + limited layout: ${ms(t0)}; changed: ${r.changed.length}`)
	}, 600_000)
})
