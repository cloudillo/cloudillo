// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Who the app bus is willing to listen to.
 *
 * An app is a sandboxed iframe that may itself embed further sandboxed iframes
 * (`DocumentEmbedIframe`, quillo's `ClDocumentBlot`). A nested child can
 * `postMessage` to `window.parent` — which is the host app's bus. Since
 * `auth:init.push` replaces idTag, accessToken, tnId and roles wholesale, an
 * unfiltered bus lets embedded content repoint the host's API client at a node
 * and a bearer token of the embed's choosing.
 *
 * Only the shell (top-level app) or the relaying host (nested embed) is
 * upstream, and both are `window.parent`.
 */

import { getAppBus, resetAppBus } from '../../message-bus/app-bus'
import { PROTOCOL_VERSION } from '../../message-bus/types'

const SHELL_INIT = {
	theme: 'glass',
	idTag: '@viewer.example',
	authenticated: true,
	token: 'viewer-token'
}

/** Drive a real `AppBus.init()` and answer the handshake as the shell would. */
async function initBus() {
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

	const pending = bus.init('testapp')
	const req = sent.find((m) => m.type === 'auth:init.req') as { id: number }
	expect(req).toBeDefined()

	window.dispatchEvent(
		new MessageEvent('message', {
			source: window.parent,
			data: {
				cloudillo: true,
				v: PROTOCOL_VERSION,
				type: 'auth:init.res',
				replyTo: req.id,
				ok: true,
				data: SHELL_INIT
			}
		})
	)
	await pending
	window.parent.postMessage = realPost

	return bus
}

/** A window that is NOT `window.parent` — stands in for a nested embed. */
function foreignWindow(): Window {
	const iframe = document.createElement('iframe')
	document.body.appendChild(iframe)
	const child = iframe.contentWindow
	if (!child) throw new Error('jsdom gave the iframe no contentWindow')
	return child
}

const HOSTILE_INIT = {
	cloudillo: true,
	v: PROTOCOL_VERSION,
	type: 'auth:init.push',
	payload: {
		theme: 'glass',
		idTag: '@attacker.example',
		authenticated: true,
		token: 'attacker-token',
		tnId: 666
	}
}

afterEach(() => {
	resetAppBus()
	document.body.innerHTML = ''
})

describe('AppBus message source validation', () => {
	it('ignores an auth:init.push from anything but the parent', async () => {
		const bus = await initBus()
		expect(bus.getState().idTag).toBe('@viewer.example')

		window.dispatchEvent(
			new MessageEvent('message', { source: foreignWindow(), data: HOSTILE_INIT })
		)

		const state = bus.getState()
		expect(state.idTag).toBe('@viewer.example')
		expect(state.accessToken).toBe('viewer-token')
		expect(state.tnId).toBeUndefined()
	})

	/**
	 * `source: null` is what a message from a detached or closed window looks
	 * like. It is not the parent, so it gets the same treatment.
	 */
	it('ignores a push with no source at all', async () => {
		const bus = await initBus()

		window.dispatchEvent(new MessageEvent('message', { data: HOSTILE_INIT }))

		expect(bus.getState().idTag).toBe('@viewer.example')
		expect(bus.getState().accessToken).toBe('viewer-token')
	})

	it('still accepts the same push from the parent', async () => {
		const bus = await initBus()

		window.dispatchEvent(
			new MessageEvent('message', {
				source: window.parent,
				data: {
					...HOSTILE_INIT,
					payload: { ...HOSTILE_INIT.payload, idTag: '@viewer2.example' }
				}
			})
		)

		// Proves the guard above rejected on the source and not on the payload.
		expect(bus.getState().idTag).toBe('@viewer2.example')
		expect(bus.getState().accessToken).toBe('attacker-token')
	})

	it('ignores a theme:update from anything but the parent', async () => {
		const bus = await initBus()
		const before = bus.getState().darkMode

		window.dispatchEvent(
			new MessageEvent('message', {
				source: foreignWindow(),
				data: {
					cloudillo: true,
					v: PROTOCOL_VERSION,
					type: 'theme:update',
					payload: { darkMode: !before }
				}
			})
		)

		expect(bus.getState().darkMode).toBe(before)
	})

	it('ignores a doc:info.push from anything but the parent', async () => {
		const bus = await initBus()
		const seen: unknown[] = []
		bus.onDocInfo((info) => seen.push(info))

		window.dispatchEvent(
			new MessageEvent('message', {
				source: foreignWindow(),
				data: {
					cloudillo: true,
					v: PROTOCOL_VERSION,
					type: 'doc:info.push',
					payload: {
						resId: '@attacker.example:f1',
						fileId: 'f1',
						state: 'ready',
						fileName: 'Not your document',
						isCrossOwner: false,
						canRename: true,
						canPost: true
					}
				}
			})
		)

		expect(seen).toEqual([])
	})

	it('ignores an embed:view.layout with an out-of-range scale', async () => {
		const bus = await initBus()
		const seen: unknown[] = []
		bus.onViewLayout((l) => {
			seen.push(l)
		})
		const layout = (scale: number) =>
			new MessageEvent('message', {
				source: window.parent,
				data: {
					cloudillo: true,
					v: PROTOCOL_VERSION,
					type: 'embed:view.layout',
					payload: { sizing: 'fit-width', availW: 400, scale, interactive: false }
				}
			})

		window.dispatchEvent(layout(Number.NaN))
		window.dispatchEvent(layout(1e9))
		expect(seen).toEqual([])

		window.dispatchEvent(layout(1))
		expect(seen).toHaveLength(1)
	})
})

// The shell relay drops a report outside the wire bounds whole, so the source clamps it.
describe('AppBus.reportView', () => {
	it('clamps an out-of-range natural size', async () => {
		const bus = await initBus()
		// biome-ignore lint/suspicious/noExplicitAny: forcing the private embed flag
		;(bus as any).isEmbed = true
		const sent: Array<Record<string, unknown>> = []
		const realPost = window.parent.postMessage
		window.parent.postMessage = ((msg: unknown) => {
			sent.push(msg as Record<string, unknown>)
		}) as typeof window.postMessage

		bus.reportView({ kind: 'reflow', natural: { w: 800, h: 50000 } })
		await new Promise((r) => setTimeout(r, 150))
		window.parent.postMessage = realPost

		expect(sent).toEqual([
			expect.objectContaining({
				type: 'embed:view.report',
				payload: expect.objectContaining({ natural: { w: 800, h: 20000 } })
			})
		])
	})
})

// vim: ts=4
