// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// Property test: an Engine fed random edits returns exactly the pages a fresh
// `layoutPublication` of the same publication produces, and lists only pages that changed.

import { describe, expect, it } from '@jest/globals'

import type { PageDL } from '../display-list.js'
import { Engine, type ParagraphPatch } from '../engine.js'
import { ptToFx } from '../fixed.js'
import { layoutPublication } from '../layout/paginate.js'
import type { Paragraph, Publication, Run, Story, TextFrameData } from '../model.js'
import { DE, dlJson, EN, field, HU, loadPublication, p, PUB_CORPUS, sha256 } from './corpus.js'

/** mulberry32: deterministic PRNG in [0, 1). */
function prng(seed: number): () => number {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

const TEMPLATES: Paragraph[] = [
	p('body', EN),
	p('body', HU),
	p('body', DE),
	p('left', 'Short line.'),
	p('kh', 'Kept heading'),
	p('h2', 'Heading'),
	p('ol', 'Numbered item.'),
	p('ol2', 'Nested numbered item.'),
	p('ul', 'Bullet item.'),
	{ ...p('body', `${EN} ${HU}`), overrides: { keepTogether: true } },
	{ ...p('body', DE), overrides: { breakBefore: 'page' } },
	{ ...p('left', EN), overrides: { breakBefore: 'column' } },
	p(
		'left',
		'Section ',
		field({ field: 'section' }),
		', page ',
		field({ field: 'page' }),
		' of ',
		field({ field: 'pages' }),
		'.'
	),
	p('body', '')
]
const STORIES = ['s1', 's2', 'tx-note']

const keyOf = (pg: PageDL) => `${pg.page.sec}\u0000${pg.page.index}`
const norm = (pg: PageDL) => sha256(dlJson([{ ...pg, rev: 0 }]))

function storyOf(pub: Publication, id: string): Story {
	const st =
		pub.sections.find((s) => s.story.id === id)?.story ??
		Object.values(pub.frames)
			.filter((f) => f.t === 'txt')
			.map((f) => (f.data as TextFrameData).story)
			.find((s) => s.id === id)
	if (!st) throw new Error(`no story ${id}`)
	return st
}

/** The oracle's own patch semantics, mutating `pub` in place. */
function applyRef(pub: Publication, pt: ParagraphPatch): void {
	const ps = storyOf(pub, pt.story).paragraphs
	const idx = (bid: string) => ps.findIndex((q) => q.bid === bid)
	const after = () => (pt.after === undefined ? 0 : idx(pt.after) + 1)
	if (pt.op === 'set' && pt.paragraph) ps[idx(pt.bid)] = pt.paragraph
	else if (pt.op === 'insert' && pt.paragraph) ps.splice(after(), 0, pt.paragraph)
	else if (pt.op === 'delete') ps.splice(idx(pt.bid), 1)
	else if (pt.op === 'move') {
		const [q] = ps.splice(idx(pt.bid), 1)
		ps.splice(after(), 0, q)
	}
}

function randomPatch(rnd: () => number, pub: Publication, n: number): ParagraphPatch {
	const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]
	const story = pick(STORIES)
	const ps = storyOf(pub, story).paragraphs
	const q = pick(ps)
	const fresh = (bid: string): Paragraph => ({ ...pick(TEMPLATES), bid })
	const r = rnd()
	if (r < 0.35) return { story, bid: q.bid, op: 'set', paragraph: fresh(q.bid) }
	if (r < 0.65 || ps.length < 2) {
		const bid = `x${n}`
		return {
			story,
			bid,
			op: 'insert',
			paragraph: fresh(bid),
			...(rnd() < 0.2 ? {} : { after: q.bid })
		}
	}
	if (r < 0.85) return { story, bid: q.bid, op: 'delete' }
	const to = pick(ps)
	return {
		story,
		bid: q.bid,
		op: 'move',
		...(to.bid === q.bid || rnd() < 0.2 ? {} : { after: to.bid })
	}
}

