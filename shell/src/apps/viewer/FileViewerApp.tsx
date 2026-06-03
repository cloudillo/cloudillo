// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { FileView } from '@cloudillo/core'
import { Button, LoadingSpinner, mergeClasses, useAuth } from '@cloudillo/react'
import { useSetAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuArrowLeft as IcBack, LuFileWarning as IcError } from 'react-icons/lu'
import { useNavigate, useParams } from 'react-router-dom'

import { useApiContext } from '../../context/index.js'
import { documentTitleAtom } from '../../title.js'
import { MediaViewer } from './MediaViewer.js'

import './viewer.css'

type ViewerState =
	| { status: 'loading' }
	| { status: 'error'; message: string }
	| { status: 'ready'; file: FileView }

export function FileViewerApp() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { getClientFor, getTokenFor } = useApiContext()
	const [auth] = useAuth()
	const setDocumentTitle = useSetAtom(documentTitleAtom)
	const { contextIdTag, resId } = useParams<{ contextIdTag?: string; resId: string }>()

	const [state, setState] = React.useState<ViewerState>({ status: 'loading' })
	const [token, setToken] = React.useState<string | undefined>()

	// Parse resId to get ownerIdTag and fileId
	const [ownerIdTag, fileId] = React.useMemo(() => {
		if (!resId) return [undefined, undefined]
		const colonIdx = resId.indexOf(':')
		if (colonIdx >= 0) {
			return [resId.substring(0, colonIdx), resId.substring(colonIdx + 1)]
		}
		// If no colon, use contextIdTag or auth idTag as owner
		return [contextIdTag || auth?.idTag, resId]
	}, [resId, contextIdTag, auth?.idTag])

	const idTag = ownerIdTag ?? contextIdTag ?? auth?.idTag ?? ''

	// Load file metadata
	React.useEffect(
		function loadFile() {
			if (!fileId) return

			;(async function () {
				try {
					// `preferred` never returns null — it falls back to an
					// unauthenticated client (see context/hooks.ts getClientFor).
					const ownerApi = getClientFor(idTag, { auth: 'preferred' })!
					const files = await ownerApi.files.list({ fileId })
					if (files.length === 0) {
						setState({ status: 'error', message: t('File not found') })
						return
					}
					const tokenResult = await getTokenFor(idTag)
					setToken(tokenResult?.token)
					setState({ status: 'ready', file: files[0] })
					// Feed the breadcrumb title. Key by the same resId the
					// breadcrumb derives from the route (`<ctx>:<fileId>` when the
					// URL omits an owner).
					if (resId && files[0]?.fileName) {
						const titleResId = resId.includes(':')
							? resId
							: `${contextIdTag ?? auth?.idTag ?? ''}:${resId}`
						setDocumentTitle({ resId: titleResId, title: files[0].fileName })
					}
				} catch (err) {
					console.error('[FileViewer] Error loading file:', err)
					setState({ status: 'error', message: t('Failed to load file') })
				}
			})()

			return () => setDocumentTitle({})
		},
		[
			getClientFor,
			getTokenFor,
			idTag,
			fileId,
			resId,
			contextIdTag,
			auth?.idTag,
			t,
			setDocumentTitle
		]
	)

	function handleBack() {
		navigate(-1)
	}

	// Render loading state
	if (state.status === 'loading') {
		return (
			<div className="c-file-viewer">
				<div className="c-file-viewer-content">
					<LoadingSpinner size="lg" label={t('Loading...')} />
				</div>
			</div>
		)
	}

	// Render error state
	if (state.status === 'error') {
		return (
			<div className="c-file-viewer">
				<div className={mergeClasses('c-file-viewer-toolbar')}>
					<Button mode="icon" onClick={handleBack} title={t('Back')}>
						<IcBack />
					</Button>
				</div>
				<div className="c-file-viewer-content">
					<div className="c-file-viewer-error">
						<IcError className="c-file-viewer-error-icon" />
						<h2>{t('Error')}</h2>
						<p>{state.message}</p>
						<Button onClick={handleBack}>{t('Go back')}</Button>
					</div>
				</div>
			</div>
		)
	}

	return <MediaViewer file={state.file} idTag={idTag} token={token} onBack={handleBack} />
}

// vim: ts=4
