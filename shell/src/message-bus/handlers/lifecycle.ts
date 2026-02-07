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
import type { AppReadyNotify, AppErrorNotify } from '@cloudillo/core'

/**
 * Callback for app ready notifications
 */
export type AppReadyCallback = (appWindow: Window, stage: 'auth' | 'synced' | 'ready') => void

/**
 * Callback for app error notifications
 */
export type AppErrorCallback = (appWindow: Window, code: number, message: string) => void

// Registry of ready callbacks per window
// Using WeakMap to allow garbage collection when iframe windows are destroyed
const readyCallbacks = new WeakMap<Window, AppReadyCallback>()

// Registry of error callbacks per window
const errorCallbacks = new WeakMap<Window, AppErrorCallback>()

// Store pending notifications that arrived before subscription
// Using WeakMap to allow garbage collection when iframe windows are destroyed
const pendingNotifications = new WeakMap<Window, 'auth' | 'synced' | 'ready'>()

// Stage priority for keeping the "best" pending notification
// Higher number = further along in loading = preferred
const stagePriority: Record<string, number> = {
	auth: 1,
	synced: 2,
	ready: 3
}

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
	console.log('[Lifecycle] Subscribing to app ready notifications')
	readyCallbacks.set(appWindow, callback)

	// Check if notification arrived before subscription
	const pendingStage = pendingNotifications.get(appWindow)
	if (pendingStage) {
		console.log('[Lifecycle] Delivering pending notification:', pendingStage)
		pendingNotifications.delete(appWindow)
		callback(appWindow, pendingStage)
	} else {
		console.log('[Lifecycle] No pending notifications, waiting for app')
	}

	return () => {
		console.log('[Lifecycle] Unsubscribing from app ready notifications')
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
 * Register a callback for when an app sends an error notification
 *
 * @param appWindow - The app window to listen for
 * @param callback - Function to call when error notification received
 */
export function onAppError(appWindow: Window, callback: AppErrorCallback): void {
	errorCallbacks.set(appWindow, callback)
}

/**
 * Unregister an error callback for an app window
 */
export function offAppError(appWindow: Window): void {
	errorCallbacks.delete(appWindow)
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
			console.log('[Lifecycle] Invoking callback for stage:', stage)
			callback(appWindow, stage)
		} else {
			// Store for later - subscription might not be set up yet
			// Keep the highest priority stage (synced > auth > ready)
			const existingStage = pendingNotifications.get(appWindow)
			const existingPriority = existingStage ? (stagePriority[existingStage] ?? 0) : 0
			const newPriority = stagePriority[stage] ?? 0

			if (newPriority >= existingPriority) {
				console.log(
					'[Lifecycle] Storing pending notification:',
					stage,
					existingStage ? `(replacing ${existingStage})` : ''
				)
				pendingNotifications.set(appWindow, stage)
			} else {
				console.log(
					'[Lifecycle] Ignoring lower priority notification:',
					stage,
					'keeping:',
					existingStage
				)
			}
		}
	})

	// Handle error notification from apps
	bus.on('app:error.notify', (msg: AppErrorNotify, source) => {
		const appWindow = source as Window
		if (!appWindow) {
			console.error('[Lifecycle] Error notification with no source window')
			return
		}

		console.log('[Lifecycle] App error:', msg.payload.code, msg.payload.message)

		const callback = errorCallbacks.get(appWindow)
		if (callback) {
			callback(appWindow, msg.payload.code, msg.payload.message)
		}
	})
}

// vim: ts=4
