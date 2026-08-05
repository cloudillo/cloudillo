// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The two ends of the remember-me key: `getApiKeyResult`'s two-way answer about
 * the stored key, and `setApiKey`'s acked write.
 *
 * Same class of bug as `secure-store.test.ts`, one layer up: only a definitive
 * "nothing stored" may end a session. `declareDead` in
 * shell/src/auth/useTokenRenewal.ts reads `{status:'ok', apiKey: undefined}` as
 * "unrecoverable" and wipes the cache, the app storage and the swKey cookie on
 * the way to /login — so an uncontrolled page (mid hard-reload, or a worker that
 * has not claimed us yet) must never produce that answer, and a write that never
 * landed must not report success only to produce it one boot later.
 */

// Not a global in ESM mode, unlike describe/it/expect.
import { jest } from '@jest/globals'

type SwReply =
	| { status: 'ok'; data?: unknown }
	| { status: 'error'; error?: string }
	| { status: 'unavailable' }
	| { status: 'timeout' }

const swRequestResult = jest.fn<() => Promise<SwReply>>()
const ensureServiceWorker = jest.fn(async () => undefined)
const ensureKeyRelayed = jest.fn(async () => {})

jest.unstable_mockModule('../pwa/sw-rpc.js', () => ({
	swRequestResult,
	swNotify: jest.fn(async () => {}),
	swRequest: jest.fn(async () => undefined),
	onSwMessage: jest.fn(() => () => {})
}))

jest.unstable_mockModule('../pwa/registration.js', () => ({
	ensureServiceWorker,
	ensureKeyRelayed,
	postTokenToSw: jest.fn(async () => {})
}))

// `setApiKey` mints the swKey cookie when there is none; the tests below all
// start from a device that already has one, so the mint path stays out of the way.
const readSwKeyCookie = jest.fn<() => string | undefined>(() => 'existing-key')
jest.unstable_mockModule('../pwa/cookie.js', () => ({
	readSwKeyCookie,
	writeSwKeyCookie: jest.fn(() => true),
	clearSwKeyCookie: jest.fn()
}))

const markHadEncryptedData = jest.fn()
jest.unstable_mockModule('../pwa/encrypted-data-flag.js', () => ({
	markHadEncryptedData,
	hadEncryptedData: jest.fn(() => false),
	clearHadEncryptedData: jest.fn()
}))

// `setApiKey` probes `window` for the Cookie Store API. Present here, so the
// Firefox/Safari key relay is skipped and the run stays on one message.
;(globalThis as unknown as { window: { cookieStore: object } }).window = { cookieStore: {} }

// Dynamic import so the mocks above are in place first.
const { getApiKeyResult, setApiKey } = await import('../pwa.js')

/** Make `navigator.serviceWorker` present or absent for the next lookup. */
function useServiceWorkerSupport(supported: boolean): void {
	const nav = globalThis.navigator as unknown as Record<string, unknown>
	if (supported) nav.serviceWorker = {}
	else delete nav.serviceWorker
}

beforeEach(() => {
	swRequestResult.mockReset()
	ensureServiceWorker.mockClear()
	markHadEncryptedData.mockClear()
	useServiceWorkerSupport(true)
	jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
	jest.restoreAllMocks()
})

describe('getApiKeyResult', () => {
	it('reports the key when the worker answers with one', async () => {
		swRequestResult.mockResolvedValue({ status: 'ok', data: { apiKey: 'secret-key' } })
		expect(await getApiKeyResult()).toEqual({ status: 'ok', apiKey: 'secret-key' })
	})

	it("reports a definitive 'no key' when the worker answers with none", async () => {
		swRequestResult.mockResolvedValue({ status: 'ok', data: {} })
		expect(await getApiKeyResult()).toEqual({ status: 'ok', apiKey: undefined })
	})

	it('gives the worker a chance to claim the page before asking', async () => {
		swRequestResult.mockResolvedValue({ status: 'ok', data: {} })
		await getApiKeyResult()
		expect(ensureServiceWorker).toHaveBeenCalled()
	})

	it("reports an error, not 'no key', when the page is uncontrolled", async () => {
		swRequestResult.mockResolvedValue({ status: 'unavailable' })
		// A worker exists in this browser, so it may well be holding a key —
		// answering "nothing stored" here forcibly logs out a live device.
		expect(await getApiKeyResult()).toEqual({ status: 'error', error: 'no-controller' })
	})

	it("reports 'no key' when the browser has no ServiceWorker at all", async () => {
		useServiceWorkerSupport(false)
		swRequestResult.mockResolvedValue({ status: 'unavailable' })
		// Nowhere a key could ever have been stored — the one definitive case.
		expect(await getApiKeyResult()).toEqual({ status: 'ok', apiKey: undefined })
	})

	it("reports an error, not 'no key', when the worker fails the read", async () => {
		swRequestResult.mockResolvedValue({ status: 'error', error: 'undecryptable' })
		expect(await getApiKeyResult()).toEqual({ status: 'error', error: 'undecryptable' })
	})

	it("reports an error, not 'no key', when the worker does not answer", async () => {
		swRequestResult.mockResolvedValue({ status: 'timeout' })
		expect(await getApiKeyResult()).toEqual({ status: 'error', error: 'timeout' })
	})
})

describe('setApiKey', () => {
	it('waits for the worker to be registered before writing', async () => {
		swRequestResult.mockResolvedValue({ status: 'ok', data: {} })
		await setApiKey('secret-key')
		// Without this the write goes out on an uncontrolled page (first install,
		// hard reload) and `swRequestResult` has no controller to send it to.
		expect(ensureServiceWorker).toHaveBeenCalled()
	})

	it('resolves once the worker acknowledges the write', async () => {
		swRequestResult.mockResolvedValue({ status: 'ok', data: {} })
		await expect(setApiKey('secret-key')).resolves.toBeUndefined()
		expect(swRequestResult).toHaveBeenCalledWith('sw:apikey.set', { apiKey: 'secret-key' })
		expect(markHadEncryptedData).toHaveBeenCalled()
	})

	it('throws when the worker could not store the key', async () => {
		// `ok: false` — the worker held no encryption key, so it stored nothing.
		// Reporting success here means the next boot reads "nothing stored" and
		// forcibly logs the device out.
		swRequestResult.mockResolvedValue({ status: 'error', error: 'no-encryption-key' })
		await expect(setApiKey('secret-key')).rejects.toThrow('no-encryption-key')
	})

	it('throws when there is no controller to receive the write', async () => {
		swRequestResult.mockResolvedValue({ status: 'unavailable' })
		await expect(setApiKey('secret-key')).rejects.toThrow('unavailable')
	})

	it('throws when the worker does not answer', async () => {
		swRequestResult.mockResolvedValue({ status: 'timeout' })
		await expect(setApiKey('secret-key')).rejects.toThrow('timeout')
	})
})

// vim: ts=4
