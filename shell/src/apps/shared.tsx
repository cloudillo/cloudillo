// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { createApiClient, type FileView, type RefAccessTokenResult } from '@cloudillo/core'
import { Button, EmptyState, LoadingSpinner, useApi } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuFileWarning as IcError } from 'react-icons/lu'
import { Link, useLocation, useParams } from 'react-router-dom'

import { GuestNameDialog } from '../components/GuestNameDialog.js'
import { type GuestFileType, useGuestDocument } from '../context/index.js'
import { useAppConfig } from '../utils.js'
import { SharedFolderView } from './shared/SharedFolderView.js'
import { BlobViewer, renderSharedApp } from './shared/shared-app.js'

type SharedState =
	| { status: 'loading' }
	| { status: 'error'; code: string; message: string; recoverable: boolean }
	| { status: 'awaiting-name'; tokenResult: RefAccessTokenResult; file: FileView }
	| { status: 'ready'; tokenResult: RefAccessTokenResult; file: FileView }

/**
 * SharedResourceView handles /s/{refId} routes for guest access to shared files.
 *
 * Flow:
 * 1. Extract refId from URL
 * 2. Exchange refId for scoped access token
 * 3. Load file metadata using scoped token
 * 4. Display file based on type:
 *    - BLOB (image, video, PDF): Display inline (viewer)
 *    - FLDR (directory): Browsable folder listing
 *    - CRDT/RTDB: Open in microfrontend app
 */
