// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	createApiClient,
	getAppBus,
	getDocWsUrl,
	getFileUrl,
	type MediaFileResolvedPush
} from '@cloudillo/core'
import { Dialog, LoadingSpinner, Panel, ZoomableImage } from '@cloudillo/react'
import { RtdbClient } from '@cloudillo/rtdb'
import * as React from 'react'
import {
	PiArrowLeftBold as IcBack,
	PiCameraBold as IcCamera,
	PiCropBold as IcCrop,
	PiTrashBold as IcDelete,
	PiEraserBold as IcEraser,
	PiFunnelBold as IcFilter,
	PiImageBold as IcImage,
	PiFilePdfBold as IcPdf,
	PiPencilSimpleBold as IcPen,
	PiRectangleBold as IcRect,
	PiScanBold as IcScan,
	PiArrowCounterClockwiseBold as IcUndo
} from 'react-icons/pi'
import { useLocation } from 'react-router-dom'

import { FAB } from './components/FAB.js'

import '@symbion/opalui'
import '@symbion/opalui/themes/glass.css'
import './style.css'

import { AnnotationOverlay } from './components/AnnotationOverlay.js'
import { CropEditor } from './components/CropEditor.js'
import { FilterSelect } from './components/FilterSelect.js'
import type { MarginOption } from './export/pdf-export.js'
import { useBackStack } from './hooks/use-back-stack.js'
import type {
	Annotation,
	AnnotationTool,
	CaptureFlowState,
	CornerSource,
	CropPoints,
	PageFilter,
	ScanPage
} from './types.js'
import { FILTER_DEFAULTS } from './types.js'
import {
	applyFilter,
	base64ToBlob,
	blendWithOriginal,
	canvasToBlob,
	extractPerspective,
	rotateCanvas
} from './utils/image-processing.js'
import { lerpQuad, quadDistance } from './utils/refine-quad.js'

const APP_NAME = 'scanillo'

// Live-preview lock. Two consecutive preview detections that agree within these bounds
// start a streak; a streak that is long and fresh enough at shutter time becomes the seed
// quad for the full-res pass.
//
// Handheld drift at 5fps (200ms) is ~0.5-1% of the frame while deliberately framing, and
// the quadrant heuristic's own jitter is 1-2px @640 ≈ 0.2-0.3%: generous enough not to
// reject a steady hand, tight enough to catch a pan.
const LOCK_AGREE_MEAN = 0.02
// Per-corner cap, so one corner jumping across the frame cannot be averaged away by three
// stable ones.
const LOCK_AGREE_MAX = 0.04
// `streak` counts agreeing *transitions*: first detection → 0, second agreeing → 1, third
// → 2. So 2 demands three detections, i.e. >=400ms of agreement.
const MIN_STABLE_STREAK = 2
// A fresh lock is normally <=400ms old at shutter (200ms frame interval + 20-80ms detect).
// This tolerates 1-2 dropped frames without accepting a quad from a recomposed scene.
const MAX_LOCK_AGE_MS = 1500
// Cuts jitter by sqrt(a/(2-a)) = 0.577 while still tracking motion.
const LOCK_EMA_ALPHA = 0.5

type PendingTempId = { pageId: string; field: 'fileId' | 'originalFileId' }

// =============================================================================
// HOOKS
// =============================================================================

function useScanillo() {
	const location = useLocation()
	const [client, setClient] = React.useState<RtdbClient | undefined>()
	const [connected, setConnected] = React.useState(false)
	const [loading, setLoading] = React.useState(true)
	const [error, setError] = React.useState<Error | undefined>()
	const [fileId, setFileId] = React.useState('')
	const [ownerTag, setOwnerTag] = React.useState<string | undefined>()
	const [idTag, setIdTag] = React.useState<string | undefined>()
	const [access, setAccess] = React.useState<'read' | 'comment' | 'write'>('write')
	const [token, setToken] = React.useState<string | undefined>()

	React.useEffect(() => {
		const resId = location.hash.slice(1)
		const [owner, path] = resId.split(':')
		setOwnerTag(owner || undefined)
		setFileId(path || '')
	}, [location.hash])

	React.useEffect(() => {
		if (!fileId) return
		let rtdbClient: RtdbClient | undefined
		let unmounted = false

		;(async () => {
			try {
				setLoading(true)
				setError(undefined)

				const bus = getAppBus()
				const _state = await bus.init(APP_NAME)
				setIdTag(bus.idTag)
				setAccess(bus.access)
				setToken(bus.accessToken)

				if (unmounted) return

				// Documents live on their owner's instance; an ownerless document is our own.
				const serverUrl = getDocWsUrl(ownerTag, bus.idTag)
				if (!serverUrl) throw new Error('No identity available for RTDB connection')

				rtdbClient = new RtdbClient({
					dbId: fileId,
					auth: {
						getToken: () => bus.accessToken,
						// On a 4401 `getToken` above is already stale — must renew.
						refreshToken: () => bus.refreshToken()
					},
					serverUrl,
					options: {
						enableCache: true,
						reconnect: true,
						reconnectDelay: 1000,
						maxReconnectDelay: 30000,
						debug: false
					}
				})

				await rtdbClient.connect()

				if (unmounted) {
					await rtdbClient.disconnect()
					return
				}

				setClient(rtdbClient)
				setConnected(true)
				setLoading(false)
			} catch (err) {
				console.error('[Scanillo] Initialization error:', err)
				if (!unmounted) {
					setError(err as Error)
					setLoading(false)
				}
			}
		})()

		return () => {
			unmounted = true
			if (rtdbClient) {
				rtdbClient.disconnect().catch(console.error)
			}
		}
	}, [fileId, ownerTag])

	return {
		client,
		fileId,
		idTag,
		ownerTag,
		access,
		token,
		connected,
		error,
		loading
	}
}

