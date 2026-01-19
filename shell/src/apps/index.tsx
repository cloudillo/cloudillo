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

import * as React from 'react'
import { Routes, Route, useLocation, useParams } from 'react-router-dom'
import { useAuth, useApi, mergeClasses } from '@cloudillo/react'

import { useAppConfig, TrustLevel } from '../utils.js'
import { getShellBus } from '../message-bus/shell-bus.js'
import { onAppReady } from '../message-bus/index.js'
import { useContextFromRoute, useGuestDocument } from '../context/index.js'
import { FeedApp } from './feed.js'
import { FilesApp } from './files.js'
import { GalleryApp } from './gallery.js'
import { MessagesApp } from './messages.js'
import { FileViewerApp } from './viewer/index.js'
import { AppLoadingIndicator, type LoadingStage } from './AppLoadingIndicator.js'

async function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(() => resolve(), ms))
}

interface MicrofrontendContainerProps {
	className?: string
	app: string
	resId?: string
	appUrl: string
	trust?: TrustLevel | boolean
	access?: 'read' | 'write'
	token?: string // Optional pre-fetched token (for guest access via share links)
	refId?: string // Share link ref ID for guest token refresh
	guestName?: string // Optional guest display name for awareness
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
 * All trust levels use 'allow-scripts allow-forms allow-downloads' without 'allow-same-origin'
 * This gives apps an opaque origin, preventing access to shell's serviceWorker API
 * and protecting the SW encryption key from being read via scriptURL
 */
function getSandboxValue(_trust: TrustLevel): string {
	return 'allow-scripts allow-forms allow-downloads'
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
	guestName
}: MicrofrontendContainerProps) {
	const ref = React.useRef<HTMLIFrameElement>(null)
	const { api, setIdTag } = useApi()
	const [auth] = useAuth()
	const [url, setUrl] = React.useState<string | undefined>(undefined)
	const [loadingStage, setLoadingStage] = React.useState<LoadingStage>('connecting')
	const [retryCount, setRetryCount] = React.useState(0)
	const [, , host, path] = (resId || '').match(/^(([a-zA-Z0-9-.]+):)?(.*)$/) || []
	// Extract context from resId (format: "contextIdTag:resource-path")
	const contextIdTag = host || auth?.idTag
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
	// These refs are for callbacks defined below - initialized to null, updated in effect
	const requestTokenRef = React.useRef<(() => Promise<string | undefined>) | null>(null)
	const scheduleRenewalRef = React.useRef<((token: string) => void) | null>(null)

	// Boolean flag that only transitions once (false → true)
	// This prevents effect re-runs on token renewal (api/auth object changes)
	const isReady = !!(api && (auth || providedToken))

	// Function to request a new token
	const requestToken = React.useCallback(async () => {
		// Use refs to get latest api/auth after potential renewal
		const currentApi = apiRef.current
		const currentAuth = authRef.current
		if (!currentApi || !currentAuth) return undefined

		const accessSuffix = access === 'read' ? 'R' : 'W'

		try {
			const res = await currentApi.auth.getAccessToken({
				scope: `${resId}:${accessSuffix}`
			})
			return res.token
		} catch (err: unknown) {
			// Duck-type check for FetchError with 401 status
			// Don't rely on instanceof which can fail with multiple bundle copies
			const httpStatus = (err as { httpStatus?: number })?.httpStatus
			const isAuthError = httpStatus === 401 || httpStatus === 403

			console.log('[Shell] Access token request failed:', {
				httpStatus,
				isAuthError,
				errorType: err?.constructor?.name,
				message: (err as Error)?.message
			})

			if (isAuthError) {
				console.log('[Shell] Auth error detected, waiting for token renewal...')

				// Wait for token renewal to complete (typically < 1 second)
				await new Promise((resolve) => setTimeout(resolve, 3000))

				// Get the potentially updated api client
				const renewedApi = apiRef.current
				console.log('[Shell] After wait - api changed:', renewedApi !== currentApi)

				if (renewedApi) {
					console.log('[Shell] Retrying access token request...')
					try {
						const res = await renewedApi.auth.getAccessToken({
							scope: `${resId}:${accessSuffix}`
						})
						console.log('[Shell] Retry succeeded!')
						return res.token
					} catch (retryErr) {
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
			const currentScheduleRenewal = scheduleRenewalRef.current

			if (currentApi && (currentAuth || currentProvidedToken) && currentRequestToken) {
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
				if (shellBus && resId && (currentProvidedToken || currentRefId)) {
					shellBus.setPendingRegistration(resId, {
						token: currentProvidedToken,
						refId: currentRefId,
						access: currentAccess || 'write',
						idTag: currentContextIdTag,
						displayName: currentGuestName
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
						onAppReady(currentAppWindow, (_window, stage) => {
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
					}

					// Read latest values from refs for pre-registration
					const latestAccess = accessRef.current
					const latestContextIdTag = contextIdTagRef.current
					const latestProvidedToken = providedTokenRef.current
					const latestRefId = refIdRef.current

					// Pre-register/update with Window reference now that we have it
					currentShellBus.preRegisterApp(currentAppWindow, {
						appName: app,
						resId,
						idTag: latestContextIdTag,
						access: latestAccess || 'write',
						token: latestProvidedToken,
						refId: latestRefId
					})

					await delay(100) // Wait for app JavaScript to initialize

					try {
						const res = await apiPromise
						// Read latest auth values for initApp
						const latestAuth = authRef.current
						const latestGuestName = guestNameRef.current
						const latestScheduleRenewal = scheduleRenewalRef.current

						currentShellBus.initApp(currentAppWindow, {
							appName: app,
							idTag: latestContextIdTag,
							tnId: latestAuth?.tnId,
							roles: latestAuth?.roles,
							darkMode: document.body.classList.contains('dark'),
							token: res.token,
							access: latestAccess || 'write',
							resId,
							displayName: latestGuestName
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
				setUrl(`${appUrl}#${resId}`)

				// Cleanup on unmount or when core dependencies change (app, resId, retryCount)
				return () => {
					// Remove load event listener
					iframeElement?.removeEventListener('load', onMicrofrontendLoad)

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
			<AppLoadingIndicator stage={loadingStage} onRetry={handleRetry} />
			<iframe
				ref={ref}
				src={url}
				sandbox={getSandboxValue(trustLevel)}
				allow="fullscreen"
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
	const location = useLocation()
	const { contextIdTag, appId, '*': rest } = useParams()
	const [guestDocument] = useGuestDocument()
	// Use contextIdTag from URL, fallback to auth idTag
	const idTag = contextIdTag || auth?.idTag || window.location.hostname

	const app = appConfig?.apps.find((a) => a.id === appId)
	const resId = (rest ?? '').indexOf(':') >= 0 ? rest : idTag + ':' + rest

	// Parse access query parameter
	const searchParams = new URLSearchParams(location.search)
	const access = searchParams.get('access') === 'read' ? 'read' : 'write'

	// Check if this is a guest document navigation and pass the stored token/name
	const isGuestAccess = guestDocument && resId === guestDocument.resId
	const guestToken = isGuestAccess ? guestDocument.token : undefined
	const guestName = isGuestAccess ? guestDocument.guestName : undefined

	return (
		!!app && (
			<MicrofrontendContainer
				className={className}
				app={app.id}
				resId={resId}
				appUrl={`${app.url}`}
				trust={app.trust}
				access={access}
				token={guestToken}
				guestName={guestName}
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
			<Route path="/app/view/:resId" element={<FileViewerApp />} />
			<Route path="/app/:appId/*" element={<ExternalApp className="w-100 h-100" />} />
			<Route path="/*" element={null} />
		</Routes>
	)
}

// vim: ts=4
