// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** The tour's target resolver: rail and dock both carry a target, only one is rendered. */

import { bubbleLayout, findTourTarget } from '../tour/steps.js'

function fakeEl(visible: boolean) {
	return { getClientRects: () => ({ length: visible ? 1 : 0 }) } as unknown as Element
}

function fakeRoot(els: Element[]) {
	return { querySelectorAll: () => els } as unknown as ParentNode
}

describe('findTourTarget', () => {
	// node env has no CSS global
	beforeAll(() => {
		globalThis.CSS ??= { escape: (s: string) => s } as typeof CSS
	})

	it('picks the visible duplicate', () => {
		const hidden = fakeEl(false)
		const shown = fakeEl(true)
		expect(findTourTarget('nav', fakeRoot([hidden, shown]))).toBe(shown)
	})

	it('returns null when none is visible', () => {
		expect(findTourTarget('nav', fakeRoot([fakeEl(false)]))).toBeNull()
		expect(findTourTarget('nav', fakeRoot([]))).toBeNull()
	})
})

describe('bubbleLayout', () => {
	const rect = (top: number, left: number, width: number, height: number) =>
		({ top, left, right: left + width, bottom: top + height, width, height }) as DOMRect

	it('centers without a target', () => {
		expect(bubbleLayout(null, true, 1000, 800)).toEqual({ mode: 'centered' })
	})

	it('places below, above, then beside', () => {
		expect(bubbleLayout(rect(10, 10, 50, 50), true, 1000, 800).placement).toBe('bottom')
		expect(bubbleLayout(rect(700, 10, 50, 50), true, 1000, 800).placement).toBe('top')
		expect(bubbleLayout(rect(0, 10, 50, 800), true, 1000, 800).placement).toBe('right-start')
		expect(bubbleLayout(rect(0, 900, 50, 800), true, 1000, 800).placement).toBe('left-start')
	})

	it('puts the narrow-screen bar away from the target', () => {
		expect(bubbleLayout(rect(10, 10, 50, 50), false, 400, 800).mode).toBe('bar bottom')
		expect(bubbleLayout(rect(700, 10, 50, 50), false, 400, 800).mode).toBe('bar top')
		expect(bubbleLayout(rect(10, 10, 50, 50), true, 400, 800).mode).toBeUndefined()
	})
})

// vim: ts=4
