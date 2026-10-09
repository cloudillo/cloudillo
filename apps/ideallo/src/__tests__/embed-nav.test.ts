// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { formatRectNav, parseIdealloNav } from '../utils/embed-nav.js'

describe('parseIdealloNav', () => {
	it('defaults to the whole board', () => {
		expect(parseIdealloNav()).toEqual({ kind: 'board' })
		expect(parseIdealloNav('')).toEqual({ kind: 'board' })
	})

	it('parses a rect', () => {
		expect(parseIdealloNav('rect:-10,20,300,200')).toEqual({
			kind: 'rect',
			x: -10,
			y: 20,
			w: 300,
			h: 200
		})
	})

	it('rejects malformed or empty rects', () => {
		expect(parseIdealloNav('rect:1,2,3')).toEqual({ kind: 'board' })
		expect(parseIdealloNav('rect:1,2,0,5')).toEqual({ kind: 'board' })
		expect(parseIdealloNav('rect:a,b,c,d')).toEqual({ kind: 'board' })
	})

	it('parses a frame', () => {
		expect(parseIdealloNav('frame:abc')).toEqual({ kind: 'frame', id: 'abc' })
		expect(parseIdealloNav('frame:')).toEqual({ kind: 'board' })
	})

	it('parses the legacy centre/zoom form', () => {
		expect(parseIdealloNav('c=100,-50;z=2')).toEqual({
			kind: 'legacy',
			cx: 100,
			cy: -50,
			zoom: 2
		})
		expect(parseIdealloNav('c=1,2')).toEqual({ kind: 'legacy', cx: 1, cy: 2, zoom: 1 })
		expect(parseIdealloNav('z=2')).toEqual({ kind: 'board' })
	})

	it('treats unknown kinds as the board', () => {
		expect(parseIdealloNav('page:x')).toEqual({ kind: 'board' })
	})
})

describe('formatRectNav', () => {
	it('rounds to integers and round-trips', () => {
		const nav = formatRectNav({ x: 1.4, y: -2.6, w: 100.5, h: 50 })
		expect(nav).toBe('rect:1,-3,101,50')
		expect(parseIdealloNav(nav)).toEqual({ kind: 'rect', x: 1, y: -3, w: 101, h: 50 })
	})
})
