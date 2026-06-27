// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ApiClient, FileView } from '@cloudillo/core'
import { mergeClasses, useApi, useAuth, useDialog, useToast } from '@cloudillo/react'
import { useSetAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'

import { version } from '../../package.json'
import {
	fileViewUpdateAtom,
	useApiContext,
	useContextFromRoute,
	useGuestDocument
} from '../context/index.js'
import { releaseClientIdsForWindow } from '../message-bus/handlers/crdt.js'
import {
	getAccessSuffix,
	offAppTitle,
	onAppError,
	onAppReady,
	onAppTitle
} from '../message-bus/index.js'
import { getShellBus } from '../message-bus/shell-bus.js'
import { documentTitleAtom } from '../title.js'
import { type TrustLevel, useAppConfig } from '../utils.js'
import { AppLoadingIndicator, type LoadingStage } from './AppLoadingIndicator.js'
import { CalendarApp } from './calendar/index.js'
import { ContactsApp } from './contacts/index.js'
import { FeedApp } from './feed.js'
import { FilesApp } from './files.js'
import { GalleryApp } from './gallery.js'
import { MessagesApp } from './messages.js'
import { FileViewerApp } from './viewer/index.js'

async function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(() => resolve(), ms))
}

/**
 * Result of attempting to reconcile an access conflict on a cross-context
 * file via files.refresh. Drives the user-facing handler in ExternalApp.
 */
export type AccessConflict =
	/** Source tombstoned the file (revoked/deleted/unreachable). Show a
	 * reason-specific toast and navigate back to the files list. */
	| { kind: 'broken'; file: FileView }
	/** Refresh returned a lower access level than the user requested.
	 * Prompt to open in read-only; on confirm, re-mount at `granted`. */
	| {
			kind: 'downgraded'
			file: FileView
			requested: 'write' | 'comment'
			granted: 'read' | 'comment'
	  }
	/** files.refresh returned 400 — the file is local-owned, so cross-context
	 * reconciliation doesn't apply. Treat as a plain auth failure. */
	| { kind: 'unsupported' }
	/** Refresh succeeded but reported the same-or-higher access the user
	 * already requested — the original 401/403 is a real auth failure
	 * (token-endpoint issue), not a permissions change. */
	| { kind: 'unchanged' }
	/** Refresh itself threw (network error, etc). */
	| { kind: 'error'; err: unknown }

// In-flight refresh promises keyed by fileId — de-dups concurrent triggers
// (rapid double-click, simultaneous initial-fetch + first-renewal failure).
const inFlightRefreshes = new Map<string, Promise<FileView>>()

function refreshFileDeduped(api: ApiClient, fileId: string): Promise<FileView> {
	const existing = inFlightRefreshes.get(fileId)
	if (existing) return existing
	const p = api.files.refresh(fileId).finally(() => {
		inFlightRefreshes.delete(fileId)
	})
	inFlightRefreshes.set(fileId, p)
	return p
}

function suffixToAccess(suffix: 'R' | 'C' | 'W'): 'read' | 'comment' | 'write' {
	return suffix === 'R' ? 'read' : suffix === 'C' ? 'comment' : 'write'
}

function classifyOutcome(file: FileView, requestedSuffix: 'R' | 'C' | 'W'): AccessConflict {
	// Tombstoned by the source server — broken, regardless of accessLevel.
	if (file.brokenAt) return { kind: 'broken', file }
	const requested = suffixToAccess(requestedSuffix)
	// Backend's refresh sometimes omits accessLevel even when the user retains
	// some access (the row would have been tombstoned otherwise). Fall back to
	// 'read' so we surface as a downgrade rather than a phantom "broken".
	const granted: 'read' | 'comment' | 'write' =
		file.accessLevel === 'read' ||
		file.accessLevel === 'comment' ||
		file.accessLevel === 'write'
			? file.accessLevel
			: 'read'
	const rank = { read: 1, comment: 2, write: 3 } as const
	if (rank[granted] < rank[requested]) {
		// rank[granted] < rank[requested] implies requested ≠ 'read' (nothing
		// outranks 1) and granted ≠ 'write' (nothing is outranked by 3). The
		// casts make those facts explicit for TS.
		return {
			kind: 'downgraded',
			file,
			requested: requested as 'write' | 'comment',
			granted: granted as 'read' | 'comment'
		}
	}
	// Same or higher access — real auth failure (token endpoint should have succeeded).
	return { kind: 'unchanged' }
}

