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
import {
	PiCheckBold as IcCheck,
	PiXBold as IcCancel,
	PiArrowCounterClockwiseBold as IcRetake
} from 'react-icons/pi'

import type { CropPoints } from '../types.js'
import { base64ToCanvas, extractPerspective } from '../utils/image-processing.js'

interface CropEditorProps {
	imageData: string
	width: number
	height: number
	initialCorners: CropPoints | null
	onConfirm: (canvas: HTMLCanvasElement, cropPoints: CropPoints) => void
	onRetake?: () => void
	onCancel: () => void
}

const HANDLE_HIT_RADIUS = 48

export function CropEditor({
	imageData,
	width,
	height,
	initialCorners,
	onConfirm,
	onRetake,
	onCancel
}: CropEditorProps) {
	const [corners, setCorners] = React.useState<CropPoints>(
		initialCorners ?? [
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 1]
		]
	)
	const [processing, setProcessing] = React.useState(false)
	const [_imageLoaded, setImageLoaded] = React.useState(false)
	const [activeCorner, setActiveCorner] = React.useState<number | null>(null)
	const containerRef = React.useRef<HTMLDivElement>(null)
	const imgRef = React.useRef<HTMLImageElement>(null)
	const magnifierRef = React.useRef<HTMLCanvasElement>(null)
	const sourceImgRef = React.useRef<HTMLImageElement | null>(null)
	const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0)

	const imgSrc = `data:image/jpeg;base64,${imageData}`

	// Force re-render on container resize (orientation change) so handle positions update
	React.useEffect(() => {
		const container = containerRef.current
		if (!container) return

		const observer = new ResizeObserver(() => forceUpdate())
		observer.observe(container)
		return () => observer.disconnect()
	}, [])

	// Load source image for magnifier
	React.useEffect(() => {
		const img = new Image()
		img.src = imgSrc
		img.onload = () => {
			sourceImgRef.current = img
		}
	}, [imgSrc])

	function getImageRect(): { x: number; y: number; w: number; h: number } | null {
		const img = imgRef.current
		const container = containerRef.current
		if (!img || !container) return null

		const containerRect = container.getBoundingClientRect()
		const cw = containerRect.width
		const ch = containerRect.height

		const imgAspect = width / height
		const containerAspect = cw / ch

		let displayW: number, displayH: number
		if (imgAspect > containerAspect) {
			displayW = cw
			displayH = cw / imgAspect
		} else {
			displayH = ch
			displayW = ch * imgAspect
		}

		return {
			x: (cw - displayW) / 2,
			y: (ch - displayH) / 2,
			w: displayW,
			h: displayH
		}
	}

	function pointerToNormalized(clientX: number, clientY: number): [number, number] {
		const container = containerRef.current
		if (!container) return [0, 0]

		const containerRect = container.getBoundingClientRect()
		const rect = getImageRect()
		if (!rect) return [0, 0]

		const x = (clientX - containerRect.left - rect.x) / rect.w
		const y = (clientY - containerRect.top - rect.y) / rect.h

		return [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))]
	}

	function findNearestCorner(clientX: number, clientY: number): number | null {
		const container = containerRef.current
		if (!container) return null

		const containerRect = container.getBoundingClientRect()
		const rect = getImageRect()
		if (!rect) return null

		const px = clientX - containerRect.left
		const py = clientY - containerRect.top

		let bestIndex: number | null = null
		let bestDist = HANDLE_HIT_RADIUS

		for (let i = 0; i < 4; i++) {
			const [nx, ny] = corners[i]
			const cx = rect.x + nx * rect.w
			const cy = rect.y + ny * rect.h
			const dist = Math.hypot(px - cx, py - cy)
			if (dist < bestDist) {
				bestDist = dist
				bestIndex = i
			}
		}

		return bestIndex
	}

	function handlePointerDown(e: React.PointerEvent) {
		const index = findNearestCorner(e.clientX, e.clientY)
		if (index === null) return

		e.preventDefault()
		setActiveCorner(index)
		containerRef.current?.setPointerCapture(e.pointerId)
	}

	function handlePointerMove(e: React.PointerEvent) {
		if (activeCorner === null) return
		e.preventDefault()

		const [nx, ny] = pointerToNormalized(e.clientX, e.clientY)
		setCorners((prev) => {
			const next = [...prev] as unknown as CropPoints
			next[activeCorner] = [nx, ny]
			return next
		})
	}

	function handlePointerUp(e: React.PointerEvent) {
		if (activeCorner !== null) {
			containerRef.current?.releasePointerCapture(e.pointerId)
			setActiveCorner(null)
		}
	}

	// Draw magnifier
	React.useEffect(() => {
		const canvas = magnifierRef.current
		const srcImg = sourceImgRef.current
		if (!canvas || !srcImg || activeCorner === null) return

		const ctx = canvas.getContext('2d')
		if (!ctx) return

		const size = 120
		const dpr = window.devicePixelRatio || 1
		canvas.width = size * dpr
		canvas.height = size * dpr
		ctx.scale(dpr, dpr)

		const [cx, cy] = corners[activeCorner]
		const srcX = cx * srcImg.naturalWidth
		const srcY = cy * srcImg.naturalHeight

		const zoomFactor = 3

		// Clip to circle
		ctx.save()
		ctx.beginPath()
		ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
		ctx.clip()

		// Draw zoomed region
		const imgRect = getImageRect()
		if (!imgRect) return
		const halfSrc = srcImg.naturalWidth * (1 / zoomFactor) * (size / imgRect.w)
		const halfSrcY = srcImg.naturalHeight * (1 / zoomFactor) * (size / imgRect.h)
		ctx.drawImage(
			srcImg,
			srcX - halfSrc / 2,
			srcY - halfSrcY / 2,
			halfSrc,
			halfSrcY,
			0,
			0,
			size,
			size
		)

		// Crosshairs
		const primary =
			getComputedStyle(document.documentElement).getPropertyValue('--col-primary').trim() ||
			'#4a9eff'
		ctx.strokeStyle = primary
		ctx.lineWidth = 1.5
		ctx.beginPath()
		ctx.moveTo(size / 2, 0)
		ctx.lineTo(size / 2, size)
		ctx.moveTo(0, size / 2)
		ctx.lineTo(size, size / 2)
		ctx.stroke()

		// Draw crop edge lines connecting to adjacent corners
		{
			const prevIdx = (activeCorner + 3) % 4
			const nextIdx = (activeCorner + 1) % 4
			ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
			ctx.lineWidth = 1.5

			for (const adjIdx of [prevIdx, nextIdx]) {
				const [ax, ay] = corners[adjIdx]
				const dx = (ax - cx) * imgRect.w * zoomFactor
				const dy = (ay - cy) * imgRect.h * zoomFactor
				ctx.beginPath()
				ctx.moveTo(size / 2, size / 2)
				ctx.lineTo(size / 2 + dx, size / 2 + dy)
				ctx.stroke()
			}
		}

		ctx.restore()

		// Circular border
		ctx.strokeStyle = 'white'
		ctx.lineWidth = 3
		ctx.beginPath()
		ctx.arc(size / 2, size / 2, size / 2 - 1.5, 0, Math.PI * 2)
		ctx.stroke()
	}, [activeCorner, corners, width, height])

	// Compute handle positions and magnifier position
	function getHandleScreenPos(index: number): { left: number; top: number } | null {
		const rect = getImageRect()
		if (!rect) return null
		const [nx, ny] = corners[index]
		return {
			left: rect.x + nx * rect.w,
			top: rect.y + ny * rect.h
		}
	}

	function getMagnifierPos(): { left: number; top: number } | null {
		if (activeCorner === null) return null
		const container = containerRef.current
		if (!container) return null

		const containerRect = container.getBoundingClientRect()
		const cw = containerRect.width

		const pos = getHandleScreenPos(activeCorner)
		if (!pos) return null

		const magSize = 120
		const gap = 20

		// Center horizontally on the handle, clamp to container
		let left = pos.left - magSize / 2
		left = Math.max(8, Math.min(left, cw - magSize - 8))

		// Place above the handle; if not enough space, place below
		let top = pos.top - gap - magSize
		if (top < 8) top = pos.top + gap

		return { left, top }
	}

	async function handleConfirm() {
		setProcessing(true)
		try {
			const canvas = await base64ToCanvas(imageData)
			const result = await extractPerspective(canvas, corners)
			onConfirm(result, corners)
		} catch (err) {
			console.error('[CropEditor] Processing error:', err)
		} finally {
			setProcessing(false)
		}
	}

	// SVG polygon in image-pixel coords
	const svgPoints = corners.map(([x, y]) => [x * width, y * height] as [number, number])
	const polygonStr = svgPoints.map(([x, y]) => `${x},${y}`).join(' ')

	const magnifierPos = getMagnifierPos()

	return (
		<div className="crop-editor">
			<div
				className="crop-editor-canvas"
				ref={containerRef}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				style={{ touchAction: 'none' }}
			>
				<img
					ref={imgRef}
					src={imgSrc}
					alt="Captured"
					style={{ width: '100%', height: '100%', objectFit: 'contain' }}
					draggable={false}
					onLoad={() => setImageLoaded(true)}
				/>
				<svg
					className="crop-overlay"
					viewBox={`0 0 ${width} ${height}`}
					preserveAspectRatio="xMidYMid meet"
				>
					<defs>
						<mask id="crop-mask">
							<rect width={width} height={height} fill="white" />
							<polygon points={polygonStr} fill="black" />
						</mask>
					</defs>
					<rect
						width={width}
						height={height}
						fill="rgba(0,0,0,0.5)"
						mask="url(#crop-mask)"
					/>
					<polygon
						points={polygonStr}
						fill="none"
						stroke="var(--col-primary, #4a9eff)"
						strokeWidth={Math.max(width, height) * 0.008}
					/>
				</svg>
				{/* HTML handle divs */}
				{corners.map((_, i) => {
					const pos = getHandleScreenPos(i)
					if (!pos) return null
					return (
						<div
							key={i}
							className={`crop-handle${activeCorner === i ? ' active' : ''}`}
							style={{ left: pos.left, top: pos.top }}
						/>
					)
				})}
				{/* Magnifier */}
				{activeCorner !== null && magnifierPos && (
					<canvas
						ref={magnifierRef}
						className="crop-magnifier"
						width={120}
						height={120}
						style={{ left: magnifierPos.left, top: magnifierPos.top }}
					/>
				)}
			</div>
			<div className="crop-toolbar">
				<button className="c-button icon" onClick={onCancel} title="Cancel">
					<IcCancel />
				</button>
				{onRetake && (
					<button className="c-button icon" onClick={onRetake} title="Retake">
						<IcRetake />
					</button>
				)}
				<button
					className="c-button primary"
					onClick={handleConfirm}
					disabled={processing}
					title="Confirm crop"
				>
					{processing ? <div className="c-spinner small" /> : <IcCheck />}
				</button>
			</div>
		</div>
	)
}

// vim: ts=4
