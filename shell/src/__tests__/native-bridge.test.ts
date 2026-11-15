// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * The Android bridge client: request/response, events, the tenant check that guards
 * download tokens, and the device-key handoff (no key revoked on a timeout, no
 * handoff dropped while one runs, relink mints over an existing key and revokes the old
 * one by id), and blob downloads streamed to native in chunks.
 */

import { jest } from '@jest/globals'

interface Req {
	id: number
	method: string
	params: Record<string, unknown>
}

const api = {
	files: {
		list: jest.fn(async () => [{ id: 'fld1', fileName: 'Phone backup' }]),
		create: jest.fn(async () => ({ id: 'fld2' }))
	},
	auth: {
		createApiKey: jest.fn(async () => ({ id: 7, plaintextKey: 'secret' })),
		deleteApiKey: jest.fn(async (_id: unknown) => {}),
		listApiKeys: jest.fn(async () => [])
	}
}

jest.unstable_mockModule('@cloudillo/core', () => ({ getApiClient: () => api }))
jest.unstable_mockModule('@cloudillo/react', () => ({ useToast: () => ({}) }))
jest.unstable_mockModule('../context/hooks.js', () => ({ useApiContext: () => ({}) }))

const g = globalThis as unknown as { window: typeof globalThis & Window }
g.window = globalThis as typeof globalThis & Window

let sent: Req[]
let nb: typeof import('../native-bridge.js')

function reply(id: number, msg: { result?: unknown; error?: string | null }) {
	window.CloudilloNative?.onmessage?.({ data: JSON.stringify({ id, ...msg }) } as MessageEvent)
}

/** Lets pending promise chains run until a request for `method` shows up. */
async function waitFor(method: string): Promise<Req> {
	for (let i = 0; i < 50; i++) {
		const r = sent.find((s) => s.method === method)
		if (r) {
			sent.splice(sent.indexOf(r), 1)
			return r
		}
		await Promise.resolve()
	}
	throw new Error(`no ${method} request`)
}

const HELLO = {
	bridgeVersion: 1,
	appVersion: '1',
	deviceName: 'Pixel',
	idTag: 'alice.tld',
	hasDeviceKey: false
}

beforeEach(async () => {
	jest.useRealTimers()
	jest.clearAllMocks()
	sent = []
	window.CloudilloNative = {
		postMessage(m: string) {
			sent.push(JSON.parse(m))
		},
		onmessage: null
	}
	jest.resetModules()
	nb = await import('../native-bridge.js')
})

afterAll(() => {
	delete window.CloudilloNative
})

describe('nativeRequest', () => {
	it('resolves with result, rejects with error', async () => {
		const ok = nb.nativeRequest('a')
		const bad = nb.nativeRequest('b')
		reply(sent[0].id, { result: 42 })
		reply(sent[1].id, { error: 'nope' })
		await expect(ok).resolves.toBe(42)
		await expect(bad).rejects.toThrow('nope')
	})

	it('treats error: null as success', async () => {
		const p = nb.nativeRequest('a')
		reply(sent[0].id, { result: 1, error: null })
		await expect(p).resolves.toBe(1)
	})

	it('rejects with NativeTimeoutError on timeout', async () => {
		jest.useFakeTimers()
		const p = nb.nativeRequest('slow', undefined, 1000)
		jest.advanceTimersByTime(1000)
		await expect(p).rejects.toBeInstanceOf(nb.NativeTimeoutError)
	})
})

describe('re-injection', () => {
	it('attaches to a freshly injected CloudilloNative', async () => {
		const first = nb.nativeRequest('a')
		reply(sent[0].id, { result: 1 })
		await first
		window.CloudilloNative = {
			postMessage(m: string) {
				sent.push(JSON.parse(m))
			},
			onmessage: null
		}
		const second = nb.nativeRequest('b')
		reply(sent[1].id, { result: 2 })
		await expect(second).resolves.toBe(2)
	})
})

describe('getNativeInfo', () => {
	it('rejects an unsupported bridge version', async () => {
		const p = nb.getNativeInfo()
		reply((await waitFor('hello')).id, { result: { ...HELLO, bridgeVersion: 0 } })
		await expect(p).rejects.toThrow('not supported')
	})
})

