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

import { useAppConfig } from '../utils.js'
import { useContextFromRoute, useGuestDocument } from '../context/index.js'
import { FeedApp } from './feed.js'
import { FilesApp } from './files.js'
import { GalleryApp } from './gallery.js'
import { MessagesApp } from './messages.js'
import { FileViewerApp } from './viewer/index.js'

async function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(() => resolve(), ms))
}

window.addEventListener('message', function onmessage(evt) {
	// Handle cloudillo messages from microfrontends
})

interface MicrofrontendContainerProps {
	className?: string
	app: string
	resId?: string
	appUrl: string
	trust?: boolean
	access?: 'read' | 'write'
	token?: string // Optional pre-fetched token (for guest access via share links)
}

export function MicrofrontendContainer({
	className,
	app,
	resId,
	appUrl,
	trust,
	access,
	token: providedToken
}: MicrofrontendContainerProps) {
	const ref = React.useRef<HTMLIFrameElement>(null)
	const { api, setIdTag } = useApi()
	const [auth] = useAuth()
	const [url, setUrl] = React.useState<string | undefined>(undefined)
	const [loading, setLoading] = React.useState(true)
	const [, , host, path] = (resId || '').match(/^(([a-zA-Z0-9-.]+):)?(.*)$/) || []
	// Extract context from resId (format: "contextIdTag:resource-path")
	const contextIdTag = host || auth?.idTag

	React.useEffect(
		function onLoad() {
			// Allow loading if we have auth OR a provided token (for guest share links)
			if (api && (auth || providedToken)) {
				const accessSuffix = access === 'read' ? 'R' : 'W'
				// Use provided token if available, otherwise fetch one
				const apiPromise = providedToken
					? Promise.resolve({ token: providedToken })
					: auth
						? api.auth.getAccessToken({ scope: `${resId}:${accessSuffix}` })
						: Promise.resolve({ token: undefined })
				ref.current?.addEventListener('load', async function onMicrofrontendLoad() {
					await delay(100) // FIXME (wait for app to start)
					try {
						const res = await apiPromise
						ref.current?.contentWindow?.postMessage(
							{
								cloudillo: true,
								type: 'init',
								idTag: contextIdTag,
								roles: auth?.roles,
								theme: 'glass',
								darkMode: document.body.classList.contains('dark'),
								token: res.token,
								access: access || 'write'
							},
							'*'
						)
					} catch (err) {
						console.error('[Shell] Failed to initialize app:', err)
						ref.current?.contentWindow?.postMessage(
							{
								cloudillo: true,
								type: 'init',
								theme: 'glass',
								darkMode: document.body.classList.contains('dark')
							},
							'*'
						)
					}
					await delay(5000) // FIXME (wait for app to start)
					setLoading(false)
				})
				setUrl(`${appUrl}#${resId}`)
			}
		},
		[api, auth, resId, contextIdTag, access, providedToken]
	)

	return (
		<div
			className={mergeClasses(
				'c-app flex-fill pos-relative',
				trust ? 'trusted' : trust == false ? 'untrusted' : undefined,
				className
			)}
		>
			{loading && (
				<IcLoading
					size="5rem"
					className="pos-absolute top-0 left-0 right-0 bottom-0 animate-rotate-cw m-auto z-1"
				/>
			)}
			<iframe
				ref={ref}
				src={url}
				className={mergeClasses(
					'pos-absolute top-0 left-0 right-0 bottom-0 z-2',
					className
				)}
				autoFocus
			/>
		</div>
	)
	//return <iframe ref={ref} src={url} className={mergeClasses('c-app flex-fill untrusted', className)} autoFocus/>
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

	// Check if this is a guest document navigation and pass the stored token
	const isGuestAccess = guestDocument && resId === guestDocument.resId
	const guestToken = isGuestAccess ? guestDocument.token : undefined

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
