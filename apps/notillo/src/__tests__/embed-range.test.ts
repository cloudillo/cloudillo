// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	firstHeading,
	formatBlockRangeNav,
	parseBlockRangeNav,
	resolveBlockRange
} from '../embed-range.js'

const blocks = ['a', 'b', 'c', 'd'].map((id) => ({ id }))

describe('block range nav', () => {
	it('round-trips, including ids with a colon', () => {
		expect(formatBlockRangeNav('p1', 'a', 'c')).toBe('blk:p1:a:c')
		expect(parseBlockRangeNav('blk:p1:a:c')).toEqual({ pageId: 'p1', start: 'a', end: 'c' })
		const nav = formatBlockRangeNav('p:1', 'a:x', 'c')
		expect(parseBlockRangeNav(nav)).toEqual({ pageId: 'p:1', start: 'a:x', end: 'c' })
	})

	it('rejects anything that is not a block range', () => {
		expect(parseBlockRangeNav(undefined)).toBeNull()
		expect(parseBlockRangeNav('p1')).toBeNull()
		expect(parseBlockRangeNav('blk:p1:a')).toBeNull()
		expect(parseBlockRangeNav('blk:p1::c')).toBeNull()
		expect(parseBlockRangeNav('blk:p1:%E0:c')).toBeNull()
	})
})

describe('resolveBlockRange', () => {
	it('resolves start..end', () => {
		expect(resolveBlockRange(blocks, 'b', 'c')).toEqual({ from: 1, to: 2 })
	})
	it('single block when start = end', () => {
		expect(resolveBlockRange(blocks, 'b', 'b')).toEqual({ from: 1, to: 1 })
	})
	it('start gone ⇒ missing', () => {
		expect(resolveBlockRange(blocks, 'x', 'c')).toBeNull()
	})
	it('end gone ⇒ start to the end of the page', () => {
		expect(resolveBlockRange(blocks, 'b', 'x')).toEqual({ from: 1, to: 3 })
	})
	it('end before start ⇒ start only', () => {
		expect(resolveBlockRange(blocks, 'c', 'a')).toEqual({ from: 2, to: 2 })
	})
})

describe('firstHeading', () => {
	it('joins text runs and nested link labels', () => {
		const blocks = [
			{ type: 'paragraph', content: [{ text: 'skip' }] },
			{
				type: 'heading',
				content: [{ text: ' Intro to ' }, { type: 'link', content: [{ text: 'Notillo' }] }]
			}
		]
		expect(firstHeading(blocks)).toBe('Intro to Notillo')
	})
	it('no heading ⇒ undefined', () => {
		expect(firstHeading([{ type: 'paragraph', content: [{ text: 'x' }] }])).toBeUndefined()
	})
	it('whitespace-only heading ⇒ undefined', () => {
		expect(firstHeading([{ type: 'heading', content: [{ text: '  ' }] }])).toBeUndefined()
	})
})
