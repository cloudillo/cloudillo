// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Embed Message Handlers for Shell
 *
 * Handles embed:open.req messages from apps.
 * Obtains scoped tokens via cross-document token exchange and
 * returns embed URLs with nonces for token isolation.
 *
 * The pending registration this mints is consumed by the *relayed* branch of
 * `handlers/auth.ts`, which registers no connection — so nothing here needs the `embed`
 * marker `registerShellEmbed` (`shell/src/shell-embed.ts`) sets. If this path ever grows a
 * registering branch, `embed: true` belongs on the entry.
 */

import { appBundleUrl, createApiClient, type EmbedOpenReq } from '@cloudillo/core'

import { shellEmbedAppName } from '../../app-name.js'
import { getAccessSuffix } from '../app-tracker.js'
import type { ShellMessageBus } from '../shell-bus.js'
import { idTagFromResId } from './resId.js'

const MAX_EMBED_DEPTH = 3

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

		// Defence in depth behind the dispatch gate; see EMBED_ALLOWED_MESSAGES in shell-bus.ts.
		if (connection.embed) {
			console.warn('[Embed] Open request from an embed connection')
			bus.sendResponse(
				appWindow,
				'embed:open.res',
				msg.id,
				false,
				undefined,
				'Cannot embed from an embedded document'
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
			// The idTag too, not just the client: an empty one would build the bundle URL
			// as `https://cl-o./apps/<name>/index.html`.
			if (!api?.idTag) {
				throw new Error('API client not available')
			}

			// Derive the context idTag from the parent connection so embeds resolve
			// against the active (community) node, not the viewer's home node.
			const contextIdTag = idTagFromResId(connection.resId) || connection.idTag || api.idTag

			// For guest/anonymous access: use the stored embed token for sourceFileId
			// if available (handles nested embeds), otherwise fall back to the
			// connection's token (handles first-level embeds).
			let viaApi = api
			const embedToken = bus.getAppTracker().getEmbedToken(sourceFileId)
			if (embedToken) {
				viaApi = createApiClient({ idTag: contextIdTag, authToken: embedToken })
			} else if (connection.token) {
				viaApi = createApiClient({ idTag: contextIdTag, authToken: connection.token })
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

			const appName = shellEmbedAppName(targetContentType)

			const idTag = contextIdTag

			// A direct app URL, not a shell route. The bundle is a static asset of the
			// node serving the shell, so the home api's idTag — NOT `contextIdTag`,
			// which names the community/owner node the *document* lives on.
			const embedUrl = appBundleUrl(api.idTag, appName)

			// Set pending registration so the embedded app can init
			// Key includes _embed: prefix to match the resId the app reads from hash
			// Include navState so it can be delivered to the embedded app
			bus.setPendingRegistration(`_embed:${nonce}`, {
				token: tokenResult.token,
				access: requestedAccess,
				resId: `${idTag}:${targetFileId}`,
				idTag,
				// Validated against the bundle-name pattern above — never taken from the
				// embedding app unchecked, with unrecognised content types falling back to
				// the viewer. The same value `embedUrl` picks the bundle by, so handlers
				// reading `connection.appName` get an attested name.
				appName,
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
