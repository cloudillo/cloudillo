// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { jwtRemainingSeconds } from '@cloudillo/core/jwt'
import { mergeClasses, useApi, useAuth, useDialog, useToast } from '@cloudillo/react'
import { useSetAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import { version } from '../../package.json'
import { fileViewUpdateAtom, useApiContext, useGuestDocument } from '../context/index.js'
import { releaseClientIdsForWindow } from '../message-bus/handlers/crdt.js'
import { offAppTitle, onAppError, onAppReady, onAppTitle } from '../message-bus/index.js'
import { getShellBus } from '../message-bus/shell-bus.js'
import { documentTitleAtom } from '../title.js'
import { delay, type TrustLevel, useAppConfig } from '../utils.js'
import { AppLoadingIndicator, type LoadingStage } from './AppLoadingIndicator.js'
import type { AccessConflict } from './access-conflict.js'
import { APP_SANDBOX, normalizeTrust } from './iframe-policy.js'
import { useAppToken } from './useAppToken.js'

// How long an app iframe may stay silent before the container shows its error state.
const LOADING_TIMEOUT_MS = 15000

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
	const timeoutRef = React.useRef<number | undefined>(undefined)
	// Track the app window for subscription persistence across effect re-runs
	const appWindowRef = React.useRef<Window | null>(null)
	// Track whether we've subscribed to avoid duplicate subscriptions
	const subscribedRef = React.useRef(false)
	// Track whether initial setup is complete (prevents re-running on auth changes)
	const initializedRef = React.useRef(false)
	// Refs for values that change but shouldn't trigger effect re-runs
	// Initialize with current values, updated in effect below
	const contextIdTagRef = React.useRef(contextIdTag)
	const providedTokenRef = React.useRef(providedToken)
	const guestNameRef = React.useRef(guestName)
	const paramsRef = React.useRef(params)
	// These refs are for callbacks defined below - initialized to null, updated in effect
	const requestTokenRef = React.useRef<(() => Promise<string | undefined>) | null>(null)
	const scheduleRenewalRef = React.useRef<((token: string) => void) | null>(null)

	// Owns the api/auth/access/refId refs, returned here so the init effect below
	// can read live values without depending on them — see useAppToken.ts.
	const {
		requestToken,
		scheduleRenewal,
		triggerAccessRefresh,
		apiRef,
		authRef,
		accessRef,
		refIdRef
	} = useAppToken({
		iframeRef: ref,
		resId,
		fileId,
		access,
		api,
		auth,
		refId,
		onAccessConflict
	})

	// Boolean flag that only transitions once (false → true)
	// This prevents effect re-runs on token renewal (api/auth object changes)
	const isReady = !!(api && (auth !== undefined || providedToken))

	// Keep refs updated with latest values
	// This effect runs on every render to ensure refs always have current values
	React.useEffect(() => {
		contextIdTagRef.current = contextIdTag
		providedTokenRef.current = providedToken
		guestNameRef.current = guestName
		paramsRef.current = params
		requestTokenRef.current = requestToken
		scheduleRenewalRef.current = scheduleRenewal
	})

	// Cleanup timers on unmount
	React.useEffect(() => {
		return () => {
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
							// Load-bearing: without it an app initialised through this
							// push path keeps `state.tokenLifetime === undefined` for
							// its whole life. Derived here rather than inside
							// `requestToken`, so the share-link guest branch — which
							// never goes through `mintAppToken` — is covered too.
							tokenLifetime: res.token ? jwtRemainingSeconds(res.token) : undefined,
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
				sandbox={APP_SANDBOX}
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

export function ExternalApp({ className }: { className?: string }) {
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
	// Keyed to the resource it was decided for: navigating to another document
	// keeps this component mounted, so an unkeyed flag would pin every later
	// document to the downgraded access. Derived at render time — resetting it in
	// an effect would flash a read-only mount first.
	const [forced, setForced] = React.useState<
		{ resId: string | undefined; access: 'read' | 'comment' } | undefined
	>()
	// Use contextIdTag from URL, fallback to auth idTag
	const idTag = contextIdTag || auth?.idTag || window.location.hostname

	const app = appConfig?.apps.find((a) => a.id === appId)
	const resId = (rest ?? '').indexOf(':') >= 0 ? rest : idTag + ':' + rest
	const forcedAccess = forced && forced.resId === resId ? forced.access : undefined

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
				setForced({ resId, access: outcome.granted })
				return
			}
			if (outcome.kind === 'unsupported' || outcome.kind === 'unchanged') {
				toast.error(t('Access denied.'))
				return
			}
			// outcome.kind === 'error'
			toast.error(t('Unable to verify file access. Please try again.'))
		},
		[navigate, t, toast, dialog, setFileViewUpdate, filesListPath, resId]
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

// vim: ts=4
