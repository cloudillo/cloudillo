// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getAppBus, resetAppBus } from '../../message-bus/app-bus'
import { PROTOCOL_VERSION } from '../../message-bus/types'

/**
 * Drive a real `AppBus.init()` against the given location hash and answer the
 * handshake as the shell would.
 *
 * @returns the bus and the `auth:init.req` payload it put on the wire
 */
async function initWithHash(hash: string) {
	window.location.hash = hash
	resetAppBus()
	const bus = getAppBus()

	const sent: Array<Record<string, unknown>> = []
	// jsdom's window.parent is the window itself; the bus posts to parent.
	// Hand-rolled rather than jest.spyOn — the `jest` global is not injected
	// under `--experimental-vm-modules`.
	const realPost = window.parent.postMessage
	window.parent.postMessage = ((msg: unknown) => {
		sent.push(msg as Record<string, unknown>)
	}) as typeof window.postMessage

	// sendRequest calls sendFn synchronously, so the request is already out
	const pending = bus.init('testapp')
	const req = sent.find((m) => m.type === 'auth:init.req') as {
		id: number
		payload: { appName: string; resId?: string }
	}
	expect(req).toBeDefined()

	window.dispatchEvent(
		new MessageEvent('message', {
			// The bus only trusts its parent; jsdom's window.parent is the window
			// itself, so this is what the shell's own reply looks like here.
			source: window.parent,
			data: {
				cloudillo: true,
				v: PROTOCOL_VERSION,
				type: 'auth:init.res',
				replyTo: req.id,
				ok: true,
				data: { theme: 'glass', idTag: '@viewer.example', authenticated: true }
			}
		})
	)
	await pending
	window.parent.postMessage = realPost

	return { bus, payload: req.payload }
}

afterEach(() => {
	resetAppBus()
	window.location.hash = ''
})

/**
 * The embed hash carries two different things glued together: the real document
 * and the '_embed:<nonce>' key the shell keys its pending registration on. Fold
 * them into one and `ownerTag` becomes the literal '_embed', which the app then
 * uses as a hostname — every profile fetch fails and every collaborator loses
 * their picture. Keep the two apart.
 */
describe('AppBus embed hash parsing', () => {
	it('keeps the real resId out of an embed hash', async () => {
		const { bus, payload } = await initWithHash('@alice.example.com:f1~abc:_embed:n0nce')

		expect(bus.resId).toBe('@alice.example.com:f1~abc')
		expect(bus.ownerTag).toBe('@alice.example.com')
		expect(bus.fileId).toBe('f1~abc')
		expect(bus.embedded).toBe(true)
		// ...while the wire protocol is untouched: the shell still sees the key
		expect(payload.resId).toBe('_embed:n0nce')
	})

	it('leaves resId undefined for a legacy embed hash', async () => {
		const { bus, payload } = await initWithHash('_embed:n0nce')

		// undefined, not '_embed' — so `bus.ownerTag ?? bus.idTag` falls through
		expect(bus.resId).toBeUndefined()
		expect(bus.ownerTag).toBeUndefined()
		expect(bus.fileId).toBeUndefined()
		expect(bus.embedded).toBe(true)
		expect(payload.resId).toBe('_embed:n0nce')
	})

	it('passes a top-level hash through unchanged', async () => {
		const { bus, payload } = await initWithHash('@alice.example.com:f1~abc')

		expect(bus.resId).toBe('@alice.example.com:f1~abc')
		expect(bus.ownerTag).toBe('@alice.example.com')
		expect(bus.fileId).toBe('f1~abc')
		expect(bus.embedded).toBe(false)
		expect(payload.resId).toBe('@alice.example.com:f1~abc')
	})

	it('has no resId at all without a hash', async () => {
		const { bus, payload } = await initWithHash('')

		expect(bus.resId).toBeUndefined()
		expect(bus.embedded).toBe(false)
		expect(payload.resId).toBeUndefined()
	})
})

// vim: ts=4
