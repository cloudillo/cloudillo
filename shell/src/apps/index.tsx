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

import { LuRefreshCw as IcLoading } from 'react-icons/lu'

import { useAppConfig, TrustLevel } from '../utils.js'
import { getShellBus } from '../message-bus/shell-bus.js'
import { useContextFromRoute, useGuestDocument } from '../context/index.js'
import { FeedApp } from './feed.js'
import { FilesApp } from './files.js'
import { GalleryApp } from './gallery.js'
import { MessagesApp } from './messages.js'
import { FileViewerApp } from './viewer/index.js'

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
 * All trust levels use 'allow-scripts allow-forms' without 'allow-same-origin'
 * This gives apps an opaque origin, preventing access to shell's serviceWorker API
 * and protecting the SW encryption key from being read via scriptURL
 */
function getSandboxValue(_trust: TrustLevel): string {
	return 'allow-scripts allow-forms'
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
	const [loading, setLoading] = React.useState(true)
	const [, , host, path] = (resId || '').match(/^(([a-zA-Z0-9-.]+):)?(.*)$/) || []
	// Extract context from resId (format: "contextIdTag:resource-path")
	const contextIdTag = host || auth?.idTag
	const trustLevel = normalizeTrust(trust)
	const renewalTimerRef = React.useRef<number | undefined>(undefined)

	// Function to request a new token
	const requestToken = React.useCallback(async () => {
		if (!api || !auth) return undefined
		const accessSuffix = access === 'read' ? 'R' : 'W'
		try {
			const res = await api.auth.getAccessToken({
				scope: `${resId}:${accessSuffix}`
			})
			return res.token
		} catch (err) {
			console.error('[Shell] Failed to get access token:', err)
			return undefined
		}
	}, [api, auth, resId, access])

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

	// Cleanup timer on unmount
	React.useEffect(() => {
		return () => {
			if (renewalTimerRef.current) {
				clearTimeout(renewalTimerRef.current)
			}
		}
	}, [])

	React.useEffect(
		function onLoad() {
			// Allow loading if we have auth OR a provided token (for guest share links)
			if (api && (auth || providedToken)) {
				// Use provided token if available, otherwise fetch one
				const apiPromise = providedToken
					? Promise.resolve({ token: providedToken })
					: requestToken().then((token) => ({ token }))

				const shellBus = getShellBus()

				// Set pending registration BEFORE loading iframe
				// This ensures token/refId is available when auth:init.req arrives
				if (shellBus && resId && (providedToken || refId)) {
					shellBus.setPendingRegistration(resId, {
						token: providedToken,
						refId,
						access: access || 'write',
						idTag: contextIdTag,
						displayName: guestName
					})
				}

				ref.current?.addEventListener('load', async function onMicrofrontendLoad() {
					// Pre-register app with resId on load (also updates if already registered)
					// Note: contentWindow changes when src is set, so we must get it here
					const currentShellBus = getShellBus()
					const currentAppWindow = ref.current?.contentWindow

					if (!currentShellBus || !currentAppWindow) {
						console.error('[Shell] Failed to initialize app: no shell bus or window')
						setLoading(false)
						return
					}

					// Pre-register/update with Window reference now that we have it
					currentShellBus.preRegisterApp(currentAppWindow, {
						appName: app,
						resId,
						idTag: contextIdTag,
						access: access || 'write',
						token: providedToken,
						refId
					})

					await delay(100) // FIXME (wait for app to start)

					try {
						const res = await apiPromise
						currentShellBus.initApp(currentAppWindow, {
							idTag: contextIdTag,
							tnId: auth?.tnId,
							roles: auth?.roles,
							darkMode: document.body.classList.contains('dark'),
							token: res.token,
							access: access || 'write',
							resId,
							displayName: guestName
						})
						// Schedule proactive token renewal
						if (res.token) {
							scheduleRenewal(res.token)
						}
					} catch (err) {
						console.error('[Shell] Failed to initialize app:', err)
						currentShellBus.initApp(currentAppWindow, {
							darkMode: document.body.classList.contains('dark')
						})
					}
					await delay(5000) // FIXME (wait for app to start)
					setLoading(false)
				})
				setUrl(`${appUrl}#${resId}`)
			}
		},
		[
			api,
			auth,
			app,
			resId,
			contextIdTag,
			access,
			providedToken,
			refId,
			guestName,
			requestToken,
			scheduleRenewal
		]
	)

	return (
		<div className={mergeClasses('c-app flex-fill pos-relative', trustLevel, className)}>
			{loading && (
				<IcLoading
					size="5rem"
					className="pos-absolute top-0 left-0 right-0 bottom-0 animate-rotate-cw m-auto z-1"
				/>
			)}
			<iframe
				ref={ref}
				src={url}
				sandbox={getSandboxValue(trustLevel)}
				className={mergeClasses(
					'pos-absolute top-0 left-0 right-0 bottom-0 z-2',
					className
				)}
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
