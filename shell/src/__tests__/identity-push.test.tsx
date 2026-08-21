// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The corrective identity push for a share-link mount.
 *
 * `MicrofrontendContainer` initialises an app as soon as it has a token, which on
 * a share link happens while `authAtom` is still `undefined` — so a signed-in
 * user gets initialised as an anonymous visitor and, because the init effect
 * deliberately never re-runs on auth, stays one. `useIdentityPush` re-sends the
 * recorded payload with the identity swapped once auth resolves.
 *
 * The payload must go back out IN FULL: `auth:init.push` rebuilds the app's state
 * wholesale (libs/core/src/message-bus/app-bus.ts), so a partial one would wipe
 * the app's token, access level and params — and the fields that can have moved
 * since `record()` (token, lifetime, theme) have to be re-read rather than
 * replayed, or the push rolls back a renewal or a theme switch.
 *
 * `.test.tsx` so jest gives this suite the jsdom environment (see jest.config.cjs).
 */

import type { AuthState } from '@cloudillo/react'
import { jest } from '@jest/globals'
import { renderHook } from '@testing-library/react'

const initApp = jest.fn()

/**
 * The connection the tracker holds for the app window. `token` is the live one —
 * `sendTokenUpdate` writes renewals here — so the push must read it from here
 * rather than replaying what `record()` saw.
 */
const connection: { token?: string } = { token: 'share-token' }

jest.unstable_mockModule('../message-bus/shell-bus.js', () => ({
	getShellBus: () => ({ initApp, getAppTracker: () => ({ getApp: () => connection }) })
}))

const { useIdentityPush } = await import('../apps/useIdentityPush.js')

const CONTEXT = '@owner.example.com'
const ALICE: AuthState = { idTag: '@alice.example.com', tnId: 7, roles: ['a'], name: 'Ada' }

/** What the container recorded for a share-link mount: no session, owner tag. */
const GUEST_INIT = {
	appName: 'quillo',
	idTag: CONTEXT,
	authenticated: false,
	darkMode: false,
	token: 'share-token',
	tokenLifetime: 300,
	access: 'write' as const,
	resId: `${CONTEXT}:file-1`,
	params: 'view=1'
}

/**
 * Render the hook with a `record()` that runs on the first commit, exactly as
 * the container's load handler does before auth resolves.
 */
function renderRecorded(initial: AuthState | null | undefined = undefined) {
	return renderHook(
		({ auth }: { auth: AuthState | null | undefined }) => {
			const push = useIdentityPush(auth)
			// One-shot, and before the hook's effect runs on later commits.
			if (!recorded) {
				recorded = true
				push.record(window, CONTEXT, GUEST_INIT)
			}
			return push
		},
		{ initialProps: { auth: initial } }
	)
}

let recorded = false

beforeEach(() => {
	recorded = false
	connection.token = 'share-token'
	initApp.mockClear()
})

describe('useIdentityPush', () => {
	it('pushes nothing while no app has been initialised', () => {
		const { rerender } = renderHook(
			({ auth }: { auth: AuthState | null | undefined }) => useIdentityPush(auth),
			{ initialProps: { auth: undefined as AuthState | null | undefined } }
		)

		rerender({ auth: ALICE })

		expect(initApp).not.toHaveBeenCalled()
	})

	it('re-sends the recorded payload with the identity swapped', () => {
		const { rerender } = renderRecorded()

		rerender({ auth: ALICE })

		expect(initApp).toHaveBeenCalledTimes(1)
		const [win, data] = initApp.mock.calls[0] as [Window, Record<string, unknown>]
		expect(win).toBe(window)
		expect(data).toMatchObject({
			idTag: '@alice.example.com',
			authenticated: true,
			tnId: 7,
			roles: ['a'],
			// A signed-in user's name arrives with auth.
			displayName: 'Ada'
		})
		// Everything the app would lose if this were a partial payload.
		expect(data).toMatchObject({
			appName: 'quillo',
			token: 'share-token',
			tokenLifetime: 300,
			access: 'write',
			resId: `${CONTEXT}:file-1`,
			params: 'view=1'
		})
	})

	it('pushes once, not on every later render', () => {
		const { rerender } = renderRecorded()

		rerender({ auth: ALICE })
		rerender({ auth: ALICE })
		rerender({ auth: { ...ALICE } })

		expect(initApp).toHaveBeenCalledTimes(1)
	})

	it('stays quiet for a genuine guest, so the anti-impersonation flag holds', () => {
		const { rerender } = renderRecorded()

		// Auth resolved to "no session" — the app was already told exactly this.
		rerender({ auth: null })

		expect(initApp).not.toHaveBeenCalled()
	})

	// `auth:init.push` rebuilds the app's state wholesale, so a replayed token is
	// not merely stale — it REVOKES the renewal the app is already using.
	it('sends the renewed token, not the one recorded at mount', () => {
		const { rerender } = renderRecorded()

		// What `useAppToken`'s `sendTokenUpdate` did while auth was resolving.
		connection.token = 'renewed-token'
		rerender({ auth: ALICE })

		expect(initApp).toHaveBeenCalledTimes(1)
		const [, data] = initApp.mock.calls[0] as [Window, Record<string, unknown>]
		expect(data.token).toBe('renewed-token')
		// The recorded lifetime belonged to the old token — it must not ride along.
		expect(data.tokenLifetime).toBeUndefined()
	})

	it('does not push into a window that has been torn down', () => {
		const { result, rerender } = renderRecorded()

		result.current.reset()
		rerender({ auth: ALICE })

		expect(initApp).not.toHaveBeenCalled()
	})
})

// vim: ts=4
