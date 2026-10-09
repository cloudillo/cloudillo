// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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
	/** Guest display name (for comment attribution) */
	displayName?: string
	/** Access level granted to the app */
	access: 'read' | 'comment' | 'write'
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
	/** Source file ID for cross-document token refresh of embedded apps */
	via?: string
	/** A shell-hosted embed (feed card, site island), not the document's own editor.
	 *  It carries the real resId for token minting, but must not be handed anything
	 *  addressed to the editor — a pending import above all, which is consumed once. */
	embed?: boolean
	/** Launch params as serialized query string */
	params?: string
}

/**
 * Encode access level to single-char suffix for token scope strings (e.g. `file:123:W`)
 */
export function getAccessSuffix(access?: 'read' | 'comment' | 'write'): 'R' | 'C' | 'W' {
	return access === 'read' ? 'R' : access === 'comment' ? 'C' : 'W'
}

/**
 * Options for registering an app
 */
export interface RegisterAppOptions {
	window: Window
	appName?: string
	resId?: string
	idTag?: string
	access?: 'read' | 'comment' | 'write'
	/** Pre-provided token for guest access via share links */
	token?: string
	/** Share link ref ID for token refresh */
	refId?: string
	/** Guest display name (for comment attribution) */
	displayName?: string
	/** See {@link AppConnection.embed} */
	embed?: boolean
	/** Launch params as serialized query string */
	params?: string
}

/**
 * Pending registration data for apps that haven't loaded yet.
 * Keyed by resId so we can look it up when auth:init.req arrives.
 */
export interface PendingRegistration {
	token?: string
	refId?: string
	access?: 'read' | 'comment' | 'write'
	idTag?: string
	appName?: string
	displayName?: string
	navState?: string
	ancestors?: string[]
	/** Launch params as serialized query string */
	params?: string
	/**
	 * The document the iframe was opened on, when the entry is keyed by an
	 * `_embed:<nonce>` handshake key rather than by the resId itself. The
	 * connection is registered on this, never on the key — a key read as a
	 * resId mints against an owner tag of `_embed`.
	 */
	resId?: string
	/** See {@link AppConnection.embed} */
	embed?: boolean
}

/**
 * A scoped token minted by embed:open.req for one embed instance
 */
export interface EmbedTokenEntry {
	/** The embedded document */
	fileId: string
	token: string
	access: 'read' | 'write'
	/** The embed chain above `fileId`, ending with the document that embeds it */
	ancestors: string[]
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
	// Strong Set of active windows to enable iteration for broadcasts
	private activeWindows = new Set<Window>()
	// Track count separately since WeakMap doesn't have size
	private connectionCount = 0
	private pendingRegistrations = new Map<string, PendingRegistration>()
	// Per host window, then by embed key ('_embed:<nonce>'): a token is usable only by the
	// window it was minted for, and only for the one embed instance that relays its key
	private embedTokens = new WeakMap<Window, Map<string, EmbedTokenEntry>>()
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
			embed: options.embed,
			idTag: options.idTag,
			access: options.access || 'write',
			initialized: false,
			registeredAt: now,
			lastActiveAt: now,
			token: options.token,
			refId: options.refId,
			displayName: options.displayName,
			params: options.params
		}

		// Only increment count if this is a new connection
		if (!this.connections.has(options.window)) {
			this.connectionCount++
		}
		this.connections.set(options.window, connection)
		this.activeWindows.add(options.window)
		// A re-registration (reload) of this window reopens its embeds, so drop its old tokens
		this.embedTokens.delete(options.window)
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
		this.activeWindows.delete(window)
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
	 * Get all initialized app windows for broadcasting messages
	 */
	getInitializedWindows(): Window[] {
		const windows: Window[] = []
		for (const win of this.activeWindows) {
			const conn = this.connections.get(win)
			if (conn?.initialized) {
				windows.push(win)
			}
		}
		return windows
	}

	/**
	 * Store the scoped token minted for one embed instance (`key` = '_embed:<nonce>') of the
	 * `window` connection, so the nested embeds it relays can look up their via-token.
	 */
	storeEmbedToken(window: Window, key: string, entry: EmbedTokenEntry): void {
		let tokens = this.embedTokens.get(window)
		if (!tokens) {
			tokens = new Map()
			this.embedTokens.set(window, tokens)
		}
		tokens.set(key, entry)
	}

	/**
	 * Drop the token of the embed instance `key` of the `window` connection (`embed:close.notify`).
	 */
	// An iframe destroyed outright (e.g. its whole host removed) runs no cleanup, so its
	// descendants' tokens stay until the host window re-registers; evict by `ancestors` prefix if
	// that matters
	removeEmbedToken(window: Window, key: string): void {
		this.embedTokens.get(window)?.delete(key)
	}

	/**
	 * Get the token stored for the embed instance `key` of the `window` connection.
	 */
	getEmbedToken(window: Window, key: string): EmbedTokenEntry | undefined {
		return this.embedTokens.get(window)?.get(key)
	}

	/**
	 * Whether the `window` connection has embedded `fileId` this session — directly into
	 * `parentFileId` when given.
	 */
	hasEmbed(window: Window, fileId: string, parentFileId?: string): boolean {
		for (const entry of this.embedTokens.get(window)?.values() ?? []) {
			if (
				entry.fileId === fileId &&
				(parentFileId === undefined || entry.ancestors.at(-1) === parentFileId)
			) {
				return true
			}
		}
		return false
	}

	/**
	 * Clear pending registrations and reset count
	 * Note: WeakMap connections will be garbage collected automatically
	 */
	clear(): void {
		this.connections = new WeakMap()
		this.activeWindows.clear()
		this.connectionCount = 0
		this.pendingRegistrations.clear()
		this.embedTokens = new WeakMap()
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
