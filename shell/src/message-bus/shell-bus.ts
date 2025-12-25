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
 * Shell-Side Message Bus Implementation
 *
 * Handles messages from apps and manages app connections.
 * Provides a unified interface for app communication.
 */

import {
	MessageBusBase,
	MessageBusConfig,
	CloudilloMessage,
	PROTOCOL_VERSION,
	validateMessage
} from '@cloudillo/base'

import {
	AppTracker,
	getAppTracker,
	type AppConnection,
	type RegisterAppOptions
} from './app-tracker.js'
import { initAuthHandlers } from './handlers/auth.js'
import { initStorageHandlers } from './handlers/storage.js'
import { initMediaHandlers } from './handlers/media.js'

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
	getAccessToken: (resId: string, access: 'read' | 'write') => Promise<TokenResult | undefined>
	/** Refresh token using share link refId (for guest access) */
	refreshTokenByRef?: (refId: string) => Promise<TokenResult | undefined>
	/** Get current auth state */
	getAuthState: () => AuthState | null
	/** Get current theme state */
	getThemeState: () => ThemeState
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
	 * Get access token for a resource
	 */
	async getAccessToken(
		resId: string,
		access: 'read' | 'write'
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
			access?: 'read' | 'write'
			idTag?: string
			displayName?: string
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
		this.appTracker.unregisterApp(window)
	}

	/**
	 * Send a proactive token update to an app
	 */
	sendTokenUpdate(appWindow: Window, token: string, tokenLifetime?: number): void {
		this.sendNotify(appWindow, 'auth:token.push', {
			token,
			tokenLifetime
		})
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
			access?: 'read' | 'write'
			token?: string
			refId?: string
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
			this.log('Updated existing app registration:', options.appName, options.resId)
		} else {
			this.appTracker.registerApp({
				window: appWindow,
				appName: options.appName,
				resId: options.resId,
				idTag: options.idTag,
				access: options.access,
				token: options.token,
				refId: options.refId
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
			idTag?: string
			tnId?: number
			roles?: string[]
			token?: string
			access?: 'read' | 'write'
			darkMode?: boolean
			tokenLifetime?: number
			resId?: string
			displayName?: string
		}
	): void {
		// Register if not already (with resId for token fetching)
		if (!this.appTracker.isKnownApp(appWindow)) {
			this.appTracker.registerApp({
				window: appWindow,
				idTag: data.idTag,
				access: data.access,
				resId: data.resId
			})
		}

		// Mark as initialized
		this.appTracker.markInitialized(appWindow)

		// Send init notification (not response - no request to reply to)
		this.sendNotify(appWindow, 'auth:init.push', {
			idTag: data.idTag,
			tnId: data.tnId,
			roles: data.roles,
			theme: 'glass',
			darkMode: data.darkMode,
			token: data.token,
			access: data.access || 'write',
			tokenLifetime: data.tokenLifetime,
			displayName: data.displayName
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
