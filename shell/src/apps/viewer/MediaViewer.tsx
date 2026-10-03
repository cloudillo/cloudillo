// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'
import { type FileView, getFileUrl } from '@cloudillo/core'
import {
	Button,
	EmptyState,
	ImmersiveOverlay,
	Text,
	Toolbar,
	ToolbarDivider,
	VideoPlayer
} from '@cloudillo/react'
import {
	LuArrowLeft as IcBack,
	LuDownload as IcDownload,
	LuMaximize as IcFullscreen
} from 'react-icons/lu'
import { getDefaultStore } from 'jotai'
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'

import { activeContextAtom } from '../../context/index.js'
import { PdfViewer } from './PdfViewer.js'

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

/**
 * Stream-download a Cloudillo file via the service worker's `/cl-download`
 * route (see `shell/sw/index.ts`).
 *
 * We must NOT use an `<a download>` link: Chromium routes downloads initiated
 * via the `download` attribute through the browser's download manager, which
 * bypasses the controlling service worker entirely (the request goes straight
 * to the origin — observed as `/cl-download` returning the SPA `index.html`,
 * with no SW fetch handler ever running). Instead we navigate a hidden,
 * same-origin iframe to the token-less `/cl-download` URL. That navigation IS
 * intercepted by the SW, which injects the auth token, fetches the real
 * `cl-o.*` file and streams the body straight back with a
 * `Content-Disposition: attachment` header — so the browser saves it (filename
 * from the header) without buffering in page memory and without a token ever
 * appearing in a URL. Same technique as StreamSaver.js.
 *
 * A navigation has no client id, so the worker cannot find this tab's hat: the
 * worn hat for `idTag` rides along as `hat=` instead.
 */
export function triggerFileDownload(
	idTag: string,
	fileId: string,
	fileName: string,
	onError?: () => void
) {
	const params = new URLSearchParams({ idTag, fileId, name: fileName })
	const active = getDefaultStore().get(activeContextAtom)
	if (active?.idTag === idTag && active.hat) params.set('hat', active.hat.idTag)
	const iframe = document.createElement('iframe')
	iframe.hidden = true
	iframe.addEventListener('load', () => {
		// A real attachment download never navigates the frame, so a `load`
		// event means the SW did NOT stream the file (no controller, or a stale
		// SW returned the SPA shell). Surface it instead of failing silently.
		console.warn('[files] /cl-download was not streamed by the service worker')
		onError?.()
	})
	iframe.src = `/cl-download?${params}`
	document.body.appendChild(iframe)
	// Remove well after the download has been handed off to the download manager
	// (long enough not to cancel an in-flight large download).
	setTimeout(() => iframe.remove(), 60_000)
}

/** Content types the MediaViewer renders inline (everything else is a pure download). */
export function isViewerSupported(contentType?: string): boolean {
	if (!contentType) return false
	return (
		contentType.startsWith('image/') ||
		contentType.startsWith('video/') ||
		contentType === 'application/pdf'
	)
}

export interface MediaViewerProps {
	file: FileView
	idTag: string
	/** Omit for logged-in (cookie); pass scoped token for guests. */
	token?: string
	onBack: () => void
	/** Optional override; default streams the file via the service worker. */
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

	const videoRef = React.useRef<HTMLVideoElement>(null)

	const handleDownload = React.useCallback(
		function handleDownload() {
			if (onDownload) {
				onDownload()
				return
			}
			triggerFileDownload(idTag, fileId, file.fileName)
		},
		[onDownload, idTag, fileId, file.fileName]
	)

	function handleVideoFullscreen() {
		if (videoRef.current) {
			if (videoRef.current.requestFullscreen) {
				videoRef.current.requestFullscreen()
			}
		}
	}

	// A fileId `getFileUrl` refuses has no viewer URL, so all three viewer branches below
	// fall through to the final block rather than render a broken one — that block names
	// the refusal as the cause, since the download route builds the same URL and fails too.
	// `posterUrl` is the exception: `poster` is optional and React omits it when undefined.
	// The three flags are mutually exclusive, so at most one branch runs and one URL is used.
	const url = getFileUrl(idTag, fileId, isImage ? 'vis.hd' : isVideo ? 'vid.hd' : undefined, {
		token
	})
	const posterUrl = isVideo ? getFileUrl(idTag, fileId, 'vis.sd', { token }) : undefined

	// Render image viewer using Lightbox
	if (isImage && url) {
		return (
			<Lightbox
				open={true}
				close={onBack}
				slides={[{ src: url, alt: file.fileName }]}
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
						// biome-ignore lint/plugin/no-raw-intrinsic: ds-allow: third-party yet-another-react-lightbox
						<button
							key="download"
							type="button"
							className="yarl__button"
							onClick={handleDownload}
							aria-label={t('Download')}
						>
							<IcDownload size={24} />
						</button>,
						'close'
					]
				}}
			/>
		)
	}

	const backButton = <Button onClick={onBack} icon={<IcBack />} aria-label={t('Back')} />
	const fileNameText = (
		<Text size="sm" weight="medium" truncate className="flex-fill">
			{file.fileName}
		</Text>
	)

	// Render video viewer
	if (isVideo && url) {
		return (
			<ImmersiveOverlay
				open
				onClose={onBack}
				aria-label={file.fileName}
				controls={
					<Toolbar floating autoHide>
						{backButton}
						{fileNameText}
						<ToolbarDivider />
						<Button
							onClick={handleDownload}
							icon={<IcDownload />}
							aria-label={t('Download')}
						/>
						<Button
							onClick={handleVideoFullscreen}
							icon={<IcFullscreen />}
							aria-label={t('Fullscreen')}
						/>
					</Toolbar>
				}
			>
				<VideoPlayer
					ref={videoRef}
					inverse
					autoPlay
					src={url}
					poster={posterUrl}
					style={{ maxHeight: '100%' }}
				/>
			</ImmersiveOverlay>
		)
	}

	// Render PDF viewer
	if (isPdf && url) {
		return (
			<PdfViewer
				url={url}
				fileName={file.fileName}
				onBack={onBack}
				onDownload={handleDownload}
			/>
		)
	}

	// Unsupported file type - offer download
	return (
		<ImmersiveOverlay
			open
			onClose={onBack}
			aria-label={file.fileName}
			controls={
				<Toolbar floating>
					{backButton}
					{fileNameText}
				</Toolbar>
			}
		>
			{/* No URL is not an unsupported type: `getFileUrl` refused the id, so
			    the download below cannot work either. Say that instead. */}
			<EmptyState
				inverse
				title={file.fileName}
				description={url ? contentType : t('This file cannot be opened')}
				actions={
					url && (
						<Button color="primary" onClick={handleDownload} icon={<IcDownload />}>
							{t('Download')}
						</Button>
					)
				}
			/>
		</ImmersiveOverlay>
	)
}

// vim: ts=4
