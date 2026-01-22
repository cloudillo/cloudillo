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
 * App-Side Message Bus Implementation
 *
 * This is the main API for apps running in sandboxed iframes to communicate
 * with the shell. It provides:
 * - Initialization with shell
 * - Token refresh
 * - Storage operations
 * - Event handling for pushed messages
 */

import {
	CloudilloMessage,
	MessageType,
	PROTOCOL_VERSION,
	AuthInitRes,
	AuthInitPush,
	AuthTokenRefreshRes,
	AuthTokenPush,
	AppReadyStage,
	StorageOp,
	StorageOpRes,
	MediaPickAck,
	MediaPickResultPush,
	CropAspect,
	Visibility
} from './types.js'
import { validateMessage } from './registry.js'
import { MessageBusBase, MessageBusConfig } from './core.js'

// ============================================
// APP STATE
// ============================================

/**
 * Application state received from shell
 */
export interface AppState {
	/** User identity tag */
	idTag?: string
	/** Tenant ID */
	tnId?: number
	/** User roles */
	roles?: string[]
	/** Current access token */
	accessToken?: string
	/** Access level (read or write) */
	access: 'read' | 'write'
	/** Dark mode enabled */
	darkMode: boolean
	/** Token lifetime in seconds */
	tokenLifetime?: number
	/** Theme name */
	theme: string
	/** Display name for anonymous guests (used in awareness) */
	displayName?: string
}

// ============================================
// STORAGE API
// ============================================

// ============================================
// MEDIA PICKER API
// ============================================

/**
 * Options for the media picker
 */
export interface MediaPickOptions {
	/**
	 * Filter by media type (MIME pattern)
	 * Examples: 'image/*', 'video/*', 'audio/*', 'application/pdf'
	 */
	mediaType?: string
	/**
	 * Explicit visibility level for comparison with selected media
	 */
	documentVisibility?: Visibility
	/**
	 * File ID to fetch visibility from (alternative to documentVisibility)
	 */
	documentFileId?: string
	/**
	 * Enable image cropping (for image media only)
	 */
	enableCrop?: boolean
	/**
	 * Allowed crop aspect ratios
	 */
	cropAspects?: CropAspect[]
	/**
	 * Custom dialog title
	 */
	title?: string
}

/**
 * Result from the media picker
 */
export interface MediaPickResult {
	/** Selected file ID */
	fileId: string
	/** File name */
	fileName: string
	/** MIME content type */
	contentType: string
	/** Image dimensions [width, height] (for images only) */
	dim?: [number, number]
	/** Visibility of the selected media */
	visibility?: Visibility
	/** Whether user acknowledged visibility warning */
	visibilityAcknowledged?: boolean
	/** Cropped variant ID if cropping was applied */
	croppedVariantId?: string
}

// ============================================
// STORAGE API
// ============================================

/**
 * Storage API for sandboxed apps
 *
 * Provides key-value storage with namespace isolation.
 * Each app should use its own namespace to prevent collisions.
 */
export interface StorageApi {
	/**
	 * Get a value by key from namespaced storage
	 */
	get<T = unknown>(ns: string, key: string): Promise<T | undefined>

	/**
	 * Set a value by key in namespaced storage
	 */
	set(ns: string, key: string, value: unknown): Promise<void>

	/**
	 * Delete a key from namespaced storage
	 */
	delete(ns: string, key: string): Promise<void>

	/**
	 * List keys in namespaced storage with optional prefix filter
	 */
	list(ns: string, prefix?: string): Promise<string[]>

	/**
	 * Clear all data in the namespace
	 */
	clear(ns: string): Promise<void>

	/**
	 * Get quota information for the namespace
	 */
	quota(ns: string): Promise<{ limit: number; used: number }>
}

// ============================================
// APP MESSAGE BUS
// ============================================

/**
 * App-side message bus for communication with shell
 *
 * Usage:
 * ```typescript
 * import { getAppBus } from '@cloudillo/core'
 *
 * const bus = getAppBus()
 * const state = await bus.init('my-app')
 *
 * // Access token
 * console.log(bus.accessToken)
 *
 * // Storage
 * await bus.storage.set('my-app', 'key', { data: 'value' })
 * const data = await bus.storage.get<{ data: string }>('my-app', 'key')
 *
 * // Token updates
 * bus.on('auth:token.push', (msg) => {
 *   console.log('Token updated:', msg.payload.token)
 * })
 * ```
 */
export class AppMessageBus extends MessageBusBase {
	private state: AppState = {
		access: 'write',
		darkMode: false,
		theme: 'glass'
	}
	private appName: string = ''
	private messageListener: ((event: MessageEvent) => void) | null = null

	constructor(config: Partial<MessageBusConfig> = {}) {
		super({ ...config, contextName: config.contextName || 'AppBus' })
	}

