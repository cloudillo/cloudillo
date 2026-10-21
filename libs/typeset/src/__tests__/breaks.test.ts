// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from '@jest/globals'

import { loadFace } from '../fonts/loader.js'
import { FontRegistry } from '../fonts/registry.js'
import { initHarfBuzz, shapeRun } from '../shape/hb.js'
import { type BreakOpp, findBreaks, hyphenGlyph } from '../text/breaks.js'
import { fetchBytes, SHY } from './corpus.js'

function checkShape(opps: BreakOpp[], len: number) {
	for (let i = 1; i < opps.length; i++) expect(opps[i].offset).toBeGreaterThan(opps[i - 1].offset)
	expect(opps[opps.length - 1]).toEqual({ offset: len, kind: 'mandatory' })
}

const hyphens = (opps: BreakOpp[]) => opps.filter((o) => o.kind === 'hyphen').map((o) => o.offset)

describe('findBreaks', () => {
	it('breaks after spaces and ends with a mandatory break', () => {
		expect(findBreaks('Hello world', 'en', false)).toEqual([
			{ offset: 6, kind: 'allowed' },
			{ offset: 11, kind: 'mandatory' }
		])
	})

	it('reports an empty text as one mandatory break', () => {
		expect(findBreaks('', 'en', true)).toEqual([{ offset: 0, kind: 'mandatory' }])
	})

	it('marks a line feed as mandatory', () => {
		expect(findBreaks('a\nb', 'en', false)).toContainEqual({ offset: 2, kind: 'mandatory' })
	})

	it('treats a soft hyphen as a hyphen break', () => {
		const text = `co${SHY}operate`
		const opps = findBreaks(text, 'en', false)
		expect(opps).toContainEqual({ offset: 3, kind: 'hyphen' })
		checkShape(opps, text.length)
	})

	it('hyphenates only when asked', () => {
		const text = 'internationalization'
		expect(hyphens(findBreaks(text, 'en', false))).toEqual([])
		const h = hyphens(findBreaks(text, 'en-US', true))
		expect(h.length).toBeGreaterThan(0)
		for (const o of h) {
			expect(o).toBeGreaterThan(0)
			expect(o).toBeLessThan(text.length)
		}
	})

	it.each([
		['hu', 'megszentségteleníthetetlenség'],
		['de', 'Donaudampfschifffahrtsgesellschaft']
	])('has a %s dictionary', (lang, word) => {
		const opps = findBreaks(word, lang, true)
		expect(hyphens(opps).length).toBeGreaterThan(1)
		checkShape(opps, word.length)
	})

	it('does not hyphenate unknown languages', () => {
		expect(hyphens(findBreaks('internationalization', 'xx', true))).toEqual([])
	})

	it('stays sorted and unique on mixed text', () => {
		const text = `Typesetting arranges ${SHY}types; hyphenation helps justification.\nNew line.`
		checkShape(findBreaks(text, 'en', true), text.length)
	})

	it('counts clusters in UTF-16 units', () => {
		const text = 'a 😀 b'
		expect(findBreaks(text, 'en', false)).toEqual([
			{ offset: 2, kind: 'allowed' },
			{ offset: 5, kind: 'allowed' },
			{ offset: 6, kind: 'mandatory' }
		])
	})
})

describe('hyphenGlyph', () => {
	it('shapes the hyphen of Lato', async () => {
		await initHarfBuzz()
		const ref = new FontRegistry().resolveFace('Lato', 400, false)
		await loadFace(ref, fetchBytes)
		const g = hyphenGlyph(ref, shapeRun)
		expect(g.gid).toBe(330)
		expect(g.advance).toBeGreaterThan(0)
	})
})
