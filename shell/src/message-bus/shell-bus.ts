// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Shell-Side Message Bus Implementation
 *
 * Handles messages from apps and manages app connections.
 * Provides a unified interface for app communication.
 */

import {
	type ApiClient,
	MESSAGE_REGISTRY,
	MessageBusBase,
	type MessageBusConfig,
	PROTOCOL_VERSION,
	validateMessage
} from '@cloudillo/core'

import {
	type AppConnection,
	type AppTracker,
	getAppTracker,
	type PendingRegistration,
	type RegisterAppOptions
} from './app-tracker.js'
import { initAuthHandlers } from './handlers/auth.js'
import { cleanupCameraSessions, initCameraHandlers } from './handlers/camera.js'
import { initCrdtHandlers } from './handlers/crdt.js'
import { initDocInfoHandlers } from './handlers/docinfo.js'
import { initDocumentHandlers } from './handlers/document.js'
import { initEmbedHandlers } from './handlers/embed.js'
import { initFeedHandlers } from './handlers/feed.js'
import { initImportHandlers } from './handlers/import.js'
import { initLifecycleHandlers } from './handlers/lifecycle.js'
import { initMediaHandlers } from './handlers/media.js'
import { initSensorHandlers } from './handlers/sensor.js'
import { initSettingsHandlers } from './handlers/settings.js'
import { initShareHandlers } from './handlers/share.js'
import { initSiteHandlers } from './handlers/site.js'
import { initStorageHandlers } from './handlers/storage.js'

/**
 * What a shell-hosted embed may send — closed by default.
 *
 * An embed is untrusted third-party content that is now a fully initialized
 * connection (`handlers/auth.ts` registers it on the attested `pending.resId` so its
 * tokens mint), so every `app>shell` request reaches a handler unless something stops
 * it. Only traffic an embedded document needs to DISPLAY ITSELF is listed; anything
 * added to `MESSAGE_REGISTRY` later is refused until it is deliberately listed here.
 *
 * This is the canonical statement of WHY an embed is refused, and the per-handler
 * `connection.embed` guards (defense in depth, for the day a type is listed here on
 * purpose) point back at it: an embed carries the document's resId only so its tokens
 * mint correctly; it is an inline preview, not the document's own editor.
 *
 * `auth:init.req` is exempted before this check — it runs before a connection exists.
 * The lifecycle notifies are load-bearing: `useShellEmbed`'s stage machine and its 15s
 * boot timeout are driven by them.
 *
 * The settings READS are here because apps block their boot on them (mapillo awaits
 * `bus.settings.list()` before `app:ready.notify`), and they are safe: `handlers/settings.ts`
 * scopes every key to `app.<connection.appName>.`, and an embed's `appName` is attested by
 * the shell (`shellEmbedAppName` resolves it from the target's content type) rather than
 * claimed by the app.
 *
 * Deliberately absent, and why:
 * - `settings:set.req` / `storage:op.req` — the WRITES to that same store; an embed is a
 *   read-only inline preview.
 * - `camera:*` / `sensor:compass.sub` — device capture for an iframe the reader never
 *   focused, and `sensor:compass.sub` calls `requestOrientationPermission()`
 *   (`handlers/sensor.ts`), which raises a permission prompt on iOS. An embedded mapillo
 *   therefore has no compass; that is the intended trade.
 * - `app:title.push` — the browser tab is showing the host page, not the embed.
 * - `doc:info.req` / `doc:rename.req` / `doc:pick.req` / `media:pick.req` /
 *   `share:create.req` / `embed:open.req` / `feed:post.req` — editor-only surfaces, by the
 *   rule above. `feed:post.req` additionally must not navigate the shell out from under
 *   the reader.
 * - `import:complete.notify` — acknowledges an import; `handlers/lifecycle.ts` never
 *   delivers one to an embed.
 *
 * `RELAY_UP_TYPES` in `libs/core/src/message-bus/embed-relay.ts` is the same idea for the
 * relayed (app-inside-app) path. The two gate different trust boundaries and their contents
 * legitimately differ — but a new message type wants a decision in both.
 */
const EMBED_ALLOWED_MESSAGES: ReadonlySet<string> = new Set([
	'auth:token.refresh.req',
	'app:ready.notify',
	'app:error.notify',
	'embed:view.report',
	'embed:view.exit',
	'settings:get.req',
	'settings:list.req',
	'crdt:clientid.req',
	'crdt:cache.append.req',
	'crdt:cache.read.req',
	'crdt:cache.compact.req'
])