	// ============================================
	// STATE ACCESSORS
	// ============================================

	/** Current access token */
	get accessToken(): string | undefined {
		return this.state.accessToken
	}

	/** User identity tag */
	get idTag(): string | undefined {
		return this.state.idTag
	}

	/** Tenant ID */
	get tnId(): number | undefined {
		return this.state.tnId
	}

	/** User roles */
	get roles(): string[] | undefined {
		return this.state.roles
	}

	/** Access level */
	get access(): 'read' | 'write' {
		return this.state.access
	}

	/** Dark mode */
	get darkMode(): boolean {
		return this.state.darkMode
	}

	/** Token lifetime in seconds */
	get tokenLifetime(): number | undefined {
		return this.state.tokenLifetime
	}

	/** Display name for anonymous guests (used in awareness) */
	get displayName(): string | undefined {
		return this.state.displayName
	}

	/** Get full state (readonly) */
	getState(): Readonly<AppState> {
		return { ...this.state }
	}

	// ============================================
	// INITIALIZATION
	// ============================================

	/**
	 * Initialize the message bus and request init from shell
	 *
	 * @param appName - Name of the app for logging and identification
	 * @returns Promise resolving to app state
	 */
	async init(appName: string): Promise<AppState> {
		if (this.initialized) {
			this.log('Already initialized, returning cached state')
			return this.getState()
		}

		this.appName = appName
		this.config.contextName = `AppBus:${appName}`
		this.log('Initializing')

		// Set up the single message listener
		this.messageListener = this.handleMessage.bind(this)
		window.addEventListener('message', this.messageListener)

		// Set up internal handlers for pushed messages
		this.setupInternalHandlers()

		// Get resId from URL hash (format: "ownerTag:resourceId")
		const resId = window.location.hash.slice(1) || undefined

		// Send init request and wait for response
		const initData = await this.sendRequest<AuthInitRes['data']>((id) => {
			this.sendToShell(this.createRequestWithPayload('auth:init.req', id, { appName, resId }))
		})

		// Update state from init response
		if (initData) {
			this.state = {
				idTag: initData.idTag,
				tnId: initData.tnId,
				roles: initData.roles,
				accessToken: initData.token,
				access: initData.access || 'write',
				darkMode: !!initData.darkMode,
				tokenLifetime: initData.tokenLifetime,
				theme: initData.theme,
				displayName: initData.displayName
			}

			// Apply theme to document
			this.applyTheme()
		}

		this.initialized = true
		this.log('Initialized with state:', this.state)

		// Notify shell that auth initialization is complete
		this.notifyReady('auth')

		return this.getState()
	}

	/**
	 * Set up handlers for pushed messages from shell
	 */
	private setupInternalHandlers(): void {
		// Handle proactive init push from shell
		this.on('auth:init.push', (msg: AuthInitPush) => {
			this.state = {
				idTag: msg.payload.idTag,
				tnId: msg.payload.tnId,
				roles: msg.payload.roles,
				accessToken: msg.payload.token,
				access: msg.payload.access || 'write',
				darkMode: !!msg.payload.darkMode,
				tokenLifetime: msg.payload.tokenLifetime,
				theme: msg.payload.theme,
				displayName: msg.payload.displayName
			}
			this.applyTheme()
			this.initialized = true
			this.log('Initialized via push')

			// Notify shell that auth initialization is complete
			this.notifyReady('auth')
		})

		// Handle token updates pushed from shell
		this.on('auth:token.push', (msg: AuthTokenPush) => {
			this.state.accessToken = msg.payload.token
			if (msg.payload.tokenLifetime !== undefined) {
				this.state.tokenLifetime = msg.payload.tokenLifetime
			}
			this.log('Token updated via push')
		})

		// Handle media picker result push from shell
		this.on('media:pick.result', (msg: MediaPickResultPush) => {
			this.handleMediaPickResult(msg)
		})
	}

	/**
	 * Apply theme classes to document body
	 */
	private applyTheme(): void {
		document.body.classList.add(`theme-${this.state.theme}`)
		if (this.state.darkMode) {
			document.body.classList.add('dark')
			document.body.classList.remove('light')
		} else {
			document.body.classList.add('light')
			document.body.classList.remove('dark')
		}
	}

	// ============================================
	// MESSAGE HANDLING
	// ============================================

	/**
	 * Handle incoming messages from shell
	 */
	private handleMessage(event: MessageEvent): void {
		const data = event.data

		// Validate message (returns undefined for non-cloudillo or invalid messages)
		const result = validateMessage(data, 'shell>app')
		if (!result) return

		const message = result.message
		this.log('Received:', message.type)

		// Handle responses to pending requests
		if ('replyTo' in message && typeof message.replyTo === 'number') {
			const ok = 'ok' in message ? (message as { ok: boolean }).ok : true
			const msgData = 'data' in message ? (message as { data?: unknown }).data : undefined
			const error = 'error' in message ? (message as { error?: string }).error : undefined

			this.handleResponse(message.replyTo, ok, msgData, error)
			return
		}

		// Dispatch to registered handlers (for notifications like token push)
		this.dispatch(message, event.source)
	}

