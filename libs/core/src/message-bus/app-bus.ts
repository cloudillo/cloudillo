// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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

import { setApiToken } from '../api-registry.js'
import { randomId } from '../utils.js'
import { MessageBusBase, type MessageBusConfig } from './core.js'
import { validateMessage } from './registry.js'
import {
	type AppReadyStage,
	type AuthInitPush,
	type AuthInitRes,
	type AuthTokenPush,
	type AuthTokenRefreshRes,
	type CameraCaptureAck,
	type CameraCaptureResultPush,
	type CameraPreviewFrame,
	type CloudilloMessage,
	type CropAspect,
	type DocInfo,
	type DocInfoPush,
	type DocInfoRes,
	type DocPickAck,
	type DocPickResultPush,
	type DocRenameRes,
	type EmbedOpenRes,
	type EmbedViewStateSet,
	type ImportDataPush,
	type MediaPickAck,
	type MediaPickResultPush,
	PROTOCOL_VERSION,
	type SensorCompassPush,
	type SettingsGetRes,
	type ShareCreateAck,
	type ShareCreateResultPush,
	type SiteMountRes,
	type SitePublishRes,
	type StorageOp,
	type StorageOpRes,
	type ThemeUpdate,
	type Visibility
} from './types.js'

// ============================================
// APP STATE
// ============================================

/**
 * Application state received from shell
 */
export interface AppState {
	/** User identity tag */
	idTag?: string
	/**
	 * Whether a real user is signed in to the shell.
	 *
	 * NOT derivable from `idTag`: for a share-link guest the shell falls back to
	 * the context (i.e. the document owner's) tag, so `idTag` is set for an
	 * anonymous visitor too. Anything that PUBLISHES an identity — presence above
	 * all — must gate on this, not on `idTag`.
	 */
	authenticated?: boolean
	/** Tenant ID */
	tnId?: number
	/** User roles */
	roles?: string[]
	/** Current access token */
	accessToken?: string
	/** Access level (read or write) */
	access: 'read' | 'comment' | 'write'
	/** Dark mode enabled */
	darkMode: boolean
	/** UI language code (e.g. 'en', 'hu') */
	language?: string
	/** Token lifetime in seconds */
	tokenLifetime?: number
	/** Theme name */
	theme: string
	/** Display name for anonymous guests (used in awareness) */
	displayName?: string
	/**
	 * Resource this app instance was launched for, as '<ownerTag>:<fileId>'.
	 * Taken from the location hash at init — in an embed the hash also carries the
	 * '_embed:<nonce>' auth handshake key, which is stripped off here so this stays
	 * the real document. Read via `bus.resId` / `bus.fileId` / `bus.ownerTag`.
	 */
	resId?: string
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
	 * Site sources only: refuse anything that is not Public, and offer to make it
	 * public rather than to share it with the document
	 */
	requirePublic?: boolean
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
	/** Site sources only: refuse anything that is not Public — see MediaPickOptions */
	requirePublic?: boolean
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
	accessLevel?: 'read' | 'comment' | 'write'
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

/** What an app's location hash says about the document it was launched for. */
export interface ParsedAppHash {
	isEmbed: boolean
	/** '<ownerTag>:<fileId>', or undefined for a legacy embed that carries none. */
	resId?: string
	/** '_embed:<nonce>' — the key the shell registered the pending embed under. */
	embedAuthKey?: string
}

/**
 * Split an app's location hash into the document it addresses and the embed
 * handshake key, if any.
 *
 * Exported because `useDocBar` in `@cloudillo/react` must answer "are we in an
 * embed?" during its FIRST render, before `init()` has run — `AppMessageBus.embedded`
 * is still false there.
 *
 * @param hash - `window.location.hash`, with or without the leading '#'
 */
export function parseAppHash(hash: string): ParsedAppHash {
	const content = hash.startsWith('#') ? hash.slice(1) : hash
	const embedIdx = content.indexOf(':_embed:')
	// New format: ownerTag:fileId:_embed:nonce
	if (embedIdx !== -1) {
		return {
			isEmbed: true,
			resId: content.slice(0, embedIdx) || undefined,
			embedAuthKey: content.slice(embedIdx + 1)
		}
	}
	// Legacy format: _embed:nonce — no real resId. Leave it undefined so callers
	// fall back deliberately rather than treating '_embed' as an owner tag.
	if (content.startsWith('_embed:')) {
		return { isEmbed: true, embedAuthKey: content }
	}
	return { isEmbed: false, resId: content || undefined }
}

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
	/**
	 * Handshake key for an embed ('_embed:<nonce>'), kept apart from {@link state}.resId
	 * so the app still knows the real document it was launched for.
	 */
	private embedAuthKey?: string
	private messageListener: ((event: MessageEvent) => void) | null = null
	private lastDocInfo: DocInfo | undefined
	private docInfoCallbacks = new Set<(info: DocInfo) => void>()
	private identityCallbacks = new Set<() => void>()
	private themeCallbacks = new Set<(darkMode: boolean) => void>()

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

