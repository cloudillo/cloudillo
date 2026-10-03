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
	contextKey: (idTag: string, hat?: string) => (hat ? `${idTag}|${hat}` : idTag),
	splitContextKey: (key: string) => {
		const [idTag, hat] = key.split('|')
		return hat ? { idTag, hat } : { idTag }
	},
	FetchError: class FetchError extends Error {},
	// Imported by `context/trust-gate.ts`, which owns the consent rule the hook
	// applies. Unused here: the hook only ever asks it for `effectiveTrust`.
	hasApiToken: (idTag: string) => tokens.get(idTag) !== undefined
}))

const getProxyToken = jest.fn<(idTag: string) => Promise<{ token: string; roles?: string[] }>>()

jest.unstable_mockModule('@cloudillo/react', () => ({
	useApi: () => ({ api: { auth: { getProxyToken } } }),
	useAuth: () => [{ idTag: HOME }],
	useToast: () => ({ error: jest.fn() })
}))

jest.unstable_mockModule('react-i18next', () => ({
	useTranslation: () => ({ t: (s: string) => s })
}))

// The hatted fallback path is not exercised here; stubbing it keeps `hooks.ts` out.
jest.unstable_mockModule('../context/hat-entry.js', () => ({
	useHatEntry: () => ({ fallback: jest.fn() })
}))

const installHatToken = jest.fn()
jest.unstable_mockModule('../pwa.js', () => ({ installHatToken }))

// Worker -> page messages, delivered by the tests through `swHandlers`.
const swHandlers = new Map<string, (msg: unknown) => void>()
jest.unstable_mockModule('../pwa/sw-rpc.js', () => ({
	onSwMessage: (type: string, handler: (msg: unknown) => void) => {
		swHandlers.set(type, handler)
		return () => swHandlers.delete(type)
	}
}))

// Real jotai atoms, so the hook's dependency tracking is the real thing — only
// the module they live in is stubbed, to keep the shell's atom graph (and the
// CSS it transitively imports) out of the suite.
const contextRolesAtom = atom<Map<string, string[]>>(new Map())
const contextHatRoleAtom = atom<Map<string, string>>(new Map())
const sessionTrustAtom = atom<Map<string, string>>(new Map())
const storedTrustAtom = atom<Map<string, string>>(new Map())
const activeContextAtom = atom<{ idTag: string; hat?: { idTag: string } } | null>(null)
// Pulled in by `trust-gate.ts` for `isKnownContext`, which this hook never calls.
const communitiesAtom = atom<{ idTag: string }[]>([])

