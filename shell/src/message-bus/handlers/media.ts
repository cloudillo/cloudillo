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
 * Media Picker Message Handlers for Shell
 *
 * Handles media picker messages from apps using ACK + push pattern:
 * - media:pick.req - App requests to open the media picker
 * - media:pick.ack - Shell immediately acknowledges dialog is opening (short timeout)
 * - media:pick.result - Shell pushes result when user completes/cancels (no timeout)
 *
 * This pattern allows users unlimited time to browse/upload media without
 * the request timing out.
 */

import type { ShellMessageBus } from '../shell-bus.js'
import type { MediaPickReq } from '@cloudillo/base'

/**
 * Media picker options passed to the component
 */
export interface MediaPickerOpenOptions {
	mediaType?: string
	documentVisibility?: 'P' | 'C' | 'F'
	documentFileId?: string
	enableCrop?: boolean
	cropAspects?: Array<'16:9' | '4:3' | '3:2' | '1:1' | 'circle' | 'free'>
	title?: string
}

/**
 * Media picker result from the component
 */
export interface MediaPickerResultData {
	fileId: string
	fileName: string
	contentType: string
	visibility?: 'P' | 'C' | 'F'
	visibilityAcknowledged?: boolean
	croppedVariantId?: string
}

/**
 * Callback type for opening the media picker
 * Called by the handler when an app requests the media picker
 */
export type MediaPickerCallback = (
	options: MediaPickerOpenOptions,
	onResult: (result: MediaPickerResultData | null) => void
) => void

// Callback set by the MediaPicker component
let openMediaPickerCallback: MediaPickerCallback | null = null

/**
 * Register the media picker callback
 * Called by the MediaPicker component when it mounts
 */
export function setMediaPickerCallback(callback: MediaPickerCallback | null): void {
	openMediaPickerCallback = callback
}

/**
 * Check if a media picker callback is registered
 */
export function hasMediaPickerCallback(): boolean {
	return openMediaPickerCallback !== null
}

/**
 * Initialize media message handlers on the shell bus
 */
export function initMediaHandlers(bus: ShellMessageBus): void {
	// Handle media pick request from apps using ACK + push pattern
	bus.on('media:pick.req', async (msg: MediaPickReq, source) => {
		const appWindow = source as Window
		if (!appWindow) {
			console.error('[Media] Pick request with no source window')
			return
		}

		const sessionId = msg.payload.sessionId

		const connection = bus.getAppTracker().validateSource(source, true)
		if (!connection) {
			console.warn('[Media] Pick request from uninitialized/unknown app')
			// Send error ACK (not result - ACK handles errors during dialog opening)
			bus.sendResponse(
				appWindow,
				'media:pick.ack',
				msg.id,
				false,
				undefined,
				'App not initialized'
			)
			return
		}

		if (!openMediaPickerCallback) {
			console.error('[Media] No media picker callback registered')
			// Send error ACK
			bus.sendResponse(
				appWindow,
				'media:pick.ack',
				msg.id,
				false,
				undefined,
				'Media picker not available'
			)
			return
		}

		console.log(
			'[Media] Opening media picker for app:',
			connection.appName,
			'sessionId:',
			sessionId
		)

		// Send ACK immediately - dialog is opening
		// This allows the app to know the dialog is opening without timing out
		bus.sendResponse(appWindow, 'media:pick.ack', msg.id, true, { sessionId })

		// Open the modal and wait for result
		// When result arrives, send push notification (no timeout on user interaction)
		openMediaPickerCallback(
			{
				mediaType: msg.payload.mediaType,
				documentVisibility: msg.payload.documentVisibility,
				documentFileId: msg.payload.documentFileId,
				enableCrop: msg.payload.enableCrop,
				cropAspects: msg.payload.cropAspects,
				title: msg.payload.title
			},
			(result) => {
				if (result) {
					console.log('[Media] Media picker result:', result)
					// Send result as push notification (not response)
					bus.sendNotify(appWindow, 'media:pick.result', {
						sessionId,
						selected: true,
						fileId: result.fileId,
						fileName: result.fileName,
						contentType: result.contentType,
						visibility: result.visibility,
						visibilityAcknowledged: result.visibilityAcknowledged,
						croppedVariantId: result.croppedVariantId
					})
				} else {
					console.log('[Media] Media picker cancelled')
					// Send cancelled result as push notification
					bus.sendNotify(appWindow, 'media:pick.result', {
						sessionId,
						selected: false
					})
				}
			}
		)
	})
}

// vim: ts=4