/**
 * The response type a `*.req` is answered with. `.ack` first: the two-phase requests
 * (`media:pick`, `doc:pick`) are awaited on the ACK, and `media:pick.res` still exists
 * in the registry as a deprecated alias.
 */
function responseTypeFor(type: string): string | undefined {
	if (!type.endsWith('.req')) return undefined
	const base = type.slice(0, -'.req'.length)
	for (const suffix of ['.ack', '.res']) {
		if (Object.hasOwn(MESSAGE_REGISTRY, base + suffix)) return base + suffix
	}
	return undefined
}

// ============================================
// TYPES
// ============================================

/**
 * Auth state from shell context
 */
export interface AuthState {
	idTag?: string
	tnId?: number
	roles?: string[]
}

/**
 * Theme state from shell context
 */
export interface ThemeState {
	darkMode: boolean
}

/**
 * Everything {@link ShellMessageBus.initApp} sends an app in `auth:init.push`.
 *
 * Named rather than inline because the app side rebuilds its whole state from
 * this payload (`libs/core/src/message-bus/app-bus.ts`), so a corrective push
 * has to re-send the previous one in full — see `apps/useIdentityPush.ts`.
 */
export interface InitAppData {
	appName?: string
	idTag?: string
	/** Whether `idTag` stands for a signed-in user rather than the
	 *  context tag a share-link guest falls back to. */
	authenticated?: boolean
	tnId?: number
	roles?: string[]
	token?: string
	access?: 'read' | 'comment' | 'write'
	darkMode?: boolean
	tokenLifetime?: number
	resId?: string
	displayName?: string
	navState?: string
	ancestors?: string[]
	params?: string
}

/**
 * Token result from getAccessToken
 */
export interface TokenResult {
	token: string
	tokenLifetime?: number
}

/**
 * Configuration for ShellMessageBus
 */
export interface ShellMessageBusConfig extends Partial<MessageBusConfig> {
	/** Get access token for a resource */
	getAccessToken: (
		resId: string,
		access: 'read' | 'comment' | 'write'
	) => Promise<TokenResult | undefined>
	/** Refresh token using share link refId (for guest access) */
	refreshTokenByRef?: (refId: string) => Promise<TokenResult | undefined>
	/** Get current auth state */
	getAuthState: () => AuthState | null
	/** Get current theme state */
	getThemeState: () => ThemeState
	/** Get current UI language code */
	getLanguage: () => string
	/** Get API client for server-proxied requests (settings, etc.) */
	getApi?: () => ApiClient | null
}

// ============================================
// SHELL MESSAGE BUS
// ============================================

/**
 * Shell-side message bus for handling app communications
 */
export class ShellMessageBus extends MessageBusBase {
	private shellConfig: ShellMessageBusConfig
	private appTracker: AppTracker
	private messageListener: ((event: MessageEvent) => void) | null = null

	constructor(config: ShellMessageBusConfig) {
		super({ ...config, contextName: config.contextName || 'ShellBus' })
		this.shellConfig = config
		this.appTracker = getAppTracker(config.debug)
	}

	/**
	 * Initialize the shell message bus
	 */
	init(): void {
		if (this.initialized) {
			this.log('Already initialized')
			return
		}

		// Set up single message listener
		this.messageListener = this.handleMessage.bind(this)
		window.addEventListener('message', this.messageListener)

		// Initialize handlers
		initAuthHandlers(this)
		initStorageHandlers(this)
		initMediaHandlers(this)
		initDocumentHandlers(this)
		initEmbedHandlers(this)
		initLifecycleHandlers(this)
		initCrdtHandlers(this)
		initSettingsHandlers(this)
		initSensorHandlers(this)
		initCameraHandlers(this)
		initShareHandlers(this)
		initImportHandlers(this)
		initSiteHandlers(this)
		initDocInfoHandlers(this)
		initFeedHandlers(this)

		this.initialized = true
		this.log('Initialized')
	}

	// ============================================
	// CONTEXT ACCESS
	// ============================================

	/**
	 * Get the app tracker instance
	 */
	getAppTracker(): AppTracker {
		return this.appTracker
	}

	/**
	 * Get current auth state
	 */
	getAuthState(): AuthState | null {
		return this.shellConfig.getAuthState()
	}

	/**
	 * Get current theme state
	 */
	getThemeState(): ThemeState {
		return this.shellConfig.getThemeState()
	}

