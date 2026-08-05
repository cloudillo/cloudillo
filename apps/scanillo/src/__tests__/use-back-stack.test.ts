// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The overlay <-> session-history bridge.
 *
 * The load-bearing case is the second: two overlays closed inside
 * TRAVERSAL_TIMEOUT_MS. An unheld watchdog fires while the second traversal is
 * still in flight, clears its in-flight flag, and that traversal's `popstate` is
 * then read as a user back press — closing an extra overlay.
 */

import { jest } from '@jest/globals'
import { act, renderHook } from '@testing-library/react'

import { useBackStack } from '../hooks/use-back-stack.js'

// Mirrors use-back-stack.ts (module-private).
const TRAVERSAL_TIMEOUT_MS = 500

let go: jest.Mock<(delta: number) => void>

/**
 * jsdom's own `history.go` traverses asynchronously and would fire its own
 * `popstate`, so the traversal is stubbed and the reply dispatched by hand —
 * the ordering between the two is exactly what is under test.
 */
function stubHistoryGo(): void {
	go = jest.fn<(delta: number) => void>()
	Object.defineProperty(window.history, 'go', { value: go, configurable: true })
}

/** The browser reporting that a traversal (ours or the user's) has landed. */
function popState(): void {
	act(() => {
		window.dispatchEvent(new PopStateEvent('popstate'))
	})
}

beforeEach(() => {
	jest.useFakeTimers()
	stubHistoryGo()
})

afterEach(() => {
	jest.useRealTimers()
})

describe('useBackStack', () => {
	it('pushes one sentinel per overlay and traverses back as they close', () => {
		const onBack = jest.fn()
		const { rerender } = renderHook(({ depth }) => useBackStack(depth, onBack), {
			initialProps: { depth: 2 }
		})
		expect(go).not.toHaveBeenCalled()

		rerender({ depth: 0 })
		expect(go).toHaveBeenCalledWith(-2)
		// Ours, not the user's — closing an overlay must not re-close it.
		popState()
		expect(onBack).not.toHaveBeenCalled()
	})

	it('reports a real back press once per press', () => {
		const onBack = jest.fn()
		renderHook(() => useBackStack(1, onBack))

		popState()
		expect(onBack).toHaveBeenCalledTimes(1)

		// The sentinel is spent: the next press leaves the app.
		popState()
		expect(onBack).toHaveBeenCalledTimes(1)
	})

	it('does not close an extra overlay when two traversals land within the timeout', () => {
		const onBack = jest.fn()
		const { rerender } = renderHook(({ depth }) => useBackStack(depth, onBack), {
			initialProps: { depth: 3 }
		})

		// First overlay closes.
		rerender({ depth: 2 })
		expect(go).toHaveBeenLastCalledWith(-1)
		popState()

		// Second one closes 100 ms later, well inside the first watchdog's window.
		act(() => {
			jest.advanceTimersByTime(100)
		})
		rerender({ depth: 1 })
		expect(go).toHaveBeenLastCalledWith(-1)

		// The moment the *first* watchdog would have fired. Left armed, it clears
		// the flag the second traversal is still relying on.
		act(() => {
			jest.advanceTimersByTime(TRAVERSAL_TIMEOUT_MS - 100)
		})
		popState()
		expect(onBack).not.toHaveBeenCalled()
	})

	it('still recovers when a traversal never reports back', () => {
		const onBack = jest.fn()
		const { rerender } = renderHook(({ depth }) => useBackStack(depth, onBack), {
			initialProps: { depth: 2 }
		})

		rerender({ depth: 1 })
		expect(go).toHaveBeenCalledWith(-1)

		// No popstate ever arrives — the watchdog must release the flag, or the
		// reconcile effect is wedged for the rest of the session.
		act(() => {
			jest.advanceTimersByTime(TRAVERSAL_TIMEOUT_MS)
		})
		popState()
		expect(onBack).toHaveBeenCalledTimes(1)
	})

	it('clears a pending watchdog on unmount', () => {
		const onBack = jest.fn()
		const { rerender, unmount } = renderHook(({ depth }) => useBackStack(depth, onBack), {
			initialProps: { depth: 2 }
		})

		rerender({ depth: 1 })
		expect(jest.getTimerCount()).toBeGreaterThan(0)

		unmount()
		expect(jest.getTimerCount()).toBe(0)
	})
})

// vim: ts=4
