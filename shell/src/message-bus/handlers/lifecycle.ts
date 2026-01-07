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
 * App Lifecycle Message Handlers for Shell
 *
 * Handles app lifecycle messages:
 * - app:ready.notify - App notifies it has reached a loading stage
 */

import type { ShellMessageBus } from '../shell-bus.js'
import type { AppReadyNotify } from '@cloudillo/base'

/**
 * Callback for app ready notifications
 */
export type AppReadyCallback = (appWindow: Window, stage: 'auth' | 'synced' | 'ready') => void

// Registry of ready callbacks per window
// Using WeakMap to allow garbage collection when iframe windows are destroyed
const readyCallbacks = new WeakMap<Window, AppReadyCallback>()

// Store pending notifications that arrived before subscription
// Using WeakMap to allow garbage collection when iframe windows are destroyed
const pendingNotifications = new WeakMap<Window, 'auth' | 'synced' | 'ready'>()

/**
 * Register a callback for when an app sends a ready notification
 *
 * If a notification was already received before subscribing,
 * the callback is invoked immediately.
 *
 * @param appWindow - The app window to listen for
 * @param callback - Function to call when ready notification received
 * @returns Cleanup function to unregister the callback
 */
export function onAppReady(appWindow: Window, callback: AppReadyCallback): () => void {
	readyCallbacks.set(appWindow, callback)

	// Check if notification arrived before subscription
	const pendingStage = pendingNotifications.get(appWindow)
	if (pendingStage) {
		console.log('[Lifecycle] Delivering pending notification:', pendingStage)
		pendingNotifications.delete(appWindow)
		callback(appWindow, pendingStage)
	}

	return () => {
		readyCallbacks.delete(appWindow)
		pendingNotifications.delete(appWindow)
	}
}

/**
 * Unregister a ready callback for an app window
 */
export function offAppReady(appWindow: Window): void {
	readyCallbacks.delete(appWindow)
	pendingNotifications.delete(appWindow)
}

/**
 * Initialize app lifecycle message handlers on the shell bus
 */
export function initLifecycleHandlers(bus: ShellMessageBus): void {
	// Handle ready notification from apps
	bus.on('app:ready.notify', (msg: AppReadyNotify, source) => {
		const appWindow = source as Window
		if (!appWindow) {
			console.error('[Lifecycle] Ready notification with no source window')
			return
		}

		const stage = msg.payload.stage || 'ready'
		console.log('[Lifecycle] App ready:', stage)

		// Call registered callback if any
		const callback = readyCallbacks.get(appWindow)
		if (callback) {
			callback(appWindow, stage)
		} else {
			// Store for later - subscription might not be set up yet
			console.log('[Lifecycle] Storing pending notification:', stage)
			pendingNotifications.set(appWindow, stage)
		}
	})
}

// vim: ts=4
