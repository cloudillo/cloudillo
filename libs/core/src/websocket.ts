// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import { getRtdbUrl, getMessageBusUrl } from './urls.js'

export interface WebSocketOpts {
	idTag: string
	authToken: string
}

/**
 * Open a Real-Time Database (RTDB) connection
 *
 * Establishes WebSocket connection for real-time database synchronization.
 *
 * @param fileId - File ID for the RTDB
 * @param opts - Connection options
 * @returns WebSocket connection
 *
 * @example
 * ```typescript
 * const ws = openRTDB('file-123', {
 *   idTag: 'alice',
 *   authToken: 'token'
 * })
 *
 * ws.onopen = () => console.log('Connected to RTDB')
 * ws.onmessage = (event) => {
 *   const data = JSON.parse(event.data)
 *   console.log('Data update:', data)
 * }
 * ws.onerror = (event) => console.error('Error:', event)
 * ws.onclose = () => console.log('Disconnected')
 *
 * // Send updates
 * ws.send(JSON.stringify({ action: 'set', path: 'data.name', value: 'Alice' }))
 *
 * // Cleanup
 * ws.close()
 * ```
 */
export function openRTDB(fileId: string, opts: WebSocketOpts): WebSocket {
	if (!opts.authToken) {
		throw new Error('No access token for RTDB connection')
	}

	const wsUrl = getRtdbUrl(opts.idTag, fileId, opts.authToken)
	console.log(`[RTDB] Connecting to ${wsUrl}`)

	return new WebSocket(wsUrl)
}

/**
 * Open a Message Bus connection for real-time updates
 *
 * Establishes WebSocket connection to receive real-time messages and
 * updates from other instances.
 *
 * @param opts - Connection options
 * @returns WebSocket connection
 *
 * @example
 * ```typescript
 * const ws = openMessageBus({
 *   idTag: 'alice',
 *   authToken: 'token'
 * })
 *
 * ws.onopen = () => console.log('Connected to message bus')
 * ws.onmessage = (event) => {
 *   const message = JSON.parse(event.data)
 *   console.log('Message:', message)
 * }
 * ws.onerror = (event) => console.error('Error:', event)
 *
 * // Cleanup
 * ws.close()
 * ```
 */
export function openMessageBus(opts: WebSocketOpts): WebSocket {
	if (!opts.authToken) {
		throw new Error('No access token for message bus connection')
	}

	const wsUrl = getMessageBusUrl(opts.idTag, opts.authToken)
	console.log(`[Bus] Connecting to ${wsUrl}`)

	return new WebSocket(wsUrl)
}

// vim: ts=2
