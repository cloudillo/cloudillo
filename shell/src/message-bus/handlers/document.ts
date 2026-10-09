// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Document Picker Message Handlers for Shell
 *
 * Handles document picker messages from apps using ACK + push pattern:
 * - doc:pick.req - App requests to open the document picker
 * - doc:pick.ack - Shell immediately acknowledges dialog is opening
 * - doc:pick.result - Shell pushes result when user completes/cancels
 *
 * and doc:link.req / doc:link.res — a pasted `cl:` ref turned into an embed target.
 */

import {
	createApiClient,
	type DocGrantReq,
	type DocLinkReq,
	type DocLinkRes,
	type DocOpenPush,
	type DocPickReq,
	FetchError,
	parseDocRef
} from '@cloudillo/core'

import { resolveAppId } from '../../app-name.js'
import { appConfig, isEmbeddable } from '../../manifest-registry.js'
import { resolveRef } from '../../refs.js'
import type { AppConnection } from '../app-tracker.js'
import type { ShellMessageBus } from '../shell-bus.js'
import { fileIdFromResId, idTagFromResId } from './resId.js'

/**
 * Document picker options passed to the component
 */
export interface DocPickerOpenOptions {
	fileTp?: string
	contentType?: string
	sourceFileId?: string
	requirePublic?: boolean // Site source: only Public documents may be embedded
	embeddableOnly?: boolean // Offer only documents an app can show as a view embed
	title?: string
	isExternalContext?: boolean
	idTag?: string // Document's context idTag (from app connection)
}

/**
 * Document picker result from the component
 */
export interface DocPickerResultData {
	fileId: string
	entryId?: string
	fileName: string
	contentType: string
	fileTp?: string
	appId?: string
}

/**
 * Callback type for opening the document picker
 */
export type DocPickerCallback = (
	options: DocPickerOpenOptions,
	onResult: (result: DocPickerResultData | null) => void
) => void

// Callback set by the DocumentPicker component
let openDocPickerCallback: DocPickerCallback | null = null

/**
 * Register the document picker callback
 */
export function setDocPickerCallback(callback: DocPickerCallback | null): void {
	openDocPickerCallback = callback
}

/**
 * Reports a failure that happens *after* the picker has closed, so it can
 * still reach the user. Registered by `DocumentPicker`, which has the React
 * context a toast needs.
 */
export type DocPickerNotice =
	| 'share-denied'
	| 'share-failed'
	| 'link-foreign'
	| 'link-failed'
	| 'link-not-embeddable'
	| 'link-read-only'
export type DocPickerNotifier = (notice: DocPickerNotice) => void

let docPickerNotifier: DocPickerNotifier | null = null

export function setDocPickerNotifier(notifier: DocPickerNotifier | null): void {
	docPickerNotifier = notifier
}

/**
 * Asks the user to confirm embedding a non-public document (the paste-path disclosure).
 * Registered by `DocumentPicker`, which has the React context a Dialog needs.
 */
export type DocLinkConfirm = (fileName: string) => Promise<boolean>

let docLinkConfirm: DocLinkConfirm | null = null

export function setDocLinkConfirm(confirm: DocLinkConfirm | null): void {
	docLinkConfirm = confirm
}

/**
 * Asks the user to confirm making an embedded document editable from its host (doc:grant.req).
 * Registered by `DocumentPicker`.
 */
export type DocGrantConfirm = (fileName: string, hostName: string) => Promise<boolean>

let docGrantConfirm: DocGrantConfirm | null = null

export function setDocGrantConfirm(confirm: DocGrantConfirm | null): void {
	docGrantConfirm = confirm
}

/**
 * Navigates the shell to a route path (an embed's "Open source", via doc:open.push).
 * Registered by `DocumentPicker`, which lives inside the router.
 */
export type DocOpenCallback = (path: string) => void

let docOpenCallback: DocOpenCallback | null = null

export function setDocOpenCallback(cb: DocOpenCallback | null): void {
	docOpenCallback = cb
}

/**
 * An API client for the document's context node: the share must live there — the same
 * node the embed token exchange queries via `?via=...` — otherwise the cross-document
 * link is not found and the embed is denied (403). `null` when no context token is had.
 */
