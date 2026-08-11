// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `useCloudilloEditor` must not reopen the document when only the identity FLAG
 * moves.
 *
 * `useCloudillo()` returns a fresh object whenever the identity changes, so its
 * document effect deliberately depends on the primitives `[cl.idTag, docId]`.
 * Widening that to `cl` would destroy the provider and reconnect the Yjs socket
 * mid-edit every time the shell corrects `authenticated` — this is the guard on
 * that dep array.
 */

import { jest } from '@jest/globals'
import { act, renderHook, waitFor } from '@testing-library/react'
import * as React from 'react'
import { MemoryRouter } from 'react-router-dom'

const destroyProvider = jest.fn()
const destroyPersistence = jest.fn()
const openYDoc = jest.fn(async () => ({
	provider: {
		synced: true,
		on: () => {},
		off: () => {},
		destroy: destroyProvider
	},
	persistence: { destroy: destroyPersistence },
	offlineCached: false
}))

jest.unstable_mockModule('@cloudillo/crdt', () => ({ openYDoc }))

const { PROTOCOL_VERSION, resetAppBus } = await import('@cloudillo/core')
const { useCloudilloEditor } = await import('../hooks.js')

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

function pushIdentity(payload: Record<string, unknown>) {
	postAsShell({ cloudillo: true, v: PROTOCOL_VERSION, type: 'auth:init.push', payload })
}

function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0))
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
	<MemoryRouter initialEntries={['/#@owner.example:file-1']}>{children}</MemoryRouter>
)

describe('useCloudilloEditor across an identity change', () => {
	let stopShell: (() => void) | undefined

	beforeEach(() => {
		openYDoc.mockClear()
		destroyProvider.mockClear()
		destroyPersistence.mockClear()
	})

	afterEach(() => {
		stopShell?.()
		stopShell = undefined
		resetAppBus()
	})

	it('does not reopen the document when only `authenticated` flips', async () => {
		stopShell = actAsShell({ idTag: '@alice.example', authenticated: false, theme: 'default' })

		const { result } = renderHook(() => useCloudilloEditor('testapp'), { wrapper })
		await waitFor(() => expect(openYDoc).toHaveBeenCalledTimes(1))

		await act(async () => {
			pushIdentity({ idTag: '@alice.example', authenticated: true, theme: 'default' })
			await flush()
		})

		expect(result.current.authenticated).toBe(true)
		// The whole point: the identity moved, the connection did not.
		expect(openYDoc).toHaveBeenCalledTimes(1)
		expect(destroyProvider).not.toHaveBeenCalled()
	})

	it('does reopen when the idTag itself changes', async () => {
		stopShell = actAsShell({ idTag: '@owner.example', authenticated: false, theme: 'default' })

		renderHook(() => useCloudilloEditor('testapp'), { wrapper })
		await waitFor(() => expect(openYDoc).toHaveBeenCalledTimes(1))

		await act(async () => {
			pushIdentity({ idTag: '@alice.example', authenticated: true, theme: 'default' })
			await flush()
		})

		// A different user must not keep editing on the previous one's connection.
		await waitFor(() => expect(openYDoc).toHaveBeenCalledTimes(2))
		expect(destroyProvider).toHaveBeenCalled()
	})
})

// vim: ts=4