jest.unstable_mockModule('../context/atoms', () => ({
	contextRolesAtom,
	contextHatRoleAtom,
	sessionTrustAtom,
	storedTrustAtom,
	activeContextAtom,
	communitiesAtom,
	partnerCommunitiesAtom: atom([])
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
	installHatToken.mockClear()
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

	describe('hatted token mirrored into the worker', () => {
		const HAT = '@hat.example.com'
		const KEY = `${COMMUNITY}|${HAT}`

		beforeEach(() => {
			store.set(contextRolesAtom, new Map())
			store.set(sessionTrustAtom, new Map())
		})

		it('pushes on entry and clears on switching to bare or another context', async () => {
			const hatted = freshToken(3600)
			tokens.set(KEY, hatted)
			const { unmount } = renderHook(() => useContextTokenRenewal())

			await act(async () => {
				store.set(activeContextAtom, { idTag: COMMUNITY, hat: { idTag: HAT } })
			})
			expect(installHatToken).toHaveBeenLastCalledWith(COMMUNITY, hatted, HAT)

			await act(async () => {
				store.set(activeContextAtom, { idTag: COMMUNITY })
			})
			expect(installHatToken).toHaveBeenLastCalledWith(COMMUNITY, undefined)

			await act(async () => {
				store.set(activeContextAtom, { idTag: COMMUNITY, hat: { idTag: HAT } })
			})
			installHatToken.mockClear()
			await act(async () => {
				store.set(activeContextAtom, { idTag: HOME })
			})
			expect(installHatToken).toHaveBeenCalledTimes(1)
			expect(installHatToken).toHaveBeenCalledWith(COMMUNITY, undefined)

			unmount()
		})

		it('pushes a hatted renewal while the hat is worn', async () => {
			const renewed = freshToken(3600)
			getProxyToken.mockResolvedValue({ token: renewed, roles: ['contributor'] })
			// Worn, with its token already gone: the hook mints straight away.
			store.set(activeContextAtom, { idTag: COMMUNITY, hat: { idTag: HAT } })
			store.set(contextRolesAtom, new Map([[KEY, ['contributor']]]))

			const { unmount } = renderHook(() => useContextTokenRenewal())
			await flush()

			expect(getProxyToken).toHaveBeenCalledWith(COMMUNITY, { hat: HAT })
			expect(installHatToken).toHaveBeenLastCalledWith(COMMUNITY, renewed, HAT)

			unmount()
		})

		const hatTokenRequest = (idTag: string) => ({
			type: 'sw:hattoken.request',
			payload: { idTag }
		})

		it('renews and re-pushes the worn hat when the worker asks', async () => {
			const renewed = freshToken(3600)
			getProxyToken.mockResolvedValue({ token: renewed, roles: [] })
			tokens.set(KEY, freshToken(3600))
			store.set(activeContextAtom, { idTag: COMMUNITY, hat: { idTag: HAT } })
			const { unmount } = renderHook(() => useContextTokenRenewal())
			installHatToken.mockClear()

			swHandlers.get('sw:hattoken.request')?.(hatTokenRequest(COMMUNITY))
			await flush()

			expect(getProxyToken).toHaveBeenCalledWith(COMMUNITY, { hat: HAT })
			expect(installHatToken).toHaveBeenLastCalledWith(COMMUNITY, renewed, HAT)

			unmount()
		})

		it('a stale hat refused after a switch leaves the worn hat in the worker', async () => {
			const HAT2 = '@hat2.example.com'
			const worn = freshToken(3600)
			tokens.set(`${COMMUNITY}|${HAT2}`, worn)
			let refuse: (err: unknown) => void = () => {}
			getProxyToken.mockReturnValue(
				new Promise((_, reject) => {
					refuse = reject
				})
			)
			// HAT worn with its token gone: the hook mints for it straight away.
			store.set(activeContextAtom, { idTag: COMMUNITY, hat: { idTag: HAT } })
			store.set(contextRolesAtom, new Map([[KEY, ['contributor']]]))
			const { unmount } = renderHook(() => useContextTokenRenewal())
			await flush()
			expect(getProxyToken).toHaveBeenCalledWith(COMMUNITY, { hat: HAT })

			await act(async () => {
				store.set(activeContextAtom, { idTag: COMMUNITY, hat: { idTag: HAT2 } })
			})
			expect(installHatToken).toHaveBeenLastCalledWith(COMMUNITY, worn, HAT2)
			installHatToken.mockClear()

			const { FetchError } = await import('@cloudillo/core')
			refuse(Object.assign(new FetchError('E-REFUSED', 'refused'), { httpStatus: 403 }))
			await flush()

			expect(installHatToken).not.toHaveBeenCalled()

			unmount()
		})

		it('answers with a clear when no hat is worn there', async () => {
			store.set(activeContextAtom, { idTag: COMMUNITY })
			const { unmount } = renderHook(() => useContextTokenRenewal())

			swHandlers.get('sw:hattoken.request')?.(hatTokenRequest(COMMUNITY))
			await flush()

			expect(getProxyToken).not.toHaveBeenCalled()
			expect(installHatToken).toHaveBeenLastCalledWith(COMMUNITY, undefined)

			unmount()
		})
	})
})

// vim: ts=4
