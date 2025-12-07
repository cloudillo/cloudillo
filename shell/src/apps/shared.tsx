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
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { LuFileWarning as IcError, LuRefreshCw as IcLoading } from 'react-icons/lu'

import { useApi, LoadingSpinner, mergeClasses } from '@cloudillo/react'
import { createApiClient, FileView, RefAccessTokenResult } from '@cloudillo/base'

import { useAppConfig } from '../utils.js'
import { useGuestDocument } from '../context/index.js'
import { MicrofrontendContainer } from './index.js'

type SharedState =
	| { status: 'loading' }
	| { status: 'error'; code: string; message: string }
	| { status: 'ready'; tokenResult: RefAccessTokenResult; file: FileView }

/**
 * SharedResourceView handles /s/{refId} routes for guest access to shared files.
 *
 * Flow:
 * 1. Extract refId from URL
 * 2. Exchange refId for scoped access token
 * 3. Load file metadata using scoped token
 * 4. Display file based on type:
 *    - BLOB (image, video, PDF): Display inline
 *    - CRDT/RTDB: Redirect to microfrontend app
 */
export function SharedResourceView() {
	const { t } = useTranslation()
	const { refId } = useParams<{ refId: string }>()
	const navigate = useNavigate()
	const { api } = useApi()
	const [appConfig] = useAppConfig()
	const [state, setState] = React.useState<SharedState>({ status: 'loading' })
	const [, setGuestDocument] = useGuestDocument()

	React.useEffect(
		function loadSharedResource() {
			if (!refId || !api) return

			;(async function () {
				try {
					// Exchange refId for scoped access token (includes resourceId and accessLevel)
					const tokenResult = await api.auth.getAccessTokenByRef(refId)

					// Create a temporary API client with the scoped token
					const scopedApi = createApiClient({
						idTag: api.idTag,
						authToken: tokenResult.token
					})

					// Load file metadata using scoped token
					const files = await scopedApi.files.list({ fileId: tokenResult.resourceId })
					if (files.length === 0) {
						setState({
							status: 'error',
							code: 'FILE_NOT_FOUND',
							message: t('File not found')
						})
						return
					}

					setState({
						status: 'ready',
						tokenResult,
						file: files[0]
					})
				} catch (err: any) {
					console.error('[SharedResourceView] Error:', err)
					const code = err?.code || 'UNKNOWN'
					let message = t('Failed to load shared resource')

					if (err?.httpStatus === 404 || code === 'E-CORE-NOTFOUND') {
						message = t('This link has expired or does not exist')
					} else if (err?.httpStatus === 403 || code === 'E-AUTH-NOPERM') {
						message = t('This link has reached its usage limit')
					}

					setState({ status: 'error', code, message })
				}
			})()
		},
		[refId, api, t]
	)

	// Set guest document info for menu navigation when CRDT/RTDB file is ready
	// Note: We don't clear on unmount so the menu item persists for navigation back
	React.useEffect(
		function updateGuestDocument() {
			if (state.status !== 'ready' || !appConfig || !api?.idTag) return

			const { tokenResult, file } = state
			const fileTp = file.fileTp || 'BLOB'

			// Only set for CRDT/RTDB files (documents that open in microfrontend apps)
			if (fileTp === 'CRDT' || fileTp === 'RTDB') {
				const appPath = appConfig.mime[file.contentType]
				if (appPath) {
					const appId = appPath.replace('/app/', '')
					const resId = `${api.idTag}:${file.fileId}`

					setGuestDocument({
						fileName: file.fileName,
						contentType: file.contentType,
						fileId: file.fileId,
						appId,
						resId,
						token: tokenResult.token,
						accessLevel: tokenResult.accessLevel,
						ownerIdTag: api.idTag
					})
				}
			}
		},
		[state, appConfig, api?.idTag, setGuestDocument]
	)

	if (state.status === 'loading') {
		return (
			<div className="c-panel flex-fill d-flex align-items-center justify-content-center">
				<LoadingSpinner />
			</div>
		)
	}

	if (state.status === 'error') {
		return (
			<div className="c-panel flex-fill d-flex flex-column align-items-center justify-content-center g-2">
				<IcError size="4rem" className="text-error" />
				<h2>{t('Link Error')}</h2>
				<p className="text-secondary">{state.message}</p>
			</div>
		)
	}

	const { tokenResult, file } = state
	const access = tokenResult.accessLevel

	// Determine display mode based on file type
	const fileTp = file.fileTp || 'BLOB'
	const contentType = file.contentType

	// CRDT/RTDB files: redirect to microfrontend app
	if (fileTp === 'CRDT' || fileTp === 'RTDB') {
		// Find the appropriate app for this content type
		const appPath = appConfig?.mime[contentType]
		if (appPath) {
			const appId = appPath.replace('/app/', '')
			const app = appConfig?.apps.find((a) => a.id === appId)
			if (app) {
				// Build resId from owner and fileId
				const resId = `${api?.idTag}:${file.fileId}`
				return (
					<MicrofrontendContainer
						className="w-100 h-100"
						app={app.id}
						resId={resId}
						appUrl={app.url}
						trust={app.trust}
						access={access}
						token={tokenResult.token}
					/>
				)
			}
		}
		// Fallback: show error if no app found
		return (
			<div className="c-panel flex-fill d-flex flex-column align-items-center justify-content-center g-2">
				<IcError size="4rem" className="text-warning" />
				<h2>{t('Unsupported file type')}</h2>
				<p className="text-secondary">{contentType}</p>
			</div>
		)
	}

	// BLOB files: display inline
	return <BlobViewer file={file} token={tokenResult.token} idTag={api?.idTag || ''} />
}

interface BlobViewerProps {
	file: FileView
	token: string
	idTag: string
}

/**
 * BlobViewer displays BLOB files (images, videos, PDFs) inline.
 */
function BlobViewer({ file, token, idTag }: BlobViewerProps) {
	const { t } = useTranslation()
	const contentType = file.contentType
	const fileUrl = `https://cl-o.${idTag}/api/file/${file.fileId}`

	// Image files
	if (contentType.startsWith('image/')) {
		return (
			<div className="c-panel flex-fill d-flex flex-column align-items-center justify-content-center p-2">
				<img
					src={fileUrl}
					alt={file.fileName}
					style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }}
				/>
				<p className="mt-2 text-secondary">{file.fileName}</p>
			</div>
		)
	}

	// Video files
	if (contentType.startsWith('video/')) {
		return (
			<div className="c-panel flex-fill d-flex flex-column align-items-center justify-content-center p-2">
				<video src={fileUrl} controls style={{ maxWidth: '100%', maxHeight: '80vh' }}>
					{t('Your browser does not support video playback')}
				</video>
				<p className="mt-2 text-secondary">{file.fileName}</p>
			</div>
		)
	}

	// PDF files
	if (contentType === 'application/pdf') {
		return (
			<div className="c-panel flex-fill d-flex flex-column h-100">
				<iframe
					src={fileUrl}
					className="flex-fill w-100"
					style={{ border: 'none', minHeight: '80vh' }}
					title={file.fileName}
				/>
			</div>
		)
	}

	// Other files: show download link
	return (
		<div className="c-panel flex-fill d-flex flex-column align-items-center justify-content-center g-2">
			<h2>{file.fileName}</h2>
			<p className="text-secondary">{contentType}</p>
			<a href={fileUrl} download={file.fileName} className="c-button primary">
				{t('Download')}
			</a>
		</div>
	)
}

// vim: ts=4
