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
 * Cloudillo CRDT Module
 *
 * This module provides Yjs document management with WebSocket synchronization
 * for collaborative editing in Cloudillo apps.
 *
 * @example
 * ```typescript
 * import { openYDoc } from '@cloudillo/crdt'
 * import { getAppBus } from '@cloudillo/core'
 * import * as Y from 'yjs'
 *
 * const bus = getAppBus()
 * const state = await bus.init('my-app')
 *
 * // Open CRDT document
 * const { yDoc, provider } = await openYDoc(new Y.Doc(), 'idTag:docId')
 * ```
 */

import type * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

import { getCrdtUrl, getAppBus } from '@cloudillo/core'
import { CrdtPersistence } from './crdt-persistence.js'

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
): Promise<{
	yDoc: Y.Doc
	provider: WebsocketProvider
	persistence: CrdtPersistence
	offlineCached: boolean
}> {
	const bus = getAppBus()
	const token = bus.accessToken
	const accessLevel = bus.access

	const [targetTag, resId] = docId.split(':')
	if (!targetTag || !resId) {
		throw new Error('Invalid docId format. Expected "targetTag:resourceId"')
	}

	// Normalized CRDT document ID (without embed suffixes)
	const crdtDocId = `${targetTag}:${resId}`

	// Request a reusable clientId from the shell to prevent unbounded
	// state vector growth. Falls back to the random clientId if unavailable.
	const clientId = await bus.requestClientId(crdtDocId)

	// Load cached state BEFORE setting clientId. This pre-populates the
	// Y.Doc store with previous operations so that Yjs sees the correct
	// clock for the reused clientId and won't trigger conflict detection.
	const persistence = new CrdtPersistence(bus, crdtDocId, yDoc)
	const hadCache = await persistence.loadCached()

	// Set the reused clientId. With a fresh clientId pool (no legacy history)
	// and cached state pre-populating the store, Yjs won't detect a conflict.
	if (clientId != null) {
		yDoc.clientID = clientId
		console.log(
			'[CRDT] Set reused clientId:',
			clientId,
			'for doc:',
			docId,
			hadCache ? '(from cache)' : '(new)'
		)
	} else {
		console.log('[CRDT] openYDoc clientId:', yDoc.clientID, 'for doc:', docId, '(random)')
	}

	// Build WebSocket params: token is optional (guest/read-only access)
	const params: Record<string, string> = {
		access: accessLevel || (token ? 'write' : 'read')
	}
	if (token) params.token = token

	// Detect offline-with-cache: no token but we have locally cached data
	const offlineCached = !token && hadCache

	const wsProvider = new WebsocketProvider(getCrdtUrl(targetTag), resId, yDoc, { params })

	// Intercept WebSocket close to handle auth errors and prevent infinite reconnection
	let tokenRefreshInProgress = false
	const setupCloseHandler = () => {
		const ws = wsProvider.ws
		if (ws) {
			const originalOnclose = ws.onclose
			ws.onclose = (event: CloseEvent) => {
				// 4401 = Unauthorized: request a fresh token from the shell and retry
				if (event.code === 4401) {
					if (tokenRefreshInProgress) {
						// Already refreshing — just ensure no further reconnects
						wsProvider.shouldConnect = false
						return
					}
					console.log('[CRDT] Token rejected (4401), requesting fresh token from shell')
					tokenRefreshInProgress = true
					// Pause reconnection while we fetch a new token
					wsProvider.shouldConnect = false
					bus.refreshToken()
						.then((newToken) => {
							tokenRefreshInProgress = false
							if (newToken) {
								console.log('[CRDT] Got fresh token, reconnecting')
								params.token = newToken
								wsProvider.shouldConnect = true
								wsProvider.connect()
							} else {
								console.log('[CRDT] Token refresh failed, stopping reconnection')
								bus.notifyError(event.code, event.reason || '')
								wsProvider.emit('connection-close', [event, wsProvider])
							}
						})
						.catch((err) => {
							tokenRefreshInProgress = false
							console.error('[CRDT] Token refresh threw unexpectedly:', err)
							bus.notifyError(event.code, String(err))
							wsProvider.emit('connection-close', [event, wsProvider])
						})
					return
				}
				// Check for auth/resource errors from backend:
				// 4403 = Access denied, 4404 = Not found
				if (event.code >= 4400 && event.code < 4500) {
					console.log(
						'[CRDT] Auth/resource error, stopping reconnection:',
						event.code,
						event.reason
					)
					wsProvider.shouldConnect = false
					wsProvider.disconnect()
					// Notify shell about the error (send raw code + reason, shell handles i18n)
					bus.notifyError(event.code, event.reason || '')
					// Emit connection-close event for React hooks to observe
					wsProvider.emit('connection-close', [event, wsProvider])
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
		} else if (status === 'disconnected' && !tokenRefreshInProgress) {
			// Refresh token from bus before y-websocket schedules reconnection.
			// Token renewal via shell push updates bus.accessToken, but the
			// params object captured at openYDoc() time still holds the old value.
			const currentToken = bus.accessToken
			if (currentToken) {
				params.token = currentToken
			} else {
				delete params.token
			}
		}
	})

	if (offlineCached) {
		// Offline with cache: start persisting immediately so local edits are saved
		persistence.startPersisting()
		// When we eventually sync (back online), re-compact to merge states
		wsProvider.once('sync', () => {
			persistence.recompact()
		})
	} else {
		// Normal online flow: start persisting after initial sync
		wsProvider.once('sync', () => {
			persistence.startPersisting()
		})
	}

	return {
		yDoc,
		provider: wsProvider,
		persistence,
		offlineCached
	}
}

// vim: ts=4
