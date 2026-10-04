// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Button,
	EmptyState,
	ImmersiveOverlay,
	LoadingSpinner,
	Text,
	Toolbar,
	ToolbarDivider,
	VBox
} from '@cloudillo/react'
import * as pdfjsLib from 'pdfjs-dist'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuArrowLeft as IcBack,
	LuDownload as IcDownload,
	LuChevronRight as IcNext,
	LuChevronLeft as IcPrev,
	LuZoomIn as IcZoomIn,
	LuZoomOut as IcZoomOut
} from 'react-icons/lu'

declare const process: { env: { CLOUDILLO_VERSION: string } }

pdfjsLib.GlobalWorkerOptions.workerSrc = `/assets-${process.env.CLOUDILLO_VERSION}/pdf.worker.min.mjs`

interface PdfViewerProps {
	url: string
	fileName: string
	onBack: () => void
	onDownload: () => void
}

const ZOOM_STEP = 0.25
const MIN_SCALE = 0.5
const MAX_SCALE = 4
const SWIPE_THRESHOLD = 50

export function PdfViewer({ url, fileName, onBack, onDownload }: PdfViewerProps) {
	const { t } = useTranslation()

	const canvasRef = React.useRef<HTMLCanvasElement>(null)
	const containerRef = React.useRef<HTMLDivElement>(null)
	const pdfDocRef = React.useRef<pdfjsLib.PDFDocumentProxy | null>(null)
	const loadingTaskRef = React.useRef<pdfjsLib.PDFDocumentLoadingTask | null>(null)
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

					const loadingTask = pdfjsLib.getDocument({ data })
					loadingTaskRef.current = loadingTask
					const doc = await loadingTask.promise
					if (cancelled) {
						loadingTask.destroy()
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
				if (loadingTaskRef.current) {
					loadingTaskRef.current.destroy()
					loadingTaskRef.current = null
				}
				pdfDocRef.current = null
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
				// The viewer is itself an overlay; only a dialog stacked above it blocks the keys
				const dialog = (evt.target as Element | null)?.closest?.(
					'dialog[open], [role="dialog"]'
				)
				if (dialog && !dialog.contains(containerRef.current)) return
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

	const zoomOut = () => setScale((s) => Math.max(MIN_SCALE, (s ?? fitWidthScale) - ZOOM_STEP))
	const zoomIn = () => setScale((s) => Math.min(MAX_SCALE, (s ?? fitWidthScale) + ZOOM_STEP))
	const ready = !loading && !error

	return (
		<ImmersiveOverlay
			open
			onClose={onBack}
			aria-label={fileName}
			controls={
				<Toolbar floating autoHide>
					<Button onClick={onBack} icon={<IcBack />} aria-label={t('Back')} />
					<Text size="sm" weight="medium" truncate className="flex-fill">
						{fileName}
					</Text>
					{ready && (
						<>
							<ToolbarDivider />
							<Button
								icon={<IcPrev />}
								aria-label={t('Previous page')}
								onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
								disabled={currentPage <= 1}
							/>
							<Text size="sm" weight="medium" align="center">
								{currentPage} / {numPages}
							</Text>
							<Button
								icon={<IcNext />}
								aria-label={t('Next page')}
								onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
								disabled={currentPage >= numPages}
							/>
							<ToolbarDivider />
							<Button
								icon={<IcZoomOut />}
								aria-label={t('Zoom out')}
								onClick={zoomOut}
							/>
							<Button variant="ghost" onClick={() => setScale(null)}>
								{scale ? `${Math.round(effectiveScale * 100)}%` : t('Fit')}
							</Button>
							<Button
								icon={<IcZoomIn />}
								aria-label={t('Zoom in')}
								onClick={zoomIn}
							/>
							<ToolbarDivider />
							<Button
								icon={<IcDownload />}
								aria-label={t('Download')}
								onClick={onDownload}
							/>
						</>
					)}
				</Toolbar>
			}
		>
			{loading ? (
				<LoadingSpinner size="lg" inverse label={t('Loading...')} />
			) : error ? (
				<EmptyState
					inverse
					color="error"
					title={error}
					actions={<Button onClick={onBack}>{t('Go back')}</Button>}
				/>
			) : (
				<VBox
					ref={containerRef}
					align="center"
					className="w-100 h-100 overflow-auto p-3"
					onTouchStart={handleTouchStart}
					onTouchEnd={handleTouchEnd}
				>
					<canvas ref={canvasRef} />
				</VBox>
			)}
		</ImmersiveOverlay>
	)
}

// vim: ts=4