describe('onNativeEvent', () => {
	it('delivers events until unsubscribed', () => {
		const cb = jest.fn()
		const off = nb.onNativeEvent('x', cb)
		const fire = () =>
			window.CloudilloNative?.onmessage?.({
				data: JSON.stringify({ event: 'x', data: 1 })
			} as MessageEvent)
		fire()
		off()
		fire()
		expect(cb).toHaveBeenCalledTimes(1)
		expect(cb).toHaveBeenCalledWith(1)
	})
})

describe('isTenantUrl', () => {
	it('accepts only https://cl-o.<idTag> on the default port', () => {
		expect(nb.isTenantUrl('https://cl-o.alice.tld/api/files/f1', 'alice.tld')).toBe(true)
		expect(nb.isTenantUrl('https://cl-o.eve.tld/api/files/f1', 'alice.tld')).toBe(false)
		expect(nb.isTenantUrl('http://cl-o.alice.tld/api/files/f1', 'alice.tld')).toBe(false)
		expect(nb.isTenantUrl('https://cl-o.alice.tld:8443/api/files/f1', 'alice.tld')).toBe(false)
		expect(nb.isTenantUrl('not a url', 'alice.tld')).toBe(false)
		expect(nb.isTenantUrl('https://cl-o.x/', 'x')).toBe(false)
	})

	it('accepts only file download paths', () => {
		expect(nb.isTenantUrl('https://cl-o.alice.tld/api/auth/login', 'alice.tld')).toBe(false)
		expect(nb.isTenantUrl('https://cl-o.alice.tld/api/files/a/b', 'alice.tld')).toBe(false)
		expect(nb.isTenantUrl('https://cl-o.alice.tld/api/files/f1?variant=x', 'alice.tld')).toBe(
			true
		)
	})
})

describe('device-key handoff', () => {
	it('deletes the key when native refuses it', async () => {
		const done = nb.ensureDeviceKey('alice.tld')
		reply((await waitFor('hello')).id, { result: HELLO })
		reply((await waitFor('setDeviceKey')).id, { error: 'disk full' })
		await done
		expect(api.auth.deleteApiKey).toHaveBeenCalledWith(7)
	})

	async function timeOutHandoff() {
		const done = nb.ensureDeviceKey('alice.tld')
		reply((await waitFor('hello')).id, { result: HELLO })
		jest.useFakeTimers()
		await waitFor('setDeviceKey')
		jest.advanceTimersByTime(30_000)
		jest.useRealTimers()
		await done
	}

	it('keeps the key when setDeviceKey times out', async () => {
		await timeOutHandoff()
		expect(api.auth.deleteApiKey).not.toHaveBeenCalled()
	})

	it('revokes a timed-out key native did not store, on the next handoff', async () => {
		await timeOutHandoff()
		const done = nb.ensureDeviceKey('alice.tld')
		reply((await waitFor('hello')).id, { result: HELLO })
		reply((await waitFor('setDeviceKey')).id, { result: null })
		await done
		expect(api.auth.deleteApiKey).toHaveBeenCalledWith('7')
	})

	it('keeps a timed-out key native reports holding', async () => {
		await timeOutHandoff()
		const done = nb.ensureDeviceKey('alice.tld')
		reply((await waitFor('hello')).id, {
			result: { ...HELLO, hasDeviceKey: true, deviceKeyId: '7' }
		})
		await done
		expect(api.auth.deleteApiKey).not.toHaveBeenCalled()
	})

	it('mints again once native has dropped its key', async () => {
		const first = nb.ensureDeviceKey('alice.tld')
		reply((await waitFor('hello')).id, { result: HELLO })
		reply((await waitFor('setDeviceKey')).id, { result: null })
		await first
		const second = nb.ensureDeviceKey('alice.tld')
		reply((await waitFor('hello')).id, { result: HELLO })
		reply((await waitFor('setDeviceKey')).id, { result: null })
		await second
		expect(api.auth.createApiKey).toHaveBeenCalledTimes(2)
	})

	it('runs a second call after the in-flight one instead of dropping it', async () => {
		const first = nb.ensureDeviceKey('alice.tld')
		const second = nb.relinkDevice('alice.tld')
		reply((await waitFor('hello')).id, { result: HELLO })
		reply((await waitFor('setDeviceKey')).id, { result: null })
		await first
		// The relink still mints, though the first run just stored a key
		reply((await waitFor('hello')).id, { result: { ...HELLO, hasDeviceKey: true } })
		reply((await waitFor('setDeviceKey')).id, { result: null })
		await second
		expect(api.auth.createApiKey).toHaveBeenCalledTimes(2)
	})

	it('relinkDevice mints even when native already has a key', async () => {
		const done = nb.relinkDevice('alice.tld')
		reply((await waitFor('hello')).id, { result: { ...HELLO, hasDeviceKey: true } })
		reply((await waitFor('setDeviceKey')).id, { result: null })
		await done
		expect(api.auth.createApiKey).toHaveBeenCalledTimes(1)
	})

	it('relink revokes the key native reports holding', async () => {
		const done = nb.relinkDevice('alice.tld')
		reply((await waitFor('hello')).id, {
			result: { ...HELLO, hasDeviceKey: true, deviceKeyId: '3' }
		})
		reply((await waitFor('setDeviceKey')).id, { result: null })
		await done
		expect(api.auth.deleteApiKey).toHaveBeenCalledTimes(1)
		expect(api.auth.deleteApiKey).toHaveBeenCalledWith('3')
		expect(api.auth.listApiKeys).not.toHaveBeenCalled()
	})

	it('relink revokes nothing when native does not report its key id', async () => {
		const done = nb.relinkDevice('alice.tld')
		reply((await waitFor('hello')).id, { result: { ...HELLO, hasDeviceKey: true } })
		reply((await waitFor('setDeviceKey')).id, { result: null })
		await done
		expect(api.auth.deleteApiKey).not.toHaveBeenCalled()
	})

	it('relink to another account rejects; ensureDeviceKey resolves without minting', async () => {
		const relink = nb.relinkDevice('alice.tld')
		reply((await waitFor('hello')).id, { result: { ...HELLO, idTag: 'eve.tld' } })
		await expect(relink).rejects.toBeInstanceOf(nb.DeviceAccountMismatchError)
		const ensure = nb.ensureDeviceKey('alice.tld')
		reply((await waitFor('hello')).id, { result: { ...HELLO, idTag: 'eve.tld' } })
		await ensure
		expect(api.auth.createApiKey).not.toHaveBeenCalled()
	})
})

