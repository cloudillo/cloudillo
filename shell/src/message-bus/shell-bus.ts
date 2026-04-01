// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Shell-Side Message Bus Implementation
 *
 * Handles messages from apps and manages app connections.
 * Provides a unified interface for app communication.
 */

import {
	MessageBusBase,
	type MessageBusConfig,
	PROTOCOL_VERSION,
	validateMessage,
	type ApiClient
} from '@cloudillo/core'

import {
	type AppTracker,
	getAppTracker,
	type AppConnection,
	type RegisterAppOptions
} from './app-tracker.js'
import { initAuthHandlers } from './handlers/auth.js'
import { initStorageHandlers } from './handlers/storage.js'
import { initMediaHandlers } from './handlers/media.js'
import { initDocumentHandlers } from './handlers/document.js'
import { initEmbedHandlers } from './handlers/embed.js'
import { initLifecycleHandlers } from './handlers/lifecycle.js'
import { initCrdtHandlers } from './handlers/crdt.js'
import { initSettingsHandlers } from './handlers/settings.js'
import { initSensorHandlers } from './handlers/sensor.js'
import { initCameraHandlers, cleanupCameraSessions } from './handlers/camera.js'
import { initShareHandlers } from './handlers/share.js'
import { initImportHandlers } from './handlers/import.js'

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
	setPendingRegistration(
		resId: string,
		data: {
			token?: string
			refId?: string
			access?: 'read' | 'comment' | 'write'
			idTag?: string
			displayName?: string
			navState?: string
			ancestors?: string[]
			params?: string
		}
	): void {
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
			const connection = this.appTracker.validateSource(
				event.source,
				result.rule.requiresAuth
			)
			if (!connection) {
				this.logWarn('Message from unknown/uninitialized app:', message.type)
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
	initApp(
		appWindow: Window,
		data: {
			appName?: string
			idTag?: string
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
	): void {
		// Register if not already (with resId for token fetching)
		if (!this.appTracker.isKnownApp(appWindow)) {
			this.appTracker.registerApp({
				window: appWindow,
				appName: data.appName,
				idTag: data.idTag,
				access: data.access,
				resId: data.resId
			})
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
