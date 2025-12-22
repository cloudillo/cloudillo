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

/**
 * Cloudillo Base Module
 *
 * This module provides the core functionality for Cloudillo apps.
 * The main API is the AppMessageBus via getAppBus().
 *
 * @example
 * ```typescript
 * import { getAppBus, openYDoc } from '@cloudillo/base'
 *
 * const bus = getAppBus()
 * const state = await bus.init('my-app')
 *
 * // Access state
 * console.log(bus.accessToken, bus.idTag, bus.access)
 *
 * // Storage
 * await bus.storage.set('my-app', 'key', value)
 *
 * // Open CRDT document
 * const { yDoc, provider } = await openYDoc(new Y.Doc(), 'idTag:docId')
 * ```
 */

import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

import { getCrdtUrl } from './urls.js'
import { getAppBus } from './message-bus/index.js'

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Delay execution for a specified time
 */
export async function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

// ============================================
// CRDT DOCUMENT FUNCTIONS
// ============================================

/**
 * Open a Yjs document with WebSocket synchronization
 *
 * This function connects to the Cloudillo CRDT server and sets up
 * real-time synchronization for the document.
 *
 * @param yDoc - The Yjs document to synchronize
 * @param docId - Document ID in format "targetTag:resourceId"
 * @returns The document and WebSocket provider
 *
 * @example
 * ```typescript
 * const yDoc = new Y.Doc()
 * const { provider } = await openYDoc(yDoc, 'alice:my-document')
 *
 * // Access shared types
 * const yText = yDoc.getText('content')
 * ```
 */
export async function openYDoc(
	yDoc: Y.Doc,
	docId: string
): Promise<{ yDoc: Y.Doc; provider: WebsocketProvider }> {
	const bus = getAppBus()
	const token = bus.accessToken
	const accessLevel = bus.access

	if (!token) {
		throw new Error('No access token. Call init() first.')
	}

	const [targetTag, resId] = docId.split(':')
	if (!targetTag || !resId) {
		throw new Error('Invalid docId format. Expected "targetTag:resourceId"')
	}

	const wsProvider = new WebsocketProvider(getCrdtUrl(targetTag), resId, yDoc, {
		params: { token, access: accessLevel || 'write' }
	})

	// Intercept WebSocket close to handle auth errors and prevent infinite reconnection
	const setupCloseHandler = () => {
		const ws = wsProvider.ws
		if (ws) {
			const originalOnclose = ws.onclose
			ws.onclose = (event: CloseEvent) => {
				// Check for auth/resource errors from backend:
				// 4401 = Unauthorized, 4403 = Access denied, 4404 = Not found
				if (event.code >= 4400 && event.code < 4500) {
					console.log(
						'[CRDT] Auth/resource error, stopping reconnection:',
						event.code,
						event.reason
					)
					wsProvider.shouldConnect = false
					wsProvider.disconnect()
					// Don't call original - prevent reconnection attempt
					return
				}
				// For other errors, let y-websocket handle normally
				if (originalOnclose) {
					originalOnclose.call(ws, event)
				}
			}
		}
	}

	// Setup handler when WebSocket connects (and on each reconnection)
	wsProvider.on('status', ({ status }: { status: string }) => {
		if (status === 'connected') {
			setupCloseHandler()
		}
	})

	return {
		yDoc,
		provider: wsProvider
	}
}

// vim: ts=4
