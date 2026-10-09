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

import {
	appBundleUrl,
	createApiClient,
	EMBED_ERR_CYCLE,
	EMBED_ERR_DEPTH,
	type EmbedCloseNotify,
	type EmbedOpenReq
} from '@cloudillo/core'

import { shellEmbedAppName } from '../../app-name.js'
import { getAccessSuffix } from '../app-tracker.js'
import type { ShellMessageBus } from '../shell-bus.js'
import { fileIdFromResId, idTagFromResId } from './resId.js'

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

		// `ancestors` stays in the schema for compatibility but is not read: the chain comes
		// from the stored via-entry, which the requester cannot forge.
		const { targetFileId, targetContentType, sourceFileId, access, navState, params } =
			msg.payload
		// quillo sends `owner:fileId`, the other apps the bare fileId
		const srcFileId = fileIdFromResId(sourceFileId) || sourceFileId
		const tgtFileId = fileIdFromResId(targetFileId) || targetFileId
		// Bound to the requesting window: a top-level app embeds from its own document, a relayed
		// nested embed (embed-relay.ts) only from the document of the embed instance the relay
		// stamped (`relayedFrom`). A child can neither clear `relayed` nor forge `relayedFrom`,
		// so it never borrows the host's token or a sibling embed's.
		// A multi-hop request arrives with `relayed` but no `relayedFrom` (the relay drops
		// it on already-relayed messages) and is refused; MAX_EMBED_DEPTH = 3 forbids it anyway. A
		// deeper limit would need a stamped nonce path.
		const isOwnDoc = !msg.relayed && srcFileId === fileIdFromResId(connection.resId)
		const via =
			!isOwnDoc && msg.relayed && msg.relayedFrom
				? bus.getAppTracker().getEmbedToken(appWindow, msg.relayedFrom)
				: undefined
		if (!isOwnDoc && via?.fileId !== srcFileId) {
			console.warn('[Embed] Open request for a foreign source:', sourceFileId)
			bus.sendResponse(appWindow, 'embed:open.res', msg.id, false, undefined, 'Not allowed')
			return
		}
		const nextAncestorChain = [...(via ? via.ancestors : []), srcFileId]
		const sourceAccess = via ? via.access : connection.access
		const requestedAccess = sourceAccess === 'write' ? access || 'read' : 'read'

		// Depth check
		if (nextAncestorChain.length >= MAX_EMBED_DEPTH) {
			console.warn('[Embed] Depth limit exceeded:', nextAncestorChain.length)
			bus.sendResponse(appWindow, 'embed:open.res', msg.id, false, undefined, EMBED_ERR_DEPTH)
			return
		}

		// Cycle check
		if (nextAncestorChain.includes(tgtFileId)) {
			console.warn('[Embed] Circular embed detected:', tgtFileId, 'in', nextAncestorChain)
			bus.sendResponse(appWindow, 'embed:open.res', msg.id, false, undefined, EMBED_ERR_CYCLE)
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
			if (via) {
				viaApi = createApiClient({ idTag: contextIdTag, authToken: via.token })
			} else if (connection.token) {
				viaApi = createApiClient({ idTag: contextIdTag, authToken: connection.token })
			}

			// Get scoped token via cross-document token exchange
			const tokenResult = await viaApi.auth.getAccessTokenVia(
				srcFileId,
				`file:${tgtFileId}:${getAccessSuffix(requestedAccess)}`
			)

			if (!tokenResult?.token) {
				throw new Error('Failed to obtain scoped token')
			}

			// Generate nonce for pending registration
			const nonce = `embed-${Date.now()}-${Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('')}`

			// Store the token per instance so nested embeds within this one can use it
			bus.getAppTracker().storeEmbedToken(appWindow, `_embed:${nonce}`, {
				fileId: tgtFileId,
				token: tokenResult.token,
				access: tokenResult.accessLevel === 'write' ? 'write' : 'read',
				ancestors: nextAncestorChain
			})

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
				// What the backend granted, not what was asked: it downgrades silently.
				access: tokenResult.accessLevel === 'write' ? 'write' : 'read',
				resId: `${idTag}:${tgtFileId}`,
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
				resId: `${idTag}:${tgtFileId}`
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

	// A host tore down an embed (or relayed a nested host's teardown): its token goes too.
	// A grandchild's token was stored under the same host window, so one lookup covers both.
	bus.on('embed:close.notify', (msg: EmbedCloseNotify, source) => {
		if (source) bus.getAppTracker().removeEmbedToken(source as Window, msg.payload.key)
	})
}

// vim: ts=4
