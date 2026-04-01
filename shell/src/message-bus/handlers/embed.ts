// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Embed Message Handlers for Shell
 *
 * Handles embed:open.req messages from apps.
 * Obtains scoped tokens via cross-document token exchange and
 * returns embed URLs with nonces for token isolation.
 */

import type { ShellMessageBus } from '../shell-bus.js'
import { createApiClient, type EmbedOpenReq } from '@cloudillo/core'
import { getAccessSuffix } from '../app-tracker.js'

const MAX_EMBED_DEPTH = 3

/**
 * Resolve contentType to app name from the MIME mapping
 */
function resolveAppName(contentType: string): string | undefined {
	// Extract app name from cloudillo/* content types
	if (contentType.startsWith('cloudillo/')) {
		return contentType.slice('cloudillo/'.length)
	}
	return undefined
}

/**
 * Initialize embed message handlers on the shell bus
 */
export function initEmbedHandlers(bus: ShellMessageBus): void {
	bus.on('embed:open.req', async (msg: EmbedOpenReq, source) => {
		const appWindow = source as Window
		if (!appWindow) {
			console.error('[Embed] Open request with no source window')
			return
		}

		const connection = bus.getAppTracker().validateSource(source, true)
		if (!connection) {
			console.warn('[Embed] Open request from uninitialized/unknown app')
			bus.sendResponse(
				appWindow,
				'embed:open.res',
				msg.id,
				false,
				undefined,
				'App not initialized'
			)
			return
		}

		const {
			targetFileId,
			targetContentType,
			sourceFileId,
			access,
			navState,
			params,
			ancestors
		} = msg.payload
		const ancestorChain = ancestors || []
		const nextAncestorChain = [...ancestorChain, sourceFileId]
		const requestedAccess = access || 'read'

		// Depth check
		if (nextAncestorChain.length >= MAX_EMBED_DEPTH) {
			console.warn('[Embed] Depth limit exceeded:', ancestorChain.length)
			bus.sendResponse(
				appWindow,
				'embed:open.res',
				msg.id,
				false,
				undefined,
				'Embed depth limit exceeded'
			)
			return
		}

		// Cycle check
		if (ancestorChain.includes(targetFileId)) {
			console.warn('[Embed] Circular embed detected:', targetFileId, 'in', ancestorChain)
			bus.sendResponse(
				appWindow,
				'embed:open.res',
				msg.id,
				false,
				undefined,
				'Circular embed detected'
			)
			return
		}

		try {
			const api = bus.getApi()
			if (!api) {
				throw new Error('API client not available')
			}

			// For guest/anonymous access: use the stored embed token for sourceFileId
			// if available (handles nested embeds), otherwise fall back to the
			// connection's token (handles first-level embeds).
			let viaApi = api
			const embedToken = bus.getAppTracker().getEmbedToken(sourceFileId)
			if (embedToken) {
				viaApi = createApiClient({ idTag: api.idTag, authToken: embedToken })
			} else if (connection.token) {
				viaApi = createApiClient({ idTag: api.idTag, authToken: connection.token })
			}

			// Get scoped token via cross-document token exchange
			const tokenResult = await viaApi.auth.getAccessTokenVia(
				sourceFileId,
				`file:${targetFileId}:${getAccessSuffix(requestedAccess)}`
			)

			if (!tokenResult?.token) {
				throw new Error('Failed to obtain scoped token')
			}

			// Store the token so nested embeds within targetFileId can use it
			bus.getAppTracker().storeEmbedToken(targetFileId, tokenResult.token)

			// Generate nonce for pending registration
			const nonce = `embed-${Date.now()}-${Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('')}`

			// Resolve app name from content type
			const appName = resolveAppName(targetContentType)

			const idTag = api.idTag

			// Build embed URL (direct app URL, not shell route)
			const embedUrl = appName ? `/apps/${appName}/` : `/apps/view/`

			// Set pending registration so the embedded app can init
			// Key includes _embed: prefix to match the resId the app reads from hash
			// Include navState so it can be delivered to the embedded app
			bus.setPendingRegistration(`_embed:${nonce}`, {
				token: tokenResult.token,
				access: requestedAccess,
				idTag,
				displayName: connection?.displayName,
				navState,
				params,
				ancestors: nextAncestorChain
			})

			bus.sendResponse(appWindow, 'embed:open.res', msg.id, true, {
				embedUrl,
				nonce,
				resId: `${idTag}:${targetFileId}`
			})
		} catch (err) {
			console.error('[Embed] Failed to process embed request:', err)
			bus.sendResponse(
				appWindow,
				'embed:open.res',
				msg.id,
				false,
				undefined,
				(err as Error).message
			)
		}
	})
}

// vim: ts=4
