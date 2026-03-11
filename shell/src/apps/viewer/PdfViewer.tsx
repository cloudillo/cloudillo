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
import { useTranslation } from 'react-i18next'
import * as pdfjsLib from 'pdfjs-dist'

import {
	LuArrowLeft as IcBack,
	LuDownload as IcDownload,
	LuChevronLeft as IcPrev,
	LuChevronRight as IcNext,
	LuZoomOut as IcZoomOut,
	LuZoomIn as IcZoomIn
} from 'react-icons/lu'

import { Button, LoadingSpinner, mergeClasses } from '@cloudillo/react'

import './viewer.css'

declare const process: { env: { CLOUDILLO_VERSION: string } }

pdfjsLib.GlobalWorkerOptions.workerSrc = `/assets-${process.env.CLOUDILLO_VERSION}/pdf.worker.min.mjs`

interface PdfViewerProps {
	url: string
	fileName: string
	onBack: () => void
	onDownload: () => void
	toolbarVisible: boolean
}

const ZOOM_STEP = 0.25
const MIN_SCALE = 0.5
const MAX_SCALE = 4
const SWIPE_THRESHOLD = 50

export function PdfViewer({ url, fileName, onBack, onDownload, toolbarVisible }: PdfViewerProps) {
	const { t } = useTranslation()

	const canvasRef = React.useRef<HTMLCanvasElement>(null)
	const containerRef = React.useRef<HTMLDivElement>(null)
	const pdfDocRef = React.useRef<pdfjsLib.PDFDocumentProxy | null>(null)
	const renderTaskRef = React.useRef<pdfjsLib.RenderTask | null>(null)

	const [numPages, setNumPages] = React.useState(0)
	const [currentPage, setCurrentPage] = React.useState(1)
	const [scale, setScale] = React.useState<number | null>(null) // null = fit-width
	const [fitWidthScale, setFitWidthScale] = React.useState(1)
	const [loading, setLoading] = React.useState(true)
	const [error, setError] = React.useState<string | null>(null)

	const touchStartRef = React.useRef<{ x: number; y: number } | null>(null)

	const effectiveScale = scale ?? fitWidthScale

	// Load PDF document
	React.useEffect(
		function loadPdf() {
			let cancelled = false

			;(async function () {
				try {
					const response = await fetch(url)
					if (!response.ok) throw new Error(`HTTP ${response.status}`)
					const data = await response.arrayBuffer()
					if (cancelled) return

					const doc = await pdfjsLib.getDocument({ data }).promise
					if (cancelled) {
						doc.destroy()
						return
					}
					pdfDocRef.current = doc
					setNumPages(doc.numPages)
					setLoading(false)
				} catch (err) {
					if (!cancelled) {
						console.error('[PdfViewer] Failed to load PDF:', err)
						setError(t('Failed to load PDF'))
						setLoading(false)
					}
				}
			})()

			return () => {
				cancelled = true
				if (pdfDocRef.current) {
					pdfDocRef.current.destroy()
					pdfDocRef.current = null
				}
			}
		},
		[url, t]
	)

	// Calculate fit-width scale
	const calcFitWidth = React.useCallback(function calcFitWidth(page: pdfjsLib.PDFPageProxy) {
		const container = containerRef.current
		if (!container) return

		const viewport = page.getViewport({ scale: 1 })
		const containerWidth = container.clientWidth - 32 // padding
		const newScale = containerWidth / viewport.width
		setFitWidthScale(newScale)
	}, [])

	// Render current page
	React.useEffect(
		function renderPage() {
			const pdfDoc = pdfDocRef.current
			const canvas = canvasRef.current
			if (!pdfDoc || !canvas || loading) return

			let cancelled = false

			pdfDoc.getPage(currentPage).then((page) => {
				if (cancelled) return

				// Recalculate fit-width from this page
				calcFitWidth(page)

				const viewport = page.getViewport({ scale: effectiveScale })
				const dpr = window.devicePixelRatio || 1

				canvas.width = Math.floor(viewport.width * dpr)
				canvas.height = Math.floor(viewport.height * dpr)
				canvas.style.width = `${Math.floor(viewport.width)}px`
				canvas.style.height = `${Math.floor(viewport.height)}px`

				// Cancel any in-flight render
				if (renderTaskRef.current) {
					renderTaskRef.current.cancel()
				}

				const renderTask = page.render({
					canvas,
					viewport: page.getViewport({ scale: effectiveScale * dpr })
				})
				renderTaskRef.current = renderTask

				renderTask.promise.catch((err) => {
					if (err?.name !== 'RenderingCancelledException') {
						console.error('[PdfViewer] Render error:', err)
					}
				})
			})

			return () => {
				cancelled = true
				if (renderTaskRef.current) {
					renderTaskRef.current.cancel()
					renderTaskRef.current = null
				}
			}
		},
		[currentPage, effectiveScale, loading, calcFitWidth]
	)

	// ResizeObserver for fit-width recalculation
	React.useEffect(
		function observeResize() {
			const container = containerRef.current
			const pdfDoc = pdfDocRef.current
			if (!container || !pdfDoc || loading) return

			const observer = new ResizeObserver(() => {
				pdfDoc.getPage(currentPage).then((page) => {
					calcFitWidth(page)
				})
			})

			observer.observe(container)
			return () => observer.disconnect()
		},
		[currentPage, loading, calcFitWidth]
	)

	// Touch handlers for swipe navigation
	function handleTouchStart(evt: React.TouchEvent) {
		if (evt.touches.length === 1) {
			touchStartRef.current = { x: evt.touches[0].clientX, y: evt.touches[0].clientY }
		}
	}

	function handleTouchEnd(evt: React.TouchEvent) {
		if (!touchStartRef.current || evt.changedTouches.length !== 1) return

		const dx = evt.changedTouches[0].clientX - touchStartRef.current.x
		const dy = evt.changedTouches[0].clientY - touchStartRef.current.y
		touchStartRef.current = null

		// Only trigger if horizontal swipe is dominant
		if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
			if (dx < 0 && currentPage < numPages) {
				setCurrentPage((p) => p + 1)
			} else if (dx > 0 && currentPage > 1) {
				setCurrentPage((p) => p - 1)
			}
		}
	}

	// Keyboard navigation
	React.useEffect(
		function keyboardNav() {
			function handleKeyDown(evt: KeyboardEvent) {
				switch (evt.key) {
					case 'ArrowLeft':
						setCurrentPage((p) => Math.max(1, p - 1))
						break
					case 'ArrowRight':
						setCurrentPage((p) => Math.min(numPages, p + 1))
						break
					case '+':
					case '=':
						setScale((s) => Math.min(MAX_SCALE, (s ?? fitWidthScale) + ZOOM_STEP))
						break
					case '-':
						setScale((s) => Math.max(MIN_SCALE, (s ?? fitWidthScale) - ZOOM_STEP))
						break
					case '0':
						setScale(null) // Reset to fit-width
						break
				}
			}

			document.addEventListener('keydown', handleKeyDown)
			return () => document.removeEventListener('keydown', handleKeyDown)
		},
		[numPages, fitWidthScale]
	)

	if (loading) {
		return (
			<div className="c-file-viewer">
				<div className={mergeClasses('c-file-viewer-toolbar', !toolbarVisible && 'hidden')}>
					<Button icon onClick={onBack} title={t('Back')}>
						<IcBack />
					</Button>
					<span className="c-file-viewer-toolbar-filename">{fileName}</span>
				</div>
				<div className="c-file-viewer-content">
					<LoadingSpinner size="lg" label={t('Loading...')} />
				</div>
			</div>
		)
	}

	if (error) {
		return (
			<div className="c-file-viewer">
				<div className={mergeClasses('c-file-viewer-toolbar', !toolbarVisible && 'hidden')}>
					<Button icon onClick={onBack} title={t('Back')}>
						<IcBack />
					</Button>
					<span className="c-file-viewer-toolbar-filename">{fileName}</span>
				</div>
				<div className="c-file-viewer-content">
					<div className="c-file-viewer-error">
						<p>{error}</p>
						<Button onClick={onBack}>{t('Go back')}</Button>
					</div>
				</div>
			</div>
		)
	}

	return (
		<div className="c-file-viewer">
			<div className={mergeClasses('c-file-viewer-toolbar', !toolbarVisible && 'hidden')}>
				<Button icon onClick={onBack} title={t('Back')}>
					<IcBack />
				</Button>
				<span className="c-file-viewer-toolbar-filename">{fileName}</span>
				<div className="c-file-viewer-toolbar-divider" />
				<Button icon onClick={onDownload} title={t('Download')}>
					<IcDownload />
				</Button>
			</div>

			<div
				ref={containerRef}
				className="c-file-viewer-pdf-container"
				onTouchStart={handleTouchStart}
				onTouchEnd={handleTouchEnd}
			>
				<canvas ref={canvasRef} className="c-file-viewer-pdf-canvas" />
			</div>

			<div className={mergeClasses('c-file-viewer-pdf-nav', !toolbarVisible && 'hidden')}>
				<Button
					icon
					onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
					disabled={currentPage <= 1}
				>
					<IcPrev />
				</Button>
				<span className="c-file-viewer-pdf-page-info">
					{currentPage} / {numPages}
				</span>
				<Button
					icon
					onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
					disabled={currentPage >= numPages}
				>
					<IcNext />
				</Button>
				<div className="c-file-viewer-toolbar-divider" />
				<Button
					icon
					onClick={() =>
						setScale((s) => Math.max(MIN_SCALE, (s ?? fitWidthScale) - ZOOM_STEP))
					}
				>
					<IcZoomOut />
				</Button>
				<Button icon onClick={() => setScale(null)} title={t('Fit width')}>
					{scale ? `${Math.round(effectiveScale * 100)}%` : t('Fit')}
				</Button>
				<Button
					icon
					onClick={() =>
						setScale((s) => Math.min(MAX_SCALE, (s ?? fitWidthScale) + ZOOM_STEP))
					}
				>
					<IcZoomIn />
				</Button>
			</div>
		</div>
	)
}

// vim: ts=4
