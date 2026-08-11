// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `useCloudillo()` must follow a later identity, not just the mount-time one.
 *
 * The memo inside it reads the app bus directly, so an `auth:init.push` that
 * corrects who we are — the shell sends one when auth resolves after a
 * share-link mount, and on a mid-session sign-in or context switch — reached
 * nobody: every consumer kept publishing the mount-time identity onto awareness
 * for the rest of the session, which is how a signed-in collaborator ended up
 * rendering as an anonymous monogram.
 */

import { getAppBus, PROTOCOL_VERSION, resetAppBus } from '@cloudillo/core'
import { act, renderHook, waitFor } from '@testing-library/react'
import * as React from 'react'
import { MemoryRouter } from 'react-router-dom'

import { useCloudillo } from '../hooks.js'

/**
 * Deliver a message to the bus as its parent window would.
 *
 * Not `window.postMessage`: jsdom leaves `event.source` null there, and the bus
 * drops anything not from `window.parent` — an embedded document must not be
 * able to hand its host a new identity. A real browser always stamps the sender,
 * so dispatching the event by hand is what matches production, not a workaround.
 * Queued through `setTimeout` to keep the delivery asynchronous, as postMessage is.
 */
function postAsShell(data: Record<string, unknown>): void {
	setTimeout(() => {
		window.dispatchEvent(new MessageEvent('message', { source: window.parent, data }))
	}, 0)
}

/**
 * Stand in for the shell: answer `auth:init.req`. jsdom makes `window.parent`
 * the window itself, so what the bus posts to its parent lands back here.
 */
function actAsShell(initData: Record<string, unknown>): () => void {
	const onMessage = (evt: MessageEvent) => {
		const msg = evt.data
		if (msg?.cloudillo !== true || msg.type !== 'auth:init.req') return
		postAsShell({
			cloudillo: true,
			v: PROTOCOL_VERSION,
			type: 'auth:init.res',
			replyTo: msg.id,
			ok: true,
			data: initData
		})
	}
	window.addEventListener('message', onMessage)
	return () => window.removeEventListener('message', onMessage)
}

/** What the shell sends to correct an app's identity after the fact. */
function pushIdentity(payload: Record<string, unknown>) {
	postAsShell({ cloudillo: true, v: PROTOCOL_VERSION, type: 'auth:init.push', payload })
}

function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0))
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
	<MemoryRouter>{children}</MemoryRouter>
)

describe('useCloudillo identity', () => {
	let stopShell: (() => void) | undefined

	afterEach(() => {
		stopShell?.()
		stopShell = undefined
		resetAppBus()
	})

	it('starts on whatever the init response said', async () => {
		stopShell = actAsShell({ idTag: '@owner.example', authenticated: false, theme: 'default' })

		const { result } = renderHook(() => useCloudillo('testapp'), { wrapper })

		await waitFor(() => expect(result.current.idTag).toBe('@owner.example'))
		// The owner tag a share-link visitor falls back to — not an identity.
		expect(result.current.authenticated).toBe(false)
	})

	it('follows a corrective push to a different user', async () => {
		stopShell = actAsShell({ idTag: '@owner.example', authenticated: false, theme: 'default' })

		const { result } = renderHook(() => useCloudillo('testapp'), { wrapper })
		await waitFor(() => expect(result.current.idTag).toBe('@owner.example'))

		await act(async () => {
			pushIdentity({
				idTag: '@alice.example',
				authenticated: true,
				theme: 'default',
				token: 'tok-2'
			})
			await flush()
		})

		expect(result.current.idTag).toBe('@alice.example')
		expect(result.current.authenticated).toBe(true)
		expect(getAppBus().accessToken).toBe('tok-2')
	})

	it('follows a bare authenticated flip on the same idTag', async () => {
		// The share-link case: the shell already handed us the right tag, it just
		// could not vouch for it yet.
		stopShell = actAsShell({ idTag: '@alice.example', authenticated: false, theme: 'default' })

		const { result } = renderHook(() => useCloudillo('testapp'), { wrapper })
		await waitFor(() => expect(result.current.authenticated).toBe(false))

		await act(async () => {
			pushIdentity({ idTag: '@alice.example', authenticated: true, theme: 'default' })
			await flush()
		})

		expect(result.current.authenticated).toBe(true)
		expect(result.current.idTag).toBe('@alice.example')
	})

	it('follows a displayName change', async () => {
		stopShell = actAsShell({
			idTag: '@alice.example',
			authenticated: true,
			displayName: 'Guest',
			theme: 'default'
		})

		const { result } = renderHook(() => useCloudillo('testapp'), { wrapper })
		await waitFor(() => expect(result.current.displayName).toBe('Guest'))

		await act(async () => {
			pushIdentity({
				idTag: '@alice.example',
				authenticated: true,
				displayName: 'Ada',
				theme: 'default'
			})
			await flush()
		})

		expect(result.current.displayName).toBe('Ada')
	})

	it('drops the subscription on unmount', async () => {
		stopShell = actAsShell({ idTag: '@alice.example', authenticated: true, theme: 'default' })

		// Watch the disposer the hook is handed. What leaks is a listener left in
		// the bus, and React silently DISCARDS a state update aimed at an unmounted
		// component — so nothing about the rendered output can reveal it, and only
		// the cleanup call itself is evidence. `resetAppBus()` in afterEach throws
		// this instance away, so the patch needs no undoing.
		const bus = getAppBus()
		const subscribe = bus.onIdentityChange.bind(bus)
		let subscriptions = 0
		let unsubscribed = 0
		bus.onIdentityChange = (cb: () => void) => {
			subscriptions++
			const off = subscribe(cb)
			return () => {
				unsubscribed++
				off()
			}
		}

		const { result, unmount } = renderHook(() => useCloudillo('testapp'), { wrapper })
		await waitFor(() => expect(result.current.idTag).toBe('@alice.example'))
		expect(subscriptions).toBe(1)

		unmount()
		expect(unsubscribed).toBe(1)

		await act(async () => {
			pushIdentity({ idTag: '@bob.example', authenticated: true, theme: 'default' })
			await flush()
		})

		// The control: the push really was delivered, the bus followed it — the
		// unsubscribe above is what kept it away from the hook, not a dead bus.
		expect(getAppBus().idTag).toBe('@bob.example')
		expect(result.current.idTag).toBe('@alice.example')
	})
})

// vim: ts=4
