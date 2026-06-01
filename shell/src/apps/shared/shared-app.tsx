// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { FileView } from '@cloudillo/core'

import { LoadingSpinner } from '@cloudillo/react'

import type { AppConfigState } from '../../utils.js'
import { MicrofrontendContainer } from '../index.js'
import { MediaViewer } from '../viewer/MediaViewer.js'
import { useInstalledToken } from './useInstalledToken.js'

/**
 * Options for opening a shared document in its microfrontend app.
 */
export interface RenderSharedAppOpts {
	token: string
	idTag: string
	access: 'read' | 'comment' | 'write'
	refId?: string
	appConfig: AppConfigState | undefined
	guestName?: string
	params?: string
}

/**
 * Open a CRDT/RTDB document in its microfrontend app using a scoped guest token.
 *
 * Returns the container element, or `null` when no app is registered for the
 * file's content type (caller should render an "unsupported" fallback).
 * Shared by the top-level shared view and the folder browser so both open
 * documents identically.
 */
export function renderSharedApp(file: FileView, opts: RenderSharedAppOpts): React.ReactNode | null {
	const { token, idTag, access, refId, appConfig, guestName, params } = opts
	const appPath = appConfig?.mime[file.contentType]
	if (!appPath) return null
	const appId = appPath.replace('/app/', '')
	const app = appConfig?.apps.find((a) => a.id === appId)
	if (!app) return null

	const resId = `${idTag}:${file.fileId}`
	return (
		<MicrofrontendContainer
			className="w-100 h-100"
			app={app.id}
			resId={resId}
			appUrl={app.url}
			trust={app.trust}
			access={access}
			token={token}
			refId={refId}
			guestName={guestName}
			params={params}
		/>
	)
}

interface BlobViewerProps {
	file: FileView
	token: string
	idTag: string
	/** Back action — returns to the previous view (folder listing or history). */
	onBack?: () => void
}

/**
 * BlobViewer displays BLOB files (images, videos, PDFs) using the same
 * full-viewport MediaViewer as the Files app, with a scoped guest token so
 * logged-out guests can fetch the content.
 */
export function BlobViewer({ file, token, idTag, onBack }: BlobViewerProps) {
	// Install the scoped token into the SW so it attaches it as an Authorization
	// header on MediaViewer's header-less media GETs — keeping it out of URLs.
	// Normally the token is fed to the SW only and MediaViewer renders token-less
	// URLs; gate the viewer until the SW holds the token to avoid the first-paint
	// race. If the install fails (useUrlToken), pass the token to MediaViewer so
	// it embeds it in the media URLs instead of 401-ing.
	const { ready: tokenReady, useUrlToken } = useInstalledToken(token)
	if (!tokenReady) {
		return (
			<div className="c-panel flex-fill d-flex align-items-center justify-content-center">
				<LoadingSpinner size="lg" />
			</div>
		)
	}

	return (
		<MediaViewer
			file={file}
			idTag={idTag}
			token={useUrlToken ? token : undefined}
			onBack={
				onBack ??
				(() => {
					if (window.history.length > 1) window.history.back()
				})
			}
		/>
	)
}

// vim: ts=4