async function getContextApi(
	bus: ShellMessageBus,
	contextIdTag: string | undefined,
	fileId: string
) {
	const api = bus.getApi()
	if (!contextIdTag || contextIdTag === api?.idTag) return api
	const tokenResult = await bus.getAccessToken(`${contextIdTag}:${fileId}`, 'write')
	if (tokenResult?.token) {
		return createApiClient({ idTag: contextIdTag, authToken: tokenResult.token })
	}
	console.warn('[Document] No context token for', contextIdTag)
	return null
}

/**
 * Grant `sourceFileId` read or write access to the embedded `target` (a file-link share),
 * reporting failures through the picker notifier. Shared by doc:pick, doc:link and doc:grant.
 *
 * @returns true when the share is in place
 */
export async function ensureFileLinkShare(
	bus: ShellMessageBus,
	contextIdTag: string | undefined,
	target: { fileId: string; entryId?: string },
	sourceFileId: string,
	permission: 'R' | 'W' = 'R',
	exact = false,
	createIfMissing = true
): Promise<boolean> {
	try {
		const api = await getContextApi(bus, contextIdTag, target.fileId)
		if (!api) {
			docPickerNotifier?.('share-failed')
			return false
		}
		const entryId = target.entryId ?? target.fileId
		// Upsert per (file, subject): the picker/link paths ask for 'R' only on a fresh share
		// (re-linking must not drop an editable embed's 'W'); doc:grant sets it either way.
		const shares = await api.files.listShares(entryId)
		const share = shares.find((s) => s.subjectType === 'F' && s.subjectId === sourceFileId)
		if (share) {
			if (!exact && permission === 'R') return true
			if (share.permission[0] === permission) return true
			await api.files.updateShare(entryId, share.id, { permission })
			return true
		}
		// Nothing to downgrade; creating a share is doc:link's job, behind its disclosure
		if (!createIfMissing) return true
		await api.files.createShare(entryId, {
			subjectType: 'F',
			subjectId: sourceFileId,
			permission
		})
		return true
	} catch (err) {
		// Share management needs ownership standing on the document's node, so a plain
		// member gets a 403 here. Unreported, the embed looks like it worked and then
		// fails to render for everyone else.
		console.warn('[Document] Failed to create share entry:', err)
		const denied = err instanceof FetchError && err.httpStatus === 403
		docPickerNotifier?.(denied ? 'share-denied' : 'share-failed')
		return false
	}
}

/**
 * `sourceFileId` may be shared from: the connection's own document (write), or, relayed,
 * the stamped embed's own document when it holds write
 */
function canShareFrom(
	bus: ShellMessageBus,
	win: Window,
	connection: AppConnection,
	msg: { relayed?: boolean; relayedFrom?: string },
	sourceFileId: string
): boolean {
	const src = fileIdFromResId(sourceFileId) || sourceFileId
	if (!msg.relayed) {
		return src === fileIdFromResId(connection.resId) && connection.access === 'write'
	}
	const via = msg.relayedFrom
		? bus.getAppTracker().getEmbedToken(win, msg.relayedFrom)
		: undefined
	return via?.fileId === src && via.access === 'write'
}

/**
 * Initialize document message handlers on the shell bus
 */