	/**
	 * Send a message to the shell (parent window)
	 */
	private sendToShell(message: CloudilloMessage): void {
		this.log('Sending to shell:', message.type)
		window.parent?.postMessage(message, '*')
	}

	// ============================================
	// TOKEN REFRESH
	// ============================================

	/**
	 * Request a fresh access token from the shell
	 *
	 * Use this when the current token is about to expire.
	 * The shell will also proactively push token updates.
	 *
	 * @returns New access token or undefined if refresh failed
	 */
	async refreshToken(): Promise<string | undefined> {
		if (!this.initialized) {
			throw new Error('AppBus not initialized. Call init() first.')
		}

		this.log('Requesting token refresh')

		const data = await this.sendRequest<AuthTokenRefreshRes['data']>((id) => {
			this.sendToShell(this.createRequest('auth:token.refresh.req', id))
		})

		if (data?.token) {
			this.state.accessToken = data.token
			if (data.tokenLifetime !== undefined) {
				this.state.tokenLifetime = data.tokenLifetime
			}
			this.log('Token refreshed')
			return data.token
		}

		this.logWarn('Token refresh returned no token')
		return undefined
	}

	// ============================================
	// APP LIFECYCLE
	// ============================================

	/**
	 * Notify the shell that the app has reached a loading stage
	 *
	 * Call this to inform the shell about your app's loading progress.
	 * The shell uses this to hide loading indicators at the appropriate time.
	 *
	 * @param stage - The loading stage reached:
	 *   - 'auth': App has received and processed auth data
	 *   - 'synced': CRDT/data sync is complete
	 *   - 'ready': App is fully interactive (default)
	 *
	 * @example
	 * ```typescript
	 * // After auth init
	 * bus.notifyReady('auth')
	 *
	 * // After CRDT sync complete
	 * bus.notifyReady('synced')
	 *
	 * // When fully ready (or just call without args)
	 * bus.notifyReady('ready')
	 * bus.notifyReady() // same as 'ready'
	 * ```
	 */
	notifyReady(stage: AppReadyStage = 'ready'): void {
		this.log('Notifying ready:', stage)
		this.sendToShell({
			cloudillo: true,
			v: PROTOCOL_VERSION,
			type: 'app:ready.notify',
			payload: { stage }
		})
	}

	// ============================================
	// MEDIA PICKER
	// ============================================

	// Timeout for ACK (dialog opening confirmation) - 5 seconds
	private static readonly MEDIA_PICK_ACK_TIMEOUT = 5000

	// Track pending media picker sessions for result correlation
	private pendingMediaSessions = new Map<
		string,
		{
			resolve: (result: MediaPickResult | undefined) => void
			reject: (error: Error) => void
		}
	>()

