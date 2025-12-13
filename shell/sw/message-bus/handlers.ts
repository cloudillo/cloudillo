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
 * Service Worker Message Handlers
 *
 * Handlers for shell→sw messages. These integrate with the existing
 * encryption and storage functions defined in the main SW file.
 */

import {
	PROTOCOL_VERSION,
	validateSwMessage,
	type SwMessageFromShell,
	type SwTokenSet,
	type SwTokenClear,
	type SwApiKeySet,
	type SwApiKeyGetReq,
	type SwApiKeyDel
} from './types.js'

// ============================================
// TYPES
// ============================================

/**
 * Storage functions provided by main SW file
 */
export interface SwStorageFunctions {
	setSecureItem: (key: string, value: string) => Promise<void>
	getSecureItem: (key: string) => Promise<string | null>
	deleteSecureItem: (key: string) => Promise<void>
}

/**
 * Handler for a specific message type
 *
 * Note: The source parameter uses a generic type because this file is
 * type-checked by the shell's tsconfig which doesn't include webworker lib.
 * The actual types are WindowClient, Client, ServiceWorker, or MessagePort.
 */
export type SwMessageHandler<T extends SwMessageFromShell> = (
	msg: T,
	source: MessageEventSource | null,
	storage: SwStorageFunctions
) => void | Promise<void>

// ============================================
// HANDLER REGISTRY
// ============================================

const handlers = new Map<SwMessageFromShell['type'], SwMessageHandler<any>>()

/**
 * Register a handler for a message type
 */
export function onSwMessage<T extends SwMessageFromShell>(
	type: T['type'],
	handler: SwMessageHandler<T>
): void {
	handlers.set(type, handler)
}

// ============================================
// HANDLERS
// ============================================

// Token handlers
onSwMessage<SwTokenSet>('sw:token.set', async (msg, _source, storage) => {
	console.log('[SW Bus] Setting auth token')
	await storage.setSecureItem('authToken', msg.payload.token)
})

onSwMessage<SwTokenClear>('sw:token.clear', async (_msg, _source, storage) => {
	console.log('[SW Bus] Clearing auth token')
	await storage.deleteSecureItem('authToken')
})

// API key handlers
onSwMessage<SwApiKeySet>('sw:apikey.set', async (msg, _source, storage) => {
	console.log('[SW Bus] Storing API key')
	await storage.setSecureItem('apiKey', msg.payload.apiKey)
})

onSwMessage<SwApiKeyGetReq>('sw:apikey.get.req', async (msg, source, storage) => {
	console.log('[SW Bus] Retrieving API key')
	const apiKey = await storage.getSecureItem('apiKey')

	// Send response back to shell
	if (source && 'postMessage' in source) {
		source.postMessage({
			cloudillo: true,
			v: PROTOCOL_VERSION,
			type: 'sw:apikey.get.res',
			replyTo: msg.id,
			ok: true,
			data: { apiKey: apiKey || undefined }
		})
	}
})

onSwMessage<SwApiKeyDel>('sw:apikey.del', async (_msg, _source, storage) => {
	console.log('[SW Bus] Deleting API key')
	await storage.deleteSecureItem('apiKey')
})

// ============================================
// MAIN HANDLER
// ============================================

/**
 * Main message handler for the service worker
 *
 * Call this from the SW's message event listener.
 *
 * @param evt - MessageEvent from the SW
 * @param storage - Storage functions from main SW file
 * @param onToken - Callback when auth token is set (for in-memory caching)
 * @returns true if message was handled, false otherwise
 */
export async function handleSwMessage(
	evt: MessageEvent,
	storage: SwStorageFunctions,
	onToken?: (token: string | undefined) => void
): Promise<boolean> {
	// Validate message (returns undefined for non-SW or invalid messages)
	const message = validateSwMessage(evt.data)
	if (!message) return false

	console.log('[SW Bus] Received:', message.type)

	// Special handling for token to update in-memory cache
	if (message.type === 'sw:token.set') {
		onToken?.(message.payload.token)
	} else if (message.type === 'sw:token.clear') {
		onToken?.(undefined)
	}

	// Find and execute handler
	const handler = handlers.get(message.type)
	if (!handler) {
		console.log('[SW Bus] No handler for:', message.type)
		return false
	}

	try {
		await handler(message, evt.source, storage)
		return true
	} catch (err) {
		console.error('[SW Bus] Handler error:', err)
		return false
	}
}

/**
 * Send a response message to the shell
 */
export function sendToShell(
	client: MessageEventSource | null,
	message: Record<string, unknown>
): void {
	if (client && 'postMessage' in client) {
		console.log('[SW Bus] Sending:', message.type)
		// Cast to any to work around type mismatch between lib.dom and lib.webworker
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		;(client as any).postMessage(message)
	}
}

// vim: ts=4