	/**
	 * Get current UI language code
	 */
	getLanguage(): string {
		return this.shellConfig.getLanguage()
	}

	/**
	 * Get API client for server-proxied requests
	 */
	getApi(): ApiClient | null {
		return this.shellConfig.getApi?.() ?? null
	}

	/**
	 * Get access token for a resource
	 */
	async getAccessToken(
		resId: string,
		access: 'read' | 'comment' | 'write'
	): Promise<TokenResult | undefined> {
		return this.shellConfig.getAccessToken(resId, access)
	}

	/**
	 * Refresh token using share link refId (for guest access)
	 */
	async refreshTokenByRef(refId: string): Promise<TokenResult | undefined> {
		return this.shellConfig.refreshTokenByRef?.(refId)
	}

	/**
	 * Set a pending registration for an app before it loads.
	 * This stores token/refId keyed by resId so auth:init.req can find it.
	 */
	setPendingRegistration(resId: string, data: PendingRegistration): void {
		this.appTracker.setPendingRegistration(resId, data)
	}

	// ============================================
	// MESSAGE HANDLING
	// ============================================

	/**
	 * Handle incoming messages from apps
	 */
	private handleMessage(event: MessageEvent): void {
		// Validate message (returns undefined for non-cloudillo or invalid messages)
		const result = validateMessage(event.data, 'app>shell')
		if (!result) return

		const message = result.message
		this.log('Received:', message.type, 'from app')

		// Validate source is a known app (except for init requests)
		if (message.type !== 'auth:init.req') {
			const connection = this.appTracker.validateSource(event.source, result.rule[1])
			if (!connection) {
				this.logWarn('Message from unknown/uninitialized app:', message.type)
				return
			}
			// The backstop that makes a newly added handler safe by default: anything not
			// listed above is refused here, before dispatch, with a real `ok:false` so the
			// app fails fast instead of waiting out its request timeout.
			//
			// The per-handler `connection.embed` guards are defense in depth for the day a
			// type is deliberately added to the allowlist — they carry the per-message
			// wording, and their own tests call the handlers directly.
			if (connection.embed && !EMBED_ALLOWED_MESSAGES.has(message.type)) {
				this.logWarn('Message not available to an embed:', message.type)
				const resType = responseTypeFor(message.type)
				const id = (message as { id?: unknown }).id
				if (resType && typeof id === 'number' && event.source) {
					this.sendResponse(
						event.source as Window,
						resType,
						id,
						false,
						undefined,
						'Not available to an embedded document'
					)
				}
				return
			}
		}

		// Dispatch to registered handlers
		this.dispatch(message, event.source)
	}

	// ============================================
	// SENDING MESSAGES
	// ============================================

	/**
	 * Send a message to an app window
	 */
	private sendToApp(appWindow: Window, message: Record<string, unknown>): void {
		this.log('Sending to app:', message.type)
		appWindow.postMessage(message, '*')
	}

	/**
	 * Send a response message to an app
	 */
	sendResponse<D>(
		appWindow: Window,
		type: string,
		replyTo: number,
		ok: boolean,
		data?: D,
		error?: string
	): void {
		this.sendToApp(appWindow, {
			cloudillo: true,
			v: PROTOCOL_VERSION,
			type,
			replyTo,
			ok,
			...(data !== undefined && { data }),
			...(error !== undefined && { error })
		})
	}

	/**
	 * Send a notification message to an app
	 */
	sendNotify<P>(appWindow: Window, type: string, payload: P): void {
		this.sendToApp(appWindow, {
			cloudillo: true,
			v: PROTOCOL_VERSION,
			type,
			payload
		})
	}

	// ============================================
	// APP MANAGEMENT
	// ============================================

	/**
	 * Register an app before initialization
	 *
	 * Called by MicrofrontendContainer when iframe loads.
	 */
	registerApp(options: RegisterAppOptions): AppConnection {
		return this.appTracker.registerApp(options)
	}

	/**
	 * Unregister an app when iframe is removed
	 */
	unregisterApp(window: Window): void {
		cleanupCameraSessions(window)
		this.appTracker.unregisterApp(window)
	}

	/**
	 * Send a proactive token update to an app
	 */
	sendTokenUpdate(appWindow: Window, token: string, tokenLifetime?: number): void {
		const conn = this.appTracker.getApp(appWindow)
		if (conn) conn.token = token

		this.sendNotify(appWindow, 'auth:token.push', {
			token,
			tokenLifetime
		})
	}

