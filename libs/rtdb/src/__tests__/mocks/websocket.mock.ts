// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The WebSocket fixture every `WebSocketManager` suite runs on.
 *
 * A suite that needs to answer a particular frame subclasses `MockWebSocket`
 * and hands the subclass to `installMockWebSocket()`; everything else — the
 * `CloseEvent` polyfill node lacks, the constructor stamped with the readyState
 * constants `send()` compares against, the connect-then-open dance — is here.
 */

import { jest } from '@jest/globals'

import type { WebSocketManager } from '../../websocket'

// Helpers for patching Node.js globals in tests
export function setGlobal(key: string, value: unknown): void {
	Object.defineProperty(globalThis, key, { value, writable: true, configurable: true })
}

export function getGlobal(key: string): unknown {
	return (globalThis as Record<string, unknown>)[key]
}

/** Polyfill CloseEvent, which the Node.js environment has no global for. */
export class CloseEvent extends Event {
	code: number
	reason: string
	wasClean: boolean

	constructor(type: string, init?: { code?: number; reason?: string; wasClean?: boolean }) {
		super(type)
		this.code = init?.code ?? 0
		this.reason = init?.reason ?? ''
		this.wasClean = init?.wasClean ?? true
	}
}
setGlobal('CloseEvent', CloseEvent)

export class MockWebSocket {
	readyState = 0
	onopen: ((event: Event) => void) | null = null
	onclose: ((event: CloseEvent) => void) | null = null
	onerror: ((event: Event) => void) | null = null
	onmessage: ((event: MessageEvent) => void) | null = null

	/** Every frame the manager sent, already JSON-parsed. */
	sent: Array<Record<string, unknown>> = []

	constructor(public url: string) {}

	send(data: string): void {
		this.sent.push(JSON.parse(data))
	}

	close(): void {
		this.simulateClose()
	}

	simulateOpen(): void {
		this.readyState = 1
		this.onopen?.(new Event('open'))
	}

	simulateClose(): void {
		this.readyState = 3
		this.onclose?.(new CloseEvent('close', { code: 1006 }))
	}

	simulateError(): void {
		this.onerror?.(new Event('error'))
	}

	simulateMessage(data: unknown): void {
		this.receive(data)
	}

	/** Deliver a server frame — what a subclass's canned answers are built on. */
	protected receive(data: unknown): void {
		this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }))
	}
}

const originalWebSocket = getGlobal('WebSocket')

/** Constructor of the socket a suite wants built — `MockWebSocket` or a subclass of it. */
type SocketCtor<T extends MockWebSocket> = new (url: string) => T

/**
 * Install the mock as the global `WebSocket` and return the live array of
 * sockets it constructs. Call from `beforeEach`, pair with `restoreWebSocket()`.
 */
export function installMockWebSocket<T extends MockWebSocket = MockWebSocket>(
	Ctor: SocketCtor<T> = MockWebSocket as SocketCtor<T>
): T[] {
	const sockets: T[] = []
	const ctor = jest.fn((url: string) => {
		const socket = new Ctor(url)
		sockets.push(socket)
		return socket
	})
	// `send()` compares `readyState` against `WebSocket.OPEN` on the constructor,
	// so the mock has to carry the readyState constants too.
	Object.assign(ctor, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 })
	setGlobal('WebSocket', ctor)
	return sockets
}

export function restoreWebSocket(): void {
	setGlobal('WebSocket', originalWebSocket)
}

/** Connect a manager and open the socket it builds, returning that socket. */
export async function connectAndOpen<T extends MockWebSocket>(
	ws: WebSocketManager,
	sockets: T[]
): Promise<T> {
	const before = sockets.length
	const connecting = ws.connect()
	// `_doConnect` awaits the token before constructing the socket, so it does not
	// exist yet on the turn `connect()` was called.
	while (sockets.length === before) await jest.advanceTimersByTimeAsync(0)
	const socket = sockets[sockets.length - 1]
	socket.simulateOpen()
	await connecting
	return socket
}

// vim: ts=4
