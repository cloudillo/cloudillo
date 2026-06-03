// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getCrdtUrl } from '@cloudillo/core'
import { WebsocketProvider } from 'y-websocket'
import type * as Y from 'yjs'

export interface CrdtWebSocketOpts {
	idTag: string
	authToken: string
}

/**
 * Open a CRDT document for collaborative editing (legacy API)
 *
 * Establishes WebSocket connection to CRDT server and sets up
 * real-time synchronization for the document.
 *
 * @deprecated Use `openYDoc()` instead, which handles auth via the message bus automatically.
 *
 * @param yDoc - Yjs document (can be new or existing)
 * @param docId - Document ID in format "tenant:resource-id"
 * @param opts - Connection options
 * @returns Document and WebSocket provider
 */
export async function openCRDT(
	yDoc: Y.Doc,
	docId: string,
	opts: CrdtWebSocketOpts
): Promise<{ yDoc: Y.Doc; provider: WebsocketProvider }> {
	const [targetTag, resId] = docId.split(':')

	if (!opts.authToken) {
		throw new Error('No access token for CRDT connection')
	}

	// Connect to server
	const wsUrl = getCrdtUrl(targetTag)
	console.log(`[CRDT] Connecting to ${wsUrl}`, { resId })

	const wsProvider = new WebsocketProvider(wsUrl, resId, yDoc, {
		params: { token: opts.authToken }
	})

	return { yDoc, provider: wsProvider }
}

// vim: ts=4