/** A non-patch edit, applied to `ref` and mirrored into `engine` (always as a deep copy). */
function randomSetter(rnd: () => number, ref: Publication, engine: Engine): void {
	const r = rnd()
	if (r < 0.2) {
		const body = ref.styles.body
		const size = ptToFx([10, 11, 12][Math.floor(rnd() * 3)])
		ref.styles = { ...ref.styles, body: { ...body, props: { ...body.props, size } } }
		engine.setStyles(structuredClone(ref.styles))
	} else if (r < 0.45) {
		const img = ref.frames['f-img']
		const note = ref.frames['f-note']
		ref.frames = {
			...ref.frames,
			'f-img': {
				...img,
				anchor: { sec: 's1', page: Math.floor(rnd() * 3) },
				x: ptToFx(60 + Math.floor(rnd() * 200))
			},
			'f-note': { ...note, anchor: { sec: 's1', page: 2 + Math.floor(rnd() * 4) } }
		}
		engine.setFrames(structuredClone(ref.frames))
	} else if (r < 0.6) {
		const m = ref.masters['m-cols']
		ref.masters = {
			...ref.masters,
			'm-cols': {
				...m,
				cols: 2 + Math.floor(rnd() * 2),
				gutter: ptToFx(8 + Math.floor(rnd() * 16))
			}
		}
		engine.setMasters(structuredClone(ref.masters))
	} else if (r < 0.85) {
		const starts = ['any', 'odd', 'even'] as const
		ref.sections = ref.sections.map((s) =>
			s.id === 's2'
				? {
						...s,
						start: starts[Math.floor(rnd() * 3)],
						maxPages: 1 + Math.floor(rnd() * 3)
					}
				: s
		)
		engine.setSections(structuredClone(ref.sections))
	} else {
		ref.title = `Title ${Math.floor(rnd() * 1000)}`
		engine.setPublication(structuredClone(ref))
	}
}

