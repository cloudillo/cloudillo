// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Feed Post Message Handlers for Shell
 *
 * `feed:post.req` — an editor asks for the document it is showing to be shared
 * as a live-document feed post. Plain request/response, not the ACK + push shape
 * `share:create` uses: fulfilling this navigates the shell to the feed, which
 * unmounts the requesting iframe, so there would be nobody left for a push.
 *
 * The document comes from the connection's resId, never from the payload — the
 * message deliberately carries no fileId, the same rule `doc:rename.req` states.
 */

import type { FeedPostReq } from '@cloudillo/core'

import type { ShellMessageBus } from '../shell-bus.js'
import { fileIdFromResId, idTagFromResId } from './resId.js'

/** What the composer needs to open on a document. */
export interface FeedPostRequest {
	/** The node that SERVES the document — the `<idTag>` half of the connection's
	 *  resId, never an owner profile. */
	srcIdTag: string
	fileId: string
}

/**
 * Callback type for handing a document to the feed composer
 *
 * Rejects if the document cannot be resolved; the connection knows no
 * contentType, so the host fetches the file row itself.
 */
export type FeedPostCallback = (request: FeedPostRequest) => Promise<void>

// Callback set by the FeedPostHost component
let feedPostCallback: FeedPostCallback | null = null

/**
 * Register the feed post callback
 * Called by the FeedPostHost component when it mounts
 */
export function setFeedPostCallback(callback: FeedPostCallback | null): void {
	feedPostCallback = callback
}

/**
 * Unregister a callback — but only if it is still the registered one.
 *
 * `FeedPostHost` is mounted once by `layout.tsx`, so an unconditional clear is safe
 * today. It stops being safe the moment two overlap: the older one's unmount would
 * silently disable "Share to feed" for the newer one.
 */
export function clearFeedPostCallback(callback: FeedPostCallback): void {
	if (feedPostCallback === callback) feedPostCallback = null
}

/**
 * Initialize feed message handlers on the shell bus
 */
export function initFeedHandlers(bus: ShellMessageBus): void {
	bus.on('feed:post.req', async (msg: FeedPostReq, source) => {
		const appWindow = source as Window
		if (!appWindow) {
			console.error('[Feed] Post request with no source window')
			return
		}

		const fail = (error: string) => {
			bus.sendResponse(appWindow, 'feed:post.res', msg.id, false, undefined, error)
		}

		const connection = bus.getAppTracker().validateSource(source, true)
		if (!connection) {
			console.warn('[Feed] Post request from uninitialized/unknown app')
			fail('App not initialized')
			return
		}

		// Defence in depth behind the dispatch gate; see EMBED_ALLOWED_MESSAGES in shell-bus.ts.
		// An embed must additionally not navigate the shell out from under the reader — the
		// same rule `handlers/lifecycle.ts` applies to a pending import.
		if (connection.embed) {
			console.warn('[Feed] Post request from an embed connection')
			fail('Cannot share from an embedded document')
			return
		}

		if (!feedPostCallback) {
			console.error('[Feed] No feed post callback registered')
			fail('Sharing to the feed is not available')
			return
		}

		// resId is "<serving idTag>:fileId" — composed by the shell from the route, so
		// it is the only trustworthy id in this exchange. An embed's `_embed:<nonce>`
		// handshake key never reaches here: `handlers/auth.ts` registers the connection
		// on `pending.resId`, and the guard above rejects embeds outright anyway.
		const srcIdTag = idTagFromResId(connection.resId)
		const fileId = fileIdFromResId(connection.resId)
		if (!srcIdTag || !fileId) {
			console.error('[Feed] Cannot determine resource ID from connection')
			fail('Cannot determine resource ID')
			return
		}

		try {
			await feedPostCallback({ srcIdTag, fileId })
			bus.sendResponse(appWindow, 'feed:post.res', msg.id, true, undefined)
		} catch (err) {
			// A document with no local row is refused, not broken — the expected
			// federated case, so this is a warning.
			console.warn('[Feed] Cannot share this document', err)
			fail(err instanceof Error ? err.message : 'Cannot share this document')
		}
	})
}

// vim: ts=4
