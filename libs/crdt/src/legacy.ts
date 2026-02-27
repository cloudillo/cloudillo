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

import { getCrdtUrl } from '@cloudillo/core'

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
	console.log(`[CRDT] Connecting to ${wsUrl}`, { resId, token: opts.authToken })

	const wsProvider = new WebsocketProvider(wsUrl, resId, yDoc, {
		params: { token: opts.authToken }
	})

	return { yDoc, provider: wsProvider }
}

// vim: ts=4
