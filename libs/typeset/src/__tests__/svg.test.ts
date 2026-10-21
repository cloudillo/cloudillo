// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from '@jest/globals'

import type { FontRef, PageDL } from '../display-list.js'
import { ptToFx } from '../fixed.js'
import { collectGlyphs, glyphId, renderPageSvg, renderPageSvgStandalone } from '../svg/render.js'
import { CORPUS, glyphPath, layoutCase } from './corpus.js'

const FONT: FontRef = {
	family: 'X',
	weight: 400,
	italic: false,
	file: 'x/X.ttf',
	sha256: 'abc',
	upem: 1000
}
const FONT2: FontRef = { ...FONT, file: 'x/Y.ttf', sha256: 'def' }

function page(): PageDL {
	return {
		page: { sec: 's', index: 0, w: ptToFx(100), h: ptToFx(50), master: '' },
		items: [
			{
				k: 'glyphs',
				font: FONT,
				size: ptToFx(10),
				color: '#112233',
				x: ptToFx(10),
				y: ptToFx(20),
				glyphs: Uint16Array.from([7, 5, 7]),
				advances: Int32Array.from([5120, 5120, 5120]),
				text: 'a<&',
				clusters: Uint32Array.from([0, 1, 2]),
				tag: 1
			},
			{
				k: 'glyphs',
				font: FONT2,
				size: ptToFx(10),
				color: '#000000',
				x: ptToFx(10),
				y: ptToFx(40),
				glyphs: Uint16Array.from([3]),
				advances: Int32Array.from([5120]),
				offsets: Int32Array.from([0, 1024]),
				text: 'b',
				clusters: Uint32Array.from([0]),
				tag: 2
			},
			{ k: 'rect', box: { x: 0, y: 0, w: 1024, h: 2048 }, fill: '#ff0000' },
			{ k: 'line', x1: 0, y1: 1024, x2: 2048, y2: 1024, color: '#000000', width: 512 },
			{
				k: 'link',
				box: { x: 0, y: 0, w: 1024, h: 1024 },
				href: 'https://example.com/?a=1&b=2'
			},
			{ k: 'link', box: { x: 0, y: 0, w: 1024, h: 1024 }, href: 'javascript:alert(1)' }
		],
		lines: [],
		tags: [
			{ id: 1, role: 'P' },
			{ id: 2, role: 'P' }
		],
		rev: 0
	}
}

describe('collectGlyphs', () => {
	it('groups by face, deduplicates and sorts', () => {
		expect(collectGlyphs(page())).toEqual([
			{ font: FONT, gids: [5, 7] },
			{ font: FONT2, gids: [3] }
		])
	})
})

describe('renderPageSvg', () => {
	const svg = renderPageSvg(page(), { glyphHref: (f, gid) => `/glyphs.svg#${glyphId(f, gid)}` })

	it('sizes the page in points', () => {
		expect(svg).toMatch(
			/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="100pt" height="50pt" viewBox="0 0 100 50">/
		)
		expect(svg.endsWith('</svg>')).toBe(true)
	})

	it('places glyph runs with one <use> per glyph in font units', () => {
		expect(svg).toContain(
			'<g fill="#112233" transform="translate(10 20) scale(0.01)">' +
				'<use href="/glyphs.svg#g-abc-7" x="0"/><use href="/glyphs.svg#g-abc-5" x="500"/>' +
				'<use href="/glyphs.svg#g-abc-7" x="1000"/></g>'
		)
		// [dx, dy] offsets are Fx, y down: 1pt at 10pt/1000upem = 100 font units.
		expect(svg).toContain('<use href="/glyphs.svg#g-def-3" x="0" y="100"/>')
	})

	it('never uses SVG text or inline outlines in shared mode', () => {
		expect(svg).not.toContain('<text')
		expect(svg).not.toContain('<defs')
		expect(svg).not.toContain('<path')
	})

	it('draws rects, lines and safe links only', () => {
		expect(svg).toContain('<rect x="0" y="0" width="1" height="2" fill="#ff0000"/>')
		expect(svg).toContain(
			'<line x1="0" y1="1" x2="2" y2="1" stroke="#000000" stroke-width="0.5"/>'
		)
		expect(svg).toContain('<a href="https://example.com/?a=1&amp;b=2">')
		expect(svg).not.toContain('javascript:')
	})
})

describe('renderPageSvgStandalone', () => {
	it('inlines each used outline once, flipped to y down', () => {
		const svg = renderPageSvgStandalone(page(), (f, gid) => `M0 0L${gid} ${f.upem}Z`)
		expect(svg).toContain(
			'<defs><path id="g-abc-5" transform="scale(1 -1)" d="M0 0L5 1000Z"/>' +
				'<path id="g-abc-7" transform="scale(1 -1)" d="M0 0L7 1000Z"/>' +
				'<path id="g-def-3" transform="scale(1 -1)" d="M0 0L3 1000Z"/></defs>'
		)
		expect(svg).toContain('<use href="#g-abc-5" x="500"/>')
	})

	it('carries the page text, escaped, in <title>/<desc>', () => {
		const svg = renderPageSvgStandalone(page(), () => '')
		expect(svg).toContain('<title>Page 1</title><desc>a&lt;&amp;\nb</desc>')
	})

	it('renders a real laid-out page', async () => {
		const pages = await layoutCase(CORPUS[0])
		const svg = renderPageSvgStandalone(pages[0], glyphPath)
		const used = collectGlyphs(pages[0]).reduce((n, g) => n + g.gids.length, 0)
		let total = 0
		for (const it of pages[0].items) if (it.k === 'glyphs') total += it.glyphs.length
		expect(svg.match(/<path id="/g)?.length).toBe(used)
		expect(svg.match(/<use /g)?.length).toBe(total)
		expect(svg).toContain('<desc>Typesetting\n')
		expect(svg).not.toContain('<text')
	})
})
