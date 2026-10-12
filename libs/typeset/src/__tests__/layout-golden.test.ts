// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { describe, expect, it } from '@jest/globals'

import { CORPUS, dlJson, layoutCase } from './corpus.js'

describe('layout golden', () => {
	it.each(CORPUS.map((c) => [c.name, c] as const))('%s', async (_name, c) => {
		const pages = await layoutCase(c)
		expect(pages.length).toBeGreaterThan(0)
		for (const pg of pages) {
			expect(pg.page.sec).toBe(c.story.id)
			for (const it of pg.items) {
				if (it.k !== 'glyphs') continue
				expect(it.advances.length).toBe(it.glyphs.length)
				expect(it.clusters.length).toBe(it.glyphs.length)
				expect(Number.isInteger(it.x) && Number.isInteger(it.y)).toBe(true)
				// Glyphs stay inside the region horizontally.
				let w = 0
				for (const a of it.advances) w += a
				expect(it.x).toBeGreaterThanOrEqual(c.region.x)
				expect(it.x + w).toBeLessThanOrEqual(c.region.x + c.region.w)
			}
			for (const ln of pg.lines) expect(ln.carets.length).toBe(ln.to - ln.from + 1)
		}
		expect(JSON.parse(dlJson(pages))).toMatchSnapshot()
	})

	it('breaks the long story onto several pages', async () => {
		const c = CORPUS.find((x) => x.name === 'en-multi-page')
		if (!c) throw new Error('corpus case missing')
		const pages = await layoutCase(c)
		expect(pages.length).toBeGreaterThan(1)
		expect(pages.map((pg) => pg.page.index)).toEqual(pages.map((_pg, i) => i))
	})

	it('hyphenates the narrow columns', async () => {
		for (const name of ['hu-narrow-hyphenated', 'de-narrow-hyphenated']) {
			const c = CORPUS.find((x) => x.name === name)
			if (!c) throw new Error('corpus case missing')
			const pages = await layoutCase(c)
			// A hyphenated line end: the line's last glyph run ends with the face's `-` glyph while
			// its text does not end with '-'.
			const hyphenated = pages.some((pg) =>
				pg.items.some(
					(it) =>
						it.k === 'glyphs' &&
						it.glyphs.length > 1 &&
						it.clusters[it.glyphs.length - 1] === it.clusters[it.glyphs.length - 2] &&
						!it.text.endsWith('-')
				)
			)
			expect(hyphenated).toBe(true)
		}
	})
})
