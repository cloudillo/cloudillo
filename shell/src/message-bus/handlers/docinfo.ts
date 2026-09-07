// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Document Info Message Handlers for Shell
 *
 * Serves the two DocBar needs a sandboxed app cannot meet itself:
 * - doc:info.req    - who owns this document and what is it called
 * - doc:rename.req  - rename it (target derived from the connection, not the message)
 *
 * An app holds exactly one scoped token for exactly one node, while a pinned or
 * placed foreign-owned document has a local row here AND an origin on the
 * owner's node. Deciding between them needs `getClientFor`, which only the shell
 * has — hence the resolver callback, registered by a React component the way
 * `share.ts` registers its dialog callback.
 *
 * Collaborator profiles are deliberately NOT served here: the shell can only
 * answer from this tenant's own mirror, which has never heard of a stranger
 * editing a foreign-hosted document. Apps call `GET /profiles/batch` on the
 * document's own node instead.
 */

import type { DocInfo, DocInfoReq, DocRenameReq } from '@cloudillo/core'

import type { ShellMessageBus } from '../shell-bus.js'

/**
 * Resolves document info and performs renames for a resId. Registered by
 * `MicrofrontendContainer` (via `useDocInfo`), which holds the context-aware API
 * clients and the row it already fetched.
 */
export interface DocInfoResolver {
	getInfo(resId: string): Promise<DocInfo | undefined>
	rename(
		resId: string,
		fileName: string
	): Promise<{ ok: boolean; fileName?: string; error?: string }>
}

// Callback set by the component owning the resolved document row
let docInfoResolver: DocInfoResolver | null = null

/** Register the document info resolver */
export function setDocInfoResolver(resolver: DocInfoResolver | null): void {
	docInfoResolver = resolver
}

/**
 * Unregister a resolver — but only if it is still the registered one.
 *
 * Routes render one container at a time, so an unconditional clear would be safe
 * today. It stops being safe the moment two overlap: the older one's unmount
 * would silently disable `doc:info` and `doc:rename` for the newer one.
 */
export function clearDocInfoResolver(resolver: DocInfoResolver): void {
	if (docInfoResolver === resolver) docInfoResolver = null
}

/**
 * Initialize document info handlers on the shell bus
 *
 * Embeds are deliberately NOT served. An embed connection's `resId` IS a real
 * document — `handlers/auth.ts` registers it on the attested `pending.resId` so
 * tokens mint — so what refuses them is an explicit decision, not the shape of the
 * resId: the dispatch gate in `shell-bus.ts` (`EMBED_ALLOWED_MESSAGES`, which also
 * carries the rationale), backed by the `connection.embed` guard in each handler
 * below. No `doc:info.push` is ever aimed at an embed iframe either. The DocBar
 * hides itself there (`parseAppHash` in `@cloudillo/core`), which is the other half
 * of the same decision.
 */
export function initDocInfoHandlers(bus: ShellMessageBus): void {
	bus.on('doc:info.req', async (msg: DocInfoReq, source) => {
		const appWindow = source as Window
		if (!appWindow) {
			console.error('[DocInfo] Info request with no source window')
			return
		}

		// The resId comes from the tracked connection, never from the message:
		// an app must not be able to ask about a document it was not launched for.
		const connection = bus.getAppTracker().validateSource(source, true)
		if (!connection?.resId) {
			bus.sendResponse(
				appWindow,
				'doc:info.res',
				msg.id,
				false,
				undefined,
				'App not initialized'
			)
			return
		}

		// Defence in depth behind the dispatch gate; see EMBED_ALLOWED_MESSAGES in shell-bus.ts.
		if (connection.embed) {
			console.warn('[DocInfo] Info request from an embed connection')
			bus.sendResponse(
				appWindow,
				'doc:info.res',
				msg.id,
				false,
				undefined,
				'Document not found'
			)
			return
		}

		if (!docInfoResolver) {
			bus.sendResponse(
				appWindow,
				'doc:info.res',
				msg.id,
				false,
				undefined,
				'Document info not available'
			)
			return
		}

		try {
			const info = await docInfoResolver.getInfo(connection.resId)
			if (info) bus.sendResponse(appWindow, 'doc:info.res', msg.id, true, info)
			else
				bus.sendResponse(
					appWindow,
					'doc:info.res',
					msg.id,
					false,
					undefined,
					'Document not found'
				)
		} catch (err) {
			console.error('[DocInfo] Info request failed:', err)
			bus.sendResponse(
				appWindow,
				'doc:info.res',
				msg.id,
				false,
				undefined,
				'Failed to resolve document info'
			)
		}
	})

	bus.on('doc:rename.req', async (msg: DocRenameReq, source) => {
		const appWindow = source as Window
		if (!appWindow) {
			console.error('[DocInfo] Rename request with no source window')
			return
		}

		// Relayed by an app on behalf of something embedded inside it. The
		// connection below is the HOST's, so acting on this would let a
		// foreign-owned embedded document rename the document containing it.
		// `setupEmbedRelay` already refuses to forward this type; this is the lock
		// that survives someone widening the relay's allowlist later.
		if (msg.relayed) {
			console.warn('[DocInfo] Rejecting a rename relayed from embedded content')
			bus.sendResponse(
				appWindow,
				'doc:rename.res',
				msg.id,
				false,
				undefined,
				'Rename is not available to embedded content'
			)
			return
		}

		const connection = bus.getAppTracker().validateSource(source, true)
		if (!connection?.resId) {
			bus.sendResponse(
				appWindow,
				'doc:rename.res',
				msg.id,
				false,
				undefined,
				'App not initialized'
			)
			return
		}

		// Defence in depth behind the dispatch gate; see EMBED_ALLOWED_MESSAGES in shell-bus.ts.
		if (connection.embed) {
			console.warn('[DocInfo] Rename request from an embed connection')
			bus.sendResponse(
				appWindow,
				'doc:rename.res',
				msg.id,
				false,
				undefined,
				'Rename is not available to embedded content'
			)
			return
		}

		if (!docInfoResolver) {
			bus.sendResponse(
				appWindow,
				'doc:rename.res',
				msg.id,
				false,
				undefined,
				'Rename not available'
			)
			return
		}

		const fileName = msg.payload.fileName.trim()
		if (!fileName) {
			bus.sendResponse(appWindow, 'doc:rename.res', msg.id, false, undefined, 'Empty name')
			return
		}

		try {
			const result = await docInfoResolver.rename(connection.resId, fileName)
			if (result.ok) {
				bus.sendResponse(appWindow, 'doc:rename.res', msg.id, true, {
					fileName: result.fileName ?? fileName
				})
			} else {
				bus.sendResponse(
					appWindow,
					'doc:rename.res',
					msg.id,
					false,
					undefined,
					result.error ?? 'Rename failed'
				)
			}
		} catch (err) {
			console.error('[DocInfo] Rename failed:', err)
			bus.sendResponse(appWindow, 'doc:rename.res', msg.id, false, undefined, 'Rename failed')
		}
	})
}

// vim: ts=4