function usePages(client: RtdbClient | undefined) {
	const [pages, setPages] = React.useState<ScanPage[]>([])
	const [loading, setLoading] = React.useState(true)

	React.useEffect(() => {
		if (!client) {
			setLoading(false)
			return
		}

		setLoading(true)

		const unsubscribe = client.collection<ScanPage>('pages').onSnapshot(
			(snapshot) => {
				const pageList = snapshot.docs
					.map(
						(doc) =>
							({
								id: doc.id,
								...doc.data()
							}) as ScanPage
					)
					.sort((a, b) => a.order - b.order)
				setPages(pageList)
				setLoading(false)
			},
			(err) => {
				console.error('[usePages] Subscription error:', err)
				setLoading(false)
			}
		)

		return () => {
			unsubscribe()
		}
	}, [client])

	const addPage = React.useCallback(
		async (
			fileId: string,
			fileName: string,
			contentType: string,
			dim?: [number, number],
			extra?: {
				originalFileId?: string
				filter?: PageFilter
				filterStrength?: number
				rotation?: number
				cropPoints?: CropPoints
			}
		): Promise<string | undefined> => {
			if (!client) return

			const maxOrder = pages.length > 0 ? Math.max(...pages.map((p) => p.order)) : 0

			const docRef = await client.collection('pages').create({
				order: maxOrder + 1,
				fileId,
				fileName,
				contentType,
				filter: extra?.filter ?? 'original',
				filterStrength: extra?.filterStrength,
				rotation: extra?.rotation ?? 0,
				...(dim && { width: dim[0], height: dim[1] }),
				...(extra?.originalFileId && { originalFileId: extra.originalFileId }),
				...(extra?.cropPoints && { cropPoints: extra.cropPoints }),
				createdAt: new Date().toISOString()
			})
			return docRef.id
		},
		[client, pages]
	)

	const updatePage = React.useCallback(
		async (
			pageId: string,
			updates: Partial<
				Pick<
					ScanPage,
					| 'fileId'
					| 'originalFileId'
					| 'filter'
					| 'filterStrength'
					| 'rotation'
					| 'cropPoints'
					| 'annotations'
					| 'width'
					| 'height'
				>
			>
		) => {
			if (!client) return
			await client.ref(`pages/${pageId}`).update(updates)
		},
		[client]
	)

	const deletePage = React.useCallback(
		async (id: string) => {
			if (!client) return
			await client.ref(`pages/${id}`).delete()
		},
		[client]
	)

	const movePage = React.useCallback(
		async (pageId: string, targetId: string, position: 'before' | 'after') => {
			if (!client) return
			const siblings = pages.filter((p) => p.id !== pageId).sort((a, b) => a.order - b.order)
			const targetIdx = siblings.findIndex((p) => p.id === targetId)
			if (targetIdx === -1) return

			let newOrder: number
			if (position === 'before') {
				const prevOrder = targetIdx > 0 ? siblings[targetIdx - 1].order : undefined
				newOrder =
					prevOrder != null
						? (prevOrder + siblings[targetIdx].order) / 2
						: siblings[targetIdx].order - 1
			} else {
				const nextOrder =
					targetIdx < siblings.length - 1 ? siblings[targetIdx + 1].order : undefined
				newOrder =
					nextOrder != null
						? (siblings[targetIdx].order + nextOrder) / 2
						: siblings[targetIdx].order + 1
			}

			await client.ref(`pages/${pageId}`).update({ order: newOrder })
		},
		[client, pages]
	)

	return { pages, loading, addPage, updatePage, deletePage, movePage }
}

// =============================================================================
// COMPONENTS
// =============================================================================

