// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'
import { type FileView, getFileUrl } from '@cloudillo/core'
import { Button, mergeClasses } from '@cloudillo/react'
import {
	LuArrowLeft as IcBack,
	LuDownload as IcDownload,
	LuMaximize as IcFullscreen
} from 'react-icons/lu'
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'

import { PdfViewer } from './PdfViewer.js'

import './viewer.css'

/** Trigger a browser download for a URL. */
export function triggerDownload(url: string, fileName: string) {
	const a = document.createElement('a')
	a.href = url
	a.download = fileName
	a.rel = 'noopener'
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
}

export interface MediaViewerProps {
	file: FileView
	idTag: string
	/** Omit for logged-in (cookie); pass scoped token for guests. */
	token?: string
	onBack: () => void
	/** Optional override; default triggers a token-bearing download. */
	onDownload?: () => void
	// Future extension point (NOT implemented now): siblings?: FileView[]; index?: number
	// to drive Lightbox next/prev gallery navigation across a folder.
}

/**
 * MediaViewer — presentational full-viewport viewer for BLOB media.
 *
 * Renders images in a zoom/fullscreen Lightbox, video/PDF in fixed full-screen
 * viewer chrome. No auth/api hooks — everything via props, so it is reused by
 * both the logged-in Files app and the logged-out guest share viewer.
 */
export function MediaViewer({ file, idTag, token, onBack, onDownload }: MediaViewerProps) {
	const { t } = useTranslation()

	const fileId = file.fileId
	const contentType = file.contentType
	const isImage = contentType.startsWith('image/')
	const isVideo = contentType.startsWith('video/')
	const isPdf = contentType === 'application/pdf'

	const [toolbarVisible, setToolbarVisible] = React.useState(true)
	const hideTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
	const videoRef = React.useRef<HTMLVideoElement>(null)

	// Keep the latest onBack without re-running setupAutoHide on every render.
	const onBackRef = React.useRef(onBack)
	React.useEffect(() => {
		onBackRef.current = onBack
	}, [onBack])

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
			// Images render in <Lightbox>, which owns its own chrome and Escape
			// handling — no auto-hide timers or listeners needed (toolbarVisible
			// is unused for that branch).
			if (isImage) return

			resetToolbarTimeout()

			const handleMouseMove = () => resetToolbarTimeout()
			const handleKeyDown = (evt: KeyboardEvent) => {
				resetToolbarTimeout()
				if (evt.key === 'Escape') {
					onBackRef.current()
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
		[resetToolbarTimeout, isImage]
	)

	const handleDownload = React.useCallback(
		function handleDownload() {
			if (onDownload) {
				onDownload()
				return
			}
			const url = getFileUrl(idTag, fileId, undefined, { token })
			triggerDownload(url, file.fileName)
		},
		[onDownload, idTag, fileId, token, file.fileName]
	)

	function handleVideoFullscreen() {
		if (videoRef.current) {
			if (videoRef.current.requestFullscreen) {
				videoRef.current.requestFullscreen()
			}
		}
	}

	// Render image viewer using Lightbox
	if (isImage) {
		const imageUrl = getFileUrl(idTag, fileId, 'vis.hd', { token })
		return (
			<Lightbox
				open={true}
				close={onBack}
				slides={[{ src: imageUrl, alt: file.fileName }]}
				plugins={[Fullscreen, Zoom]}
				zoom={{ scrollToZoom: true }}
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
	if (isVideo) {
		const videoUrl = getFileUrl(idTag, fileId, 'vid.hd', { token })
		const posterUrl = getFileUrl(idTag, fileId, 'vis.sd', { token })

		return (
			<div className="c-file-viewer">
				<div className={mergeClasses('c-file-viewer-toolbar', !toolbarVisible && 'hidden')}>
					<Button mode="icon" onClick={onBack} title={t('Back')}>
						<IcBack />
					</Button>
					<span className="c-file-viewer-toolbar-filename">{file.fileName}</span>
					<div className="c-file-viewer-toolbar-divider" />
					<Button mode="icon" onClick={handleDownload} title={t('Download')}>
						<IcDownload />
					</Button>
					<Button mode="icon" onClick={handleVideoFullscreen} title={t('Fullscreen')}>
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
	if (isPdf) {
		return (
			<PdfViewer
				url={getFileUrl(idTag, fileId, undefined, { token })}
				fileName={file.fileName}
				onBack={onBack}
				onDownload={handleDownload}
				toolbarVisible={toolbarVisible}
			/>
		)
	}

	// Unsupported file type - offer download
	return (
		<div className="c-file-viewer">
			<div className={mergeClasses('c-file-viewer-toolbar', !toolbarVisible && 'hidden')}>
				<Button mode="icon" onClick={onBack} title={t('Back')}>
					<IcBack />
				</Button>
				<span className="c-file-viewer-toolbar-filename">{file.fileName}</span>
			</div>
			<div className="c-file-viewer-content">
				<div className="c-file-viewer-error">
					<h2>{file.fileName}</h2>
					<p className="text-secondary">{contentType}</p>
					<Button variant="primary" onClick={handleDownload}>
						<IcDownload />
						{t('Download')}
					</Button>
				</div>
			</div>
		</div>
	)
}

// vim: ts=4