export function SharedResourceView() {
	const { t } = useTranslation()
	const { refId } = useParams<{ refId: string }>()
	const location = useLocation()
	const { api } = useApi()
	const [appConfig] = useAppConfig()
	const [state, setState] = React.useState<SharedState>({ status: 'loading' })
	const [guestName, setGuestName] = React.useState<string | undefined>(undefined)
	const [reloadKey, setReloadKey] = React.useState(0)
	const [guestDocument, setGuestDocument] = useGuestDocument()

	// Track the current guest document without retriggering the load effect.
	// (Adding `guestDocument` to the load deps would loop with updateGuestDocument.)
	const guestDocumentRef = React.useRef(guestDocument)
	React.useEffect(() => {
		guestDocumentRef.current = guestDocument
	}, [guestDocument])

	React.useEffect(
		function loadSharedResource() {
			if (!refId || !api) return

			;(async function () {
				try {
					// Exchange refId for scoped access token (includes resourceId and accessLevel).
					// A return visit (the atom still holds this refId from the first open) uses a
					// non-consuming refresh so revisits never burn a count-limited share.
					const isReturn = guestDocumentRef.current?.refId === refId
					const tokenResult = await api.auth.getAccessTokenByRef(
						refId,
						isReturn ? { refresh: true } : undefined
					)

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
							message: t('File not found'),
							recoverable: false
						})
						return
					}

					const file = files[0]
					const fileTp = file.fileTp || 'BLOB'

					// For CRDT/RTDB files, always show guest name dialog
					if (fileTp === 'CRDT' || fileTp === 'RTDB') {
						setState({ status: 'awaiting-name', tokenResult, file })
					} else {
						// BLOB / FLDR files don't need guest name
						setState({ status: 'ready', tokenResult, file })
					}
				} catch (err: unknown) {
					console.error('[SharedResourceView] Error:', err)
					const apiErr = err as Record<string, unknown>
					const code = (apiErr?.code as string) || 'UNKNOWN'
					let message = t('Failed to load shared resource')
					// Expired / usage-limited links won't recover on retry — steer
					// the guest to sign in instead. Transient/unknown errors offer
					// a Retry.
					let recoverable = true

					if (apiErr?.httpStatus === 404 || code === 'E-CORE-NOTFOUND') {
						message = t('This link has expired or does not exist')
						recoverable = false
					} else if (apiErr?.httpStatus === 403 || code === 'E-AUTH-NOPERM') {
						message = t('This link has reached its usage limit')
						recoverable = false
					}

					setState({ status: 'error', code, message, recoverable })
				}
			})()
		},
		[refId, api, t, reloadKey]
	)

	// Set guest document info for menu navigation when CRDT/RTDB file is ready
	// Note: We don't clear on unmount so the menu item persists for navigation back
	React.useEffect(
		function updateGuestDocument() {
			if (state.status !== 'ready' || !api?.idTag) return

			const { tokenResult, file } = state
			const fileTp = file.fileTp || 'BLOB'
			const resId = `${api.idTag}:${file.fileId}`

			// Only CRDT/RTDB files open in a microfrontend app, so only they
			// resolve an appId. BLOB/FLDR shares render inside this view and must
			// keep appId='' so the menu item routes to /s/{refId} (layout.tsx).
			const isAppDoc = fileTp === 'CRDT' || fileTp === 'RTDB'
			const appPath = isAppDoc ? appConfig?.mime[file.contentType] : undefined
			const appId = appPath ? appPath.replace('/app/', '') : ''

			// CRDT/RTDB documents open in microfrontend apps — require a registered app.
			// BLOB/FLDR shares render inside this view, so they need no app mapping.
			if (fileTp === 'CRDT' || fileTp === 'RTDB') {
				if (!appConfig || !appId) return
			}

			setGuestDocument({
				fileName: file.fileName,
				contentType: file.contentType,
				fileId: file.fileId,
				appId,
				resId,
				token: tokenResult.token,
				accessLevel: tokenResult.accessLevel,
				ownerIdTag: api.idTag,
				guestName,
				refId,
				fileTp: fileTp as GuestFileType
			})
		},
		[state, appConfig, api?.idTag, setGuestDocument, guestName, refId]
	)

	// Handle guest name confirmation
	const handleGuestNameConfirm = (name: string) => {
		setGuestName(name)
		if (state.status === 'awaiting-name') {
			setState({
				status: 'ready',
				tokenResult: state.tokenResult,
				file: state.file
			})
		}
	}

	if (state.status === 'loading') {
		return (
			<div className="c-panel flex-fill d-flex align-items-center justify-content-center">
				<LoadingSpinner />
			</div>
		)
	}

	if (state.status === 'error') {
		return (
			<div className="c-panel flex-fill d-flex align-items-center justify-content-center">
				<EmptyState
					icon={<IcError size="4rem" className="text-error" />}
					title={t('Link Error')}
					description={state.message}
					action={
						<div className="c-hbox g-2 align-items-center justify-content-center">
							{state.recoverable && (
								<Button
									variant="primary"
									onClick={() => setReloadKey((k) => k + 1)}
								>
									{t('Retry')}
								</Button>
							)}
							<Link
								to="/login"
								className={state.recoverable ? 'c-button' : 'c-button accent'}
							>
								{t('Go to Cloudillo')}
							</Link>
						</div>
					}
				/>
			</div>
		)
	}

	// Show dialog when awaiting guest name
	if (state.status === 'awaiting-name') {
		return <GuestNameDialog open={true} onConfirm={handleGuestNameConfirm} />
	}

	const { tokenResult, file } = state
	const access = tokenResult.accessLevel
	const idTag = api?.idTag || ''

	// Determine display mode based on file type
	const fileTp = file.fileTp || 'BLOB'
	const contentType = file.contentType

	// CRDT/RTDB files: open in microfrontend app
	if (fileTp === 'CRDT' || fileTp === 'RTDB') {
		// Merge ref-stored params with URL query params (URL wins)
		const refParams = new URLSearchParams(tokenResult.params || '')
		const urlParams = new URLSearchParams(location.search)
		for (const [key, value] of urlParams) {
			// Folder-browser nav params (SharedFolderView) must not leak into a
			// root doc share's microfrontend params.
			if (key === 'parentId' || key === 'file') continue
			refParams.set(key, value)
		}
		const mergedParams = refParams.toString() || undefined

		const appEl = renderSharedApp(file, {
			token: tokenResult.token,
			idTag,
			access,
			refId,
			appConfig,
			guestName,
			params: mergedParams
		})
		if (appEl) return <>{appEl}</>

		// Fallback: show error if no app found
		return (
			<div className="c-panel flex-fill d-flex flex-column align-items-center justify-content-center g-2">
				<IcError size="4rem" className="text-warning" />
				<h2>{t('Unsupported file type')}</h2>
				<p className="text-secondary">{contentType}</p>
			</div>
		)
	}

	// Directory: browsable folder listing
	if (fileTp === 'FLDR') {
		return (
			<SharedFolderView
				rootFile={file}
				token={tokenResult.token}
				idTag={idTag}
				accessLevel={access}
				refId={refId}
				appConfig={appConfig}
				guestName={guestName}
			/>
		)
	}

	// BLOB files: display inline (viewer)
	return <BlobViewer file={file} token={tokenResult.token} idTag={idTag} />
}

// vim: ts=4