function PageGrid({
	pages,
	loading,
	ownerTag,
	token,
	onSelectPage,
	onMovePage
}: {
	pages: ScanPage[]
	loading: boolean
	ownerTag?: string
	token?: string
	onSelectPage: (id: string) => void
	onMovePage: (pageId: string, targetId: string, position: 'before' | 'after') => void
}) {
	const [draggedId, setDraggedId] = React.useState<string | null>(null)
	const [dropTargetId, setDropTargetId] = React.useState<string | null>(null)
	const [dropPosition, setDropPosition] = React.useState<'before' | 'after'>('before')

	// Touch drag state
	const touchState = React.useRef<{
		timer: ReturnType<typeof setTimeout> | null
		dragId: string | null
		clone: HTMLElement | null
		startX: number
		startY: number
	}>({ timer: null, dragId: null, clone: null, startX: 0, startY: 0 })

	function cleanupTouch() {
		const ts = touchState.current
		if (ts.timer) clearTimeout(ts.timer)
		if (ts.clone) ts.clone.remove()
		ts.timer = null
		ts.dragId = null
		ts.clone = null
		setDraggedId(null)
		setDropTargetId(null)
	}

	function handleDragStart(e: React.DragEvent, pageId: string) {
		setDraggedId(pageId)
		e.dataTransfer.effectAllowed = 'move'
		e.dataTransfer.setData('text/plain', pageId)
	}

	function handleDragOver(e: React.DragEvent, pageId: string) {
		e.preventDefault()
		if (pageId === draggedId) return
		const rect = e.currentTarget.getBoundingClientRect()
		const pos = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
		setDropTargetId(pageId)
		setDropPosition(pos)
	}

	function handleDragLeave() {
		setDropTargetId(null)
	}

	function handleDrop(e: React.DragEvent) {
		e.preventDefault()
		const sourceId = e.dataTransfer.getData('text/plain')
		if (sourceId && dropTargetId && sourceId !== dropTargetId) {
			onMovePage(sourceId, dropTargetId, dropPosition)
		}
		setDraggedId(null)
		setDropTargetId(null)
	}

	function handleDragEnd() {
		setDraggedId(null)
		setDropTargetId(null)
	}

	function handleTouchStart(e: React.TouchEvent, pageId: string) {
		const touch = e.touches[0]
		const ts = touchState.current
		ts.startX = touch.clientX
		ts.startY = touch.clientY
		ts.timer = setTimeout(() => {
			ts.dragId = pageId
			setDraggedId(pageId)

			// Create ghost clone
			const el = e.currentTarget as HTMLElement
			const rect = el.getBoundingClientRect()
			const clone = el.cloneNode(true) as HTMLElement
			clone.className = 'page-thumb drag-clone'
			clone.style.width = `${rect.width}px`
			clone.style.height = `${rect.height}px`
			clone.style.left = `${touch.clientX - rect.width / 2}px`
			clone.style.top = `${touch.clientY - rect.height / 2}px`
			document.body.appendChild(clone)
			ts.clone = clone
		}, 400)
	}

	function handleTouchMove(e: React.TouchEvent) {
		const ts = touchState.current
		const touch = e.touches[0]

		// Cancel long-press if moved before triggering
		if (ts.timer && !ts.dragId) {
			const dx = touch.clientX - ts.startX
			const dy = touch.clientY - ts.startY
			if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
				clearTimeout(ts.timer)
				ts.timer = null
			}
			return
		}

		if (!ts.dragId) return
		e.preventDefault()

		// Move clone
		if (ts.clone) {
			const rect = ts.clone.getBoundingClientRect()
			ts.clone.style.left = `${touch.clientX - rect.width / 2}px`
			ts.clone.style.top = `${touch.clientY - rect.height / 2}px`
		}

		// Find drop target
		if (ts.clone) ts.clone.style.pointerEvents = 'none'
		const target = document.elementFromPoint(touch.clientX, touch.clientY)
		if (ts.clone) ts.clone.style.pointerEvents = ''

		const thumb = target?.closest('.page-thumb') as HTMLElement | null
		if (thumb) {
			const id = thumb.dataset.pageId
			if (id && id !== ts.dragId) {
				const rect = thumb.getBoundingClientRect()
				const pos = touch.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
				setDropTargetId(id)
				setDropPosition(pos)
			}
		} else {
			setDropTargetId(null)
		}
	}

	function handleTouchEnd() {
		const ts = touchState.current
		if (ts.dragId && dropTargetId && ts.dragId !== dropTargetId) {
			onMovePage(ts.dragId, dropTargetId, dropPosition)
		}
		cleanupTouch()
	}

	if (loading && pages.length === 0) {
		return <LoadingSpinner label="Loading pages…" />
	}

	if (pages.length === 0) {
		return (
			<div className="empty-state">
				<div className="empty-state-icon">
					<IcScan size={48} />
				</div>
				<p className="empty-state-text">No pages yet</p>
				<small>Add pages using the button below.</small>
			</div>
		)
	}

	return (
		<div className="page-grid" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
			{pages.map((page, idx) => {
				const isDragged = page.id === draggedId
				const isDropTarget = page.id === dropTargetId
				const cls = [
					'page-thumb',
					isDragged ? 'dragging' : '',
					isDropTarget && dropPosition === 'before' ? 'drop-before' : '',
					isDropTarget && dropPosition === 'after' ? 'drop-after' : ''
				]
					.filter(Boolean)
					.join(' ')
				return (
					<div
						key={page.id}
						className={cls}
						data-page-id={page.id}
						draggable
						onClick={() => !draggedId && onSelectPage(page.id)}
						onDragStart={(e) => handleDragStart(e, page.id)}
						onDragOver={(e) => handleDragOver(e, page.id)}
						onDragLeave={handleDragLeave}
						onDragEnd={handleDragEnd}
						onTouchStart={(e) => handleTouchStart(e, page.id)}
						onTouchMove={handleTouchMove}
						onTouchEnd={handleTouchEnd}
					>
						{ownerTag && (
							<img
								src={getFileUrl(ownerTag, page.fileId, 'vis.tn', { token })}
								alt={`Page ${idx + 1}`}
								loading="lazy"
							/>
						)}
						<span className="page-number">{idx + 1}</span>
					</div>
				)
			})}
		</div>
	)
}

const ANNOTATION_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6']
const DEFAULT_STROKE_WIDTH = 0.005