export function initDocumentHandlers(bus: ShellMessageBus): void {
	bus.on('doc:pick.req', async (msg: DocPickReq, source) => {
		const appWindow = source as Window
		if (!appWindow) {
			console.error('[Document] Pick request with no source window')
			return
		}

		const sessionId = msg.payload.sessionId

		const connection = bus.getAppTracker().validateSource(source, true)
		if (!connection) {
			console.warn('[Document] Pick request from uninitialized/unknown app')
			bus.sendResponse(
				appWindow,
				'doc:pick.ack',
				msg.id,
				false,
				undefined,
				'App not initialized'
			)
			return
		}

		// Defence in depth behind the dispatch gate; see EMBED_ALLOWED_MESSAGES in shell-bus.ts.
		if (connection.embed) {
			console.warn('[Document] Pick request from an embed connection')
			bus.sendResponse(
				appWindow,
				'doc:pick.ack',
				msg.id,
				false,
				undefined,
				'Cannot pick a document from an embedded document'
			)
			return
		}

		if (!openDocPickerCallback) {
			console.error('[Document] No document picker callback registered')
			bus.sendResponse(
				appWindow,
				'doc:pick.ack',
				msg.id,
				false,
				undefined,
				'Document picker not available'
			)
			return
		}

		const pickSource = msg.payload.sourceFileId
		if (pickSource && !canShareFrom(bus, appWindow, connection, msg, pickSource)) {
			console.warn('[Document] Pick request shares from a foreign source:', pickSource)
			bus.sendResponse(appWindow, 'doc:pick.ack', msg.id, false, undefined, 'Not allowed')
			return
		}
		const sourceFileId = pickSource ? fileIdFromResId(pickSource) || pickSource : undefined

		console.log(
			'[Document] Opening document picker for app:',
			connection.appName,
			'sessionId:',
			sessionId
		)

		// Send ACK immediately
		bus.sendResponse(appWindow, 'doc:pick.ack', msg.id, true, { sessionId })

		// Extract context idTag from resId (format: "contextIdTag:fileId")
		const contextIdTag = idTagFromResId(connection.resId) || connection.idTag

		// Open the modal and wait for result
		openDocPickerCallback(
			{
				fileTp: msg.payload.fileTp,
				contentType: msg.payload.contentType,
				sourceFileId,
				requirePublic: msg.payload.requirePublic,
				// This request only ever serves app embedding
				embeddableOnly: true,
				title: msg.payload.title,
				isExternalContext: true,
				idTag: contextIdTag // Document's context idTag from resId
			},
			async (result) => {
				if (result) {
					console.log('[Document] Document picker result:', result)

					if (sourceFileId) {
						await ensureFileLinkShare(bus, contextIdTag, result, sourceFileId)
					}

					bus.sendNotify(appWindow, 'doc:pick.result', {
						sessionId,
						selected: true,
						fileId: result.fileId,
						fileName: result.fileName,
						contentType: result.contentType,
						fileTp: result.fileTp,
						appId: result.appId
					})
				} else {
					console.log('[Document] Document picker cancelled')
					bus.sendNotify(appWindow, 'doc:pick.result', {
						sessionId,
						selected: false
					})
				}
			}
		)
	})

	bus.on('doc:link.req', async (msg: DocLinkReq, source) => {
		const appWindow = source as Window
		if (!appWindow) return
		const reply = (ok: boolean, data?: DocLinkRes['data'], error?: string) =>
			bus.sendResponse(appWindow, 'doc:link.res', msg.id, ok, data, error)

		const connection = bus.getAppTracker().validateSource(source, true)
		if (!connection) return reply(false, undefined, 'App not initialized')
		// Not in EMBED_ALLOWED_MESSAGES either: an embed may not create shares.
		if (connection.embed) {
			return reply(false, undefined, 'Cannot link a document from an embedded document')
		}

		const sourceFileId = fileIdFromResId(msg.payload.sourceFileId) || msg.payload.sourceFileId
		if (sourceFileId !== fileIdFromResId(connection.resId)) {
			return reply(false, undefined, 'Not allowed')
		}
		if (connection.access !== 'write') {
			docPickerNotifier?.('link-read-only')
			return reply(false, undefined, 'Not allowed')
		}

		const parsed = parseDocRef(msg.payload.ref)
		if (!parsed) return reply(false, undefined, 'Not a document link')
		const contextIdTag = idTagFromResId(connection.resId) || connection.idTag
		// Like the picker (`localOnly`), only documents held by this context's node can be
		// embedded: that is where the share must live.
		const fileId = fileIdFromResId(parsed.resId)
		if (!fileId || idTagFromResId(parsed.resId) !== contextIdTag) {
			docPickerNotifier?.('link-foreign')
			return reply(false, undefined, 'Only documents from this context can be embedded')
		}

		try {
			const api = await getContextApi(bus, contextIdTag, fileId)
			if (!api) {
				docPickerNotifier?.('link-failed')
				return reply(false, undefined, 'No access to the document context')
			}
			const meta = await api.files.getMetadata(fileId)
			if (!isEmbeddable(meta.contentType)) {
				docPickerNotifier?.('link-not-embeddable')
				return reply(false, undefined, 'Not embeddable')
			}
			// The pasted ref is untrusted: the app comes from the file's own content type
			const appId =
				resolveAppId(meta.contentType, appConfig.mime) ??
				(appConfig.apps.some((app) => app.id === parsed.appId) ? parsed.appId : undefined)
			if (!appId) {
				docPickerNotifier?.('link-failed')
				return reply(false, undefined, 'No app for this document')
			}

			if (!docLinkConfirm) return reply(false, undefined, 'Disclosure not available')
			if (!(await docLinkConfirm(meta.fileName))) return reply(true)

			if (
				!(await ensureFileLinkShare(
					bus,
					contextIdTag,
					{ fileId, entryId: meta.entryId },
					sourceFileId
				))
			) {
				return reply(false, undefined, 'Share failed')
			}
			reply(true, {
				fileId,
				contentType: meta.contentType,
				appId,
				fileName: meta.fileName,
				nav: parsed.nav && parsed.nav.length <= 1024 ? parsed.nav : undefined
			})
		} catch (err) {
			console.warn('[Document] Link request failed:', err)
			docPickerNotifier?.('link-failed')
			reply(false, undefined, 'Document not found')
		}
	})

	bus.on('doc:grant.req', async (msg: DocGrantReq, source) => {
		const appWindow = source as Window
		if (!appWindow) return
		const reply = (ok: boolean, error?: string) =>
			bus.sendResponse(appWindow, 'doc:grant.res', msg.id, ok, undefined, error)

		const connection = bus.getAppTracker().validateSource(source, true)
		if (!connection) return reply(false, 'App not initialized')
		// Not in EMBED_ALLOWED_MESSAGES either: an embed may not grant access to its host.
		if (connection.embed) return reply(false, 'Cannot grant from an embedded document')
		// Not in RELAY_UP_TYPES: a relayed grant can only be forged
		if (msg.relayed) return reply(false, 'Not allowed')
		const { targetFileId, access } = msg.payload
		if (!canShareFrom(bus, appWindow, connection, msg, msg.payload.sourceFileId)) {
			return reply(false, 'Not allowed')
		}
		// quillo sends `owner:fileId`, the other apps the bare fileId
		const sourceFileId = fileIdFromResId(msg.payload.sourceFileId) || msg.payload.sourceFileId

		const contextIdTag = idTagFromResId(connection.resId) || connection.idTag
		// Like doc:link, the target must be this context's own document (targetFileId may
		// come as a bare id or as a resId)
		const targetCtx = idTagFromResId(targetFileId)
		if (targetCtx && targetCtx !== contextIdTag) return reply(false, 'Not allowed')
		const fileId = fileIdFromResId(targetFileId) || targetFileId
		// Only a document this connection has embedded this session into the source document
		// (its token is stored by embed:open.req)
		if (!bus.getAppTracker().hasEmbed(appWindow, fileId, sourceFileId)) {
			return reply(false, 'Not embedded')
		}
		try {
			const api = await getContextApi(bus, contextIdTag, fileId)
			if (!api) {
				docPickerNotifier?.('share-failed')
				return reply(false, 'No access to the document context')
			}
			const meta = await api.files.getMetadata(fileId)
			if (access === 'write') {
				if (!docGrantConfirm) return reply(false, 'Confirmation not available')
				const host = await api.files.getMetadata(sourceFileId)
				if (!(await docGrantConfirm(meta.fileName, host.fileName))) {
					return reply(false, 'Declined')
				}
			}
			const ok = await ensureFileLinkShare(
				bus,
				contextIdTag,
				{ fileId, entryId: meta.entryId },
				sourceFileId,
				access === 'write' ? 'W' : 'R',
				true,
				access === 'write'
			)
			reply(ok)
		} catch (err) {
			console.warn('[Document] Grant request failed:', err)
			docPickerNotifier?.('share-failed')
			reply(false, 'Document not found')
		}
	})

	bus.on('doc:open.push', (msg: DocOpenPush, source) => {
		const appWindow = source as Window
		const connection = bus.getAppTracker().validateSource(source, true)
		// Not relayed for embeds either: an embedded document may not navigate the shell.
		if (!connection || connection.embed) return
		// Only right after a user gesture in this app: an app may not navigate the shell on its own
		if (!navigator.userActivation?.isActive) return
		const active = document.activeElement
		if (!(active instanceof HTMLIFrameElement) || active.contentWindow !== appWindow) return
		const { ref } = msg.payload
		const parsed = parseDocRef(ref)
		if (!parsed || !appConfig.apps.some((app) => app.id === parsed.appId)) return
		// Only a document this app has embedded: the push exists to open an embed's source
		const fileId = fileIdFromResId(parsed.resId)
		if (!fileId || !bus.getAppTracker().hasEmbed(appWindow, fileId)) return
		const path = resolveRef(ref)
		if (path) docOpenCallback?.(path)
	})
}

// vim: ts=4
