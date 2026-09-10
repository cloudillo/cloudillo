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
import { MemoryRouter, useNavigate } from 'react-router-dom'

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

/*
 * `initDoc()` is invoked bare, so anything `openYDoc` throws used to become an unhandled
 * rejection: `synced` stayed false, `error` stayed null, and the editor sat on its loading
 * screen with nothing in the UI. A malformed owner tag in the location hash is one way in —
 * `getCrdtUrl` yields a string `new WebSocket` throws on, synchronously inside the
 * `WebsocketProvider` constructor y-websocket's `setupWS` calls.
 */
describe('useCloudilloEditor when the document fails to open', () => {
	let stopShell: (() => void) | undefined
	let error: ReturnType<typeof jest.spyOn>

	beforeEach(() => {
		openYDoc.mockClear()
		error = jest.spyOn(console, 'error').mockImplementation(() => {})
	})

	afterEach(() => {
		error.mockRestore()
		stopShell?.()
		stopShell = undefined
		resetAppBus()
	})

	it('surfaces the failure as `error` instead of hanging on the loading screen', async () => {
		openYDoc.mockImplementationOnce(async () => {
			throw new Error('SyntaxError: failed to construct WebSocket')
		})
		stopShell = actAsShell({ idTag: '@alice.example', authenticated: true, theme: 'default' })

		const { result } = renderHook(() => useCloudilloEditor('testapp'), { wrapper })

		await waitFor(() => expect(result.current.error).not.toBeNull())
		expect(result.current.synced).toBe(false)
		// Outside the 4400-4499 CRDT close-code band, which names a server refusal.
		expect(result.current.error?.code).toBe(0)
		expect(result.current.error?.reason).toContain('WebSocket')
		// `setProvider` only runs once the NEW `openYDoc` resolves, so a failure must
		// leave nothing behind — a destroyed provider here is a dead socket that
		// awareness/presence consumers would happily keep writing to.
		expect(result.current.provider).toBeUndefined()
	})

	// The effect never reset its own state, so a failed document kept showing its error
	// after navigating to a healthy one — and a stale `synced === true` would have
	// reported the new document ready before its own `sync` fired.
	it('clears the error when the document changes', async () => {
		openYDoc.mockImplementationOnce(async () => {
			throw new Error('SyntaxError: failed to construct WebSocket')
		})
		stopShell = actAsShell({ idTag: '@alice.example', authenticated: true, theme: 'default' })

		const { result } = renderHook(
			() => ({ editor: useCloudilloEditor('testapp'), navigate: useNavigate() }),
			{ wrapper }
		)
		await waitFor(() => expect(result.current.editor.error).not.toBeNull())

		// The next document opens cleanly — the failed one's error must not follow it.
		await act(async () => {
			result.current.navigate('/#@owner.example:file-2')
			await flush()
		})

		await waitFor(() => expect(result.current.editor.error).toBeNull())
		expect(openYDoc).toHaveBeenCalledTimes(2)
		// A FRESH doc, not the one the first document was opened on. `openYDoc` attaches
		// persistence and a provider without clearing what it is handed, so reusing the
		// instance merges the two documents into each other, in both directions.
		expect(openYDoc.mock.calls[0][0]).not.toBe(openYDoc.mock.calls[1][0])
		// ...and the cleanup of the OUTGOING doc must not have taken the incoming one with
		// it: the cleanup destroys only a doc the render body has already superseded.
		expect((openYDoc.mock.calls[1][0] as { isDestroyed: boolean }).isDestroyed).toBe(false)
	})

	it('reuses the doc across a StrictMode remount', async () => {
		stopShell = actAsShell({ idTag: '@alice.example', authenticated: true, theme: 'default' })

		const { result } = renderHook(() => useCloudilloEditor('testapp'), {
			wrapper: ({ children }) => <React.StrictMode>{wrapper({ children })}</React.StrictMode>
		})
		await waitFor(() => expect(result.current.synced).toBe(true))

		// StrictMode's throwaway unmount must not destroy the doc the remount is handed.
		expect((openYDoc.mock.calls[0][0] as { isDestroyed: boolean }).isDestroyed).toBe(false)
	})

	it('leaves the doc alive on unmount', async () => {
		stopShell = actAsShell({ idTag: '@alice.example', authenticated: true, theme: 'default' })

		const { result, unmount } = renderHook(() => useCloudilloEditor('testapp'), { wrapper })
		await waitFor(() => expect(result.current.synced).toBe(true))
		const doc = openYDoc.mock.calls[0][0] as { isDestroyed: boolean }

		unmount()

		// Deliberate: nothing superseded it, and a StrictMode remount is indistinguishable
		// from this at teardown. GC takes it with the component.
		expect(doc.isDestroyed).toBe(false)
	})
})

// vim: ts=4
