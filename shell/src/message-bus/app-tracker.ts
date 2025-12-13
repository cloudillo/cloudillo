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
 * App Connection Tracker
 *
 * Tracks active app connections by Window reference for strict origin validation.
 * Apps running in sandboxed iframes have opaque origins, so we track them by
 * their Window object to validate message sources.
 */

// ============================================
// TYPES
// ============================================

/**
 * Information about a connected app
 */
export interface AppConnection {
	/** Reference to the app's window (iframe.contentWindow) */
	window: Window
	/** App name/identifier */
	appName?: string
	/** Resource ID the app is accessing */
	resId?: string
	/** User identity tag for this app context */
	idTag?: string
	/** Access level granted to the app */
	access: 'read' | 'write'
	/** Whether the app has been initialized */
	initialized: boolean
	/** When the app was registered */
	registeredAt: number
	/** When the app was last active */
	lastActiveAt: number
}

/**
 * Options for registering an app
 */
export interface RegisterAppOptions {
	window: Window
	appName?: string
	resId?: string
	idTag?: string
	access?: 'read' | 'write'
}

// ============================================
// APP TRACKER
// ============================================

/**
 * Tracks active app connections for message source validation
 */
export class AppTracker {
	private connections = new Map<Window, AppConnection>()
	private debug: boolean

	constructor(debug = false) {
		this.debug = debug
	}

	private log(...args: unknown[]): void {
		if (this.debug) {
			console.log('[AppTracker]', ...args)
		}
	}

	/**
	 * Register a new app connection
	 *
	 * Called when an app iframe loads and we prepare to send it init data.
	 */
	registerApp(options: RegisterAppOptions): AppConnection {
		const now = Date.now()
		const connection: AppConnection = {
			window: options.window,
			appName: options.appName,
			resId: options.resId,
			idTag: options.idTag,
			access: options.access || 'write',
			initialized: false,
			registeredAt: now,
			lastActiveAt: now
		}

		this.connections.set(options.window, connection)
		this.log('Registered app:', options.appName, options.resId)
		return connection
	}

	/**
	 * Mark an app as initialized (after sending init response)
	 */
	markInitialized(window: Window): boolean {
		const connection = this.connections.get(window)
		if (!connection) {
			this.log('Cannot mark initialized - app not found')
			return false
		}

		connection.initialized = true
		connection.lastActiveAt = Date.now()
		this.log('Marked initialized:', connection.appName)
		return true
	}

	/**
	 * Unregister an app connection
	 *
	 * Called when an app iframe is removed/unmounted.
	 */
	unregisterApp(window: Window): boolean {
		const connection = this.connections.get(window)
		if (!connection) {
			return false
		}

		this.connections.delete(window)
		this.log('Unregistered app:', connection.appName)
		return true
	}

	/**
	 * Get app connection by window
	 */
	getApp(window: Window): AppConnection | undefined {
		const connection = this.connections.get(window)
		if (connection) {
			connection.lastActiveAt = Date.now()
		}
		return connection
	}

	/**
	 * Check if a window is a known app
	 */
	isKnownApp(window: Window): boolean {
		return this.connections.has(window)
	}

	/**
	 * Check if an app is initialized
	 */
	isInitialized(window: Window): boolean {
		const connection = this.connections.get(window)
		return connection?.initialized ?? false
	}

	/**
	 * Validate a message source
	 *
	 * @param source - MessageEvent.source
	 * @param requireInit - Whether the app must be initialized
	 * @returns The app connection if valid, undefined otherwise
	 */
	validateSource(
		source: MessageEventSource | null,
		requireInit = false
	): AppConnection | undefined {
		if (!source || !(source instanceof Window)) {
			this.log('Invalid source - not a Window')
			return undefined
		}

		const connection = this.connections.get(source)
		if (!connection) {
			this.log('Unknown source - app not registered')
			return undefined
		}

		if (requireInit && !connection.initialized) {
			this.log('App not initialized:', connection.appName)
			return undefined
		}

		connection.lastActiveAt = Date.now()
		return connection
	}

	/**
	 * Get all active connections
	 */
	getConnections(): AppConnection[] {
		return Array.from(this.connections.values())
	}

	/**
	 * Get count of active connections
	 */
	getConnectionCount(): number {
		return this.connections.size
	}

	/**
	 * Cleanup stale connections (apps that haven't been active)
	 *
	 * @param maxAge - Maximum age in milliseconds
	 * @returns Number of connections cleaned up
	 */
	cleanup(maxAge: number = 30 * 60 * 1000): number {
		const now = Date.now()
		let count = 0

		for (const [window, connection] of this.connections) {
			if (now - connection.lastActiveAt > maxAge) {
				this.connections.delete(window)
				this.log('Cleaned up stale connection:', connection.appName)
				count++
			}
		}

		return count
	}

	/**
	 * Clear all connections
	 */
	clear(): void {
		this.connections.clear()
		this.log('Cleared all connections')
	}
}

// ============================================
// SINGLETON
// ============================================

let trackerInstance: AppTracker | null = null

/**
 * Get the singleton AppTracker instance
 */
export function getAppTracker(debug = false): AppTracker {
	if (!trackerInstance) {
		trackerInstance = new AppTracker(debug)
	}
	return trackerInstance
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetAppTracker(): void {
	if (trackerInstance) {
		trackerInstance.clear()
		trackerInstance = null
	}
}

// vim: ts=4
