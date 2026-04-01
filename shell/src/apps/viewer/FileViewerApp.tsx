// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'

import {
	LuArrowLeft as IcBack,
	LuDownload as IcDownload,
	LuMaximize as IcFullscreen,
	LuFileWarning as IcError
} from 'react-icons/lu'

import { PdfViewer } from './PdfViewer.js'

import { getFileUrl, type FileView } from '@cloudillo/core'
import { useApi, useAuth, LoadingSpinner, Button, mergeClasses } from '@cloudillo/react'

import './viewer.css'

type ViewerState =
	| { status: 'loading' }
	| { status: 'error'; message: string }
	| { status: 'ready'; file: FileView }

export function FileViewerApp() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { api } = useApi()
	const [auth] = useAuth()
	const { contextIdTag, resId } = useParams<{ contextIdTag?: string; resId: string }>()

	const [state, setState] = React.useState<ViewerState>({ status: 'loading' })
	const [toolbarVisible, setToolbarVisible] = React.useState(true)
	const hideTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
	const videoRef = React.useRef<HTMLVideoElement>(null)

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
			if (!api || !fileId) return

			;(async function () {
				try {
					const files = await api.files.list({ fileId })
					if (files.length === 0) {
						setState({ status: 'error', message: t('File not found') })
						return
					}
					setState({ status: 'ready', file: files[0] })
				} catch (err) {
					console.error('[FileViewer] Error loading file:', err)
					setState({ status: 'error', message: t('Failed to load file') })
				}
			})()
		},
		[api, fileId, t]
	)

	// Auto-hide toolbar after inactivity
	const resetToolbarTimeout = React.useCallback(function resetToolbarTimeout() {
		setToolbarVisible(true)
		if (hideTimeoutRef.current) {
			clearTimeout(hideTimeoutRef.current)
		}
		hideTimeoutRef.current = setTimeout(() => {
			setToolbarVisible(false)
		}, 3000)
	}, [])

	React.useEffect(
		function setupAutoHide() {
			resetToolbarTimeout()

			const handleMouseMove = () => resetToolbarTimeout()
			const handleKeyDown = (evt: KeyboardEvent) => {
				resetToolbarTimeout()
				if (evt.key === 'Escape') {
					navigate(-1)
				}
			}

			document.addEventListener('mousemove', handleMouseMove)
			document.addEventListener('keydown', handleKeyDown)

			return () => {
				if (hideTimeoutRef.current) {
					clearTimeout(hideTimeoutRef.current)
				}
				document.removeEventListener('mousemove', handleMouseMove)
				document.removeEventListener('keydown', handleKeyDown)
			}
		},
		[resetToolbarTimeout, navigate]
	)

	// Handlers
	function handleBack() {
		navigate(-1)
	}

	function handleDownload() {
		if (state.status !== 'ready' || !fileId) return
		const url = getFileUrl(idTag, fileId, undefined, { token: auth?.token })
		const a = document.createElement('a')
		a.href = url
		a.download = state.file.fileName
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
	}

	function handleVideoFullscreen() {
		if (videoRef.current) {
			if (videoRef.current.requestFullscreen) {
				videoRef.current.requestFullscreen()
			}
		}
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
				<div className={mergeClasses('c-file-viewer-toolbar', !toolbarVisible && 'hidden')}>
					<Button icon onClick={handleBack} title={t('Back')}>
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

	const { file } = state
	const contentType = file.contentType
	const isImage = contentType.startsWith('image/')
	const isVideo = contentType.startsWith('video/')
	const isPdf = contentType === 'application/pdf'

	// Render image viewer using Lightbox
	if (isImage && fileId) {
		const imageUrl = getFileUrl(idTag, fileId, 'vis.hd')
		return (
			<Lightbox
				open={true}
				close={handleBack}
				slides={[{ src: imageUrl, alt: file.fileName }]}
				plugins={[Fullscreen, Zoom]}
				render={{
					buttonPrev: () => null,
					buttonNext: () => null
				}}
				carousel={{ finite: true }}
				controller={{ closeOnBackdropClick: true }}
				toolbar={{
					buttons: [
						<button
							key="download"
							type="button"
							className="yarl__button"
							onClick={handleDownload}
							title={t('Download')}
						>
							<IcDownload size={24} />
						</button>,
						'close'
					]
				}}
			/>
		)
	}

	// Render video viewer
	if (isVideo && fileId) {
		const videoUrl = getFileUrl(idTag, fileId, 'vid.hd', { token: auth?.token })
		const posterUrl = getFileUrl(idTag, fileId, 'vid.sd', { token: auth?.token })

		return (
			<div className="c-file-viewer">
				<div className={mergeClasses('c-file-viewer-toolbar', !toolbarVisible && 'hidden')}>
					<Button icon onClick={handleBack} title={t('Back')}>
						<IcBack />
					</Button>
					<span className="c-file-viewer-toolbar-filename">{file.fileName}</span>
					<div className="c-file-viewer-toolbar-divider" />
					<Button icon onClick={handleDownload} title={t('Download')}>
						<IcDownload />
					</Button>
					<Button icon onClick={handleVideoFullscreen} title={t('Fullscreen')}>
						<IcFullscreen />
					</Button>
				</div>
				<div className="c-file-viewer-content">
					<div className="c-file-viewer-video-container">
						<video
							ref={videoRef}
							className="c-file-viewer-video"
							controls
							autoPlay
							poster={posterUrl}
						>
							<source src={videoUrl} />
							{t('Your browser does not support video playback')}
						</video>
					</div>
				</div>
			</div>
		)
	}

	// Render PDF viewer
	if (isPdf && fileId) {
		const pdfUrl = getFileUrl(idTag, fileId, undefined, { token: auth?.token })

		return (
			<PdfViewer
				url={pdfUrl}
				fileName={file.fileName}
				onBack={handleBack}
				onDownload={handleDownload}
				toolbarVisible={toolbarVisible}
			/>
		)
	}

	// Unsupported file type - offer download
	return (
		<div className="c-file-viewer">
			<div className={mergeClasses('c-file-viewer-toolbar', !toolbarVisible && 'hidden')}>
				<Button icon onClick={handleBack} title={t('Back')}>
					<IcBack />
				</Button>
				<span className="c-file-viewer-toolbar-filename">{file.fileName}</span>
			</div>
			<div className="c-file-viewer-content">
				<div className="c-file-viewer-error">
					<h2>{file.fileName}</h2>
					<p className="text-secondary">{contentType}</p>
					<Button primary onClick={handleDownload}>
						<IcDownload />
						{t('Download')}
					</Button>
				</div>
			</div>
		</div>
	)
}

// vim: ts=4
