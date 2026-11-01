// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { classifyWheel, WHEEL_ZOOM_K } from 'react-svg-canvas'

function wheel(over: Partial<Parameters<typeof classifyWheel>[0]>) {
	return { deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false, ...over }
}

function expectZoom(action: ReturnType<typeof classifyWheel>, factor: number) {
	expect(action.kind).toBe('zoom')
	if (action.kind === 'zoom') expect(action.factor).toBeCloseTo(factor)
}

function expectPan(action: ReturnType<typeof classifyWheel>, dx: number, dy: number) {
	expect(action.kind).toBe('pan')
	if (action.kind === 'pan') {
		// toBeCloseTo, not toEqual: a zero delta negates to -0
		expect(action.dx).toBeCloseTo(dx)
		expect(action.dy).toBeCloseTo(dy)
	}
}

describe('classifyWheel', () => {
	it('zooms in proportion to a small ctrl (trackpad pinch) delta', () => {
		expectZoom(classifyWheel(wheel({ deltaY: 3, ctrlKey: true })), Math.exp(-3 * WHEEL_ZOOM_K))
		expectZoom(classifyWheel(wheel({ deltaY: -3, metaKey: true })), Math.exp(3 * WHEEL_ZOOM_K))
	})

	it('clamps a ctrl + notch to the classic x0.8 / x1.25 step', () => {
		expectZoom(classifyWheel(wheel({ deltaY: 100, ctrlKey: true })), 0.8)
		expectZoom(classifyWheel(wheel({ deltaY: -100, ctrlKey: true })), 1.25)
	})

	it('zooms on a mouse notch of +-100 / +-120 px with no deltaX', () => {
		expectZoom(classifyWheel(wheel({ deltaY: 100 })), 0.8)
		expectZoom(classifyWheel(wheel({ deltaY: -100 })), 1.25)
		expectZoom(classifyWheel(wheel({ deltaY: 120 })), 0.8)
		expectZoom(classifyWheel(wheel({ deltaY: -120 })), 1.25)
	})

	it('zooms on a line-mode delta', () => {
		expectZoom(classifyWheel(wheel({ deltaY: 3, deltaMode: 1 })), 0.8)
	})

	it('pans on a fractional touchpad delta', () => {
		expectPan(classifyWheel(wheel({ deltaY: 2.5 })), 0, -2.5)
	})

	it('pans on a two-axis delta even when deltaY is notch-sized', () => {
		expectPan(classifyWheel(wheel({ deltaX: 10, deltaY: 100 })), -10, -100)
	})

	it('pans horizontally on shift-wheel', () => {
		expectPan(classifyWheel(wheel({ deltaX: 100 })), -100, 0)
	})
})
