// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { FileView } from '@cloudillo/core'
import { Button, EmptyState, ImmersiveOverlay, LoadingSpinner, useAuth } from '@cloudillo/react'
import { useSetAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuFileWarning as IcError } from 'react-icons/lu'
import { useNavigate, useParams } from 'react-router-dom'

import { useApiContext, useCtx } from '../../context/index.js'
import { documentTitleAtom } from '../../title.js'
import { MediaViewer } from './MediaViewer.js'

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
	const { resId } = useParams<{ resId: string }>()
	// The real tenant behind the route's context segment. `~` is a URL shorthand, never an
	// idTag, so it must not reach `getClientFor`, `getTokenFor` or the owner half of a resId.
	const contextIdTag = useCtx().idTag

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
					// Local row first: for a pinned or placed foreign-owned file the
					// row served by the active context carries the name this user
					// chose, and that is the name the rest of the shell shows. Content
					// still lives on the owner's node, so `idTag` — not the context —
					// keeps deciding the token and the media URLs below.
					const localApi =
						contextIdTag && contextIdTag !== idTag
							? getClientFor(contextIdTag, { auth: 'preferred' })
							: null
					let file = localApi
						? (await localApi.files.list({ fileId }).catch(() => []))[0]
						: undefined
					if (!file) {
						// `preferred` never returns null — it falls back to an
						// unauthenticated client (see context/hooks.ts getClientFor).
						const ownerApi = getClientFor(idTag, { auth: 'preferred' })!
						file = (await ownerApi.files.list({ fileId }))[0]
					}
					if (!file) {
						setState({ status: 'error', message: t('File not found') })
						return
					}
					const tokenResult = await getTokenFor(idTag)
					setToken(tokenResult?.token)
					setState({ status: 'ready', file })
					// Feed the document title. Key by the same resId the route
					// produces (`<ctx>:<fileId>` when the URL omits an owner).
					if (resId && file.fileName) {
						const titleResId = resId.includes(':')
							? resId
							: `${contextIdTag ?? auth?.idTag ?? ''}:${resId}`
						setDocumentTitle({ resId: titleResId, title: file.fileName })
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
			<ImmersiveOverlay open onClose={handleBack} aria-label={t('Loading...')}>
				<LoadingSpinner size="lg" inverse label={t('Loading...')} />
			</ImmersiveOverlay>
		)
	}

	// Render error state
	if (state.status === 'error') {
		return (
			<ImmersiveOverlay open onClose={handleBack} aria-label={t('Error')}>
				<EmptyState
					inverse
					color="error"
					icon={<IcError />}
					title={t('Error')}
					description={state.message}
					actions={<Button onClick={handleBack}>{t('Go back')}</Button>}
				/>
			</ImmersiveOverlay>
		)
	}

	return <MediaViewer file={state.file} idTag={idTag} token={token} onBack={handleBack} />
}

// vim: ts=4
