// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Document Picker Message Handlers for Shell
 *
 * Handles document picker messages from apps using ACK + push pattern:
 * - doc:pick.req - App requests to open the document picker
 * - doc:pick.ack - Shell immediately acknowledges dialog is opening
 * - doc:pick.result - Shell pushes result when user completes/cancels
 */

import { createApiClient, type DocPickReq, FetchError } from '@cloudillo/core'

import type { ShellMessageBus } from '../shell-bus.js'
import { idTagFromResId } from './resId.js'

/**
 * Document picker options passed to the component
 */
export interface DocPickerOpenOptions {
	fileTp?: string
	contentType?: string
	sourceFileId?: string
	title?: string
	isExternalContext?: boolean
	idTag?: string // Document's context idTag (from app connection)
}

/**
 * Document picker result from the component
 */
export interface DocPickerResultData {
	fileId: string
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
export type DocPickerNotice = 'share-denied' | 'share-failed'
export type DocPickerNotifier = (notice: DocPickerNotice) => void

let docPickerNotifier: DocPickerNotifier | null = null

export function setDocPickerNotifier(notifier: DocPickerNotifier | null): void {
	docPickerNotifier = notifier
}

/**
 * Check if a document picker callback is registered
 */
export function hasDocPickerCallback(): boolean {
	return openDocPickerCallback !== null
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
				sourceFileId: msg.payload.sourceFileId,
				title: msg.payload.title,
				isExternalContext: true,
				idTag: contextIdTag // Document's context idTag from resId
			},
			async (result) => {
				if (result) {
					console.log('[Document] Document picker result:', result)

					// Create share entry if sourceFileId was provided.
					// The share must live on the document's context (community)
					// node — the same node the embed token exchange queries via
					// `?via=...` — otherwise the cross-document link is not found
					// and the embed is denied (403). Mint a context-scoped client
					// when the document belongs to a foreign context.
					if (msg.payload.sourceFileId) {
						try {
							let api = bus.getApi()
							if (contextIdTag && contextIdTag !== api?.idTag) {
								const tokenResult = await bus.getAccessToken(
									`${contextIdTag}:${result.fileId}`,
									'write'
								)
								if (tokenResult?.token) {
									api = createApiClient({
										idTag: contextIdTag,
										authToken: tokenResult.token
									})
								} else {
									console.warn(
										'[Document] No context token for',
										contextIdTag,
										'- skipping share creation'
									)
									api = null
								}
							}
							if (api) {
								await api.files.createShare(result.fileId, {
									subjectType: 'F',
									subjectId: msg.payload.sourceFileId,
									permission: 'R'
								})
							} else {
								docPickerNotifier?.('share-failed')
							}
						} catch (err) {
							// Share management needs ownership standing on the document's
							// node, so a plain member gets a 403 here. Unreported, the
							// embed looks like it worked and then fails to render for
							// everyone else.
							console.warn('[Document] Failed to create share entry:', err)
							const denied = err instanceof FetchError && err.httpStatus === 403
							docPickerNotifier?.(denied ? 'share-denied' : 'share-failed')
						}
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
}

// vim: ts=4