function PageDetail({
	page,
	pageIndex,
	totalPages,
	ownerTag,
	token,
	onBack,
	onDelete,
	onReEdit,
	onUpdateAnnotations
}: {
	page: ScanPage
	pageIndex: number
	totalPages: number
	ownerTag?: string
	token?: string
	onBack: () => void
	onDelete: (id: string) => void
	onReEdit: (page: ScanPage, mode: 'crop' | 'filter') => void
	onUpdateAnnotations: (pageId: string, annotations: Annotation[]) => void
}) {
	const [confirming, setConfirming] = React.useState(false)
	const [activeTool, setActiveTool] = React.useState<AnnotationTool | null>(null)
	const [color, setColor] = React.useState(ANNOTATION_COLORS[0])
	const [strokeWidth, setStrokeWidth] = React.useState(DEFAULT_STROKE_WIDTH)
	const [annotations, setAnnotations] = React.useState<Annotation[]>(page.annotations ?? [])
	const [processedUrl, setProcessedUrl] = React.useState<string | null>(null)
	const [processing, setProcessing] = React.useState(false)

	// Sync annotations from page prop when page changes
	React.useEffect(() => {
		setAnnotations(page.annotations ?? [])
	}, [page.id])

	// Stabilize cropPoints reference to avoid unnecessary reprocessing
	const cropPointsKey = JSON.stringify(page.cropPoints)

	// Reprocess high-res image from original
	React.useEffect(() => {
		if (!ownerTag) return

		const sourceFileId = page.originalFileId ?? page.fileId
		const url = getFileUrl(ownerTag, sourceFileId, 'orig', { token })
		let cancelled = false
		let objectUrl: string | null = null

		setProcessedUrl(null)
		setProcessing(true)

		async function process() {
			try {
				// Load original image into canvas
				const img = new Image()
				img.crossOrigin = 'anonymous'
				await new Promise<void>((resolve, reject) => {
					img.onload = () => resolve()
					img.onerror = () => reject(new Error('Failed to load image'))
					img.src = url
				})
				if (cancelled) return

				let canvas = document.createElement('canvas')
				canvas.width = img.naturalWidth
				canvas.height = img.naturalHeight
				const ctx = canvas.getContext('2d')!
				ctx.drawImage(img, 0, 0)

				// Apply crop
				if (page.cropPoints) {
					canvas = await extractPerspective(canvas, page.cropPoints)
				}
				if (cancelled) return

				// Apply filter
				if (page.filter && page.filter !== 'original') {
					const strength = page.filterStrength ?? FILTER_DEFAULTS[page.filter]
					const original = canvas
					const filtered = await applyFilter(canvas, page.filter)
					canvas = blendWithOriginal(original, filtered, strength / 100)
				}
				if (cancelled) return

				// Apply rotation
				if (page.rotation && page.rotation !== 0) {
					canvas = rotateCanvas(canvas, page.rotation)
				}

				const blob = await canvasToBlob(canvas, 0.92)
				if (cancelled) return

				objectUrl = URL.createObjectURL(blob)
				setProcessedUrl(objectUrl)
			} catch (err) {
				console.error('Failed to process high-res image:', err)
			} finally {
				if (!cancelled) setProcessing(false)
			}
		}

		process()

		return () => {
			cancelled = true
			if (objectUrl) URL.revokeObjectURL(objectUrl)
		}
	}, [
		ownerTag,
		token,
		page.id,
		page.originalFileId,
		page.fileId,
		cropPointsKey,
		page.filter,
		page.filterStrength,
		page.rotation
	])

	function handleAddAnnotation(ann: Annotation) {
		const next = [...annotations, ann]
		setAnnotations(next)
		onUpdateAnnotations(page.id, next)
	}

	function handleUndo() {
		if (annotations.length === 0) return
		const next = annotations.slice(0, -1)
		setAnnotations(next)
		onUpdateAnnotations(page.id, next)
	}

	function handleRemoveAnnotation(id: string) {
		const next = annotations.filter((a) => a.id !== id)
		setAnnotations(next)
		onUpdateAnnotations(page.id, next)
	}

	function toggleTool(tool: AnnotationTool) {
		setActiveTool((prev) => (prev === tool ? null : tool))
	}

	function handleDelete() {
		if (!confirming) {
			setConfirming(true)
			setTimeout(() => setConfirming(false), 3000)
			return
		}
		onDelete(page.id)
	}

	return (
		<div className="page-detail">
			<div className="page-detail-header">
				<button className="c-button icon" onClick={onBack}>
					<IcBack />
				</button>
				<h3>
					Page {pageIndex + 1} of {totalPages}
				</h3>
			</div>
			<div className="page-detail-image">
				{ownerTag && (
					<ZoomableImage alt={`Page ${pageIndex + 1}`}>
						<img
							src={
								processedUrl ??
								getFileUrl(ownerTag, page.fileId, 'vis.md', { token })
							}
							alt={`Page ${pageIndex + 1}`}
							style={{
								width: '100%',
								height: '100%',
								objectFit: 'contain',
								pointerEvents: 'none',
								userSelect: 'none'
							}}
							draggable={false}
						/>
						<AnnotationOverlay
							annotations={annotations}
							activeTool={activeTool}
							color={color}
							strokeWidth={strokeWidth}
							opacity={1}
							imageWidth={page.width ?? 1}
							imageHeight={page.height ?? 1}
							onAdd={handleAddAnnotation}
							onRemove={handleRemoveAnnotation}
						/>
						{processing && (
							<div
								style={{
									position: 'absolute',
									inset: 0,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									background: 'rgba(0,0,0,0.15)',
									borderRadius: 'var(--radius-sm)',
									pointerEvents: 'none'
								}}
							>
								<LoadingSpinner />
							</div>
						)}
					</ZoomableImage>
				)}
			</div>
			{activeTool && activeTool !== 'eraser' && (
				<div className="annotation-options-bar">
					<div className="annotation-colors">
						{ANNOTATION_COLORS.map((c) => (
							<button
								key={c}
								className={`annotation-color-dot${c === color ? ' active' : ''}`}
								style={{ background: c }}
								onClick={() => setColor(c)}
							/>
						))}
					</div>
					<input
						type="range"
						className="annotation-stroke-slider"
						min={0.0015}
						max={0.015}
						step={0.0005}
						value={strokeWidth}
						onChange={(e) => setStrokeWidth(Number(e.target.value))}
					/>
				</div>
			)}
			<div className="action-bar">
				<button
					className={`c-button icon${activeTool === 'freehand' ? ' primary' : ''}`}
					onClick={() => toggleTool('freehand')}
					title="Pen"
				>
					<IcPen />
				</button>
				<button
					className={`c-button icon${activeTool === 'rect' ? ' primary' : ''}`}
					onClick={() => toggleTool('rect')}
					title="Rectangle"
				>
					<IcRect />
				</button>
				<button
					className={`c-button icon${activeTool === 'eraser' ? ' primary' : ''}`}
					onClick={() => toggleTool('eraser')}
					title="Eraser"
				>
					<IcEraser />
				</button>
				{activeTool && (
					<button
						className="c-button icon"
						onClick={handleUndo}
						disabled={annotations.length === 0}
						title="Undo"
					>
						<IcUndo />
					</button>
				)}
				<div style={{ flex: 1 }} />
				<button
					className="c-button icon"
					onClick={() => onReEdit(page, 'crop')}
					title="Adjust crop"
				>
					<IcCrop />
				</button>
				<button
					className="c-button icon"
					onClick={() => onReEdit(page, 'filter')}
					title="Change filter"
				>
					<IcFilter />
				</button>
				{confirming ? (
					<button className="c-button error" onClick={handleDelete}>
						<IcDelete /> Delete?
					</button>
				) : (
					<button className="c-button icon" onClick={handleDelete} title="Delete page">
						<IcDelete />
					</button>
				)}
			</div>
		</div>
	)
}

// =============================================================================
// EXPORT DIALOG
// =============================================================================

interface ExportOptions {
	dpi: number
	margin: MarginOption
	annotations: boolean
}

function ExportDialog({
	open,
	onClose,
	onExport
}: {
	open: boolean
	onClose: () => void
	onExport: (options: ExportOptions) => void
}) {
	const [dpi, setDpi] = React.useState(150)
	const [margin, setMargin] = React.useState<MarginOption>('normal')
	const [annotations, setAnnotations] = React.useState(true)

	function handleExport() {
		onExport({ dpi, margin, annotations })
	}

	return (
		<Dialog open={open} title="Export PDF" dismissable onClose={onClose}>
			<div className="c-vbox g-3">
				<div className="c-vbox g-1">
					<label className="export-label">Resolution</label>
					<div className="c-hbox g-2">
						{(
							[
								[72, 'Draft'],
								[150, 'Normal'],
								[300, 'High']
							] as const
						).map(([value, label]) => (
							<label key={value} className="c-hbox g-1 align-center">
								<input
									type="radio"
									name="dpi"
									checked={dpi === value}
									onChange={() => setDpi(value)}
								/>
								{label}
							</label>
						))}
					</div>
				</div>

				<div className="c-vbox g-1">
					<label className="export-label">Margins</label>
					<div className="c-hbox g-2">
						{(
							[
								['none', 'None'],
								['small', 'Small'],
								['normal', 'Normal']
							] as [MarginOption, string][]
						).map(([value, label]) => (
							<label key={value} className="c-hbox g-1 align-center">
								<input
									type="radio"
									name="margin"
									checked={margin === value}
									onChange={() => setMargin(value)}
								/>
								{label}
							</label>
						))}
					</div>
				</div>

				<label className="c-hbox g-2 align-center">
					<input
						type="checkbox"
						checked={annotations}
						onChange={(e) => setAnnotations(e.target.checked)}
					/>
					Include annotations
				</label>

				<button className="c-button primary" onClick={handleExport}>
					Export
				</button>
			</div>
		</Dialog>
	)
}

