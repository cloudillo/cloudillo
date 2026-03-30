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
	type CloudilloMessage,
	PROTOCOL_VERSION,
	type AuthInitRes,
	type AuthInitPush,
	type AuthTokenRefreshRes,
	type AuthTokenPush,
	type AppReadyStage,
	type StorageOp,
	type StorageOpRes,
	type SettingsGetRes,
	type MediaPickAck,
	type MediaPickResultPush,
	type DocPickAck,
	type DocPickResultPush,
	type EmbedOpenRes,
	type EmbedViewStateSet,
	type SensorCompassPush,
	type CropAspect,
	type Visibility,
	type CameraCaptureAck,
	type CameraCaptureResultPush,
	type CameraPreviewFrame,
	type ShareCreateAck,
	type ShareCreateResultPush,
	type ImportDataPush
} from './types.js'
import { validateMessage } from './registry.js'
import { MessageBusBase, type MessageBusConfig } from './core.js'

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
	/**
	 * Interactive view state for embeds. Bidirectionally updatable during the
	 * session via embed:viewstate.push / embed:viewstate.set. Persisted in
	 * block props by the parent app. Only meaningful in embed context.
	 */
	navState?: string
	/** Ancestor file IDs in the embed chain (for cycle/depth detection) */
	ancestors?: string[]
	/**
	 * Launch params as serialized query string (e.g., "mode=present&nav=page:3").
	 * Controls app behavior/mode and deep linking. Set at launch, immutable during
	 * session. Available in all contexts: direct navigation, share links, and embeds.
	 * Convention: use the `nav` key for deep linking to a specific view position.
	 * Read via `bus.params` (raw) or `bus.parsedParams` (URLSearchParams).
	 */
	params?: string
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
// DOCUMENT PICKER API
// ============================================

/**
 * Options for the document picker
 */
export interface DocPickOptions {
	/** Filter by file type (CRDT, RTDB) */
	fileTp?: string
	/** Filter by content type (e.g. 'cloudillo/quillo') */
	contentType?: string
	/** Source file ID (for creating share entries) */
	sourceFileId?: string
	/** Custom dialog title */
	title?: string
}

/**
 * Result from the document picker
 */
export interface DocPickResult {
	/** Selected file ID */
	fileId: string
	/** File name */
	fileName: string
	/** MIME content type */
	contentType: string
	/** File type (CRDT, RTDB) */
	fileTp?: string
	/** App ID resolved from content type */
	appId?: string
}

// ============================================
// SHARE LINK CREATION API
// ============================================

/**
 * Options for requesting share link creation
 */
export interface ShareCreateOptions {
	/** Suggested access level (default: 'read') */
	accessLevel?: 'read' | 'write'
	/** Description for the share link */
	description?: string
	/** Expiration timestamp (Unix ms) */
	expiresAt?: number
	/** Max uses (null = unlimited) */
	count?: number
	/** Serialized query string for launch params (e.g., "mode=present&follow=some.id.tag") */
	params?: string
	/** When true, dialog offers reusing existing compatible refs for this document */
	reuse?: boolean
}

/**
 * Result from share link creation
 */
export interface ShareCreateResult {
	/** Whether the link was created */
	created: boolean
	/** Reference ID */
	refId?: string
	/** Full share URL */
	url?: string
}

// ============================================
// CAMERA CAPTURE API
// ============================================

/**
 * Options for camera capture
 */
export interface CameraCaptureOptions {
	/** Preferred camera facing direction */
	facing?: 'user' | 'environment'
	/** Maximum resolution (longest edge in pixels) */
	maxResolution?: number
}

/**
 * Result from camera capture
 */
export interface CameraCaptureResult {
	/** Base64-encoded image data */
	imageData: string
	/** Image width in pixels */
	width: number
	/** Image height in pixels */
	height: number
}

// ============================================
// CAMERA SESSION & PREVIEW API
// ============================================