describe('Engine', () => {
	it('throws before setPublication and on unknown stories', async () => {
		const env = await loadPublication(PUB_CORPUS[0].pub)
		const engine = new Engine(env)
		expect(() => engine.layout()).toThrow()
		engine.setPublication(PUB_CORPUS[0].pub)
		expect(() => engine.patch([{ story: 'nope', bid: 'b', op: 'delete' }])).toThrow()
	})

	it('returns no pages when nothing changed', async () => {
		const pub = PUB_CORPUS[0].pub
		const engine = new Engine(await loadPublication(pub))
		engine.setPublication(pub)
		const a = engine.layout()
		expect(a.changed).toHaveLength(a.pageCount)
		const b = engine.layout()
		expect(b.changed).toEqual([])
		expect(b.rev).toBe(a.rev)
		engine.setSections([...pub.sections]) // same content: dirty, but no page differs
		expect(engine.layout().changed).toEqual([])
	})

	it('setStyles with a new body size relays out with the new metrics', async () => {
		const base = PUB_CORPUS[0].pub
		const env = await loadPublication(base)
		const engine = new Engine(env)
		engine.setPublication(base)
		const view = new Map(engine.layout().changed.map((pg): [string, PageDL] => [keyOf(pg), pg]))

		// Same paragraph objects, new styles object: the identity-keyed caches must miss.
		const body = base.styles.body
		const styles = {
			...base.styles,
			body: { ...body, props: { ...body.props, size: ptToFx(13) } }
		}
		engine.setStyles(styles)
		const r = engine.layout()
		expect(r.changed.length).toBeGreaterThan(0)
		for (const pg of r.changed) view.set(keyOf(pg), pg)
		const counts = new Map(r.sections.map((s): [string, number] => [s.id, s.pages]))
		for (const [k, pg] of view) {
			if (pg.page.index >= (counts.get(pg.page.sec) ?? 0)) view.delete(k)
		}

		const pages = layoutPublication({ ...base, styles }, env).pages
		const fresh = pages.map(norm)
		expect(fresh).not.toEqual(layoutPublication(base, env).pages.map(norm))
		expect(r.pageCount).toBe(fresh.length)
		expect(
			pages.map((pg) => {
				const v = view.get(keyOf(pg))
				return v ? norm(v) : 'missing'
			})
		).toEqual(fresh)
	})

	it.each(PUB_CORPUS.flatMap((c) => [1, 7, 42].map((seed) => [c.name, seed, c.pub] as const)))(
		'%s, seed %d: incremental layout equals a fresh layout after random edits',
		async (_name, seed, base) => {
			const env = await loadPublication(base, undefined, TEMPLATES)
			const rnd = prng(seed)
			const ref = structuredClone(base)
			const engine = new Engine(env)
			engine.setPublication(structuredClone(base))
			const view = new Map<string, PageDL>()
			let n = 0

			for (let step = 0; step < 30; step++) {
				if (step > 0) {
					if (rnd() < 0.75) {
						const patches: ParagraphPatch[] = []
						const k = 1 + Math.floor(rnd() * 3)
						for (let i = 0; i < k; i++) {
							const pt = randomPatch(rnd, ref, n++)
							applyRef(ref, pt)
							patches.push(pt)
						}
						engine.patch(patches)
					} else randomSetter(rnd, ref, engine)
				}

				const from = Math.floor(rnd() * 6)
				const r = engine.layout([from, from + 2])
				const fresh = layoutPublication(ref, env)
				const order = new Map(fresh.pages.map((pg, g): [string, number] => [keyOf(pg), g]))

				// Only real changes, stamped with this pass's rev, viewport first then in order.
				const at = r.changed.map((pg) => order.get(keyOf(pg)) ?? -1)
				const inView = at.map((g) => g >= from && g < from + 2)
				expect(inView).toEqual([...inView].sort((a, b) => Number(b) - Number(a)))
				const firstOut = inView.indexOf(false)
				const groups = firstOut < 0 ? [at] : [at.slice(0, firstOut), at.slice(firstOut)]
				for (const g of groups) expect(g).toEqual([...g].sort((a, b) => a - b))
				for (const pg of r.changed) {
					expect(pg.rev).toBe(r.rev)
					const before = view.get(keyOf(pg))
					if (before) expect(norm(pg)).not.toBe(norm(before))
					view.set(keyOf(pg), pg)
				}

				// Drop pages that are gone, then compare page by page with the fresh layout.
				const counts = new Map(r.sections.map((s): [string, number] => [s.id, s.pages]))
				for (const [k, pg] of view) {
					if (pg.page.index >= (counts.get(pg.page.sec) ?? 0)) view.delete(k)
				}
				expect(view.size).toBe(fresh.pages.length)
				expect(
					fresh.pages.map((pg) => {
						const v = view.get(keyOf(pg))
						return v ? norm(v) : 'missing'
					})
				).toEqual(fresh.pages.map(norm))
				expect(r.pageCount).toBe(fresh.pages.length)
				expect(r.sections).toEqual(fresh.sections)
				expect(r.overset).toEqual(fresh.overset)
			}
		},
		120_000
	)

	it.each(PUB_CORPUS.map((c) => [c.name, c.pub] as const))(
		'%s: a limited pass stops at the limit, the next full pass completes it',
		async (_name, base) => {
			const env = await loadPublication(base)
			const ref = structuredClone(base)
			const engine = new Engine(env)
			engine.setPublication(structuredClone(base))
			const first = engine.layout()
			const view = new Map(first.changed.map((pg): [string, PageDL] => [keyOf(pg), pg]))

			// Grow the first body paragraph of the first section: page 0 and the flow after it move.
			const story = ref.sections[0].story
			const q = story.paragraphs[1]
			const [r0, ...rest] = q.runs as Run[]
			const pt: ParagraphPatch = {
				story: story.id,
				bid: q.bid,
				op: 'set',
				paragraph: { ...q, runs: [{ ...r0, text: `${r0.text} ${HU}` }, ...rest] }
			}
			applyRef(ref, pt)
			engine.patch([pt])
			const fresh = layoutPublication(ref, env)

			const limit = 1
			const part = engine.layout(undefined, { limit })
			expect(part.partial).toBe(true)
			expect(part.pageCount).toBe(first.pageCount)
			expect(part.changed.length).toBeGreaterThan(0)
			const order = new Map(fresh.pages.map((pg, g): [string, number] => [keyOf(pg), g]))
			for (const pg of part.changed) {
				expect(order.get(keyOf(pg))).toBeLessThan(limit)
				view.set(keyOf(pg), pg)
			}

			const full = engine.layout()
			expect(full.partial).toBeUndefined()
			for (const pg of full.changed) view.set(keyOf(pg), pg)
			const counts = new Map(full.sections.map((s): [string, number] => [s.id, s.pages]))
			for (const [k, pg] of view) {
				if (pg.page.index >= (counts.get(pg.page.sec) ?? 0)) view.delete(k)
			}
			expect(view.size).toBe(fresh.pages.length)
			expect(
				fresh.pages.map((pg) => {
					const v = view.get(keyOf(pg))
					return v ? norm(v) : 'missing'
				})
			).toEqual(fresh.pages.map(norm))
			expect(full.pageCount).toBe(fresh.pages.length)
			expect(full.sections).toEqual(fresh.sections)
			expect(full.overset).toEqual(fresh.overset)
		}
	)
})
