// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The immediate (already-expired) branch of the per-context proxy-token renewal.
 *
 * `schedule` cannot drive that branch — `renewalDelayMs` answers null for a dead
 * token, i.e. "don't arm a timer" — so the hook drives it through the renewer's
 * `renewNow`, whose retry, throttle and success re-arm are all load-bearing here:
 *
 * - Without the retry, a failed mint leaves `contextRoles` untouched, so nothing
 *   re-renders, the effect does not re-run and no renewer exists to re-arm: one
 *   offline moment leaves that context anonymous for the rest of the session.
 * - Without the success re-arm, the same silence leaves the *fresh* token with no
 *   proactive timer at all, and the context dies at its `exp`.
 * - Without the throttle (and the identity-stable `setContextRoles`), a token this
 *   effect keeps judging expired — an unparseable `exp`, a client clock running
 *   ahead — is an unthrottled request loop against /api/auth/proxy-token.
 *
 * `.test.tsx` so jest gives this suite the jsdom environment (see jest.config.cjs).
 */

import { jest } from '@jest/globals'
import { act, renderHook } from '@testing-library/react'
import { atom, getDefaultStore } from 'jotai'

// Mirrors auth/renewal-timer.ts (module-private).
const RENEWAL_RETRY_MS = 30_000
const RENEW_NOW_MIN_INTERVAL_MS = 10_000

const HOME = '@user.example.com'
const COMMUNITY = '@team.example.com'

// The token each idTag's client currently holds. Undefined means expired — the
// registry reaps at `exp` — which is what puts the hook on the immediate path.
const tokens = new Map<string, string | undefined>()

const setApiToken = jest.fn((idTag: string, token: string | undefined) => {
	tokens.set(idTag, token)
})

jest.unstable_mockModule('@cloudillo/core', () => ({
	getApiClient: (idTag: string) => ({ getAuthToken: () => tokens.get(idTag) }),
	setApiToken,
	// Imported by `context/trust-gate.ts`, which owns the consent rule the hook
	// applies. Unused here: the hook only ever asks it for `effectiveTrust`.
	hasApiToken: (idTag: string) => tokens.get(idTag) !== undefined
}))

const getProxyToken = jest.fn<(idTag: string) => Promise<{ token: string; roles?: string[] }>>()

jest.unstable_mockModule('@cloudillo/react', () => ({
	useApi: () => ({ api: { auth: { getProxyToken } } }),
	useAuth: () => [{ idTag: HOME }]
}))

// Real jotai atoms, so the hook's dependency tracking is the real thing — only
// the module they live in is stubbed, to keep the shell's atom graph (and the
// CSS it transitively imports) out of the suite.
const contextRolesAtom = atom<Map<string, string[]>>(new Map())
const sessionTrustAtom = atom<Map<string, string>>(new Map())
const storedTrustAtom = atom<Map<string, string>>(new Map())
const activeContextAtom = atom<{ idTag: string } | null>(null)

jest.unstable_mockModule('../context/atoms', () => ({
	contextRolesAtom,
	sessionTrustAtom,
	storedTrustAtom,
	activeContextAtom
}))

const { useContextTokenRenewal } = await import('../context/useContextTokenRenewal.js')

const store = getDefaultStore()

/** An unsigned token carrying just the claims the schedule reads. */
function makeToken(claims: object): string {
	// base64url, the encoding `decodeJwtPayload` expects.
	const payload = btoa(JSON.stringify(claims))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '')
	return `header.${payload}.sig`
}

/** A token issued now and valid for `lifetimeSec`, as the server would mint it. */
function freshToken(lifetimeSec: number): string {
	const iat = Math.floor(Date.now() / 1000)
	return makeToken({ iat, exp: iat + lifetimeSec })
}

/** Let queued microtasks (the `renewOne` chain) settle inside `act`. */
async function flush(): Promise<void> {
	await act(async () => {
		await Promise.resolve()
		await Promise.resolve()
	})
}

/** A fresh `sessionTrust` identity, which is what re-runs the hook's effect. */
async function bumpEffect(): Promise<void> {
	await act(async () => {
		store.set(sessionTrustAtom, new Map([[COMMUNITY, 'S']]))
	})
	await flush()
}

beforeEach(() => {
	jest.useFakeTimers()
	tokens.clear()
	getProxyToken.mockReset()
	setApiToken.mockClear()
	// A community the user has consented to, whose token is already gone.
	store.set(contextRolesAtom, new Map([[COMMUNITY, ['member']]]))
	store.set(sessionTrustAtom, new Map([[COMMUNITY, 'S']]))
	store.set(storedTrustAtom, new Map())
	store.set(activeContextAtom, null)
	jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
	jest.useRealTimers()
	jest.restoreAllMocks()
})