/**
 * A camera session returned by openCamera()
 */
export interface CameraSession {
	/** Session ID for correlating preview/overlay messages */
	sessionId: string
	/** Promise that resolves when user captures or cancels */
	result: Promise<CameraCaptureResult | undefined>
}

/**
 * Options for camera preview streaming
 */
export interface CameraPreviewOptions {
	/** Preview frame width (default: 320) */
	width?: number
	/** Preview frame height (default: 240) */
	height?: number
	/** Frames per second (default: 5) */
	fps?: number
}

/**
 * Preview frame data received from shell
 */
export interface CameraPreviewFrameData {
	/** Session ID */
	sessionId: string
	/** Frame sequence number */
	seq: number
	/** Base64-encoded JPEG image */
	imageData: string
	/** Frame width */
	width: number
	/** Frame height */
	height: number
}

/**
 * Overlay item to render on camera preview
 */
export interface OverlayItemData {
	type: 'polygon' | 'polyline' | 'rect' | 'circle' | 'text'
	/** Normalized 0-1 coordinates */
	points?: [number, number][]
	stroke?: string
	strokeWidth?: number
	fill?: string
	confidence?: number
}

// ============================================
// EMBED API
// ============================================

/**
 * Result from embed open request
 */
export interface EmbedOpenResult {
	/** URL to load in the embedded iframe */
	embedUrl: string
	/** Nonce for pending registration lookup */
	nonce: string
	/** Real resource ID (ownerTag:fileId) for correct WebSocket routing */
	resId?: string
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
// SETTINGS API
// ============================================

/**
 * Settings API for sandboxed apps
 *
 * Provides access to server-side settings via the message bus.
 * The shell enforces scope filtering so apps can only access
 * settings under their own `app.<appName>.*` prefix.
 */
export interface SettingsApi {
	/**
	 * Get a setting value by key
	 */
	get<T = unknown>(key: string): Promise<T | undefined>

	/**
	 * Set a setting value by key
	 */
	set(key: string, value: unknown): Promise<void>

	/**
	 * List settings with optional prefix filter
	 */
	list(prefix?: string): Promise<Array<{ key: string; value: unknown }>>
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
	private isEmbed = false
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

	/** Launch params as serialized query string */
	get params(): string | undefined {
		return this.state.params
	}

	/** Launch params parsed as URLSearchParams for convenient access */
	get parsedParams(): URLSearchParams {
		return new URLSearchParams(this.state.params || '')
	}

	/** Whether this app is running as an embedded document (nested iframe) */
	get embedded(): boolean {
		return this.isEmbed
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

		this.config.contextName = `AppBus:${appName}`

		// Detect embed context and extract auth resId from hash
		const hashContent = window.location.hash.slice(1)
		const embedIdx = hashContent.indexOf(':_embed:')
		let resId: string | undefined
		if (embedIdx !== -1) {
			// New format: ownerTag:fileId:_embed:nonce
			this.isEmbed = true
			resId = hashContent.slice(embedIdx + 1) // "_embed:nonce"
		} else if (hashContent.startsWith('_embed:')) {
			// Legacy format: _embed:nonce (no real resId)
			this.isEmbed = true
			resId = hashContent
		} else {
			resId = hashContent || undefined
		}
		this.log('Initializing', this.isEmbed ? '(embed mode)' : '')

		// Set up the single message listener
		this.messageListener = this.handleMessage.bind(this)
		window.addEventListener('message', this.messageListener)

		// Set up internal handlers for pushed messages
		this.setupInternalHandlers()

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
				displayName: initData.displayName,
				navState: initData.navState,
				ancestors: initData.ancestors,
				params: initData.params
			}

			// Apply theme to document
			this.applyTheme()
		}

		this.initialized = true
		this.log('Initialized with state:', this.state)

		// Notify shell that auth initialization is complete
		this.notifyReady('auth')

