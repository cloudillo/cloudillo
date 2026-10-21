// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * `useConnectionNote`: "Offline" at once, "Reconnecting…" after 3 s, and a 2 s "Synced" only
 * when a note was actually shown.
 */

import { jest } from '@jest/globals'
import { act, renderHook } from '@testing-library/react'
import type { WebsocketProvider } from 'y-websocket'

import { useConnectionNote } from '../docbar.js'

type Handler = (...args: unknown[]) => void

/** Just the slice of a y-websocket provider the hook touches. */
function fakeProvider(wsconnected: boolean) {
	const handlers = new Map<string, Set<Handler>>()
	const p = {
		wsconnected,
		on: (ev: string, cb: Handler) => {
			if (!handlers.has(ev)) handlers.set(ev, new Set())
			handlers.get(ev)?.add(cb)
		},
		off: (ev: string, cb: Handler) => {
			handlers.get(ev)?.delete(cb)
		},
		emit: (ev: string, ...args: unknown[]) => {
			for (const cb of handlers.get(ev) ?? []) cb(...args)
		},
		count: () => [...handlers.values()].reduce((n, s) => n + s.size, 0)
	}
	return p
}

let online = true
Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })

function mount(p: ReturnType<typeof fakeProvider>) {
	return renderHook(() => useConnectionNote(p as unknown as WebsocketProvider))
}

const advance = (ms: number) => {
	act(() => {
		jest.advanceTimersByTime(ms)
	})
}

describe('useConnectionNote', () => {
	beforeEach(() => {
		jest.useFakeTimers()
		online = true
	})
	afterEach(() => {
		jest.useRealTimers()
	})

	it('shows "offline" immediately when the browser goes offline', () => {
		const p = fakeProvider(true)
		const { result } = mount(p)
		expect(result.current).toBeUndefined()
		online = false
		p.wsconnected = false
		act(() => {
			window.dispatchEvent(new Event('offline'))
		})
		advance(0)
		expect(result.current).toBe('offline')
	})

	it('shows "reconnecting" only after 3 s down', () => {
		const p = fakeProvider(true)
		const { result } = mount(p)
		p.wsconnected = false
		act(() => p.emit('status', { status: 'disconnected' }))
		advance(2999)
		expect(result.current).toBeUndefined()
		advance(1)
		expect(result.current).toBe('reconnecting')
	})

	it('stays silent for a blip that reconnects within 3 s', () => {
		const p = fakeProvider(true)
		const { result } = mount(p)
		p.wsconnected = false
		act(() => p.emit('status', { status: 'disconnected' }))
		advance(1000)
		p.wsconnected = true
		act(() => p.emit('status', { status: 'connected' }))
		act(() => p.emit('sync', true))
		advance(5000)
		expect(result.current).toBeUndefined()
	})

	it('shows "synced" for 2 s after a shown note', () => {
		const p = fakeProvider(false)
		const { result } = mount(p)
		advance(3000)
		expect(result.current).toBe('reconnecting')
		p.wsconnected = true
		act(() => p.emit('status', { status: 'connected' }))
		act(() => p.emit('sync', true))
		expect(result.current).toBe('synced')
		advance(1999)
		expect(result.current).toBe('synced')
		advance(1)
		expect(result.current).toBeUndefined()
	})

	it('removes its listeners on unmount', () => {
		const p = fakeProvider(true)
		const add = jest.spyOn(window, 'addEventListener')
		const remove = jest.spyOn(window, 'removeEventListener')
		const { unmount } = mount(p)
		expect(p.count()).toBe(2)
		unmount()
		expect(p.count()).toBe(0)
		for (const ev of ['online', 'offline']) {
			const added = add.mock.calls.find((c) => c[0] === ev)?.[1]
			expect(added).toBeDefined()
			expect(remove.mock.calls.some((c) => c[0] === ev && c[1] === added)).toBe(true)
		}
		add.mockRestore()
		remove.mockRestore()
	})
})