interface MicrofrontendContainerProps {
	className?: string
	app: string
	resId?: string
	appUrl: string
	trust?: TrustLevel | boolean
	access?: 'read' | 'comment' | 'write'
	token?: string // Optional pre-fetched token (for guest access via share links)
	refId?: string // Share link ref ID for guest token refresh
	guestName?: string // Optional guest display name for awareness
	params?: string // Launch params as serialized query string
	onAccessConflict?: (outcome: AccessConflict) => void | Promise<void>
}

/**
 * Normalize trust value to TrustLevel
 * - true → 'trusted' (backwards compatibility)
 * - false/undefined → 'untrusted' (backwards compatibility)
 * - TrustLevel string → as-is
 */
function normalizeTrust(trust: TrustLevel | boolean | undefined): TrustLevel {
	if (trust === true) return 'trusted'
	if (trust === false || trust === undefined) return 'untrusted'
	return trust
}

/**
 * Get iframe sandbox attribute value
 * All trust levels use the same base permissions without 'allow-same-origin'.
 * This gives apps an opaque origin, preventing access to shell's serviceWorker API
 * and protecting the SW encryption key from being read via scriptURL.
 *
 * `allow-popups` lets apps open external links with `window.open` / `<a target>`;
 * `allow-popups-to-escape-sandbox` ensures those popups open as normal windows
 * (not inheriting the app's sandbox), which is what users expect when clicking
 * a link to an external site.
 */
function getSandboxValue(_trust: TrustLevel): string {
	return 'allow-scripts allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox'
}

/**
 * Parse JWT to get expiration timestamp (without verifying signature)
 */
function getTokenExpiry(token: string): number | null {
	try {
		const [, payload] = token.split('.')
		if (!payload) return null
		const decoded = JSON.parse(atob(payload))
		return decoded.exp ? decoded.exp * 1000 : null // convert to ms
	} catch {
		return null
	}
}

// Timeout before showing error state (15 seconds)
const LOADING_TIMEOUT_MS = 15000

