// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Import Data Handler for Shell
 *
 * Manages pending file imports for the smart upload feature.
 * When the files app creates a CRDT document from an uploaded file
 * (e.g., xlsx → calcillo), this handler stores the source file data
 * and delivers it to the app after CRDT sync completes.
 */

import type { ImportCompleteNotify } from '@cloudillo/core'
import type { ShellMessageBus } from '../shell-bus.js'

// ============================================
// PENDING IMPORT STORAGE
// ============================================

export interface PendingImport {
	sourceMimeType: string
	fileName: string
	data: string // base64-encoded
}

// Pending imports keyed by resId (ownerTag:fileId)
const pendingImports = new Map<string, PendingImport>()

/**
 * Store import data for a newly created document.
 * Called by the smart upload hook when user chooses "Convert".
 */
export function setPendingImport(resId: string, importData: PendingImport): void {
	console.log('[Import] Setting pending import for:', resId)
	pendingImports.set(resId, importData)

	// Auto-cleanup after 5 minutes in case the app never opens
	setTimeout(
		() => {
			if (pendingImports.has(resId)) {
				console.log('[Import] Cleaning up stale pending import:', resId)
				pendingImports.delete(resId)
			}
		},
		5 * 60 * 1000
	)
}

/**
 * Check if there is pending import data for a resId
 */
export function hasPendingImport(resId: string): boolean {
	return pendingImports.has(resId)
}

/**
 * Retrieve and remove pending import data
 */
export function consumePendingImport(resId: string): PendingImport | undefined {
	const data = pendingImports.get(resId)
	if (data) {
		pendingImports.delete(resId)
	}
	return data
}

// ============================================
// MESSAGE HANDLERS
// ============================================

/**
 * Initialize import message handlers on the shell bus.
 *
 * Listens for app:ready.notify 'synced' stage and delivers
 * pending import data to the app.
 */
export function initImportHandlers(bus: ShellMessageBus): void {
	// Handle import complete notification from apps
	bus.on('import:complete.notify', (msg: ImportCompleteNotify) => {
		if (msg.payload.success) {
			console.log('[Import] App reports import complete')
		} else {
			console.error('[Import] App reports import failed:', msg.payload.error)
		}
	})
}

/**
 * Deliver pending import data to an app window after it syncs.
 * Called from the MicrofrontendContainer or lifecycle handler
 * when the app reaches the 'synced' stage.
 */
export function deliverPendingImport(
	bus: ShellMessageBus,
	appWindow: Window,
	resId: string
): boolean {
	const importData = consumePendingImport(resId)
	if (!importData) return false

	console.log('[Import] Delivering import data to app:', resId)
	bus.sendNotify(appWindow, 'import:data.push', {
		sourceMimeType: importData.sourceMimeType,
		fileName: importData.fileName,
		data: importData.data
	})
	return true
}

// vim: ts=4