	/**
	 * Whether a real user is signed in — see {@link AppState.authenticated}.
	 * False for a share-link guest, whose `idTag` is the document owner's.
	 */
	get authenticated(): boolean {
		return !!this.state.authenticated
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
	get access(): 'read' | 'comment' | 'write' {
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

	/** Resource this app was launched for, as '<ownerTag>:<fileId>' */
	get resId(): string | undefined {
		return this.state.resId
	}

	/**
	 * File ID part of {@link resId}. Split on the FIRST colon only — a fileId may
	 * itself contain colons, the owner tag never does.
	 */
	get fileId(): string | undefined {
		const i = this.state.resId?.indexOf(':') ?? -1
		return i > 0 ? this.state.resId?.slice(i + 1) : undefined
	}

	/** Owner tag part of {@link resId} — the tenant serving the document. */
	get ownerTag(): string | undefined {
		const i = this.state.resId?.indexOf(':') ?? -1
		return i > 0 ? this.state.resId?.slice(0, i) : undefined
	}

	/** Last document info pushed by the shell, if any */
	get docInfo(): DocInfo | undefined {
		return this.lastDocInfo
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

		// resId and auth handshake key are separate things: the shell keys the
		// pending embed registration on '_embed:<nonce>', while the app needs the
		// real '<ownerTag>:<fileId>' to address the document's node (profile
		// pictures, file URLs).
		const parsed = parseAppHash(window.location.hash)
		this.isEmbed = parsed.isEmbed
		this.embedAuthKey = parsed.embedAuthKey
		const resId = parsed.resId
		this.state.resId = resId
		this.log('Initializing', this.isEmbed ? '(embed mode)' : '')

		// Set up the single message listener
		this.messageListener = this.handleMessage.bind(this)
		window.addEventListener('message', this.messageListener)

		// Set up internal handlers for pushed messages
		this.setupInternalHandlers()

		// Send init request and wait for response
		const initData = await this.sendRequest<AuthInitRes['data']>((id) => {
			// The shell matches an embed on its handshake key, not on the document
			this.sendToShell(
				this.createRequestWithPayload('auth:init.req', id, {
					appName,
					resId: this.embedAuthKey ?? resId
				})
			)
		})

		// Update state from init response
		if (initData) {
			this.state = {
				idTag: initData.idTag,
				authenticated: !!initData.authenticated,
				tnId: initData.tnId,
				roles: initData.roles,
				accessToken: initData.token,
				access: initData.access || 'write',
				darkMode: !!initData.darkMode,
				language: initData.language,
				tokenLifetime: initData.tokenLifetime,
				theme: initData.theme,
				displayName: initData.displayName,
				resId,
				navState: initData.navState,
				ancestors: initData.ancestors,
				params: initData.params
			}

			// Apply theme to document
			this.applyTheme()
			this.syncApiToken()
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
			const before = this.state
			this.state = {
				idTag: msg.payload.idTag,
				authenticated: !!msg.payload.authenticated,
				tnId: msg.payload.tnId,
				roles: msg.payload.roles,
				accessToken: msg.payload.token,
				access: msg.payload.access || 'write',
				darkMode: !!msg.payload.darkMode,
				language: msg.payload.language,
				tokenLifetime: msg.payload.tokenLifetime,
				theme: msg.payload.theme,
				displayName: msg.payload.displayName,
				// Derived from the location hash, not sent by the shell — carry it over
				resId: this.state.resId,
				navState: msg.payload.navState,
				ancestors: msg.payload.ancestors,
				params: msg.payload.params
			}
			this.applyTheme()
			this.syncApiToken()
			this.initialized = true
			this.log('Initialized via push')

			// A re-init can change WHO we are (sign-in, context switch, a guest
			// link opened in a signed-in session). Anything that published the
			// old identity has to hear about it.
			if (
				before.idTag !== this.state.idTag ||
				before.authenticated !== this.state.authenticated ||
				before.displayName !== this.state.displayName
			) {
				for (const cb of this.identityCallbacks) {
					try {
						cb()
					} catch (err) {
						this.logWarn('Identity callback failed:', (err as Error).message)
					}
				}
			}

			// The push rebuilds state wholesale, so it can carry a theme flip too.
			if (before.darkMode !== this.state.darkMode) this.emitThemeChange()

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
			this.syncApiToken()
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

		// Handle live theme changes broadcast by the shell
		this.on('theme:update', (msg: ThemeUpdate) => {
			const before = this.state.darkMode
			this.state.darkMode = msg.payload.darkMode
			this.applyTheme()
			if (before !== this.state.darkMode) this.emitThemeChange()
			this.log('Theme updated, darkMode:', msg.payload.darkMode)
		})

		// Registered on the bus rather than in a component: the shell's first push
		// races React mount, so the cached value is load-bearing for late subscribers.
		this.on('doc:info.push', (msg: DocInfoPush) => {
			this.lastDocInfo = msg.payload
			for (const cb of this.docInfoCallbacks) {
				try {
					cb(msg.payload)
				} catch (err) {
					this.logWarn('docInfo callback threw:', err)
				}
			}
		})
	}

	/**
	 * Mirror the bus's current token into the process-wide ApiClient registry, so
	 * `useApi()` (libs/react) hands app code an authenticated client. The bus owns
	 * that entry app-side, as the shell's boot/auth flow owns the home entry (see
	 * api-registry.ts). Call wherever `accessToken` changes.
	 *
	 * No explicit expiry: the shell derives every `tokenLifetime` it sends from the
	 * token's own `exp`, so `setAuthToken` reading `exp` gets the same answer
	 * without the rounding.
	 */
	private syncApiToken(): void {
		if (!this.state.idTag) return
		setApiToken(this.state.idTag, this.state.accessToken)
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
		// A nested embedded iframe can postMessage to window.parent, i.e. to this
		// bus — and `auth:init.push` replaces idTag + accessToken wholesale. Only
		// the shell (or, for an embed, the relaying host) is upstream, and both are
		// `window.parent`.
		if (event.source !== window.parent) return

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
			this.syncApiToken()
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

	/**
	 * Push document title / dirty state to the shell header breadcrumb.
	 *
	 * The shell already shows the file name it pre-fetched. Pass `title` only to
	 * override that (e.g. an in-document heading); pass `undefined` to keep the
	 * file name and just update the dirty flag. `dirty: true` shows a leading
	 * `*` while there are unsaved changes.
	 *
	 * @param title - Override title, or `undefined` to keep the file name
	 * @param opts.dirty - Whether the document has unsaved changes
	 *
	 * @example
	 * bus.setTitle(undefined, { dirty: true })  // keep file name, mark unsaved
	 * bus.setTitle('My heading')                // override the displayed title
	 */
	setTitle(title?: string, opts?: { dirty?: boolean }): void {
		this.log('Setting title:', title, opts)
		this.sendToShell({
			cloudillo: true,
			v: PROTOCOL_VERSION,
			type: 'app:title.push',
			payload: { ...(title !== undefined ? { title } : {}), dirty: opts?.dirty }
		})
	}

	// ============================================
	// DOCUMENT INFO
	// ============================================

	/**
	 * Subscribe to document info from the shell. Fires immediately with the cached
	 * value if one was already pushed, then on every change (rename, pin, access).
	 *
	 * @returns Unsubscribe function
	 */
	onDocInfo(cb: (info: DocInfo) => void): () => void {
		this.docInfoCallbacks.add(cb)
		if (this.lastDocInfo) cb(this.lastDocInfo)
		return () => {
			this.docInfoCallbacks.delete(cb)
		}
	}

	/**
	 * Subscribe to identity changes — `idTag`, `authenticated` or `displayName`
	 * changing on a later `auth:init.push`.
	 *
	 * For apps that publish who they are once at startup and would otherwise keep
	 * broadcasting a stale identity for the rest of the session. React apps reach
	 * it through `useCloudillo`; a plain-DOM app (quillo) subscribes here itself.
	 * Does NOT fire for the initial `init()`.
	 *
	 * @returns Unsubscribe function
	 */
	onIdentityChange(cb: () => void): () => void {
		this.identityCallbacks.add(cb)
		return () => {
			this.identityCallbacks.delete(cb)
		}
	}

	/**
	 * Subscribe to live theme changes — the shell's `theme:update` broadcast, or a
	 * later `auth:init.push` carrying a different `darkMode`.
	 *
	 * `applyTheme()` already flips the `body` classes, so this is for anything that
	 * READ `darkMode` into its own state: an embedded editor's theme prop, a colour
	 * derived in JS. React apps get it through `useCloudillo().darkMode`. Does NOT
	 * fire for the initial `init()`.
	 *
	 * @returns Unsubscribe function
	 */
	onThemeChange(cb: (darkMode: boolean) => void): () => void {
		this.themeCallbacks.add(cb)
		return () => {
			this.themeCallbacks.delete(cb)
		}
	}

	private emitThemeChange(): void {
		for (const cb of this.themeCallbacks) {
			try {
				cb(this.state.darkMode)
			} catch (err) {
				this.logWarn('Theme callback failed:', (err as Error).message)
			}
		}
	}

	/**
	 * Ask the shell for document info. Rarely needed — the shell pushes it
	 * unprompted, so prefer {@link onDocInfo}. This is the recovery path for an
	 * app that missed the push (a late mount, a dropped message).
	 */
	async requestDocInfo(): Promise<DocInfo | undefined> {
		if (!this.initialized) {
			throw new Error('AppBus not initialized. Call init() first.')
		}

		try {
			const data = await this.sendRequest<DocInfoRes['data']>((id) => {
				this.sendToShell(this.createRequest('doc:info.req', id))
			})
			if (data) this.lastDocInfo = data
			return data
		} catch (err) {
			this.logWarn('Failed to get document info:', (err as Error).message)
			return undefined
		}
	}

	/**
	 * Rename the document this app was launched for.
	 *
	 * The target is derived shell-side from the connection's resId, so this
	 * cannot address another file. For a pinned or placed foreign-owned document
	 * it renames the local row, not the origin.
	 */
	async renameDocument(
		fileName: string
	): Promise<{ ok: boolean; fileName?: string; error?: string }> {
		if (!this.initialized) {
			throw new Error('AppBus not initialized. Call init() first.')
		}

		try {
			const data = await this.sendRequest<DocRenameRes['data']>((id) => {
				this.sendToShell(this.createRequestWithPayload('doc:rename.req', id, { fileName }))
			})
			return { ok: true, fileName: data?.fileName }
		} catch (err) {
			const error = (err as Error).message
			this.logWarn('Rename failed:', error)
			return { ok: false, error }
		}
	}

	// No `getProfiles()` here: collaborator profiles are resolved by the app itself
	// against the DOCUMENT's node (`api.profiles.getBatch()` with `bus.ownerTag`
	// and `bus.accessToken`). A shell round-trip could only answer from the
	// viewer's own mirror, which has never heard of a stranger collaborating on a
	// foreign-hosted document.

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
		clock: number,
		offline: boolean
	): Promise<void> {
		await this.sendRequest<void>((id) => {
			this.sendToShell(
				this.createRequestWithPayload('crdt:cache.append.req', id, {
					docId,
					update,
					clientId,
					clock,
					offline
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
		const sessionId = `mp-${Date.now()}-${randomId(9)}`

		// Phase 1: Send request and wait for ACK (short timeout)
		// This confirms the shell received the request and is opening the dialog
		try {
			const ackData = await this.sendRequest<MediaPickAck['data']>((id) => {
				this.sendToShell(
					this.createRequestWithPayload('media:pick.req', id, {
						sessionId,
						mediaType: options?.mediaType,
						documentVisibility: options?.documentVisibility,
						requirePublic: options?.requirePublic,
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

		const sessionId = `dp-${Date.now()}-${randomId(9)}`

		try {
			const ackData = await this.sendRequest<DocPickAck['data']>((id) => {
				this.sendToShell(
					this.createRequestWithPayload('doc:pick.req', id, {
						sessionId,
						fileTp: options?.fileTp,
						contentType: options?.contentType,
						sourceFileId: options?.sourceFileId,
						requirePublic: options?.requirePublic,
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
		access?: 'read' | 'comment' | 'write'
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

		const sessionId = `cc-${Date.now()}-${randomId(9)}`

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

		const sessionId = `cc-${Date.now()}-${randomId(9)}`

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

		const sessionId = `sc-${Date.now()}-${randomId(9)}`

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
	// SITE PUBLISH
	// ============================================

	// An upload plus a server-side commit, not a round trip to a dialog: the 10s
	// default would time out a container of any size on a slow link.
	private static readonly SITE_PUBLISH_TIMEOUT = 120000

	/**
	 * Hand the shell a finished site container to upload and commit
	 *
	 * The app builds the container because it owns the document format and holds
	 * the RTDB connection; it cannot commit one, because its token is scoped to a
	 * single file. The `Blob` crosses the bus by structured clone — there is no
	 * encoding layer, as with the `Uint8Array` in `crdt:cache.append.req`.
	 *
	 * @param options - The container and the document it was built from
	 * @returns The managed file the container was uploaded as
	 */
	async publishSite(options: {
		blob: Blob
		docFileId: string
	}): Promise<{ containerFileId: string }> {
		if (!this.initialized) {
			throw new Error('AppBus not initialized. Call init() first.')
		}

		this.log('Publishing site container for:', options.docFileId, options.blob.size, 'bytes')

		const data = await this.sendRequest<SitePublishRes['data']>((id) => {
			this.sendToShell(
				this.createRequestWithPayload('site:publish.req', id, {
					blob: options.blob,
					docFileId: options.docFileId
				})
			)
		}, AppMessageBus.SITE_PUBLISH_TIMEOUT)

		if (!data?.containerFileId) {
			throw new Error('Publish returned no container file id')
		}
		return { containerFileId: data.containerFileId }
	}

	/**
	 * Ask where this document is mounted on the site
	 *
	 * The publisher bakes absolute site paths into the container, so it has to
	 * know its mount path before it builds one. The mount table lives behind
	 * `/api/sites`, which a file-scoped token cannot read, so the shell answers.
	 *
	 * A document with no mount row yet is not an error: the answer is then the
	 * default `/` with `mounted: false`, which is the path publishing it would
	 * claim.
	 *
	 * @param options - The document to look up; must be the one the app was opened on
	 * @returns The configured mount path, and whether a row backs it
	 */
	async resolveSiteMount(options: {
		docFileId: string
	}): Promise<{ mountPath: string; mounted: boolean }> {
		if (!this.initialized) {
			throw new Error('AppBus not initialized. Call init() first.')
		}

		const data = await this.sendRequest<SiteMountRes['data']>((id) => {
			this.sendToShell(
				this.createRequestWithPayload('site:mount.req', id, {
					docFileId: options.docFileId
				})
			)
		})

		if (!data?.mountPath) {
			throw new Error('Mount lookup returned no path')
		}
		return { mountPath: data.mountPath, mounted: data.mounted }
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