		// Fire viewStateSet handler if navState was provided during init
		if (this.state.navState && this.viewStateHandler) {
			this.viewStateHandler(this.state.navState)
		}

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
				displayName: msg.payload.displayName,
				navState: msg.payload.navState,
				ancestors: msg.payload.ancestors,
				params: msg.payload.params
			}
			this.applyTheme()
			this.initialized = true
			this.log('Initialized via push')

			// Fire viewStateSet handler if navState was provided
			if (this.state.navState && this.viewStateHandler) {
				this.viewStateHandler(this.state.navState)
			}

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

		// Handle document picker result push from shell
		this.on('doc:pick.result', (msg: DocPickResultPush) => {
			this.handleDocPickResult(msg)
		})

		// Handle camera capture result push from shell
		this.on('camera:capture.result', (msg: CameraCaptureResultPush) => {
			this.handleCameraCaptureResult(msg)
		})

		// Handle share link creation result push from shell
		this.on('share:create.result', (msg: ShareCreateResultPush) => {
			this.handleShareCreateResult(msg)
		})

		// Handle camera preview frame push from shell
		this.on('camera:preview.frame', (msg: CameraPreviewFrame) => {
			this.previewFrameCallback?.(msg.payload)
		})

		// Handle view state set from parent/shell
		this.on('embed:viewstate.set', (msg: EmbedViewStateSet) => {
			this.log('Received viewstate.set:', msg.payload.viewState)
			this.viewStateHandler?.(msg.payload.viewState)
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
		// Always send to parent. For top-level apps, parent is the shell.
		// For nested embeds, parent is the host app which relays to the shell.
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

	/**
	 * Notify the shell that an error occurred
	 *
	 * Call this to inform the shell about critical errors (e.g., CRDT connection failures)
	 * so it can display an error overlay instead of showing an empty document.
	 *
	 * @param code - Error code (e.g., 4401 for auth failure)
	 * @param message - Human-readable error message
	 */
	notifyError(code: number, message: string): void {
		this.log('Notifying error:', code, message)
		this.sendToShell({
			cloudillo: true,
			v: PROTOCOL_VERSION,
			type: 'app:error.notify',
			payload: { code, message }
		})
	}

	// ============================================
	// CRDT CLIENT ID
	// ============================================

	/**
	 * Request a reusable Yjs clientId from the shell
	 *
	 * The shell manages a pool of clientIds coordinated via Web Locks
	 * to ensure no two tabs use the same clientId for the same document.
	 * This prevents unbounded growth of Yjs state vectors.
	 *
	 * @param docId - Document ID in format "targetTag:resourceId"
	 * @returns ClientId number, or undefined if unavailable (falls back to random)
	 */
	async requestClientId(docId: string): Promise<number | undefined> {
		if (!this.initialized) {
			throw new Error('AppBus not initialized. Call init() first.')
		}

		this.log('Requesting clientId for:', docId)

		try {
			const data = await this.sendRequest<{ clientId: number }>((id) => {
				this.sendToShell(this.createRequestWithPayload('crdt:clientid.req', id, { docId }))
			})
			this.log('Received clientId:', data?.clientId)
			return data?.clientId
		} catch (err) {
			this.logWarn('Failed to get clientId, will use random:', (err as Error).message)
			return undefined
		}
	}

	// ============================================
	// CRDT CACHE
	// ============================================

	/**
	 * Append a CRDT update to the shell cache and update the clock
	 */
	async crdtCacheAppend(
		docId: string,
		update: Uint8Array,
		clientId: number,
		clock: number
	): Promise<void> {
		await this.sendRequest<void>((id) => {
			this.sendToShell(
				this.createRequestWithPayload('crdt:cache.append.req', id, {
					docId,
					update,
					clientId,
					clock
				})
			)
		})
	}

	/**
	 * Read cached CRDT state for a document
	 */
	async crdtCacheRead(docId: string): Promise<Uint8Array[]> {
		const data = await this.sendRequest<Uint8Array[]>((id) => {
			this.sendToShell(this.createRequestWithPayload('crdt:cache.read.req', id, { docId }))
		})
		return data ?? []
	}

	/**
	 * Compact the CRDT cache for a document
	 */
	async crdtCacheCompact(docId: string, state: Uint8Array, clearDirty?: boolean): Promise<void> {
		await this.sendRequest<void>((id) => {
			this.sendToShell(
				this.createRequestWithPayload('crdt:cache.compact.req', id, {
					docId,
					state,
					clearDirty
				})
			)
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
	// DOCUMENT PICKER
	// ============================================

	// Timeout for ACK (dialog opening confirmation) - 5 seconds
	private static readonly DOC_PICK_ACK_TIMEOUT = 5000

	// Track pending document picker sessions for result correlation
	private pendingDocSessions = new Map<
		string,
		{
			resolve: (result: DocPickResult | undefined) => void
			reject: (error: Error) => void
		}
	>()

	/**
	 * Open the document picker to select a document
	 *
	 * Uses the same ACK + push pattern as pickMedia().
	 *
	 * @param options - Document picker configuration
	 * @returns Promise resolving to selected document or undefined if cancelled
	 */
	async pickDocument(options?: DocPickOptions): Promise<DocPickResult | undefined> {
		if (!this.initialized) {
			throw new Error('AppBus not initialized. Call init() first.')
		}

		this.log('Opening document picker:', options)

		const sessionId = `dp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

		try {
			const ackData = await this.sendRequest<DocPickAck['data']>((id) => {
				this.sendToShell(
					this.createRequestWithPayload('doc:pick.req', id, {
						sessionId,
						fileTp: options?.fileTp,
						contentType: options?.contentType,
						sourceFileId: options?.sourceFileId,
						title: options?.title
					})
				)
			}, AppMessageBus.DOC_PICK_ACK_TIMEOUT)

			if (ackData?.sessionId !== sessionId) {
				this.logWarn(
					'Document picker ACK sessionId mismatch:',
					ackData?.sessionId,
					'vs',
					sessionId
				)
				throw new Error('Session ID mismatch in ACK response')
			}

			this.log('Document picker ACK received, sessionId:', sessionId)

			return new Promise<DocPickResult | undefined>((resolve, reject) => {
				this.pendingDocSessions.set(sessionId, { resolve, reject })
			})
		} catch (error) {
			this.pendingDocSessions.delete(sessionId)
			throw error
		}
	}

	/**
	 * Handle document picker result push from shell
	 */
	private handleDocPickResult(msg: DocPickResultPush): void {
		const sessionId = msg.payload.sessionId
		const pending = this.pendingDocSessions.get(sessionId)

		if (!pending) {
			this.logWarn('Received document picker result for unknown session:', sessionId)
			return
		}

		this.pendingDocSessions.delete(sessionId)

		if (msg.payload.selected && msg.payload.fileId) {
			this.log('Document picker result:', msg.payload)
			pending.resolve({
				fileId: msg.payload.fileId,
				fileName: msg.payload.fileName || '',
				contentType: msg.payload.contentType || '',
				fileTp: msg.payload.fileTp,
				appId: msg.payload.appId
			})
		} else {
			this.log('Document picker cancelled')
			pending.resolve(undefined)
		}
	}

	// ============================================
	// EMBED API
	// ============================================

	/**
	 * Request an embed URL for a nested document
	 *
	 * The shell will obtain a scoped token via cross-document token exchange,
	 * generate a nonce, and return an embed URL for loading the target document.
	 *
	 * @param options - Embed configuration
	 * @returns Promise resolving to embed URL and nonce
	 */
	async requestEmbed(options: {
		targetFileId: string
		targetContentType: string
		sourceFileId: string
		access?: 'read' | 'write'
		navState?: string
		params?: string
	}): Promise<EmbedOpenResult> {
		if (!this.initialized) {
			throw new Error('AppBus not initialized. Call init() first.')
		}

		this.log('Requesting embed:', options)

		const ancestors = [...(this.state.ancestors || []), options.sourceFileId]

		const data = await this.sendRequest<EmbedOpenRes['data']>((id) => {
			this.sendToShell(
				this.createRequestWithPayload('embed:open.req', id, {
					targetFileId: options.targetFileId,
					targetContentType: options.targetContentType,
					sourceFileId: options.sourceFileId,
					access: options.access,
					navState: options.navState,
					params: options.params,
					ancestors
				})
			)
		})

		if (!data?.embedUrl || !data?.nonce) {
			throw new Error('Invalid embed response: missing embedUrl or nonce')
		}

		return {
			embedUrl: data.embedUrl,
			nonce: data.nonce,
			resId: data.resId
		}
	}

	// ============================================
	// VIEW STATE API
	// ============================================

	private viewStateHandler: ((viewState?: string) => void) | null = null

	/**
	 * Push the current view state to the parent (or shell)
	 *
	 * Call this when the app's view changes (slide navigation, pan/zoom, page change).
	 * For continuous changes (pan/zoom), debounce before calling.
	 *
	 * @param payload - View state data including opaque state string and optional aspect ratio
	 */
	pushViewState(payload: {
		viewState: string
		aspectRatio?: [number, number]
		aspectFixed?: boolean
	}): void {
		this.log('Pushing view state:', payload.viewState)
		this.sendToShell({
			cloudillo: true,
			v: PROTOCOL_VERSION,
			type: 'embed:viewstate.push',
			payload
		})
	}

	/**
	 * Register a handler for incoming view state set requests
	 *
	 * Called when the parent (or shell) wants the app to navigate to a specific state.
	 * The handler receives the opaque view state string to parse and apply.
	 *
	 * @param handler - Function called with the view state string
	 */
	onViewStateSet(handler: (viewState?: string) => void): void {
		this.viewStateHandler = handler
	}

	// ============================================
	// CAMERA CAPTURE
	// ============================================

	private static readonly CAMERA_CAPTURE_ACK_TIMEOUT = 5000

	private pendingCameraSessions = new Map<
		string,
		{
			resolve: (result: CameraCaptureResult | undefined) => void
			reject: (error: Error) => void
		}
	>()

	/**
	 * Open the camera to capture an image
	 *
	 * Uses the same ACK + push pattern as pickMedia().
	 *
	 * @param options - Camera capture configuration
	 * @returns Promise resolving to captured image data or undefined if cancelled
	 */
	async captureCamera(options?: CameraCaptureOptions): Promise<CameraCaptureResult | undefined> {
		if (!this.initialized) {
			throw new Error('AppBus not initialized. Call init() first.')
		}

		this.log('Opening camera capture:', options)

		const sessionId = `cc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

		try {
			const ackData = await this.sendRequest<CameraCaptureAck['data']>((id) => {
				this.sendToShell(
					this.createRequestWithPayload('camera:capture.req', id, {
						sessionId,
						facing: options?.facing,
						maxResolution: options?.maxResolution
					})
				)
			}, AppMessageBus.CAMERA_CAPTURE_ACK_TIMEOUT)

			if (ackData?.sessionId !== sessionId) {
				this.logWarn(
					'Camera capture ACK sessionId mismatch:',
					ackData?.sessionId,
					'vs',
					sessionId
				)
				throw new Error('Session ID mismatch in ACK response')
			}

			this.log('Camera capture ACK received, sessionId:', sessionId)

			return new Promise<CameraCaptureResult | undefined>((resolve, reject) => {
				this.pendingCameraSessions.set(sessionId, { resolve, reject })
			})
		} catch (error) {
			this.pendingCameraSessions.delete(sessionId)
			throw error
		}
	}

	/**
	 * Open the camera and return a session handle
	 *
	 * Unlike captureCamera(), this returns immediately after ACK with a session
	 * object that allows starting preview streaming before the user captures.
	 *
	 * @param options - Camera capture configuration
	 * @returns Promise resolving to a CameraSession with sessionId and result promise
	 */
	async openCamera(options?: CameraCaptureOptions): Promise<CameraSession> {
		if (!this.initialized) {
			throw new Error('AppBus not initialized. Call init() first.')
		}

		this.log('Opening camera:', options)

		const sessionId = `cc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

		const ackData = await this.sendRequest<CameraCaptureAck['data']>((id) => {
			this.sendToShell(
				this.createRequestWithPayload('camera:capture.req', id, {
					sessionId,
					facing: options?.facing,
					maxResolution: options?.maxResolution
				})
			)
		}, AppMessageBus.CAMERA_CAPTURE_ACK_TIMEOUT)

		if (ackData?.sessionId !== sessionId) {
			throw new Error('Session ID mismatch in ACK response')
		}

		this.log('Camera ACK received, sessionId:', sessionId)

		const result = new Promise<CameraCaptureResult | undefined>((resolve, reject) => {
			this.pendingCameraSessions.set(sessionId, { resolve, reject })
		})

		return { sessionId, result }
	}

	// ============================================
	// CAMERA PREVIEW
	// ============================================

	private previewFrameCallback: ((frame: CameraPreviewFrameData) => void) | null = null

	/**
	 * Start receiving preview frames for a camera session
	 */
	startCameraPreview(sessionId: string, options?: CameraPreviewOptions): void {
		this.log('Starting camera preview:', sessionId)
		this.sendToShell({
			cloudillo: true,
			v: PROTOCOL_VERSION,
			type: 'camera:preview.start',
			payload: {
				sessionId,
				width: options?.width,
				height: options?.height,
				fps: options?.fps
			}
		})
	}

	/**
	 * Stop receiving preview frames for a camera session
	 */
	stopCameraPreview(sessionId: string): void {
		this.log('Stopping camera preview:', sessionId)
		this.sendToShell({
			cloudillo: true,
			v: PROTOCOL_VERSION,
			type: 'camera:preview.stop',
			payload: { sessionId }
		})
	}

	/**
	 * Register a callback for incoming preview frames
	 */
	onCameraPreviewFrame(callback: ((frame: CameraPreviewFrameData) => void) | null): void {
		this.previewFrameCallback = callback
	}

	/**
	 * Send overlay shapes to render on camera preview
	 */
	sendCameraOverlay(sessionId: string, frameSeq: number, overlays: OverlayItemData[]): void {
		this.sendToShell({
			cloudillo: true,
			v: PROTOCOL_VERSION,
			type: 'camera:overlay.update',
			payload: { sessionId, frameSeq, overlays }
		})
	}

	/**
	 * Handle camera capture result push from shell
	 */
	private handleCameraCaptureResult(msg: CameraCaptureResultPush): void {
		const sessionId = msg.payload.sessionId
		const pending = this.pendingCameraSessions.get(sessionId)

		if (!pending) {
			this.logWarn('Received camera capture result for unknown session:', sessionId)
			return
		}

		this.pendingCameraSessions.delete(sessionId)

		if (msg.payload.captured && msg.payload.imageData) {
			this.log('Camera capture result received')
			pending.resolve({
				imageData: msg.payload.imageData,
				width: msg.payload.width || 0,
				height: msg.payload.height || 0
			})
		} else {
			this.log('Camera capture cancelled')
			pending.resolve(undefined)
		}
	}

	// ============================================
	// COMPASS / SENSOR API
	// ============================================

	private compassCallback: ((heading: number, absolute: boolean) => void) | null = null

	/**
	 * Subscribe to compass heading updates from the shell
	 *
	 * The shell reads the device orientation sensor (which is blocked
	 * inside sandboxed iframes) and pushes heading data via the message bus.
	 *
	 * @param callback - Called with heading (degrees, 0=N clockwise) and absolute flag
	 */
	async subscribeCompass(callback: (heading: number, absolute: boolean) => void): Promise<void> {
		if (!this.initialized) {
			throw new Error('AppBus not initialized. Call init() first.')
		}

		this.compassCallback = callback

		// Register the push handler (idempotent — replaces previous)
		this.on('sensor:compass.push', (msg: SensorCompassPush) => {
			this.compassCallback?.(msg.payload.heading, msg.payload.absolute)
		})

		await this.sendRequest((id) => {
			this.sendToShell(
				this.createRequestWithPayload('sensor:compass.sub', id, { enabled: true })
			)
		})

		this.log('Compass subscribed')
	}

	/**
	 * Unsubscribe from compass heading updates
	 */
	async unsubscribeCompass(): Promise<void> {
		if (!this.initialized) {
			throw new Error('AppBus not initialized. Call init() first.')
		}

		this.compassCallback = null

		await this.sendRequest((id) => {
			this.sendToShell(
				this.createRequestWithPayload('sensor:compass.sub', id, { enabled: false })
			)
		})

		this.log('Compass unsubscribed')
	}

	// ============================================
	// SETTINGS API
	// ============================================

	/**
	 * Settings API for the app
	 *
	 * Provides access to server-side settings via the shell.
	 * The shell enforces scope filtering: apps can only access
	 * settings under their own `app.<appName>.*` prefix.
	 */
	readonly settings: SettingsApi = {
		get: async <T = unknown>(key: string): Promise<T | undefined> => {
			if (!this.initialized) {
				throw new Error('AppBus not initialized. Call init() first.')
			}

			this.log('Settings get:', key)

			const data = await this.sendRequest<SettingsGetRes['data']>((id) => {
				this.sendToShell(this.createRequestWithPayload('settings:get.req', id, { key }))
			})

			return data as T | undefined
		},

		set: async (key: string, value: unknown): Promise<void> => {
			if (!this.initialized) {
				throw new Error('AppBus not initialized. Call init() first.')
			}

			this.log('Settings set:', key)

			await this.sendRequest((id) => {
				this.sendToShell(
					this.createRequestWithPayload('settings:set.req', id, { key, value })
				)
			})
		},

		list: async (prefix?: string): Promise<Array<{ key: string; value: unknown }>> => {
			if (!this.initialized) {
				throw new Error('AppBus not initialized. Call init() first.')
			}

			this.log('Settings list:', prefix)

			const data = await this.sendRequest<Array<{ key: string; value: unknown }>>((id) => {
				this.sendToShell(
					this.createRequestWithPayload('settings:list.req', id, {
						...(prefix !== undefined && { prefix })
					})
				)
			})

			return data ?? []
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
	// SHARE LINK CREATION
	// ============================================

	// Timeout for ACK (dialog opening confirmation) - 5 seconds
	private static readonly SHARE_CREATE_ACK_TIMEOUT = 5000

	// Track pending share link creation sessions for result correlation
	private pendingShareSessions = new Map<
		string,
		{
			resolve: (result: ShareCreateResult | undefined) => void
			reject: (error: Error) => void
		}
	>()

	/**
	 * Request the shell to create a share link for the current document
	 *
	 * Uses ACK + push pattern:
	 * 1. Sends request, waits for ACK (5 second timeout)
	 * 2. Waits indefinitely for result push when user confirms/cancels
	 *
	 * @param options - Share link options
	 * @returns Promise resolving to created share link info or undefined if cancelled
	 */
	async requestShareLink(options?: ShareCreateOptions): Promise<ShareCreateResult | undefined> {
		if (!this.initialized) {
			throw new Error('AppBus not initialized. Call init() first.')
		}

		this.log('Requesting share link creation:', options)

		const sessionId = `sc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

		try {
			const ackData = await this.sendRequest<ShareCreateAck['data']>((id) => {
				this.sendToShell(
					this.createRequestWithPayload('share:create.req', id, {
						sessionId,
						accessLevel: options?.accessLevel,
						description: options?.description,
						expiresAt: options?.expiresAt,
						count: options?.count,
						params: options?.params,
						reuse: options?.reuse
					})
				)
			}, AppMessageBus.SHARE_CREATE_ACK_TIMEOUT)

			if (ackData?.sessionId !== sessionId) {
				this.logWarn(
					'Share create ACK sessionId mismatch:',
					ackData?.sessionId,
					'vs',
					sessionId
				)
				throw new Error('Session ID mismatch in ACK response')
			}

			this.log('Share create ACK received, sessionId:', sessionId)

			return new Promise<ShareCreateResult | undefined>((resolve, reject) => {
				this.pendingShareSessions.set(sessionId, { resolve, reject })
			})
		} catch (error) {
			this.pendingShareSessions.delete(sessionId)
			throw error
		}
	}

	/**
	 * Handle share link creation result push from shell
	 */
	private handleShareCreateResult(msg: ShareCreateResultPush): void {
		const sessionId = msg.payload.sessionId
		const pending = this.pendingShareSessions.get(sessionId)

		if (!pending) {
			this.logWarn('Received share create result for unknown session:', sessionId)
			return
		}

		this.pendingShareSessions.delete(sessionId)

		if (msg.payload.created && msg.payload.refId) {
			this.log('Share link created:', msg.payload)
			pending.resolve({
				created: true,
				refId: msg.payload.refId,
				url: msg.payload.url
			})
		} else {
			this.log('Share link creation cancelled')
			pending.resolve(undefined)
		}
	}

	// ============================================
	// IMPORT DATA
	// ============================================

	/**
	 * Register a handler for import data pushed from the shell
	 *
	 * When the shell creates a document via file conversion (e.g., xlsx → calcillo),
	 * it sends the source file data after CRDT sync. The app should parse the data
	 * and populate the Y.Doc.
	 *
	 * @param handler - Function to process the import data
	 * @returns Cleanup function to unregister the handler
	 */
	onImportData(handler: (payload: ImportDataPush['payload']) => void): () => void {
		this.on('import:data.push', (msg: ImportDataPush) => {
			this.log('Received import data:', msg.payload.sourceMimeType, msg.payload.fileName)
			handler(msg.payload)
		})

		return () => {
			this.off('import:data.push')
		}
	}

	/**
	 * Notify the shell that import processing is complete
	 *
	 * @param success - Whether the import succeeded
	 * @param error - Error message if import failed
	 */
	notifyImportComplete(success: boolean, error?: string): void {
		this.log('Notifying import complete:', success, error)
		this.sendToShell({
			cloudillo: true,
			v: PROTOCOL_VERSION,
			type: 'import:complete.notify',
			payload: { success, error }
		})
	}

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

		// Reject all pending camera capture sessions
		for (const [sessionId, pending] of this.pendingCameraSessions) {
			pending.reject(new Error('AppBus destroyed'))
			this.log('Cancelled pending camera session:', sessionId)
		}
		this.pendingCameraSessions.clear()

		// Reject all pending document picker sessions
		for (const [sessionId, pending] of this.pendingDocSessions) {
			pending.reject(new Error('AppBus destroyed'))
			this.log('Cancelled pending document session:', sessionId)
		}
		this.pendingDocSessions.clear()

		// Reject all pending share link creation sessions
		for (const [sessionId, pending] of this.pendingShareSessions) {
			pending.reject(new Error('AppBus destroyed'))
			this.log('Cancelled pending share session:', sessionId)
		}
		this.pendingShareSessions.clear()

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