	/**
	 * Open the media picker to select a file
	 *
	 * Opens a shell-provided dialog for selecting or uploading media files.
	 * Supports filtering by media type, optional cropping for images, and
	 * visibility comparison with the target document.
	 *
	 * Uses ACK + push pattern:
	 * 1. Sends request, waits for ACK (5 second timeout) confirming dialog is opening
	 * 2. Waits indefinitely for result push when user selects/cancels
	 *
	 * This pattern ensures the request doesn't timeout while user is browsing.
	 *
	 * @param options - Media picker configuration
	 * @returns Promise resolving to selected media or undefined if cancelled
	 *
	 * @example
	 * ```typescript
	 * const result = await bus.pickMedia({
	 *   mediaType: 'image/*',
	 *   documentFileId: 'abc123',  // Will check visibility
	 *   enableCrop: true,
	 *   cropAspects: ['16:9', '1:1']
	 * })
	 * if (result) {
	 *   console.log('Selected file:', result.fileId)
	 *   if (result.visibilityAcknowledged) {
	 *     console.log('User acknowledged visibility warning')
	 *   }
	 * }
	 * ```
	 */
	async pickMedia(options?: MediaPickOptions): Promise<MediaPickResult | undefined> {
		if (!this.initialized) {
			throw new Error('AppBus not initialized. Call init() first.')
		}

		this.log('Opening media picker:', options)

		// Generate unique session ID for correlating result
		const sessionId = `mp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

		// Phase 1: Send request and wait for ACK (short timeout)
		// This confirms the shell received the request and is opening the dialog
		try {
			const ackData = await this.sendRequest<MediaPickAck['data']>((id) => {
				this.sendToShell(
					this.createRequestWithPayload('media:pick.req', id, {
						sessionId,
						mediaType: options?.mediaType,
						documentVisibility: options?.documentVisibility,
						documentFileId: options?.documentFileId,
						enableCrop: options?.enableCrop,
						cropAspects: options?.cropAspects,
						title: options?.title
					})
				)
			}, AppMessageBus.MEDIA_PICK_ACK_TIMEOUT)

			// Verify session ID from ACK matches
			if (ackData?.sessionId !== sessionId) {
				this.logWarn(
					'Media picker ACK sessionId mismatch:',
					ackData?.sessionId,
					'vs',
					sessionId
				)
				throw new Error('Session ID mismatch in ACK response')
			}

			this.log('Media picker ACK received, sessionId:', sessionId)

			// Phase 2: Wait for result push (no timeout - user takes as long as needed)
			return new Promise<MediaPickResult | undefined>((resolve, reject) => {
				// Store the promise handlers for this session
				this.pendingMediaSessions.set(sessionId, { resolve, reject })
			})
		} catch (error) {
			// Clean up if ACK fails
			this.pendingMediaSessions.delete(sessionId)
			throw error
		}
	}

	/**
	 * Handle media picker result push from shell
	 * Called internally when media:pick.result message is received
	 */
	private handleMediaPickResult(msg: MediaPickResultPush): void {
		const sessionId = msg.payload.sessionId
		const pending = this.pendingMediaSessions.get(sessionId)

		if (!pending) {
			this.logWarn('Received media picker result for unknown session:', sessionId)
			return
		}

		// Clean up the pending session
		this.pendingMediaSessions.delete(sessionId)

		if (msg.payload.selected && msg.payload.fileId) {
			this.log('Media picker result:', msg.payload)
			pending.resolve({
				fileId: msg.payload.fileId,
				fileName: msg.payload.fileName || '',
				contentType: msg.payload.contentType || '',
				dim: msg.payload.dim,
				visibility: msg.payload.visibility,
				visibilityAcknowledged: msg.payload.visibilityAcknowledged,
				croppedVariantId: msg.payload.croppedVariantId
			})
		} else {
			this.log('Media picker cancelled')
			pending.resolve(undefined)
		}
	}

	// ============================================
	// STORAGE API
	// ============================================

	/**
	 * Storage API for the app
	 */
	readonly storage: StorageApi = {
		get: async <T = unknown>(ns: string, key: string): Promise<T | undefined> => {
			return this.storageRequest<T>('get', ns, key)
		},

		set: async (ns: string, key: string, value: unknown): Promise<void> => {
			await this.storageRequest<void>('set', ns, key, value)
		},

		delete: async (ns: string, key: string): Promise<void> => {
			await this.storageRequest<void>('delete', ns, key)
		},

		list: async (ns: string, prefix?: string): Promise<string[]> => {
			return (
				(await this.storageRequest<string[]>('list', ns, undefined, undefined, prefix)) ??
				[]
			)
		},

		clear: async (ns: string): Promise<void> => {
			await this.storageRequest<void>('clear', ns)
		},

		quota: async (ns: string): Promise<{ limit: number; used: number }> => {
			return (
				(await this.storageRequest<{ limit: number; used: number }>('quota', ns)) ?? {
					limit: 0,
					used: 0
				}
			)
		}
	}

	/**
	 * Send a storage request to the shell
	 */
	private async storageRequest<T>(
		op: StorageOp,
		ns: string,
		key?: string,
		value?: unknown,
		prefix?: string
	): Promise<T | undefined> {
		if (!this.initialized) {
			throw new Error('AppBus not initialized. Call init() first.')
		}

		this.log('Storage request:', op, ns, key)

		const data = await this.sendRequest<StorageOpRes['data']>((id) => {
			this.sendToShell(
				this.createRequestWithPayload('storage:op.req', id, {
					op,
					ns,
					...(key !== undefined && { key }),
					...(value !== undefined && { value }),
					...(prefix !== undefined && { prefix })
				})
			)
		})

		return data as T | undefined
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

		// Reject all pending media picker sessions
		for (const [sessionId, pending] of this.pendingMediaSessions) {
			pending.reject(new Error('AppBus destroyed'))
			this.log('Cancelled pending media session:', sessionId)
		}
		this.pendingMediaSessions.clear()

		super.destroy()
	}
}

// ============================================
// SINGLETON
// ============================================

let appBusInstance: AppMessageBus | null = null

/**
 * Get the singleton AppMessageBus instance
 *
 * @param config - Optional configuration (only used on first call)
 * @returns AppMessageBus instance
 */
export function getAppBus(config?: Partial<MessageBusConfig>): AppMessageBus {
	if (!appBusInstance) {
		appBusInstance = new AppMessageBus(config)
	}
	return appBusInstance
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetAppBus(): void {
	if (appBusInstance) {
		appBusInstance.destroy()
		appBusInstance = null
	}
}

// vim: ts=4