describe('useContextTokenRenewal', () => {
	it('retries a failed immediate refresh until it succeeds', async () => {
		getProxyToken.mockRejectedValueOnce(new Error('offline'))
		getProxyToken.mockResolvedValueOnce({ token: freshToken(3600), roles: ['member'] })

		const { unmount } = renderHook(() => useContextTokenRenewal())
		await flush()
		expect(getProxyToken).toHaveBeenCalledTimes(1)

		// Nothing re-renders after a failed mint, so this retry is the only thing
		// that can bring the context back.
		await act(async () => {
			await jest.advanceTimersByTimeAsync(RENEWAL_RETRY_MS)
		})
		expect(getProxyToken).toHaveBeenCalledTimes(2)
		expect(setApiToken).toHaveBeenCalledWith(COMMUNITY, expect.any(String))

		unmount()
	})

	it('arms the proactive renewer from the token the immediate mint produced', async () => {
		getProxyToken.mockResolvedValue({ token: freshToken(3600), roles: ['member'] })
		// Pin the ±5% jitter, so the renewal point is exactly 80% of the hour and
		// the advances below can neither miss it nor overshoot into a second one.
		jest.spyOn(Math, 'random').mockReturnValue(0.5)

		const { unmount } = renderHook(() => useContextTokenRenewal())
		await flush()
		expect(getProxyToken).toHaveBeenCalledTimes(1)

		// Same roles means `contextRoles` keeps its identity, so this effect never
		// re-runs — nothing but the mint itself can arm the proactive timer, and
		// without it the fresh token would carry no renewal at all and the context
		// would silently de-authenticate at `exp`. Nothing before 80% of an hour.
		await act(async () => {
			await jest.advanceTimersByTimeAsync(RENEWAL_RETRY_MS * 4)
		})
		expect(getProxyToken).toHaveBeenCalledTimes(1)

		// 80% of the hour, minus what the window above already consumed.
		await act(async () => {
			await jest.advanceTimersByTimeAsync(2_880_000 - RENEWAL_RETRY_MS * 4)
		})
		expect(getProxyToken).toHaveBeenCalledTimes(2)

		unmount()
	})

	it('keeps the contextRoles identity when the roles come back unchanged', async () => {
		getProxyToken.mockResolvedValue({ token: freshToken(3600), roles: ['member'] })
		const before = store.get(contextRolesAtom)

		const { unmount } = renderHook(() => useContextTokenRenewal())
		await flush()

		// A fresh Map here re-runs the effect, which would mint again against a
		// token it still judges expired — the loop the throttle exists to bound.
		expect(store.get(contextRolesAtom)).toBe(before)

		unmount()
	})

	it('floors the mint rate for a token it keeps judging expired', async () => {
		// An `exp` that is not a number: `getJwtTimes` answers null, so every pass
		// takes the immediate branch no matter how many tokens land.
		let issued = 0
		getProxyToken.mockImplementation(async () => ({
			token: makeToken({ iat: 1 }),
			// Fresh roles each time, so the atom identity does change and the
			// effect really does re-run — the worst case for the throttle.
			roles: ['member', `r${issued++}`]
		}))

		const { unmount } = renderHook(() => useContextTokenRenewal())
		await flush()
		expect(getProxyToken).toHaveBeenCalledTimes(1)

		for (let i = 0; i < 5; i++) await bumpEffect()
		// All inside RENEW_NOW_MIN_INTERVAL_MS — the loop is one request, not six.
		expect(getProxyToken).toHaveBeenCalledTimes(1)

		await act(async () => {
			await jest.advanceTimersByTimeAsync(RENEW_NOW_MIN_INTERVAL_MS)
		})
		await bumpEffect()
		expect(getProxyToken).toHaveBeenCalledTimes(2)

		unmount()
	})

	it('clears a pending retry on unmount', async () => {
		getProxyToken.mockRejectedValue(new Error('offline'))

		const { unmount } = renderHook(() => useContextTokenRenewal())
		await flush()
		expect(getProxyToken).toHaveBeenCalledTimes(1)

		unmount()
		await act(async () => {
			await jest.advanceTimersByTimeAsync(RENEWAL_RETRY_MS * 4)
		})
		expect(getProxyToken).toHaveBeenCalledTimes(1)
	})
})

// vim: ts=4
