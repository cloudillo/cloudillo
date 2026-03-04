// This file is part of the Cloudillo Platform.
// Copyright (C) 2024-2026  Szilárd Hajba
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
 * Document Picker Message Handlers for Shell
 *
 * Handles document picker messages from apps using ACK + push pattern:
 * - doc:pick.req - App requests to open the document picker
 * - doc:pick.ack - Shell immediately acknowledges dialog is opening
 * - doc:pick.result - Shell pushes result when user completes/cancels
 */

import type { ShellMessageBus } from '../shell-bus.js'
import type { DocPickReq } from '@cloudillo/core'

/**
 * Document picker options passed to the component
 */
export interface DocPickerOpenOptions {
	fileTp?: string
	contentType?: string
	sourceFileId?: string
	title?: string
	isExternalContext?: boolean
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

		// Open the modal and wait for result
		openDocPickerCallback(
			{
				fileTp: msg.payload.fileTp,
				contentType: msg.payload.contentType,
				sourceFileId: msg.payload.sourceFileId,
				title: msg.payload.title,
				isExternalContext: true
			},
			async (result) => {
				if (result) {
					console.log('[Document] Document picker result:', result)

					// Create share entry if sourceFileId was provided
					if (msg.payload.sourceFileId) {
						try {
							const api = bus.getApi()
							if (api) {
								await api.files.createShare(result.fileId, {
									subjectType: 'F',
									subjectId: msg.payload.sourceFileId,
									permission: 'R'
								})
							}
						} catch (err) {
							console.warn('[Document] Failed to create share entry:', err)
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
