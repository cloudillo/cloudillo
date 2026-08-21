// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The site short-circuit in `runBootSequence`, and what it is allowed to skip.
 *
 * An anonymous reader of a published page must not have a ServiceWorker installed
 * in their browser just so the waterfall can conclude "guest" — that is what the
 * short-circuit is for, and the boot seed answers the one question the skipped
 * `/.well-known/cloudillo/id-tag` fetch would have.
 *
 * But `readSiteSeed` returns `null` on *any* decode failure: a missing field, a
 * wrapper generation older than the seed, unparseable JSON. Short-circuiting there
 * set no idTag and skipped the fetch that would have found one, so `api` stayed
 * `null` for the whole session — no document-embed island, no owner banner, and no
 * API client at all for a later client-side navigation into a shell route. So the
 * seed gates the branch: without one, the reader falls through to the waterfall and
 * pays for the ServiceWorker, which is the pre-existing behaviour and strictly
 * better than having nothing to call.
 *
 * `.test.tsx` rather than `.test.ts` with no JSX in it, as `site-seed.test.tsx`
 * explains: only that half of the jest split has a DOM.
 */

import { jest } from '@jest/globals'

// Type-only, so it is erased before the mock of that same module takes effect.
import type { SiteBootSeed } from '../site/detect.js'

const SEED: SiteBootSeed = {
	owner: { idTag: 'alice.tld', name: 'Alice' },
	site: { host: 'alice.tld', mountPath: '/', docFileId: 'f1' },
	nav: []
}

/** The waterfall asks the host it is served from, which under jsdom is not the seed's. */
const WELL_KNOWN = `https://${window.location.host}/.well-known/cloudillo/id-tag`

/**
 * Boot once, with `isSiteDocument` true and the seed the caller names, and report
 * what the anonymous branch and the waterfall each did.
 *
 * `jest.resetModules()` per case because `boot.ts` guards on a module-scope
 * `booted` flag — one `Layout` per page, and therefore one boot per module.
 */
async function bootAsSiteReader(siteSeed: SiteBootSeed | null) {
	jest.resetModules()

	jest.unstable_mockModule('../site/detect.js', () => ({
		isSiteDocument: true,
		siteSeed
	}))
	jest.unstable_mockModule('../pwa/cookie.js', () => ({
		readSwKeyCookie: () => undefined
	}))

	const ensureServiceWorker = jest.fn(async () => undefined)
	jest.unstable_mockModule('../pwa.js', () => ({
		ensureServiceWorker,
		getApiKey: async () => undefined,
		getSessionToken: () => undefined,
		installToken: async () => undefined,
		setCurrentAuthToken: () => {},
		clearAuthToken: async () => undefined,
		deleteApiKey: async () => undefined
	}))
	// Every specifier here resolves from *this* file, not from `boot.ts`.
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
		applyMenuConfig: () => {}
	}))
	jest.unstable_mockModule('@cloudillo/core', () => ({
		createApiClient: () => ({
			auth: { loginInit: async () => ({ status: 'anonymous' }) }
		}),
		setApiToken: () => {},
		FetchError: class FetchError extends Error {}
	}))

	const fetchMock = jest.fn(async (url: string) => ({
		url,
		ok: true,
		json: async () => ({ idTag: 'alice.tld' })
	}))
	;(globalThis as unknown as { fetch: unknown }).fetch = fetchMock

	const setIdTag = jest.fn()
	const setAuth = jest.fn()
	const { runBootSequence } = await import('../auth/boot.js')
	await runBootSequence({
		api: null,
		auth: undefined,
		appConfig: {},
		setAppConfig: () => {},
		setAuth,
		setIdTag,
		setKeyLoss: () => {},
		setLoginInitData: () => {},
		setFavorites: () => {},
		setContextIdpEnabled: () => {},
		loadNotifications: () => {},
		toastWarning: () => {},
		t: ((key: string) => key) as never,
		getPathname: () => '/blog/hello',
		navigate: (() => {}) as never
	} as never)

	return {
		setIdTag,
		setAuth,
		ensureServiceWorker,
		fetchedWellKnown: fetchMock.mock.calls.some((call) => String(call[0]) === WELL_KNOWN)
	}
}

describe('runBootSequence on a published page', () => {
	it('should short-circuit on a readable seed, installing no ServiceWorker', async () => {
		const boot = await bootAsSiteReader(SEED)

		expect(boot.setIdTag).toHaveBeenCalledWith('alice.tld')
		expect(boot.ensureServiceWorker).not.toHaveBeenCalled()
		expect(boot.fetchedWellKnown).toBe(false)
		expect(boot.setAuth).toHaveBeenCalledWith(null)
	})

	it('should fall through to the waterfall when the seed did not decode', async () => {
		// The regression: the branch was taken anyway, `setIdTag` never ran, and the
		// fetch that would have answered the same question was skipped with it.
		const boot = await bootAsSiteReader(null)

		expect(boot.fetchedWellKnown).toBe(true)
		expect(boot.setIdTag).toHaveBeenCalledWith('alice.tld')
	})
})

// vim: ts=4
