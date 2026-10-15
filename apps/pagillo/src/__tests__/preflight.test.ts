// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { PageDL } from '@cloudillo/typeset'

import type { StoredFrame } from '../crdt/stored-types.js'
import {
	isEmptyRange,
	oversetTarget,
	type PreflightInput,
	parsePageRange,
	preflightRows
} from '../export/preflight.js'
import { type LayoutState, pageKey } from '../layout/useLayout.js'

describe('parsePageRange', () => {
	it('parses ranges and singles, 1-based to 0-based', () => {
		expect(parsePageRange('3–7, 10', 12)).toEqual([2, 3, 4, 5, 6, 9])
	})
	it('returns the bad part', () => {
		expect(parsePageRange('2-1', 12)).toBe('2-1')
		expect(parsePageRange('13', 12)).toBe('13')
	})
	it('flags an empty field as empty, not as a bad part', () => {
		for (const s of ['', ' ', ', ,']) expect(isEmptyRange(parsePageRange(s, 12))).toBe(true)
		expect(isEmptyRange(parsePageRange('x', 12))).toBe(false)
		expect(isEmptyRange(parsePageRange('1', 12))).toBe(false)
	})
})

describe('oversetTarget', () => {
	it('keeps the page fallback when the overset has a frame', () => {
		const layout = {
			overset: [{ sec: 's1', frame: 'f1' }],
			sections: [{ id: 's1', pages: 3 }]
		} as unknown as LayoutState
		expect(oversetTarget(layout)).toEqual({ page: pageKey('s1', 2), frame: 'f1' })
	})
	it('is undefined without overset', () => {
		const layout = { overset: [], sections: [{ id: 's1', pages: 3 }] } as unknown as LayoutState
		expect(oversetTarget(layout)).toBeUndefined()
	})
})

describe('preflightRows', () => {
	const t = (key: string) => key
	const layout = (l: Partial<LayoutState> = {}) =>
		({
			overset: [],
			sections: [{ id: 's1', pages: 2 }],
			pages: new Map(),
			fontsChanged: false,
			...l
		}) as unknown as LayoutState
	const input = (i: Partial<PreflightInput> = {}): PreflightInput => ({
		layout: layout(),
		frames: [],
		emptyImages: new Map(),
		...i
	})
	const keys = (i: PreflightInput) => preflightRows(i, t).map((r) => r.key)

	it('has no rows for a clean document', () => {
		expect(keys(input())).toEqual([])
	})
	it('overset', () => {
		const l = layout({ overset: [{ sec: 's1', frame: 'f1' }] as LayoutState['overset'] })
		expect(preflightRows(input({ layout: l }), t)).toEqual([
			{ key: 'overset', label: expect.any(String), page: 's1/1', frame: 'f1' }
		])
	})
	it('empty image frames', () => {
		const emptyImages = new Map([['s1/0', [{ id: 'f2', x: 0, y: 0, w: 1, h: 1, rot: 0 }]]])
		expect(preflightRows(input({ emptyImages }), t)).toEqual([
			{ key: 'empty', label: expect.any(String), page: 's1/0', frame: 'f2' }
		])
	})
	it('low dpi', () => {
		// 100 px across 1 inch (72 pt in Fx) = 100 dpi.
		const frame = {
			t: 'img',
			anchor: { sec: 's1', page: 1 },
			w: 72 * 1024,
			data: { fileId: 'a', px: [100, 100] }
		} as unknown as StoredFrame
		const sharp = { ...frame, data: { fileId: 'b', px: [300, 300] } } as StoredFrame
		expect(
			preflightRows(
				input({
					frames: [
						['f3', frame],
						['f4', sharp]
					]
				}),
				t
			)
		).toEqual([{ key: 'dpi', label: expect.any(String), page: 's1/1', frame: 'f3' }])
	})
	it('figure without alt text', () => {
		const pg = {
			items: [{ k: 'image', tag: 2 }],
			tags: [{ id: 1, role: 'Div', children: [{ id: 2, role: 'Figure', frame: 'f5' }] }]
		} as unknown as PageDL
		const l = layout({ pages: new Map([['s1/0', pg]]) })
		expect(preflightRows(input({ layout: l }), t)).toEqual([
			{ key: 'alt', label: expect.any(String), page: 's1/0', frame: 'f5' }
		])
	})
	it('changed fonts', () => {
		expect(keys(input({ layout: layout({ fontsChanged: true }) }))).toEqual(['fonts'])
	})
})

// vim: ts=4
