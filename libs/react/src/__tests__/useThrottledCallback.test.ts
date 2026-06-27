// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { jest } from '@jest/globals'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useThrottledCallback } from '../useThrottledCallback.js'

// Minimal renderHook: render a component that calls `hook()` and capture its
// return value, avoiding a @testing-library dependency.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function renderHook<T>(hook: () => T): { result: { current: T }; unmount: () => void } {
	const container = document.createElement('div')
	const root = createRoot(container)
	const result = { current: undefined as unknown as T }
	function Probe() {
		result.current = hook()
		return null
	}
	act(() => {
		root.render(React.createElement(Probe))
	})
	return {
		result,
		unmount: () =>
			act(() => {
				root.unmount()
			})
	}
}

describe('useThrottledCallback', () => {
	beforeEach(() => {
		jest.useFakeTimers()
	})
	afterEach(() => {
		jest.clearAllTimers()
		jest.useRealTimers()
	})

	it('fires once per window on the trailing edge', () => {
		const spy = jest.fn()
		const { result, unmount } = renderHook(() => useThrottledCallback(spy, 1000))
		const [throttled] = result.current

		act(() => {
			throttled(1)
		})
		// Not fired immediately (trailing-edge).
		expect(spy).not.toHaveBeenCalled()

		act(() => {
			jest.advanceTimersByTime(1000)
		})
		expect(spy).toHaveBeenCalledTimes(1)
		expect(spy).toHaveBeenLastCalledWith(1)
		unmount()
	})

	it('coalesces rapid calls to the last args', () => {
		const spy = jest.fn()
		const { result, unmount } = renderHook(() => useThrottledCallback(spy, 1000))
		const [throttled] = result.current

		act(() => {
			throttled(1)
			throttled(2)
			throttled(3)
		})
		act(() => {
			jest.advanceTimersByTime(1000)
		})
		expect(spy).toHaveBeenCalledTimes(1)
		expect(spy).toHaveBeenLastCalledWith(3)
		unmount()
	})

	it('flush() fires the pending call immediately and clears the timer', () => {
		const spy = jest.fn()
		const { result, unmount } = renderHook(() => useThrottledCallback(spy, 1000))
		const [throttled, flush] = result.current

		act(() => {
			throttled(42)
		})
		act(() => {
			flush()
		})
		expect(spy).toHaveBeenCalledTimes(1)
		expect(spy).toHaveBeenLastCalledWith(42)

		// Timer was cleared — advancing time must not fire a second time.
		act(() => {
			jest.advanceTimersByTime(2000)
		})
		expect(spy).toHaveBeenCalledTimes(1)
		unmount()
	})
})

// vim: ts=4