export function MicrofrontendContainer({
	className,
	app,
	resId,
	appUrl,
	trust,
	access,
	token: providedToken,
	refId,
	guestName,
	params,
	onAccessConflict
}: MicrofrontendContainerProps) {
	const ref = React.useRef<HTMLIFrameElement>(null)
	const { api } = useApi()
	const [auth] = useAuth()
	const setDocumentTitle = useSetAtom(documentTitleAtom)
	const [url, setUrl] = React.useState<string | undefined>(undefined)
	const [loadingStage, setLoadingStage] = React.useState<LoadingStage>('connecting')
	const [errorMessage, setErrorMessage] = React.useState<string | undefined>(undefined)
	const [errorCode, setErrorCode] = React.useState<number | undefined>(undefined)
	const [retryCount, setRetryCount] = React.useState(0)
	const [, , host, fileId] = (resId || '').match(/^(([a-zA-Z0-9-.]+):)?(.*)$/) || []
	// Extract context from resId (format: "contextIdTag:resource-path")
	const contextIdTag = host || auth?.idTag || api?.idTag
	const trustLevel = normalizeTrust(trust)
	const renewalTimerRef = React.useRef<number | undefined>(undefined)
	const timeoutRef = React.useRef<number | undefined>(undefined)
	// Track the app window for subscription persistence across effect re-runs
	const appWindowRef = React.useRef<Window | null>(null)
	// Track whether we've subscribed to avoid duplicate subscriptions
	const subscribedRef = React.useRef(false)
	// Track whether initial setup is complete (prevents re-running on auth changes)
	const initializedRef = React.useRef(false)
	// Refs for values that change but shouldn't trigger effect re-runs
	// Initialize with current values, updated in effect below
	const authRef = React.useRef(auth)
	const apiRef = React.useRef(api)
	const accessRef = React.useRef(access)
	const contextIdTagRef = React.useRef(contextIdTag)
	const providedTokenRef = React.useRef(providedToken)
	const refIdRef = React.useRef(refId)
	const guestNameRef = React.useRef(guestName)
	const paramsRef = React.useRef(params)
	const onAccessConflictRef = React.useRef(onAccessConflict)
	// Tracks whether we've already dispatched an access-conflict for this mount
	// so a slow refresh + a fast app:error don't both fire dialogs/navigations.
	const conflictDispatchedRef = React.useRef(false)
	// These refs are for callbacks defined below - initialized to null, updated in effect
	const requestTokenRef = React.useRef<(() => Promise<string | undefined>) | null>(null)
	const scheduleRenewalRef = React.useRef<((token: string) => void) | null>(null)

	// Boolean flag that only transitions once (false → true)
	// This prevents effect re-runs on token renewal (api/auth object changes)
	const isReady = !!(api && (auth !== undefined || providedToken))

	// Shared access-conflict reconciliation: calls files.refresh, classifies
	// the result, and dispatches to onAccessConflict. Used from both the
	// token-fetch retry path (when access-token returns 401/403) and the
	// app:error path (when the app reports 4401/4403 — the token mints fine
	// but the backend WebSocket/handler enforces the actual access level).
	const triggerAccessRefresh = React.useCallback(async () => {
		if (conflictDispatchedRef.current) return
		const currentApi = apiRef.current
		if (!currentApi || !fileId) return
		conflictDispatchedRef.current = true
		const accessSuffix = getAccessSuffix(accessRef.current)
		try {
			const updated = await refreshFileDeduped(currentApi, fileId)
			const outcome = classifyOutcome(updated, accessSuffix)
			if (onAccessConflictRef.current) {
				await onAccessConflictRef.current(outcome)
			}
			// `unchanged` means the refresh succeeded but the user's access
			// hasn't actually changed — i.e. a transient/genuine auth failure
			// that may resolve later. Allow the next access blip to retry.
			if (outcome.kind === 'unchanged') {
				conflictDispatchedRef.current = false
			}
		} catch (refreshErr) {
			const status = (refreshErr as { httpStatus?: number })?.httpStatus
			if (status === 400) {
				onAccessConflictRef.current?.({ kind: 'unsupported' })
			} else {
				onAccessConflictRef.current?.({ kind: 'error', err: refreshErr })
				// Refresh itself failed — allow the next blip to retry.
				conflictDispatchedRef.current = false
			}
		}
	}, [fileId])

	// Function to request a new token
	const requestToken = React.useCallback(async () => {
		// Use refs to get latest api/auth after potential renewal
		const currentApi = apiRef.current
		const currentAuth = authRef.current
		if (!currentApi) return undefined

		// Guest token refresh via refId
		if (!currentAuth) {
			const currentRefId = refIdRef.current
			if (!currentRefId) return undefined
			try {
				const res = await currentApi.auth.getAccessTokenByRef(currentRefId, {
					refresh: true
				})
				return res.token
			} catch (err) {
				console.error('[Shell] Guest token refresh failed:', err)
				return undefined
			}
		}

		const accessSuffix = getAccessSuffix(access)

		try {
			const res = await currentApi.auth.getAccessToken({
				scope: `file:${fileId}:${accessSuffix}`
			})
			return res.token
		} catch (err: unknown) {
			// Duck-type check for FetchError with 401 status
			// Don't rely on instanceof which can fail with multiple bundle copies
			const httpStatus = (err as { httpStatus?: number })?.httpStatus
			const isAuthError = httpStatus === 401 || httpStatus === 403

			if (isAuthError) {
				// Wait for token renewal to complete (typically < 1 second)
				await new Promise((resolve) => setTimeout(resolve, 3000))

				// Get the potentially updated api client
				const renewedApi = apiRef.current

				if (renewedApi) {
					try {
						const res = await renewedApi.auth.getAccessToken({
							scope: `file:${fileId}:${accessSuffix}`
						})
						return res.token
					} catch (retryErr) {
						const retryStatus = (retryErr as { httpStatus?: number })?.httpStatus
						if ((retryStatus === 401 || retryStatus === 403) && fileId) {
							// Genuine access conflict — reconcile via refresh.
							await triggerAccessRefresh()
							return undefined
						}
						console.error('[Shell] Retry failed:', retryErr)
					}
				}
			}

			console.error('[Shell] Failed to get access token:', err)
			return undefined
		}
	}, [resId, access]) // Note: api/auth removed from deps, using refs instead

	// Send token update to app via message bus
	const sendTokenToApp = React.useCallback((token: string) => {
		const appWindow = ref.current?.contentWindow
		if (!appWindow) return
		const shellBus = getShellBus()
		shellBus?.sendTokenUpdate(appWindow, token)
	}, [])

	// Schedule proactive token renewal at 80% of lifetime
	const scheduleRenewal = React.useCallback(
		(token: string) => {
			const expiry = getTokenExpiry(token)
			if (!expiry) return

			const now = Date.now()
			const remaining = expiry - now
			if (remaining <= 0) return

			const renewAt = remaining * 0.8

			if (renewalTimerRef.current) {
				clearTimeout(renewalTimerRef.current)
			}

			renewalTimerRef.current = window.setTimeout(async () => {
				const newToken = await requestToken()
				if (newToken) {
					sendTokenToApp(newToken)
					scheduleRenewal(newToken)
				}
			}, renewAt)
		},
		[requestToken, sendTokenToApp]
	)

	// Keep refs updated with latest values
	// This effect runs on every render to ensure refs always have current values
	React.useEffect(() => {
		authRef.current = auth
		apiRef.current = api
		accessRef.current = access
		contextIdTagRef.current = contextIdTag
		providedTokenRef.current = providedToken
		refIdRef.current = refId
		guestNameRef.current = guestName
		paramsRef.current = params
		onAccessConflictRef.current = onAccessConflict
		requestTokenRef.current = requestToken
		scheduleRenewalRef.current = scheduleRenewal
	})

	// Cleanup timers on unmount
	React.useEffect(() => {
		return () => {
			if (renewalTimerRef.current) {
				clearTimeout(renewalTimerRef.current)
			}
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current)
			}
		}
	}, [])

	// Retry handler
	const handleRetry = React.useCallback(() => {
		setLoadingStage('connecting')
		setErrorMessage(undefined)
		setErrorCode(undefined)
		setRetryCount((c) => c + 1)
		// Reset the iframe src to trigger reload
		if (ref.current) {
			const currentSrc = ref.current.src
			ref.current.src = ''
			setTimeout(() => {
				if (ref.current) {
					ref.current.src = currentSrc
				}
			}, 100)
		}
	}, [])

	React.useEffect(
		function onLoad() {
			// Skip if already initialized (prevents re-running on auth/api changes)
			// Only re-run when core structure changes (app, resId, retry)
			if (initializedRef.current) {
				return
			}

			// Allow loading if we have auth OR a provided token (for guest share links)
			// Use refs for values that change but shouldn't trigger re-runs
			const currentApi = apiRef.current
			const currentAuth = authRef.current
			const currentProvidedToken = providedTokenRef.current
			const currentAccess = accessRef.current
			const currentContextIdTag = contextIdTagRef.current
			const currentRefId = refIdRef.current
			const currentGuestName = guestNameRef.current
			const currentRequestToken = requestTokenRef.current
			const _currentScheduleRenewal = scheduleRenewalRef.current

			if (
				currentApi &&
				(currentAuth !== undefined || currentProvidedToken) &&
				currentRequestToken
			) {
				// Mark as initialized to prevent re-running
				initializedRef.current = true

				// Reset loading stage on mount or retry
				setLoadingStage('connecting')

				// Use provided token if available, otherwise fetch one
				const apiPromise = currentProvidedToken
					? Promise.resolve({ token: currentProvidedToken })
					: currentRequestToken().then((token) => ({ token }))

				const shellBus = getShellBus()

				// Set pending registration BEFORE loading iframe
				// This ensures token/refId is available when auth:init.req arrives
				if (shellBus && resId) {
					shellBus.setPendingRegistration(resId, {
						token: currentProvidedToken,
						refId: currentRefId,
						access: currentAccess || 'write',
						idTag: currentAuth?.idTag || currentContextIdTag,
						displayName: currentGuestName,
						params: paramsRef.current
					})
				}

				// Set timeout for error state
				timeoutRef.current = window.setTimeout(() => {
					setLoadingStage('error')
				}, LOADING_TIMEOUT_MS)

				// Store iframe element reference for cleanup
				const iframeElement = ref.current

				// Define handler as named function for removal
				const onMicrofrontendLoad = async function () {
					// Pre-register app with resId on load (also updates if already registered)
					// Note: contentWindow changes when src is set, so we must get it here
					const currentShellBus = getShellBus()
					const currentAppWindow = ref.current?.contentWindow

					if (!currentShellBus || !currentAppWindow) {
						console.error('[Shell] Failed to initialize app: no shell bus or window')
						setLoadingStage('error')
						if (timeoutRef.current) {
							clearTimeout(timeoutRef.current)
						}
						return
					}

					// Store the window reference for subscription persistence
					appWindowRef.current = currentAppWindow

					// Subscribe to ready notifications from the app
					// Use refs to ensure subscription persists across effect re-runs
					if (!subscribedRef.current) {
						subscribedRef.current = true
						onAppReady(currentAppWindow, (_window, _stage) => {
							// Clear timeout when app reports any ready stage
							if (timeoutRef.current) {
								clearTimeout(timeoutRef.current)
								timeoutRef.current = undefined
							}

							// Any ready notification means the app is functional
							// 'auth' = auth complete, 'synced' = CRDT synced, 'ready' = fully ready
							setLoadingStage('ready')
							// Don't unsubscribe - keep subscription active for potential reconnection scenarios
						})
						onAppError(currentAppWindow, (_window, code, message) => {
							// Clear timeout since we have a definitive error
							if (timeoutRef.current) {
								clearTimeout(timeoutRef.current)
								timeoutRef.current = undefined
							}
							// 4401/4403 = app-level auth/forbidden (e.g. CRDT WS
							// rejected the token's scope). The access-token
							// endpoint can succeed while the resource handler
							// later rejects, so this is the second chokepoint
							// where we must reconcile via files.refresh.
							const isAuthError =
								code === 4401 || code === 4403 || code === 401 || code === 403
							if (isAuthError && fileId) {
								// Fire-and-forget — handler will show toast/dialog/navigate.
								void triggerAccessRefresh()
								return
							}
							setErrorCode(code)
							setErrorMessage(message)
							setLoadingStage('error')
						})
						// App title push: the app takes over title management. An
						// explicit `title` replaces the file name; when omitted the
						// current title is kept and only the dirty flag updates.
						onAppTitle(currentAppWindow, (_window, title, dirty) => {
							if (!resId) return
							setDocumentTitle((prev) => {
								const sameRes = prev.resId === resId
								return {
									resId,
									title: title ?? (sameRes ? prev.title : undefined),
									dirty,
									appManaged: true
								}
							})
						})
					}

					// Read latest values from refs for pre-registration
					const latestAccess = accessRef.current
					const latestAuth = authRef.current
					const latestProvidedToken = providedTokenRef.current
					const latestRefId = refIdRef.current

					// Pre-register/update with Window reference now that we have it
					currentShellBus.preRegisterApp(currentAppWindow, {
						appName: app,
						resId,
						idTag: latestAuth?.idTag || contextIdTagRef.current,
						access: latestAccess || 'write',
						token: latestProvidedToken,
						refId: latestRefId,
						displayName: guestNameRef.current,
						params: paramsRef.current
					})

					await delay(100) // Wait for app JavaScript to initialize

					try {
						const res = await apiPromise
						// Re-read latest auth values for initApp (may have been renewed)
						const latestGuestName = guestNameRef.current
						const latestScheduleRenewal = scheduleRenewalRef.current

						currentShellBus.initApp(currentAppWindow, {
							appName: app,
							idTag: latestAuth?.idTag || contextIdTagRef.current,
							tnId: latestAuth?.tnId,
							roles: latestAuth?.roles,
							darkMode: document.body.classList.contains('dark'),
							token: res.token,
							access: latestAccess || 'write',
							resId,
							displayName: latestGuestName,
							params: paramsRef.current
						})
						// Schedule proactive token renewal
						if (res.token && latestScheduleRenewal) {
							latestScheduleRenewal(res.token)
						}
					} catch (err) {
						console.error('[Shell] Failed to initialize app:', err)
						currentShellBus.initApp(currentAppWindow, {
							appName: app,
							darkMode: document.body.classList.contains('dark')
						})
					}

					// Note: We no longer use fixed delay - we wait for app:ready.notify
				}

				iframeElement?.addEventListener('load', onMicrofrontendLoad)
				setUrl(`${appUrl}?v=${version}#${resId}`)

				// Cleanup on unmount or when core dependencies change (app, resId, retryCount)
				return () => {
					// Remove load event listener
					iframeElement?.removeEventListener('load', onMicrofrontendLoad)

					// Release any Yjs clientId locks held by this app
					const appWindow = appWindowRef.current
					if (appWindow) {
						releaseClientIdsForWindow(appWindow)
						offAppTitle(appWindow)
					}

					// Clean up subscription and initialization state when effect truly re-runs
					// (component unmount or retry, NOT on auth/token changes)
					subscribedRef.current = false
					appWindowRef.current = null
					initializedRef.current = false

					if (timeoutRef.current) {
						clearTimeout(timeoutRef.current)
						timeoutRef.current = undefined
					}
				}
			}
		},
		// Minimal dependencies - only things that require re-creating the iframe/subscription
		// Auth/token changes are handled by token refresh mechanism and refs, not effect re-runs
		// isReady transitions false→true once when api/auth become available, preventing re-runs on token renewal
		[app, appUrl, resId, retryCount, isReady]
	)

	return (
		<div className={mergeClasses('c-app flex-fill pos-relative', trustLevel, className)}>
			<AppLoadingIndicator
				stage={loadingStage}
				onRetry={handleRetry}
				errorMessage={errorMessage}
				errorCode={errorCode}
			/>
			{/* clipboard-read/clipboard-write are required for in-app context-menu */}
			{/* copy/paste (Fortune Sheet and others use the async Clipboard API for menu actions) */}
			<iframe
				ref={ref}
				src={url}
				sandbox={getSandboxValue(trustLevel)}
				allow="clipboard-read; clipboard-write; fullscreen; geolocation; accelerometer; gyroscope; magnetometer"
				allowFullScreen
				className={mergeClasses(
					'pos-absolute top-0 left-0 right-0 bottom-0 z-1',
					className
				)}
				style={{ width: '100%', height: '100%' }}
				autoFocus
			/>
		</div>
	)
}

