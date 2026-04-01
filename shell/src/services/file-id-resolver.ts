// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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

import { PROTOCOL_VERSION } from '@cloudillo/core'
import { getAppTracker } from '../message-bus/app-tracker.js'

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

// Queue for FILE_ID_GENERATED messages that arrive before registration
// This handles the race condition where the WebSocket message arrives before
// the app has registered the temp ID
interface EarlyResolution {
	finalId: string
	queuedAt: number
}
const earlyResolutions = new Map<string, EarlyResolution>()

// Cleanup interval - remove stale entries after 10 minutes
const CLEANUP_INTERVAL = 10 * 60 * 1000
const MAX_PENDING_AGE = 10 * 60 * 1000
const MAX_EARLY_RESOLUTION_AGE = 30 * 1000 // 30 seconds for early resolutions

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
	// Check if resolution already arrived before registration (race condition fix)
	const earlyResolution = earlyResolutions.get(tempId)
	if (earlyResolution) {
		console.log(
			'[FileIdResolver] Found early resolution for temp ID:',
			tempId,
			'->',
			earlyResolution.finalId
		)
		earlyResolutions.delete(tempId)

		// Forward resolution immediately to the app
		try {
			const message = {
				cloudillo: true,
				v: PROTOCOL_VERSION,
				type: 'media:file.resolved',
				payload: {
					tempId,
					finalId: earlyResolution.finalId
				}
			}
			appWindow.postMessage(message, '*')
			console.log('[FileIdResolver] Sent early resolution to app window')
		} catch (err) {
			console.warn('[FileIdResolver] Failed to send early resolution to app window:', err)
		}
		return
	}

	// No early resolution, register for later
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
export function handleFileIdGenerated(tempId: string, finalId: string, rootId?: string): void {
	const pending = pendingTempIds.get(tempId)

	if (!pending || pending.length === 0) {
		// No registration - try rootId-based lookup to find the app window
		if (rootId) {
			const tracker = getAppTracker()
			const message = {
				cloudillo: true,
				v: PROTOCOL_VERSION,
				type: 'media:file.resolved',
				payload: { tempId, finalId }
			}

			let forwarded = false
			for (const win of tracker.getInitializedWindows()) {
				const conn = tracker.getApp(win)
				if (conn?.resId?.endsWith(':' + rootId)) {
					try {
						win.postMessage(message, '*')
						console.log(
							'[FileIdResolver] Forwarded resolution via rootId to app:',
							conn.appName
						)
						forwarded = true
					} catch (err) {
						console.warn('[FileIdResolver] Failed to forward via rootId:', err)
					}
				}
			}

			if (forwarded) {
				console.log(
					'[FileIdResolver] Resolving temp ID (via rootId):',
					tempId,
					'->',
					finalId
				)
				return
			}
		}

		// No registration and no rootId match - queue for later
		console.log('[FileIdResolver] Queuing early resolution for temp ID:', tempId)
		earlyResolutions.set(tempId, {
			finalId,
			queuedAt: Date.now()
		})
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
 * Cleanup stale pending entries and early resolutions
 * Called periodically to prevent memory leaks
 */
function cleanup(): void {
	const now = Date.now()
	let cleaned = 0

	// Clean up stale pending registrations
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

	// Clean up stale early resolutions (resolutions that were never claimed)
	for (const [tempId, resolution] of earlyResolutions.entries()) {
		if (now - resolution.queuedAt > MAX_EARLY_RESOLUTION_AGE) {
			earlyResolutions.delete(tempId)
			cleaned++
		}
	}

	if (cleaned > 0) {
		console.log('[FileIdResolver] Cleaned up', cleaned, 'stale entries')
	}
}

// Start cleanup interval
setInterval(cleanup, CLEANUP_INTERVAL)

// vim: ts=4