	/**
	 * Broadcast a theme update to all initialized app iframes
	 */
	broadcastThemeUpdate(darkMode: boolean): void {
		const windows = this.appTracker.getInitializedWindows()
		for (const appWindow of windows) {
			this.sendNotify(appWindow, 'theme:update', { darkMode })
		}
		this.log('Broadcast theme update to', windows.length, 'apps, darkMode:', darkMode)
	}

	/**
	 * Pre-register an app before it loads (to handle early init.req)
	 *
	 * Called when iframe is created but before src is set.
	 * This ensures resId is available when app sends auth:init.req.
	 */
	preRegisterApp(
		appWindow: Window,
		options: {
			appName?: string
			resId?: string
			idTag?: string
			access?: 'read' | 'comment' | 'write'
			token?: string
			refId?: string
			displayName?: string
			params?: string
		}
	): void {
		const existing = this.appTracker.getApp(appWindow)
		if (existing) {
			// Update existing connection with token/refId (may have been created by early auth:init.req)
			if (options.token) existing.token = options.token
			if (options.refId) existing.refId = options.refId
			if (options.appName) existing.appName = options.appName
			if (options.idTag) existing.idTag = options.idTag
			if (options.access) existing.access = options.access
			if (options.displayName) existing.displayName = options.displayName
			if (options.params) existing.params = options.params
			this.log('Updated existing app registration:', options.appName, options.resId)
		} else {
			this.appTracker.registerApp({
				window: appWindow,
				appName: options.appName,
				resId: options.resId,
				idTag: options.idTag,
				access: options.access,
				token: options.token,
				refId: options.refId,
				displayName: options.displayName,
				params: options.params
			})
			this.log('Pre-registered app:', options.appName, options.resId)
		}
	}

	/**
	 * Initialize an app directly (alternative to waiting for init.req)
	 *
	 * Used for immediate initialization after iframe load.
	 */
	initApp(appWindow: Window, data: InitAppData): void {
		// Register if not already (with resId for token fetching)
		if (!this.appTracker.isKnownApp(appWindow)) {
			this.appTracker.registerApp({
				window: appWindow,
				appName: data.appName,
				idTag: data.idTag,
				access: data.access,
				resId: data.resId
			})
		} else {
			// A re-init corrects WHO the app is (see `useIdentityPush`). The
			// connection has to follow, or a later `auth:init.req` — which resolves
			// `idTag` from the connection first — hands back the pre-correction one.
			const conn = this.appTracker.getApp(appWindow)
			if (conn) {
				if (data.idTag) conn.idTag = data.idTag
				if (data.access) conn.access = data.access
			}
		}

		// Mark as initialized
		this.appTracker.markInitialized(appWindow)

		// Store scoped token in connection
		if (data.token) {
			const conn = this.appTracker.getApp(appWindow)
			if (conn) conn.token = data.token
		}

		// Send init notification (not response - no request to reply to)
		this.sendNotify(appWindow, 'auth:init.push', {
			idTag: data.idTag,
			authenticated: !!data.authenticated,
			tnId: data.tnId,
			roles: data.roles,
			theme: 'glass',
			darkMode: data.darkMode,
			language: this.getLanguage(),
			token: data.token,
			access: data.access || 'write',
			tokenLifetime: data.tokenLifetime,
			displayName: data.displayName,
			navState: data.navState,
			ancestors: data.ancestors,
			params: data.params
		})
	}

	// ============================================
	// LIFECYCLE
	// ============================================

	/**
	 * Destroy the message bus and cleanup
	 */
	override destroy(): void {
		if (this.messageListener) {
			window.removeEventListener('message', this.messageListener)
			this.messageListener = null
		}
		this.appTracker.clear()
		super.destroy()
	}
}

// ============================================
// SINGLETON
// ============================================

let shellBusInstance: ShellMessageBus | null = null

/**
 * Initialize the singleton ShellMessageBus
 */
export function initShellBus(config: ShellMessageBusConfig): ShellMessageBus {
	if (shellBusInstance) {
		console.warn('[ShellBus] Already initialized, returning existing instance')
		return shellBusInstance
	}

	shellBusInstance = new ShellMessageBus(config)
	shellBusInstance.init()
	return shellBusInstance
}

/**
 * Get the singleton ShellMessageBus instance
 */
export function getShellBus(): ShellMessageBus | null {
	return shellBusInstance
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetShellBus(): void {
	if (shellBusInstance) {
		shellBusInstance.destroy()
		shellBusInstance = null
	}
}

// vim: ts=4
