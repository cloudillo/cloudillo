// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { Paragraph } from '@cloudillo/typeset'
import type { Hunspell } from 'hunspell-wasm'

import { check, leaves } from '../worker/spell.js'

const h = { testSpelling: (w: string) => w !== 'teh' } as unknown as Hunspell

describe('spell check', () => {
	it('flags misspelled words by UTF-16 range, skipping digits and ignored words', () => {
		expect(check(h, 'teh cat', 'en', new Set())).toEqual([
			{ from: 0, to: 3, lang: 'en', word: 'teh' }
		])
		// '😀' is two UTF-16 units.
		expect(check(h, '😀 teh', 'en', new Set())).toEqual([
			{ from: 3, to: 6, lang: 'en', word: 'teh' }
		])
		expect(check(h, 'teh', 'en', new Set(['teh']))).toEqual([])
		const h2 = { testSpelling: () => false } as unknown as Hunspell
		expect(check(h2, '42 a1, -', 'en', new Set())).toEqual([])
	})

	it('yields table cell paragraphs, not the table', () => {
		const para = (bid: string): Paragraph => ({ bid, style: '', overrides: {}, runs: [] })
		const table = {
			bid: 'T',
			style: '',
			overrides: {},
			runs: {
				k: 'table',
				rows: [
					{
						cells: [
							{ paragraphs: [para('c1'), para('c2')] },
							{ paragraphs: [para('c3')] }
						]
					}
				]
			}
		} as unknown as Paragraph
		expect([...leaves([para('a'), table, para('b')])].map((p) => p.bid)).toEqual([
			'a',
			'c1',
			'c2',
			'c3',
			'b'
		])
	})
})

// vim: ts=4
