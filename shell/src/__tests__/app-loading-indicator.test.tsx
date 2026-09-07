// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The overlay must never be left mounted at `opacity: 0`.
 *
 * `AppLoadingIndicator` resets `fadingOut` only from the 200ms fade timer, and `stage`
 * is an effect dependency — so a stage change during the fade ran the cleanup, killed
 * the timer and stranded `fadingOut === true`. The embed hits this every time: the app
 * bus fires `notifyReady('auth')` on a successful handshake, and the CRDT socket then
 * closes 4403 ~50ms later. Spinner → "Access denied" → blank box.
 */

import { jest } from '@jest/globals'
import { act, render } from '@testing-library/react'
import * as React from 'react'

jest.unstable_mockModule('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key })
}))

jest.unstable_mockModule('@cloudillo/react', () => ({
	Button: ({ children }: { children?: React.ReactNode }) => (
		<button type="button">{children}</button>
	),
	LoadingSpinner: () => <div data-testid="spinner" />,
	mergeClasses: (...c: unknown[]) => c.filter(Boolean).join(' ')
}))

const { AppLoadingIndicator } = await import('../apps/AppLoadingIndicator.js')

const SHOW_DELAY_MS = 300
const FADE_MS = 200

beforeEach(() => {
	jest.useFakeTimers()
})

afterEach(() => {
	jest.useRealTimers()
})

function advance(ms: number) {
	act(() => {
		jest.advanceTimersByTime(ms)
	})
}

describe('AppLoadingIndicator', () => {
	it('should show the error at full opacity when it arrives mid-fade', () => {
		const { container, rerender } = render(<AppLoadingIndicator stage="connecting" />)
		advance(SHOW_DELAY_MS + 1)

		rerender(<AppLoadingIndicator stage="ready" />)
		// Inside the fade window: the timer that resets `fadingOut` has not fired yet.
		advance(100)

		rerender(<AppLoadingIndicator stage="error" errorCode={4403} />)
		advance(FADE_MS + 1)

		const overlay = container.querySelector('.c-app-loading')
		expect(overlay).not.toBeNull()
		expect(overlay?.className).not.toContain('c-app-loading--fade-out')
		expect(overlay?.textContent).toContain('Access denied')
	})

	it('should still hide once ready with no error', () => {
		const { container, rerender } = render(<AppLoadingIndicator stage="connecting" />)
		advance(SHOW_DELAY_MS + 1)
		const overlay = container.querySelector('.c-app-loading')
		expect(overlay).not.toBeNull()
		// Progress is a status; only a failure interrupts a screen reader.
		expect(overlay?.getAttribute('role')).toBe('status')
		expect(overlay?.getAttribute('aria-live')).toBe('polite')

		rerender(<AppLoadingIndicator stage="ready" />)
		advance(FADE_MS + 1)

		expect(container.innerHTML).toBe('')
	})

	// The key remounts the container, so the alert is a fresh live region rather than a
	// status region whose role was swapped underneath the screen reader.
	it('should become an alert when the error follows a spinner', () => {
		const { container, rerender } = render(<AppLoadingIndicator stage="syncing" />)
		advance(SHOW_DELAY_MS + 1)
		expect(container.querySelector('.c-app-loading')?.getAttribute('role')).toBe('status')

		rerender(<AppLoadingIndicator stage="error" errorCode={4404} />)

		const overlay = container.querySelector('.c-app-loading')
		expect(overlay?.getAttribute('role')).toBe('alert')
		expect(overlay?.getAttribute('aria-live')).toBe('assertive')
	})

	it('should map the error code to text from a cold mount', () => {
		const { container } = render(<AppLoadingIndicator stage="error" errorCode={4403} />)
		advance(SHOW_DELAY_MS + 1)

		const overlay = container.querySelector('.c-app-loading')
		expect(overlay?.textContent).toContain('Access denied')
		expect(overlay?.getAttribute('role')).toBe('alert')
		expect(overlay?.getAttribute('aria-live')).toBe('assertive')
	})
})

// vim: ts=4