describe('blob downloads', () => {
	const CHUNK = 512 * 1024
	const realFetch = globalThis.fetch
	afterEach(() => {
		globalThis.fetch = realFetch
	})
	const getToken = async () => undefined

	it('streams the blob in chunks, the last one flagged', async () => {
		globalThis.fetch = jest.fn(async () => ({
			blob: async () => new Blob([new Uint8Array(CHUNK + 10)])
		})) as unknown as typeof fetch
		const done = nb.handleDownload({ reqId: 1, url: 'blob:x' }, getToken)
		const c1 = await waitForSlow('downloadChunk')
		expect(c1.params.last).toBe(false)
		reply(c1.id, { result: null })
		const c2 = await waitForSlow('downloadChunk')
		expect(c2.params).toMatchObject({ reqId: 1, last: true })
		expect(atob(String(c2.params.b64)).length).toBe(10)
		reply(c2.id, { result: null })
		await expect(done).resolves.toBe(true)
	})

	it('tells native when the blob cannot be read', async () => {
		globalThis.fetch = jest.fn(async () => {
			throw new Error('gone')
		}) as unknown as typeof fetch
		const done = nb.handleDownload({ reqId: 2, url: 'blob:x' }, getToken)
		const c = await waitForSlow('downloadChunk')
		expect(c.params).toMatchObject({ reqId: 2, last: true, error: 'gone' })
		reply(c.id, { result: null })
		await expect(done).resolves.toBe(false)
		expect(sent).toHaveLength(0)
	})
})

/** Like `waitFor`, but also yields to the event loop (Blob reads resolve as macrotasks). */
async function waitForSlow(method: string): Promise<Req> {
	for (let i = 0; i < 50; i++) {
		try {
			return await waitFor(method)
		} catch {
			await new Promise((r) => setTimeout(r, 0))
		}
	}
	throw new Error(`no ${method} request`)
}

// vim: ts=4
