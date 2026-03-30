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
 * Share Link Creation Message Handlers for Shell
 *
 * Handles share link creation messages from apps using ACK + push pattern:
 * - share:create.req - App requests to create a share link
 * - share:create.ack - Shell immediately acknowledges dialog is opening
 * - share:create.result - Shell pushes result when user confirms/cancels
 */

import type { ShellMessageBus } from '../shell-bus.js'
import type { ShareCreateReq } from '@cloudillo/core'

/**
 * Share link creation options passed to the component
 */
export interface ShareCreateOpenOptions {
	resourceId: string
	accessLevel?: 'read' | 'write'
	description?: string
	expiresAt?: number
	count?: number
	params?: string
	reuse?: boolean
}

/**
 * Share link creation result from the component
 */
export interface ShareCreateResultData {
	refId: string
	url: string
}

/**
 * Callback type for opening the share creation dialog
 */
export type ShareCreateCallback = (
	options: ShareCreateOpenOptions,
	onResult: (result: ShareCreateResultData | null) => void
) => void

// Callback set by the ShareCreate component
let openShareCreateCallback: ShareCreateCallback | null = null

/**
 * Register the share creation callback
 * Called by the ShareCreate component when it mounts
 */
export function setShareCreateCallback(callback: ShareCreateCallback | null): void {
	openShareCreateCallback = callback
}

/**
 * Check if a share creation callback is registered
 */
export function hasShareCreateCallback(): boolean {
	return openShareCreateCallback !== null
}

/**
 * Initialize share message handlers on the shell bus
 */
export function initShareHandlers(bus: ShellMessageBus): void {
	bus.on('share:create.req', async (msg: ShareCreateReq, source) => {
		const appWindow = source as Window
		if (!appWindow) {
			console.error('[Share] Create request with no source window')
			return
		}

		const sessionId = msg.payload.sessionId

		const connection = bus.getAppTracker().validateSource(source, true)
		if (!connection) {
			console.warn('[Share] Create request from uninitialized/unknown app')
			bus.sendResponse(
				appWindow,
				'share:create.ack',
				msg.id,
				false,
				undefined,
				'App not initialized'
			)
			return
		}

		if (!openShareCreateCallback) {
			console.error('[Share] No share create callback registered')
			bus.sendResponse(
				appWindow,
				'share:create.ack',
				msg.id,
				false,
				undefined,
				'Share creation not available'
			)
			return
		}

		// Derive resourceId from connection's resId (format: "ownerTag:fileId")
		const fileId = connection.resId?.split(':').slice(1).join(':')
		if (!fileId) {
			console.error('[Share] Cannot determine resource ID from connection')
			bus.sendResponse(
				appWindow,
				'share:create.ack',
				msg.id,
				false,
				undefined,
				'Cannot determine resource ID'
			)
			return
		}

		console.log(
			'[Share] Opening share creation for app:',
			connection.appName,
			'sessionId:',
			sessionId
		)

		// Send ACK immediately
		bus.sendResponse(appWindow, 'share:create.ack', msg.id, true, { sessionId })

		// Open the dialog and wait for result
		openShareCreateCallback(
			{
				resourceId: fileId,
				accessLevel: msg.payload.accessLevel,
				description: msg.payload.description,
				expiresAt: msg.payload.expiresAt,
				count: msg.payload.count,
				params: msg.payload.params,
				reuse: msg.payload.reuse
			},
			(result) => {
				if (result) {
					console.log('[Share] Share link created:', result)
					bus.sendNotify(appWindow, 'share:create.result', {
						sessionId,
						created: true,
						refId: result.refId,
						url: result.url
					})
				} else {
					console.log('[Share] Share link creation cancelled')
					bus.sendNotify(appWindow, 'share:create.result', {
						sessionId,
						created: false
					})
				}
			}
		)
	})
}

// vim: ts=4
