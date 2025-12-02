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

import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
//import { IndexeddbPersistence } from 'y-indexeddb'

export interface WebSocketOpts {
	idTag: string
	authToken: string
}

/**
 * Open a CRDT document for collaborative editing
 *
 * Establishes WebSocket connection to CRDT server and sets up offline
 * persistence via IndexedDB.
 *
 * @param yDoc - Yjs document (can be new or existing)
 * @param docId - Document ID in format "tenant:resource-id"
 * @param opts - Connection options
 * @returns Document and WebSocket provider
 *
 * @example
 * ```typescript
 * const yDoc = new Y.Doc()
 * const { yDoc: doc, provider } = await openCRDT(
 *   yDoc,
 *   'alice:doc-123',
 *   { idTag: 'alice', authToken: 'token' }
 * )
 *
 * // Use the document
 * const yMap = doc.getMap('data')
 * yMap.observe(event => console.log('Changed:', event.changes))
 *
 * // Cleanup
 * provider.destroy()
 * ```
 */
export async function openCRDT(
	yDoc: Y.Doc,
	docId: string,
	opts: WebSocketOpts
): Promise<{ yDoc: Y.Doc; provider: WebsocketProvider }> {
	const [targetTag, resId] = docId.split(':')

	if (!opts.authToken) {
		throw new Error('No access token for CRDT connection')
	}

	// Set up offline persistence
	/*
  const idbProvider = new IndexeddbPersistence(docId, yDoc)
  await new Promise<void>((resolve) => {
    idbProvider.on('synced', () => {
      console.log(`[CRDT] Loaded from local storage: ${docId}`)
      resolve()
    })
  })
  */

	// Connect to server
	const wsUrl = `wss://cl-o.${targetTag}/ws/crdt`
	console.log(`[CRDT] Connecting to ${wsUrl}`, { resId, token: opts.authToken })

	const wsProvider = new WebsocketProvider(wsUrl, resId, yDoc, {
		params: { token: opts.authToken }
	})

	return { yDoc, provider: wsProvider }
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

	const wsUrl = `wss://cl-o.${opts.idTag}/ws/rtdb/${fileId}?token=${encodeURIComponent(opts.authToken)}`
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

	const wsUrl = `wss://cl-o.${opts.idTag}/ws/bus?token=${encodeURIComponent(opts.authToken)}`
	console.log(`[Bus] Connecting to ${wsUrl}`)

	return new WebSocket(wsUrl)
}

// vim: ts=2
