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

export interface ZoomableImageProps extends React.HTMLAttributes<HTMLDivElement> {
	src?: string
	alt?: string
	minZoom?: number
	maxZoom?: number
	zoomEnabled?: boolean
	resetOnSrcChange?: boolean
	children?: React.ReactNode
}

interface Transform {
	x: number
	y: number
	scale: number
}

export function ZoomableImage({
	src,
	alt,
	minZoom = 1,
	maxZoom = 5,
	zoomEnabled = true,
	resetOnSrcChange = true,
	children,
	style,
	...rest
}: ZoomableImageProps) {
	const containerRef = React.useRef<HTMLDivElement>(null)
	const innerRef = React.useRef<HTMLDivElement>(null)
	const transformRef = React.useRef<Transform>({ x: 0, y: 0, scale: 1 })
	const pointersRef = React.useRef<Map<number, { x: number; y: number }>>(new Map())
	const lastPinchDistRef = React.useRef<number>(0)
	const lastPinchMidRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 })
	const lastTapRef = React.useRef<number>(0)
	const transitioning = React.useRef(false)

	const transitionHandlerRef = React.useRef<(() => void) | null>(null)

	function applyTransform(smooth = false) {
		const el = innerRef.current
		if (!el) return
		const { x, y, scale } = transformRef.current
		// Clean up any pending transition handler
		if (transitionHandlerRef.current) {
			el.removeEventListener('transitionend', transitionHandlerRef.current)
			transitionHandlerRef.current = null
		}
		if (smooth) {
			transitioning.current = true
			el.style.transition = 'transform 0.25s ease'
			const handler = () => {
				el.style.transition = ''
				transitioning.current = false
				transitionHandlerRef.current = null
				el.removeEventListener('transitionend', handler)
			}
			transitionHandlerRef.current = handler
			el.addEventListener('transitionend', handler)
		}
		el.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
	}

	// Clean up transition listener on unmount
	React.useEffect(() => {
		return () => {
			if (transitionHandlerRef.current && innerRef.current) {
				innerRef.current.removeEventListener('transitionend', transitionHandlerRef.current)
			}
		}
	}, [])

	function clampPan(t: Transform): Transform {
		const container = containerRef.current
		const inner = innerRef.current
		if (!container || !inner || t.scale <= 1) {
			return { ...t, x: 0, y: 0 }
		}

		const cRect = container.getBoundingClientRect()
		const contentW = inner.scrollWidth * t.scale
		const contentH = inner.scrollHeight * t.scale

		let { x, y } = t
		const maxX = Math.max(0, (contentW - cRect.width) / 2)
		const maxY = Math.max(0, (contentH - cRect.height) / 2)
		x = Math.max(-maxX, Math.min(maxX, x))
		y = Math.max(-maxY, Math.min(maxY, y))

		return { ...t, x, y }
	}

	function zoomAtPoint(focalX: number, focalY: number, newScale: number) {
		const t = transformRef.current
		const clamped = Math.max(minZoom, Math.min(maxZoom, newScale))
		const ratio = clamped / t.scale
		const nx = focalX - (focalX - t.x) * ratio
		const ny = focalY - (focalY - t.y) * ratio
		transformRef.current = clampPan({ x: nx, y: ny, scale: clamped })
		applyTransform()
	}

	function resetZoom() {
		transformRef.current = { x: 0, y: 0, scale: 1 }
		applyTransform(true)
	}

	// Reset zoom when src changes
	React.useEffect(() => {
		if (!resetOnSrcChange) return
		transformRef.current = { x: 0, y: 0, scale: 1 }
		applyTransform()
	}, [src, resetOnSrcChange])

	// Wheel zoom
	React.useEffect(() => {
		const container = containerRef.current
		if (!container || !zoomEnabled) return

		function handleWheel(e: WheelEvent) {
			e.preventDefault()
			const rect = container!.getBoundingClientRect()
			const fx = e.clientX - rect.left - rect.width / 2
			const fy = e.clientY - rect.top - rect.height / 2
			const delta = -e.deltaY * 0.002
			const newScale = transformRef.current.scale * (1 + delta)
			zoomAtPoint(fx, fy, newScale)
		}

		container.addEventListener('wheel', handleWheel, { passive: false })
		return () => container.removeEventListener('wheel', handleWheel)
	}, [zoomEnabled, minZoom, maxZoom])

	function handlePointerDown(e: React.PointerEvent) {
		if (!zoomEnabled || transitioning.current) return
		const container = containerRef.current
		if (!container) return

		container.setPointerCapture(e.pointerId)
		pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

		if (pointersRef.current.size === 2) {
			const pts = Array.from(pointersRef.current.values())
			lastPinchDistRef.current = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
			lastPinchMidRef.current = {
				x: (pts[0].x + pts[1].x) / 2,
				y: (pts[0].y + pts[1].y) / 2
			}
		}
	}

	function handlePointerMove(e: React.PointerEvent) {
		if (!zoomEnabled) return
		const ptr = pointersRef.current.get(e.pointerId)
		if (!ptr) return

		const container = containerRef.current
		if (!container) return

		if (pointersRef.current.size === 2) {
			// Update this pointer
			pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
			const pts = Array.from(pointersRef.current.values())
			const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
			const mid = {
				x: (pts[0].x + pts[1].x) / 2,
				y: (pts[0].y + pts[1].y) / 2
			}

			const rect = container.getBoundingClientRect()
			const fx = mid.x - rect.left - rect.width / 2
			const fy = mid.y - rect.top - rect.height / 2
			const ratio = dist / lastPinchDistRef.current
			const newScale = transformRef.current.scale * ratio

			// Also pan with midpoint movement
			const t = transformRef.current
			const dx = mid.x - lastPinchMidRef.current.x
			const dy = mid.y - lastPinchMidRef.current.y

			const clamped = Math.max(minZoom, Math.min(maxZoom, newScale))
			const scaleRatio = clamped / t.scale
			const nx = fx - (fx - t.x) * scaleRatio + dx
			const ny = fy - (fy - t.y) * scaleRatio + dy
			transformRef.current = clampPan({ x: nx, y: ny, scale: clamped })
			applyTransform()

			lastPinchDistRef.current = dist
			lastPinchMidRef.current = mid
		} else if (pointersRef.current.size === 1 && transformRef.current.scale > 1) {
			// Pan
			const dx = e.clientX - ptr.x
			const dy = e.clientY - ptr.y
			const t = transformRef.current
			transformRef.current = clampPan({ x: t.x + dx, y: t.y + dy, scale: t.scale })
			applyTransform()
			pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
		}
	}

	function handlePointerUp(e: React.PointerEvent) {
		pointersRef.current.delete(e.pointerId)

		// Double-tap detection
		if (pointersRef.current.size === 0) {
			const now = Date.now()
			if (now - lastTapRef.current < 300) {
				resetZoom()
				lastTapRef.current = 0
			} else {
				lastTapRef.current = now
			}
		}
	}

	function handlePointerCancel(e: React.PointerEvent) {
		pointersRef.current.delete(e.pointerId)
	}

	return (
		<div
			ref={containerRef}
			{...rest}
			style={{
				overflow: 'hidden',
				touchAction: 'none',
				width: '100%',
				height: '100%',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				...style
			}}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerCancel}
		>
			<div
				ref={innerRef}
				style={{
					transformOrigin: 'center center',
					position: 'relative',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: '100%',
					height: '100%'
				}}
			>
				{children ??
					(src && (
						<img
							src={src}
							alt={alt}
							style={{
								maxWidth: '100%',
								maxHeight: '100%',
								objectFit: 'contain',
								pointerEvents: 'none',
								userSelect: 'none'
							}}
							draggable={false}
						/>
					))}
			</div>
		</div>
	)
}

// vim: ts=4
