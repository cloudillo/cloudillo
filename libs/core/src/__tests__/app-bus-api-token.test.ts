// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Inside a sandboxed app iframe the bus is the only owner of the ApiClient
 * registry entry — nothing else in the app's JS context knows the token. If the
 * write-through breaks, `useApi()` silently hands every app an anonymous client
 * and every authenticated request 401s.
 */

import { hasApiToken, resetApiRegistry } from '../api-registry'
import { getAppBus, resetAppBus } from '../message-bus/app-bus'
import { PROTOCOL_VERSION } from '../message-bus/types'

const ID_TAG = 'alice.example'

/**
 * Stand in for the shell: answer the bus's `auth:init.req` with an init
 * response. jsdom makes `window.parent` the window itself, so the request the
 * bus posts to its parent lands right back here.
 */
function actAsShell(initData: Record<string, unknown>): () => void {
	const onMessage = (evt: MessageEvent) => {
		const msg = evt.data
		if (msg?.cloudillo !== true || msg.type !== 'auth:init.req') return
		window.postMessage(
			{
				cloudillo: true,
				v: PROTOCOL_VERSION,
				type: 'auth:init.res',
				replyTo: msg.id,
				ok: true,
				data: initData
			},
			'*'
		)
	}
	window.addEventListener('message', onMessage)
	return () => window.removeEventListener('message', onMessage)
}

/** Let the posted messages jsdom queued actually be delivered. */
function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('AppBus -> api registry write-through', () => {
	let stopShell: (() => void) | undefined

	beforeEach(() => {
		resetApiRegistry()
	})

	afterEach(() => {
		stopShell?.()
		stopShell = undefined
		resetAppBus()
	})

	it('registers the token received during init', async () => {
		stopShell = actAsShell({ idTag: ID_TAG, theme: 'default', token: 'tok-init' })
		await getAppBus().init('testapp')
		expect(hasApiToken(ID_TAG)).toBe(true)
	})

	it('re-registers on a pushed token, so a renewal does not go stale', async () => {
		stopShell = actAsShell({ idTag: ID_TAG, theme: 'default', token: 'tok-init' })
		const bus = getAppBus()
		await bus.init('testapp')

		window.postMessage(
			{
				cloudillo: true,
				v: PROTOCOL_VERSION,
				type: 'auth:token.push',
				payload: { token: 'tok-renewed' }
			},
			'*'
		)
		await flush()

		expect(bus.accessToken).toBe('tok-renewed')
		expect(hasApiToken(ID_TAG)).toBe(true)
	})

	it('registers nothing when the shell sends no idTag', async () => {
		// Guest/anonymous init: there is no entry to own.
		stopShell = actAsShell({ theme: 'default' })
		await getAppBus().init('testapp')
		expect(hasApiToken(ID_TAG)).toBe(false)
	})
})

// vim: ts=4