function ExternalApp({ className }: { className?: string }) {
	const [appConfig] = useAppConfig()
	const [auth] = useAuth()
	const { api } = useApi()
	const { getClientFor } = useApiContext()
	const location = useLocation()
	const navigate = useNavigate()
	const { t } = useTranslation()
	const toast = useToast()
	const dialog = useDialog()
	const setFileViewUpdate = useSetAtom(fileViewUpdateAtom)
	const setDocumentTitle = useSetAtom(documentTitleAtom)
	const { contextIdTag, appId, '*': rest } = useParams()
	const [guestDocument] = useGuestDocument()
	const [forcedAccess, setForcedAccess] = React.useState<
		'read' | 'comment' | 'write' | undefined
	>()
	// Use contextIdTag from URL, fallback to auth idTag
	const idTag = contextIdTag || auth?.idTag || window.location.hostname

	const app = appConfig?.apps.find((a) => a.id === appId)
	const resId = (rest ?? '').indexOf(':') >= 0 ? rest : idTag + ':' + rest

	// Parse access query parameter
	const searchParams = new URLSearchParams(location.search)
	const rawAccess = searchParams.get('access')
	const access: 'read' | 'comment' | 'write' =
		rawAccess === 'comment' && auth
			? 'comment'
			: rawAccess === 'read' || (!auth && rawAccess !== 'write')
				? 'read'
				: 'write'

	// Collect non-access search params as launch params
	const launchParams = new URLSearchParams()
	for (const [k, v] of searchParams) {
		if (k !== 'access') launchParams.set(k, v)
	}
	const paramsStr = launchParams.toString() || undefined

	// Check if this is a guest document navigation and pass the stored token/name
	const isGuestAccess = guestDocument && resId === guestDocument.resId
	const guestToken = isGuestAccess ? guestDocument.token : undefined
	const guestName = isGuestAccess ? guestDocument.guestName : undefined

	const filesListPath = `/app/${contextIdTag || auth?.idTag}/files`

	// Prefetch the file name for an instant breadcrumb title (apps may refine it
	// live via `app:title.push`). Clear on resId change / unmount so list pages
	// show no document segment.
	React.useEffect(() => {
		if (!resId) return
		const colon = resId.indexOf(':')
		const owner = colon >= 0 ? resId.slice(0, colon) : undefined
		const fileId = colon >= 0 ? resId.slice(colon + 1) : resId
		let cancelled = false
		// Owned docs resolve on the current context client; federated docs
		// (explicit owner in the resId) must be fetched from the owner's node.
		const client = owner ? getClientFor(owner, { auth: 'preferred' }) : api
		if (client && fileId) {
			client.files
				.list({ fileId })
				.then((files) => {
					if (cancelled) return
					const file = files[0]
					if (file?.fileName) {
						setDocumentTitle((prev) => {
							// If an app already took over the title for this
							// document, leave it alone.
							if (prev.resId === resId && prev.appManaged) return prev
							return { resId, title: file.fileName }
						})
					}
				})
				.catch((err) => {
					console.error('[ExternalApp] Title prefetch failed:', err)
				})
		}
		return () => {
			cancelled = true
			setDocumentTitle({})
		}
	}, [api, getClientFor, resId, setDocumentTitle])

	const handleAccessConflict = React.useCallback(
		async (outcome: AccessConflict) => {
			if (outcome.kind === 'broken') {
				setFileViewUpdate((prev) => ({
					version: (prev?.version ?? 0) + 1,
					file: outcome.file
				}))
				const reason = outcome.file.brokenReason
				const msg =
					reason === 'revoked'
						? t('This file is no longer shared with you.')
						: reason === 'deleted'
							? t('The owner deleted this file.')
							: reason === 'unreachable'
								? t("The owner's server couldn't be reached.")
								: t('This file is no longer available.')
				toast.error(msg)
				navigate(filesListPath)
				return
			}
			if (outcome.kind === 'downgraded') {
				setFileViewUpdate((prev) => ({
					version: (prev?.version ?? 0) + 1,
					file: outcome.file
				}))
				const confirmed = await dialog.confirm(
					t('Open in read-only mode?'),
					t(
						'Your access to this file changed from {{requested}} to {{granted}}. Open in read-only mode?',
						{
							requested: t(outcome.requested),
							granted: t(outcome.granted)
						}
					)
				)
				if (!confirmed) {
					navigate(filesListPath)
					return
				}
				// Re-mount the container with the lower access via state.
				setForcedAccess(outcome.granted)
				return
			}
			if (outcome.kind === 'unsupported' || outcome.kind === 'unchanged') {
				toast.error(t('Access denied.'))
				return
			}
			// outcome.kind === 'error'
			toast.error(t('Unable to verify file access. Please try again.'))
		},
		[navigate, t, toast, dialog, setFileViewUpdate, filesListPath]
	)

	const effectiveAccess = forcedAccess ?? access

	return (
		!!app && (
			<MicrofrontendContainer
				key={forcedAccess ? `${resId}:${forcedAccess}` : resId}
				className={className}
				app={app.id}
				resId={resId}
				appUrl={`${app.url}`}
				trust={app.trust}
				access={effectiveAccess}
				token={guestToken}
				guestName={guestName}
				params={paramsStr}
				onAccessConflict={handleAccessConflict}
			/>
		)
	)
}

