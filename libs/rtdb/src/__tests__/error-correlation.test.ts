// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The client keys its pending-request map on the numeric id it sent, so an error
 * frame that echoes that id must settle the request it belongs to.
 *
 * Presence depends on this twice over: an oversized state has to come back as a
 * 413 the caller can see, and the unknown-command arm is what lets a new client
 * detect an old server on the first frame rather than one stall per keystroke.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'

import { RtdbError } from '../errors'
import { WebSocketManager } from '../websocket'
import {
	connectAndOpen,
	installMockWebSocket,
	MockWebSocket,
	restoreWebSocket
} from './mocks/websocket.mock'

class ErrorSocket extends MockWebSocket {
	/** Answer a frame the way the fixed backend does: same id, error payload. */
	sendError(id: unknown, code: number, message: string): void {
		this.receive({ id, type: 'error', code, message })
	}
}

let sockets: ErrorSocket[] = []

beforeEach(() => {
	jest.useFakeTimers()
	sockets = installMockWebSocket(ErrorSocket)
})

afterEach(() => {
	jest.clearAllTimers()
	jest.useRealTimers()
	restoreWebSocket()
})

describe('server error correlation', () => {
	let ws: WebSocketManager

	beforeEach(() => {
		ws = new WebSocketManager('test-db', () => 'test-token', 'wss://test.com', {
			enableCache: false,
			reconnect: false,
			reconnectDelay: 100,
			maxReconnectDelay: 1000,
			debug: false,
			presence: true
		})
	})

	it('rejects the request an echoed error id belongs to, within a tick', async () => {
		const socket = await connectAndOpen(ws, sockets)

		const failed = ws.send({ type: 'presence', state: {} }).catch((error) => error)
		const id = socket.sent.find((m) => m.type === 'presence')?.id

		socket.sendError(id, 413, 'Presence state too large')
		await jest.advanceTimersByTimeAsync(0)

		const error = await failed
		expect(error).toBeInstanceOf(RtdbError)
		expect((error as RtdbError).code).toBe(413)
		expect((error as RtdbError).message).toBe('Presence state too large')
		// Settled long before the 30s timeout could have fired.
		expect(ws.getPendingRequestCount()).toBe(0)
	})
})

// vim: ts=4
