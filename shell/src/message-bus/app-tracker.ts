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
	/** Pre-provided token for guest access via share links */
	token?: string
	/** Share link ref ID for token refresh */
	refId?: string
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
	/** Pre-provided token for guest access via share links */
	token?: string
	/** Share link ref ID for token refresh */
	refId?: string
}

/**
 * Pending registration data for apps that haven't loaded yet.
 * Keyed by resId so we can look it up when auth:init.req arrives.
 */
export interface PendingRegistration {
	token?: string
	refId?: string
	access?: 'read' | 'write'
	idTag?: string
	appName?: string
	displayName?: string
}

// ============================================
// APP TRACKER
// ============================================

/**
 * Tracks active app connections for message source validation
 */
export class AppTracker {
	// Using WeakMap to allow garbage collection when iframe windows are destroyed
	private connections = new WeakMap<Window, AppConnection>()
	// Track count separately since WeakMap doesn't have size
	private connectionCount = 0
	private pendingRegistrations = new Map<string, PendingRegistration>()
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
			lastActiveAt: now,
			token: options.token,
			refId: options.refId
		}

		// Only increment count if this is a new connection
		if (!this.connections.has(options.window)) {
			this.connectionCount++
		}
		this.connections.set(options.window, connection)
		this.log('Registered app:', options.appName, options.resId)
		return connection
	}

	// ============================================
	// PENDING REGISTRATIONS
	// ============================================

	/**
	 * Set a pending registration for an app before it loads.
	 * This allows us to store token/refId before we have the Window reference.
	 * When auth:init.req arrives with matching resId, we can look this up.
	 */
	setPendingRegistration(resId: string, data: PendingRegistration): void {
		this.pendingRegistrations.set(resId, data)
		this.log('Set pending registration for:', resId)
	}

	/**
	 * Get pending registration by resId
	 */
	getPendingRegistration(resId: string): PendingRegistration | undefined {
		return this.pendingRegistrations.get(resId)
	}

	/**
	 * Consume and remove a pending registration
	 */
	consumePendingRegistration(resId: string): PendingRegistration | undefined {
		const pending = this.pendingRegistrations.get(resId)
		if (pending) {
			this.pendingRegistrations.delete(resId)
			this.log('Consumed pending registration for:', resId)
		}
		return pending
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
		this.connectionCount = Math.max(0, this.connectionCount - 1)
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
		// Use duck-type check instead of instanceof to handle cross-origin WindowProxy
		if (!source || typeof (source as Window).postMessage !== 'function') {
			this.log('Invalid source - not a Window-like object')
			return undefined
		}

		// Cast to Window for Map lookup (safe after duck-type check above)
		const connection = this.connections.get(source as Window)
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
	 * Get approximate count of active connections
	 * Note: This is approximate since WeakMap entries may be GC'd
	 */
	getConnectionCount(): number {
		return this.connectionCount
	}

	/**
	 * Clear pending registrations and reset count
	 * Note: WeakMap connections will be garbage collected automatically
	 */
	clear(): void {
		this.connections = new WeakMap()
		this.connectionCount = 0
		this.pendingRegistrations.clear()
		this.log('Cleared all connections and pending registrations')
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