function PlaceHolder({ title }: { title: string }) {
	return <h1>{title}</h1>
}

export function AppRoutes() {
	// Sync URL context with active context state
	useContextFromRoute()

	return (
		<Routes>
			<Route path="/" element={<PlaceHolder title="Home" />} />
			{/* Context-aware routes */}
			<Route path="/app/:contextIdTag/files" element={<FilesApp />} />
			<Route path="/app/:contextIdTag/feed" element={<FeedApp />} />
			<Route path="/app/:contextIdTag/gallery" element={<GalleryApp />} />
			<Route path="/app/:contextIdTag/messages/:convId?" element={<MessagesApp />} />
			<Route path="/app/:contextIdTag/contacts" element={<ContactsApp />} />
			<Route path="/app/:contextIdTag/calendar" element={<CalendarApp />} />
			<Route path="/app/:contextIdTag/view/:resId" element={<FileViewerApp />} />
			<Route
				path="/app/:contextIdTag/:appId/*"
				element={<ExternalApp className="w-100 h-100" />}
			/>
			{/* Legacy routes (redirect to context-aware routes) */}
			<Route path="/app/files" element={<FilesApp />} />
			<Route path="/app/feed" element={<FeedApp />} />
			<Route path="/app/gallery" element={<GalleryApp />} />
			<Route path="/app/messages/:convId?" element={<MessagesApp />} />
			<Route path="/app/contacts" element={<ContactsApp />} />
			<Route path="/app/calendar" element={<CalendarApp />} />
			<Route path="/app/view/:resId" element={<FileViewerApp />} />
			<Route path="/app/:appId/*" element={<ExternalApp className="w-100 h-100" />} />
			<Route path="/*" element={null} />
		</Routes>
	)
}

// vim: ts=4
