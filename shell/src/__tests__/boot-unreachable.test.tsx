// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * A boot whose id-tag probe cannot reach the server (network error or 5xx) halts with
 * `setUnreachable` and never calls `setAuth(null)` — an outage must not look like a
 * sign-out. A 4xx goes to the outer catch → guest.
 *
 * Harness copied from `site-boot.test.tsx`; `jest.resetModules()` per case because
 * `boot.ts` latches a module-scope `booted` flag.
 */

import { jest } from '@jest/globals'

async function bootWithProbe(probe: () => Promise<unknown>) {
	jest.resetModules()

	jest.unstable_mockModule('../site/detect.js', () => ({
		isSiteDocument: false,
		siteSeed: null
	}))
	jest.unstable_mockModule('../pwa/cookie.js', () => ({
		readSwKeyCookie: () => undefined
	}))
	jest.unstable_mockModule('../pwa.js', () => ({
		ensureServiceWorker: async () => undefined,
		getApiKey: async () => undefined,
		getSessionToken: () => undefined,
		installToken: async () => undefined,
		setCurrentAuthToken: () => {},
		clearAuthToken: async () => undefined,
		deleteApiKey: async () => undefined
	}))
	jest.unstable_mockModule('../auth/key-loss.js', () => ({
		assessKeyLoss: async () => undefined
	}))
	jest.unstable_mockModule('../settings', () => ({
		applyTheme: () => {},
		readStoredTheme: () => ({ theme: undefined, colors: undefined }),
		setTheme: () => {}
	}))
	jest.unstable_mockModule('../context/index.js', () => ({
		loadIdpEnabled: async () => false
	}))
	jest.unstable_mockModule('../manifest-registry.js', () => ({
		applyMenuConfig: () => {},
		disabledApps: new Set(),
		withoutDisabledApps: (config: unknown) => config
	}))
	jest.unstable_mockModule('@cloudillo/core', () => ({
		createApiClient: () => ({
			auth: { loginInit: async () => ({ status: 'anonymous' }) }
		}),
		setApiToken: () => {},
		isContextKey: (key: unknown) => typeof key === 'string',
		FetchError: class FetchError extends Error {}
	}))

	;(globalThis as unknown as { fetch: unknown }).fetch = jest.fn(probe)

	const setAuth = jest.fn()
	const setUnreachable = jest.fn()
	const { runBootSequence } = await import('../auth/boot.js')
	await runBootSequence({
		api: null,
		auth: undefined,
		appConfig: {},
		setAppConfig: () => {},
		setAuth,
		setIdTag: () => {},
		setKeyLoss: () => {},
		setUnreachable,
		setLoginInitData: () => {},
		setFavorites: () => {},
		setContextColors: () => {},
		setContextIdpEnabled: () => {},
		loadNotifications: () => {},
		toastWarning: () => {},
		t: ((key: string) => key) as never,
		getPathname: () => '/',
		navigate: (() => {}) as never
	} as never)

	return { setAuth, setUnreachable }
}

describe('runBootSequence when the id-tag probe fails', () => {
	beforeEach(() => {
		jest.spyOn(console, 'warn').mockImplementation(() => {})
		jest.spyOn(console, 'error').mockImplementation(() => {})
	})
	afterEach(() => {
		jest.restoreAllMocks()
	})

	it('halts as unreachable when fetch rejects', async () => {
		const boot = await bootWithProbe(async () => {
			throw new TypeError('Failed to fetch')
		})

		expect(boot.setUnreachable).toHaveBeenCalledWith(window.location.host)
		expect(boot.setAuth).not.toHaveBeenCalled()
	})

	it('halts as unreachable on a 5xx', async () => {
		const boot = await bootWithProbe(async () => ({ ok: false, status: 503 }))

		expect(boot.setUnreachable).toHaveBeenCalledWith(window.location.host)
		expect(boot.setAuth).not.toHaveBeenCalled()
	})

	it('falls back to guest on a 4xx', async () => {
		const boot = await bootWithProbe(async () => ({ ok: false, status: 404 }))

		expect(boot.setAuth).toHaveBeenCalledWith(null)
		expect(boot.setUnreachable).not.toHaveBeenCalled()
	})
})

// vim: ts=4