// =============================================================================
// MAIN APP
// =============================================================================

export function ScanilloApp() {
	const scanillo = useScanillo()
	const pendingTempIds = React.useRef(new Map<string, PendingTempId>())
	// Monotonic, so every `step: 'crop'` state is a distinct CropEditor instance.
	const captureIdRef = React.useRef(0)
	const {
		pages,
		loading: pagesLoading,
		addPage,
		updatePage,
		deletePage,
		movePage
	} = usePages(scanillo.client)
	const [selectedPageId, setSelectedPageId] = React.useState<string | null>(null)
	const [captureFlow, setCaptureFlow] = React.useState<CaptureFlowState>({ step: 'idle' })
	const [showExportDialog, setShowExportDialog] = React.useState(false)
	const [exporting, setExporting] = React.useState(false)
	const [exportProgress, setExportProgress] = React.useState(0)
	const [saving, setSaving] = React.useState(false)
	const [loadingReEdit, setLoadingReEdit] = React.useState(false)
	const isReadOnly = scanillo.access !== 'write'

	// Use ref to avoid re-registering the handler when updatePage changes
	const updatePageRef = React.useRef(updatePage)
	React.useLayoutEffect(() => {
		updatePageRef.current = updatePage
	}, [updatePage])

	// Listen for temp file ID resolutions from shell
	React.useEffect(() => {
		const bus = getAppBus()

		const handleFileResolved = (msg: MediaFileResolvedPush) => {
			const { tempId, finalId } = msg.payload
			const pending = pendingTempIds.current.get(tempId)
			if (pending) {
				updatePageRef
					.current(pending.pageId, { [pending.field]: finalId })
					.catch(console.error)
				pendingTempIds.current.delete(tempId)
			}
		}

		bus.on('media:file.resolved', handleFileResolved)
		return () => {
			bus.off('media:file.resolved')
		}
	}, [])

	// Failsafe: resolve stale temp IDs on page load via direct API
	React.useEffect(() => {
		if (pagesLoading || pages.length === 0) return
		if (!scanillo.ownerTag || !scanillo.token) return

		const tempIdEntries: Array<{
			tempId: string
			pageId: string
			field: 'fileId' | 'originalFileId'
		}> = []
		for (const page of pages) {
			if (page.fileId.startsWith('@')) {
				tempIdEntries.push({ tempId: page.fileId, pageId: page.id, field: 'fileId' })
			}
			if (page.originalFileId?.startsWith('@')) {
				tempIdEntries.push({
					tempId: page.originalFileId,
					pageId: page.id,
					field: 'originalFileId'
				})
			}
		}
		if (tempIdEntries.length === 0) return

		const api = createApiClient({ idTag: scanillo.ownerTag, authToken: scanillo.token })

		for (const entry of tempIdEntries) {
			api.files
				.list({ fileId: entry.tempId })
				.then((files) => {
					if (files.length > 0 && files[0].fileId !== entry.tempId) {
						updatePage(entry.pageId, { [entry.field]: files[0].fileId }).catch(
							console.error
						)
					} else {
						// Still pending — register for media:file.resolved push
						pendingTempIds.current.set(entry.tempId, {
							pageId: entry.pageId,
							field: entry.field
						})
					}
				})
				.catch(console.error)
		}
	}, [pages, pagesLoading, scanillo.ownerTag, scanillo.token])

	const selectedPage = selectedPageId ? pages.find((p) => p.id === selectedPageId) : undefined
	const selectedPageIndex = selectedPage ? pages.indexOf(selectedPage) : -1

	const overlayDepth =
		(selectedPageId ? 1 : 0) +
		(captureFlow.step === 'crop' || captureFlow.step === 'filter' ? 1 : 0) +
		(showExportDialog ? 1 : 0)

	useBackStack(overlayDepth, () => {
		if (showExportDialog) {
			setShowExportDialog(false)
		} else if (captureFlow.step === 'filter') {
			handleFilterBack()
		} else if (captureFlow.step === 'crop') {
			setCaptureFlow({ step: 'idle' })
		} else if (selectedPageId) {
			setSelectedPageId(null)
		}
	})

	async function handlePickMedia() {
		try {
			const bus = getAppBus()
			const result = await bus.pickMedia({
				mediaType: 'image/*',
				documentFileId: scanillo.fileId
			})
			if (result && scanillo.ownerTag) {
				setCaptureFlow({ step: 'processing' })

				// Fetch the picked image and enter crop flow
				const url = getFileUrl(scanillo.ownerTag, result.fileId, 'orig', {
					token: scanillo.token
				})
				const resp = await fetch(url)
				const blob = await resp.blob()

				const reader = new FileReader()
				const imageData = await new Promise<string>((resolve, reject) => {
					reader.onload = () => {
						const r = reader.result as string
						resolve(r.replace(/^data:[^;]+;base64,/, ''))
					}
					reader.onerror = () => reject(new Error('Failed to read file'))
					reader.readAsDataURL(blob)
				})

				const bitmap = await createImageBitmap(blob)
				const w = bitmap.width
				const h = bitmap.height
				bitmap.close()

				const { detectDocumentDetailed } = await import('./detect-document.js')
				const det = await detectDocumentDetailed(imageData, { refine: true, seed: null })
				setCaptureFlow({
					step: 'crop',
					captureId: ++captureIdRef.current,
					imageData,
					width: w,
					height: h,
					detectedCorners: det.quad,
					cornerSource: det.source
				})
			}
		} catch (err) {
			setCaptureFlow({ step: 'idle' })
			console.error('[Scanillo] Pick media error:', err)
		}
	}

	async function handleCaptureCamera() {
		try {
			const bus = getAppBus()
			// Hoisted out of the 5fps loop so no frame pays for module resolution
			const dd = await import('./detect-document.js')

			// Set up frame handler before opening camera
			let detecting = false
			let cancelled = false
			let latestFrame: {
				imageData: string
				seq: number
				width: number
				height: number
				at: number
			} | null = null
			// Last stable preview boundary. The bus sends no timestamp, so `at` is stamped
			// when the frame arrives. Held in a box because the detection loop assigns it
			// from a nested closure, which a plain `let` would not survive narrowing-wise.
			const lock: { current: { quad: CropPoints; at: number; streak: number } | null } = {
				current: null
			}

			async function processNextFrame(sessionId: string) {
				if (cancelled || !latestFrame) {
					detecting = false
					return
				}
				detecting = true
				const frame = latestFrame
				latestFrame = null

				try {
					const raw = await dd.detectDocument(frame.imageData, frame.width, frame.height)
					// The shutter already fired — this result is newer than the shot and
					// must not touch the lock or a torn-down session.
					if (cancelled) {
						detecting = false
						return
					}
					const quad: CropPoints | null =
						raw && raw.length === 4 ? (raw as CropPoints) : null

					if (quad) {
						const prev = lock.current
						const d = prev ? quadDistance(prev.quad, quad) : null
						const agrees = !!(
							prev &&
							d &&
							d.mean <= LOCK_AGREE_MEAN &&
							d.max <= LOCK_AGREE_MAX
						)
						const smoothed =
							agrees && prev ? lerpQuad(prev.quad, quad, LOCK_EMA_ALPHA) : quad
						lock.current = {
							quad: smoothed,
							at: frame.at,
							streak: agrees && prev ? prev.streak + 1 : 0
						}
						bus.sendCameraOverlay(sessionId, frame.seq, [
							{
								type: 'polygon',
								points: smoothed,
								stroke: 'rgba(0, 220, 80, 0.9)',
								strokeWidth: 3,
								fill: 'rgba(0, 220, 80, 0.15)'
							}
						])
					} else {
						// Clear the overlay but keep the lock — recency expires it.
						bus.sendCameraOverlay(sessionId, frame.seq, [])
					}
				} catch (err) {
					console.error('[Scanillo] Detection error:', err)
				}

				if (!cancelled && latestFrame) {
					processNextFrame(sessionId)
				} else {
					detecting = false
				}
			}

			// Open camera - returns session immediately on ACK
			const session = await bus.openCamera({ facing: 'environment' })

			bus.onCameraPreviewFrame((frame) => {
				latestFrame = { ...frame, at: performance.now() }
				if (!detecting) processNextFrame(session.sessionId)
			})

			// Start preview streaming
			bus.startCameraPreview(session.sessionId, { width: 640, height: 480, fps: 5 })

			// Wait for user to capture or cancel
			const result = await session.result

			// Freeze the preview state synchronously. onCameraPreviewFrame(null) below only
			// stops *new* frames; an in-flight detection would otherwise complete during the
			// await further down and overwrite `lock` with a frame newer than the shot.
			cancelled = true
			const now = performance.now()
			const stable = lock.current
			const lockAgeMs = stable ? now - stable.at : null
			const streak = stable?.streak ?? 0
			const seed =
				stable && stable.streak >= MIN_STABLE_STREAK && now - stable.at <= MAX_LOCK_AGE_MS
					? stable.quad
					: null

			// Clean up
			bus.stopCameraPreview(session.sessionId)
			bus.onCameraPreviewFrame(null)

			if (result) {
				setCaptureFlow({ step: 'processing' })
				const det = await dd.detectDocumentDetailed(result.imageData, {
					seed,
					refine: true
				})
				console.debug('[scanillo] capture', {
					source: det.source,
					reason: det.reason,
					areaFraction: det.areaFraction,
					refinedEdges: det.refinedEdges,
					maxShiftPx: det.maxShiftPx,
					lockAgeMs,
					streak
				})
				setCaptureFlow({
					step: 'crop',
					captureId: ++captureIdRef.current,
					imageData: result.imageData,
					width: result.width,
					height: result.height,
					detectedCorners: det.quad,
					cornerSource: det.source
				})
			}
		} catch (err) {
			setCaptureFlow({ step: 'idle' })
			console.error('[Scanillo] Camera capture error:', err)
		}
	}

	async function handleSavePage(
		filteredCanvas: HTMLCanvasElement,
		cropPoints: CropPoints,
		filter: PageFilter,
		filterStrength: number,
		rotation: number,
		opts: { sourcePageId?: string; existingOriginalFileId?: string; originalImageData: string }
	) {
		const api = createApiClient({ idTag: scanillo.ownerTag!, authToken: scanillo.token })

		// Upload processed image directly via API
		const processedBlob = await canvasToBlob(filteredCanvas)
		const uploaded = await api.files.uploadBlob(
			'thumbnail-only',
			`scan-${Date.now()}.jpg`,
			processedBlob,
			'image/jpeg',
			{ rootId: scanillo.fileId }
		)

		// Use existing original (re-edit) or upload new one (first edit)
		let originalFileId: string
		if (opts.existingOriginalFileId) {
			originalFileId = opts.existingOriginalFileId
		} else {
			const origBlob = await base64ToBlob(opts.originalImageData)
			const origResult = await api.files.uploadBlob(
				'orig-only',
				`scan-orig-${Date.now()}.jpg`,
				origBlob,
				'image/jpeg',
				{ rootId: scanillo.fileId }
			)
			originalFileId = origResult.fileId
		}

		let pageId: string | undefined

		if (opts.sourcePageId) {
			// Look up old edited fileId before updating
			const oldFileId = pages.find((p) => p.id === opts.sourcePageId)?.fileId

			await updatePage(opts.sourcePageId, {
				fileId: uploaded.fileId,
				originalFileId,
				filter,
				filterStrength,
				rotation,
				cropPoints,
				...(uploaded.dim && { width: uploaded.dim[0], height: uploaded.dim[1] })
			})
			pageId = opts.sourcePageId

			// Delete old edited variant (not the original)
			if (oldFileId && oldFileId !== uploaded.fileId && scanillo.ownerTag) {
				const delApi = createApiClient({
					idTag: scanillo.ownerTag,
					authToken: scanillo.token
				})
				delApi.files.delete(oldFileId).catch(() => {})
			}
		} else {
			pageId = await addPage(
				uploaded.fileId,
				`scan-${Date.now()}.jpg`,
				'image/jpeg',
				uploaded.dim,
				{
					originalFileId,
					filter,
					filterStrength,
					rotation,
					cropPoints
				}
			)
		}

		// Register pending temp IDs for resolution
		if (pageId) {
			if (uploaded.fileId.startsWith('@')) {
				pendingTempIds.current.set(uploaded.fileId, { pageId, field: 'fileId' })
			}
			if (originalFileId.startsWith('@')) {
				pendingTempIds.current.set(originalFileId, { pageId, field: 'originalFileId' })
			}
		}

		return pageId
	}

	async function handleCropConfirm(croppedCanvas: HTMLCanvasElement, cropPoints: CropPoints) {
		if (captureFlow.step !== 'crop') return

		// Re-edit crop: apply existing filter and save directly
		if (captureFlow.sourcePageId && captureFlow.existingFilter) {
			setSaving(true)
			try {
				const filter = captureFlow.existingFilter
				const rotation = captureFlow.existingRotation ?? 0
				const strength = captureFlow.existingFilterStrength ?? FILTER_DEFAULTS[filter]

				// Apply filter
				let canvas = croppedCanvas
				if (filter !== 'original') {
					const filtered = await applyFilter(croppedCanvas, filter)
					canvas = blendWithOriginal(croppedCanvas, filtered, strength / 100)
				}

				// Apply rotation
				if (rotation !== 0) {
					canvas = rotateCanvas(canvas, rotation)
				}

				const savedPageId = await handleSavePage(
					canvas,
					cropPoints,
					filter,
					strength,
					rotation,
					{
						sourcePageId: captureFlow.sourcePageId,
						existingOriginalFileId: captureFlow.existingOriginalFileId,
						originalImageData: captureFlow.imageData
					}
				)
				setCaptureFlow({ step: 'idle' })
				if (savedPageId) setSelectedPageId(savedPageId)
			} catch (err) {
				console.error('[Scanillo] Crop re-edit save error:', err)
			} finally {
				setSaving(false)
			}
			return
		}

		// New capture: proceed to filter step
		setCaptureFlow({
			step: 'filter',
			croppedCanvas,
			cropPoints,
			originalImageData: captureFlow.imageData,
			originalWidth: captureFlow.width,
			originalHeight: captureFlow.height,
			sourcePageId: captureFlow.sourcePageId,
			existingOriginalFileId: captureFlow.existingOriginalFileId
		})
	}

	function handleCropRetake() {
		if (captureFlow.step === 'idle') return
		setCaptureFlow({ step: 'idle' })
		handleCaptureCamera()
	}

	async function handleFilterConfirm(
		filteredCanvas: HTMLCanvasElement,
		filter: PageFilter,
		rotation: number,
		filterStrength: number
	) {
		if (captureFlow.step !== 'filter') return
		setSaving(true)
		try {
			const savedPageId = await handleSavePage(
				filteredCanvas,
				captureFlow.cropPoints,
				filter,
				filterStrength,
				rotation,
				{
					sourcePageId: captureFlow.sourcePageId,
					existingOriginalFileId: captureFlow.existingOriginalFileId,
					originalImageData: captureFlow.originalImageData
				}
			)
			setCaptureFlow({ step: 'idle' })
			if (savedPageId) setSelectedPageId(savedPageId)
		} catch (err) {
			console.error('[Scanillo] Filter confirm error:', err)
		} finally {
			setSaving(false)
		}
	}

	function handleFilterBack() {
		if (captureFlow.step !== 'filter') return

		// Re-edit filter: go back to PageDetail (cancel)
		if (captureFlow.sourcePageId) {
			setCaptureFlow({ step: 'idle' })
			return
		}

		// New capture: go back to crop
		setCaptureFlow({
			step: 'crop',
			captureId: ++captureIdRef.current,
			imageData: captureFlow.originalImageData,
			width: captureFlow.originalWidth,
			height: captureFlow.originalHeight,
			detectedCorners: captureFlow.cropPoints
		})
	}

	async function handleReEditPage(page: ScanPage, mode: 'crop' | 'filter') {
		setLoadingReEdit(true)
		try {
			const _bus = getAppBus()
			const sourceFileId = page.originalFileId ?? page.fileId
			if (!scanillo.ownerTag) return

			const url = getFileUrl(scanillo.ownerTag, sourceFileId, 'orig', {
				token: scanillo.token
			})
			const resp = await fetch(url)
			const blob = await resp.blob()

			// Convert to base64
			const reader = new FileReader()
			const imageData = await new Promise<string>((resolve, reject) => {
				reader.onload = () => {
					const result = reader.result as string
					resolve(result.replace(/^data:[^;]+;base64,/, ''))
				}
				reader.onerror = () => reject(new Error('Failed to read file'))
				reader.readAsDataURL(blob)
			})

			// Get dimensions
			const bitmap = await createImageBitmap(blob)
			const w = bitmap.width
			const h = bitmap.height
			bitmap.close()

			if (mode === 'crop') {
				// Confirmed corners are reused as-is — no detection, and no provenance hint
				let quad: CropPoints | null = page.cropPoints ?? null
				let cornerSource: CornerSource | undefined
				if (!quad) {
					const { detectDocumentDetailed } = await import('./detect-document.js')
					const det = await detectDocumentDetailed(imageData, {
						refine: true,
						seed: null
					})
					quad = det.quad
					cornerSource = det.source
				}
				setCaptureFlow({
					step: 'crop',
					captureId: ++captureIdRef.current,
					imageData,
					width: w,
					height: h,
					detectedCorners: quad,
					cornerSource,
					sourcePageId: page.id,
					existingOriginalFileId: page.originalFileId,
					existingFilter: page.filter,
					existingFilterStrength: page.filterStrength,
					existingRotation: page.rotation
				})
			} else {
				const { base64ToCanvas, extractPerspective } = await import(
					'./utils/image-processing.js'
				)
				const canvas = await base64ToCanvas(imageData)
				const cropPoints: CropPoints = page.cropPoints ?? [
					[0, 0],
					[1, 0],
					[1, 1],
					[0, 1]
				]
				const cropped = await extractPerspective(canvas, cropPoints)
				setCaptureFlow({
					step: 'filter',
					croppedCanvas: cropped,
					cropPoints,
					originalImageData: imageData,
					originalWidth: w,
					originalHeight: h,
					sourcePageId: page.id,
					existingOriginalFileId: page.originalFileId,
					rotation: page.rotation
				})
			}
		} catch (err) {
			console.error('[Scanillo] Re-edit error:', err)
		} finally {
			setLoadingReEdit(false)
		}
	}

	async function handleExportPdf(exportOpts: ExportOptions) {
		if (!scanillo.ownerTag || pages.length === 0) return
		setShowExportDialog(false)
		try {
			setExporting(true)
			setExportProgress(0)
			const { exportPagesToPdf } = await import('./export/pdf-export.js')
			await exportPagesToPdf(pages, {
				ownerTag: scanillo.ownerTag,
				token: scanillo.token,
				fileId: scanillo.fileId,
				onProgress: setExportProgress,
				dpi: exportOpts.dpi,
				margin: exportOpts.margin,
				includeAnnotations: exportOpts.annotations
			})
		} catch (err) {
			console.error('[Scanillo] PDF export error:', err)
		} finally {
			setExporting(false)
		}
	}

	async function handleDeletePage(id: string) {
		await deletePage(id)
		setSelectedPageId(null)
	}

	if (scanillo.loading) {
		return (
			<div className="c-vbox w-100 h-100 justify-center align-center">
				<Panel className="c-vbox align-center p-2">
					<LoadingSpinner size="lg" label="Connecting to Scanillo…" />
				</Panel>
			</div>
		)
	}

	if (scanillo.error) {
		return (
			<div className="c-vbox w-100 h-100 justify-center align-center">
				<Panel className="c-alert error">
					<h3>Connection Error</h3>
					<p>{scanillo.error.message}</p>
				</Panel>
			</div>
		)
	}

	if (captureFlow.step === 'processing') {
		return (
			<div className="scanillo-app c-vbox w-100 h-100">
				<div className="export-overlay">
					<div className="export-progress">
						<LoadingSpinner label="Processing image…" />
					</div>
				</div>
			</div>
		)
	}

	if (captureFlow.step === 'crop') {
		return (
			<div className="scanillo-app c-vbox w-100 h-100">
				<CropEditor
					key={captureFlow.captureId}
					imageData={captureFlow.imageData}
					width={captureFlow.width}
					height={captureFlow.height}
					initialCorners={captureFlow.detectedCorners}
					cornerSource={captureFlow.cornerSource}
					onConfirm={handleCropConfirm}
					onRetake={captureFlow.sourcePageId ? undefined : handleCropRetake}
					onCancel={() => setCaptureFlow({ step: 'idle' })}
				/>
				{saving && (
					<div className="export-overlay">
						<div className="export-progress">
							<LoadingSpinner label="Saving…" />
						</div>
					</div>
				)}
			</div>
		)
	}

	if (captureFlow.step === 'filter') {
		return (
			<div className="scanillo-app c-vbox w-100 h-100">
				<FilterSelect
					sourceCanvas={captureFlow.croppedCanvas}
					initialRotation={captureFlow.rotation}
					onConfirm={handleFilterConfirm}
					onBack={handleFilterBack}
				/>
				{saving && (
					<div className="export-overlay">
						<div className="export-progress">
							<LoadingSpinner label="Saving…" />
						</div>
					</div>
				)}
			</div>
		)
	}

	if (selectedPage) {
		return (
			<div className="scanillo-app c-vbox w-100 h-100">
				<PageDetail
					page={selectedPage}
					pageIndex={selectedPageIndex}
					totalPages={pages.length}
					ownerTag={scanillo.ownerTag}
					token={scanillo.token}
					onBack={() => setSelectedPageId(null)}
					onDelete={handleDeletePage}
					onReEdit={handleReEditPage}
					onUpdateAnnotations={(pageId, anns) =>
						updatePage(pageId, { annotations: anns })
					}
				/>
				{loadingReEdit && (
					<div className="export-overlay">
						<div className="export-progress">
							<LoadingSpinner label="Loading…" />
						</div>
					</div>
				)}
			</div>
		)
	}

	return (
		<div className="scanillo-app c-vbox w-100 h-100">
			<PageGrid
				pages={pages}
				loading={pagesLoading}
				ownerTag={scanillo.ownerTag}
				token={scanillo.token}
				onSelectPage={setSelectedPageId}
				onMovePage={movePage}
			/>
			<div className="fab-container">
				{pages.length > 0 && (
					<FAB
						size="small"
						onClick={() => setShowExportDialog(true)}
						disabled={exporting}
						title="Export as PDF"
						label="Export as PDF"
						icon={<IcPdf />}
					/>
				)}
				{!isReadOnly && (
					<>
						<FAB
							size="small"
							onClick={handlePickMedia}
							title="Import image"
							label="Import image"
							icon={<IcImage />}
						/>
						<FAB
							variant="primary"
							onClick={handleCaptureCamera}
							title="Capture with camera"
							label="Capture with camera"
							icon={<IcCamera />}
						/>
					</>
				)}
			</div>
			<ExportDialog
				open={showExportDialog}
				onClose={() => setShowExportDialog(false)}
				onExport={handleExportPdf}
			/>
			{exporting && (
				<div className="export-overlay">
					<div className="export-progress">
						<LoadingSpinner size="lg" label="Exporting PDF…" />
						<div className="progress-bar">
							<div
								className="progress-fill"
								style={{ width: `${exportProgress}%` }}
							/>
						</div>
						<small>{exportProgress}%</small>
					</div>
				</div>
			)}
		</div>
	)
}

// vim: ts=4
