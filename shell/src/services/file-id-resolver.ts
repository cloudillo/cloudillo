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
 * File ID Resolver Service
 *
 * Tracks pending temp file IDs (e.g., @123) from MediaPicker uploads and
 * resolves them to final IDs when FILE_ID_GENERATED WebSocket events arrive.
 *
 * Flow:
 * 1. MediaPicker uploads file, receives temp ID (e.g., @123)
 * 2. App stores temp ID in CRDT document
 * 3. Backend processes file, generates final ID (e.g., f1~abc123...)
 * 4. Backend broadcasts FILE_ID_GENERATED via WebSocket
 * 5. This service forwards resolution to the app that requested it
 */

import { getShellBus } from '../message-bus/shell-bus.js'
import { PROTOCOL_VERSION } from '@cloudillo/base'

/**
 * Information about a pending temp ID
 */
interface PendingTempId {
	/** The app window that requested this file */
	appWindow: Window
	/** When this was registered (for cleanup) */
	registeredAt: number
}

// Map of tempId -> PendingTempId info
const pendingTempIds = new Map<string, PendingTempId[]>()

// Cleanup interval - remove stale entries after 10 minutes
const CLEANUP_INTERVAL = 10 * 60 * 1000
const MAX_PENDING_AGE = 10 * 60 * 1000

/**
 * Register a pending temp ID for resolution
 *
 * Called by MediaPicker when a file is uploaded and returns a temp ID.
 * The appWindow is stored so we can forward the resolution when it arrives.
 *
 * @param tempId - The temporary file ID (e.g., @123)
 * @param appWindow - The app window that will receive the resolution
 */
export function registerPendingTempId(tempId: string, appWindow: Window): void {
	const pending = pendingTempIds.get(tempId) || []
	pending.push({
		appWindow,
		registeredAt: Date.now()
	})
	pendingTempIds.set(tempId, pending)
	console.log('[FileIdResolver] Registered pending temp ID:', tempId)
}

/**
 * Handle FILE_ID_GENERATED WebSocket event
 *
 * Called by WsBus when a FILE_ID_GENERATED message is received.
 * Forwards the resolution to all apps that are tracking this temp ID.
 *
 * @param tempId - The temporary file ID (e.g., @123)
 * @param finalId - The final content-addressed file ID (e.g., f1~abc123...)
 */
export function handleFileIdGenerated(tempId: string, finalId: string): void {
	const pending = pendingTempIds.get(tempId)

	if (!pending || pending.length === 0) {
		// No one is tracking this temp ID - that's fine, not all uploads are from apps
		console.log('[FileIdResolver] No pending registration for temp ID:', tempId)
		return
	}

	console.log('[FileIdResolver] Resolving temp ID:', tempId, '->', finalId)

	// Send resolution to all registered app windows
	for (const { appWindow } of pending) {
		try {
			const message = {
				cloudillo: true,
				v: PROTOCOL_VERSION,
				type: 'media:file.resolved',
				payload: {
					tempId,
					finalId
				}
			}
			appWindow.postMessage(message, '*')
			console.log('[FileIdResolver] Sent resolution to app window')
		} catch (err) {
			console.warn('[FileIdResolver] Failed to send resolution to app window:', err)
		}
	}

	// Remove the pending entry
	pendingTempIds.delete(tempId)
}

/**
 * Cleanup stale pending entries
 * Called periodically to prevent memory leaks
 */
function cleanup(): void {
	const now = Date.now()
	let cleaned = 0

	for (const [tempId, pending] of pendingTempIds.entries()) {
		// Filter out stale entries
		const fresh = pending.filter((p) => now - p.registeredAt < MAX_PENDING_AGE)

		if (fresh.length === 0) {
			pendingTempIds.delete(tempId)
			cleaned++
		} else if (fresh.length < pending.length) {
			pendingTempIds.set(tempId, fresh)
			cleaned += pending.length - fresh.length
		}
	}

	if (cleaned > 0) {
		console.log('[FileIdResolver] Cleaned up', cleaned, 'stale pending entries')
	}
}

// Start cleanup interval
setInterval(cleanup, CLEANUP_INTERVAL)

// vim: ts=4
