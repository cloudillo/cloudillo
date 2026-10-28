// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * useTouchGestures: long press, swipe vs. scroll lock, swipe commit and clamping.
 *
 * `.test.tsx` so jest gives this suite the jsdom environment (see jest.config.cjs).
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, renderHook } from '@testing-library/react'
import type * as React from 'react'

import {
	LONG_PRESS_MS,
	MOVE_TOLERANCE_PX,
	SWIPE_MAX_PX,
	SWIPE_PX,
	type TouchGestureOptions,
	useTouchGestures
} from '../ui/touch-gestures.js'

function touch(clientX: number, clientY: number) {
	return { touches: [{ clientX, clientY }] } as unknown as React.TouchEvent<HTMLElement>
}

function click() {
	return { preventDefault: jest.fn() }
}

function setup(over: Partial<TouchGestureOptions> = {}) {
	const o = {
		enabled: true,
		onMenu: jest.fn(),
		onSwipeLeft: jest.fn(),
		onSwipeRight: jest.fn(),
		...over
	}
	const { result } = renderHook(() => useTouchGestures(o))
	const h = () => result.current.handlers
	return {
		o,
		result,
		start: (x: number, y: number) => act(() => h().onTouchStart?.(touch(x, y))),
		move: (x: number, y: number) => act(() => h().onTouchMove?.(touch(x, y))),
		end: () => act(() => h().onTouchEnd?.(touch(0, 0))),
		cancel: () => act(() => h().onTouchCancel?.(touch(0, 0))),
		click: () => {
			const e = click()
			h().onClickCapture?.(e as unknown as React.MouseEvent<HTMLElement>)
			return e.preventDefault
		}
	}
}

beforeEach(() => {
	jest.useFakeTimers()
})
afterEach(() => {
	jest.useRealTimers()
})

describe('useTouchGestures', () => {
	it('long press opens the menu at the start point and swallows the next click', () => {
		const t = setup()
		t.start(100, 200)
		act(() => {
			jest.advanceTimersByTime(LONG_PRESS_MS)
		})
		expect(t.o.onMenu).toHaveBeenCalledWith({ x: 100, y: 200 })
		t.end()
		expect(t.click()).toHaveBeenCalled()
	})

	it('a move past the tolerance cancels the long press', () => {
		const t = setup()
		t.start(100, 200)
		t.move(100 + MOVE_TOLERANCE_PX + 1, 200)
		act(() => {
			jest.advanceTimersByTime(LONG_PRESS_MS)
		})
		expect(t.o.onMenu).not.toHaveBeenCalled()
	})

	it('a mostly vertical move locks to scroll', () => {
		const t = setup()
		t.start(100, 200)
		t.move(105, 260)
		t.move(100 + SWIPE_PX + 10, 260)
		expect(t.result.current.swipeX).toBe(0)
		t.end()
		expect(t.o.onSwipeLeft).not.toHaveBeenCalled()
		expect(t.o.onSwipeRight).not.toHaveBeenCalled()
		expect(t.click()).not.toHaveBeenCalled()
	})

	it('a horizontal swipe past SWIPE_PX commits on release, clamped to SWIPE_MAX_PX', () => {
		const t = setup()
		t.start(200, 200)
		t.move(200 - SWIPE_MAX_PX - 50, 205)
		expect(t.result.current.swipeX).toBe(-SWIPE_MAX_PX)
		t.end()
		expect(t.result.current.swipeX).toBe(0)
		expect(t.o.onSwipeLeft).toHaveBeenCalledTimes(1)
		expect(t.click()).toHaveBeenCalled()

		t.start(200, 200)
		t.move(200 + SWIPE_PX, 200)
		expect(t.result.current.swipeX).toBe(SWIPE_PX)
		t.end()
		expect(t.o.onSwipeRight).toHaveBeenCalledTimes(1)
	})

	it('a swipe short of SWIPE_PX does not commit', () => {
		const t = setup()
		t.start(200, 200)
		t.move(200 - SWIPE_PX + 1, 200)
		t.end()
		expect(t.o.onSwipeLeft).not.toHaveBeenCalled()
	})

	it('clamps to 0 on a side with no handler', () => {
		const t = setup({ onSwipeRight: undefined })
		t.start(200, 200)
		t.move(200 + SWIPE_MAX_PX, 200)
		expect(t.result.current.swipeX).toBe(0)
		t.end()
		expect(t.o.onSwipeLeft).not.toHaveBeenCalled()
	})

	it('touch cancel never commits a swipe', () => {
		const t = setup()
		t.start(200, 200)
		t.move(200 - SWIPE_MAX_PX, 200)
		t.cancel()
		expect(t.result.current.swipeX).toBe(0)
		expect(t.o.onSwipeLeft).not.toHaveBeenCalled()
	})

	it('does nothing when disabled', () => {
		const t = setup({ enabled: false })
		t.start(200, 200)
		act(() => {
			jest.advanceTimersByTime(LONG_PRESS_MS)
		})
		t.move(200 - SWIPE_MAX_PX, 200)
		t.end()
		expect(t.o.onMenu).not.toHaveBeenCalled()
		expect(t.o.onSwipeLeft).not.toHaveBeenCalled()
		expect(t.result.current.swipeX).toBe(0)
		expect(t.click()).not.toHaveBeenCalled()
	})
})

// vim: ts=4
