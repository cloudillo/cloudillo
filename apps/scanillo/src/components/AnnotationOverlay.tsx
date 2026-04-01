// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { Annotation, AnnotationTool } from '../types.js'
import { simplifyPoints } from '../utils/annotation-rendering.js'

const ERASER_RADIUS = 0.02

function pointToSegmentDist(
	px: number,
	py: number,
	ax: number,
	ay: number,
	bx: number,
	by: number
): number {
	const dx = bx - ax,
		dy = by - ay
	const len2 = dx * dx + dy * dy
	if (len2 === 0) return Math.hypot(px - ax, py - ay)
	const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
	return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function hitTestAnnotation(px: number, py: number, ann: Annotation, tolerance: number): boolean {
	if (ann.type === 'freehand') {
		for (let i = 0; i < ann.points.length - 1; i++) {
			const [ax, ay] = ann.points[i]
			const [bx, by] = ann.points[i + 1]
			if (pointToSegmentDist(px, py, ax, ay, bx, by) < tolerance + ann.strokeWidth / 2)
				return true
		}
		if (ann.points.length === 1) {
			const [ax, ay] = ann.points[0]
			if (Math.hypot(px - ax, py - ay) < tolerance + ann.strokeWidth / 2) return true
		}
	} else if (ann.type === 'rect') {
		const corners: [number, number][] = [
			[ann.x, ann.y],
			[ann.x + ann.width, ann.y],
			[ann.x + ann.width, ann.y + ann.height],
			[ann.x, ann.y + ann.height]
		]
		for (let i = 0; i < 4; i++) {
			const [ax, ay] = corners[i]
			const [bx, by] = corners[(i + 1) % 4]
			if (pointToSegmentDist(px, py, ax, ay, bx, by) < tolerance + ann.strokeWidth / 2)
				return true
		}
		if (
			ann.fill &&
			px >= ann.x &&
			px <= ann.x + ann.width &&
			py >= ann.y &&
			py <= ann.y + ann.height
		)
			return true
	}
	return false
}

interface AnnotationOverlayProps {
	annotations: Annotation[]
	activeTool: AnnotationTool | null
	color: string
	strokeWidth: number
	opacity: number
	imageWidth: number
	imageHeight: number
	onAdd: (annotation: Annotation) => void
	onRemove: (id: string) => void
}

export function AnnotationOverlay({
	annotations,
	activeTool,
	color,
	strokeWidth,
	opacity,
	imageWidth,
	imageHeight,
	onAdd,
	onRemove
}: AnnotationOverlayProps) {
	const svgRef = React.useRef<SVGSVGElement>(null)
	const drawingRef = React.useRef<{
		pointerId: number
		type: AnnotationTool
		points?: [number, number][]
		startPoint?: [number, number]
		element?: SVGElement
		erasedIds?: Set<string>
	} | null>(null)
	const [eraserPos, setEraserPos] = React.useState<[number, number] | null>(null)

	function pointerToNormalized(e: React.PointerEvent): [number, number] | null {
		const svg = svgRef.current
		if (!svg) return null
		const ctm = svg.getScreenCTM()
		if (!ctm) return null
		const pt = svg.createSVGPoint()
		pt.x = e.clientX
		pt.y = e.clientY
		const svgPt = pt.matrixTransform(ctm.inverse())
		const x = svgPt.x / imageWidth
		const y = svgPt.y / imageHeight
		return [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))]
	}

	function eraseAtPoint(px: number, py: number, erasedIds: Set<string>) {
		for (const ann of annotations) {
			if (erasedIds.has(ann.id)) continue
			if (hitTestAnnotation(px, py, ann, ERASER_RADIUS)) {
				erasedIds.add(ann.id)
				onRemove(ann.id)
			}
		}
	}

	function handlePointerDown(e: React.PointerEvent) {
		if (e.button !== 0) return
		if (!activeTool) return
		if (drawingRef.current) return // already drawing

		const pt = pointerToNormalized(e)
		if (!pt) return

		e.stopPropagation()
		e.preventDefault()
		svgRef.current?.setPointerCapture(e.pointerId)

		if (activeTool === 'eraser') {
			const erasedIds = new Set<string>()
			drawingRef.current = {
				pointerId: e.pointerId,
				type: 'eraser',
				erasedIds
			}
			eraseAtPoint(pt[0], pt[1], erasedIds)
			setEraserPos(pt)
			return
		}

		const svgStrokeWidth = strokeWidth * Math.min(imageWidth, imageHeight)

		if (activeTool === 'freehand') {
			// Create active polyline element via ref-based DOM manipulation
			const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
			polyline.setAttribute('fill', 'none')
			polyline.setAttribute('stroke', color)
			polyline.setAttribute('stroke-width', String(svgStrokeWidth))
			polyline.setAttribute('stroke-linecap', 'round')
			polyline.setAttribute('stroke-linejoin', 'round')
			polyline.setAttribute('opacity', String(opacity))
			polyline.setAttribute('points', `${pt[0] * imageWidth},${pt[1] * imageHeight}`)
			svgRef.current?.appendChild(polyline)

			drawingRef.current = {
				pointerId: e.pointerId,
				type: 'freehand',
				points: [pt],
				element: polyline
			}
		} else if (activeTool === 'rect') {
			const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
			rect.setAttribute('fill', 'none')
			rect.setAttribute('stroke', color)
			rect.setAttribute('stroke-width', String(svgStrokeWidth))
			rect.setAttribute('opacity', String(opacity))
			rect.setAttribute('x', String(pt[0] * imageWidth))
			rect.setAttribute('y', String(pt[1] * imageHeight))
			rect.setAttribute('width', '0')
			rect.setAttribute('height', '0')
			svgRef.current?.appendChild(rect)

			drawingRef.current = {
				pointerId: e.pointerId,
				type: 'rect',
				startPoint: pt,
				element: rect
			}
		}
	}

	function handlePointerMove(e: React.PointerEvent) {
		// Track eraser cursor position even when not drawing
		if (activeTool === 'eraser' && !drawingRef.current) {
			const pt = pointerToNormalized(e)
			if (pt) setEraserPos(pt)
			return
		}

		const drawing = drawingRef.current
		if (!drawing || drawing.pointerId !== e.pointerId) return

		// If a second pointer arrives, cancel the stroke (pinch zoom takes over)
		// This is checked indirectly: pointerDown only starts on first pointer

		const pt = pointerToNormalized(e)
		if (!pt) return

		e.stopPropagation()
		e.preventDefault()

		if (drawing.type === 'eraser' && drawing.erasedIds) {
			eraseAtPoint(pt[0], pt[1], drawing.erasedIds)
			setEraserPos(pt)
		} else if (drawing.type === 'freehand' && drawing.points && drawing.element) {
			drawing.points.push(pt)
			const pointsStr = drawing.points
				.map(([x, y]) => `${x * imageWidth},${y * imageHeight}`)
				.join(' ')
			drawing.element.setAttribute('points', pointsStr)
		} else if (drawing.type === 'rect' && drawing.startPoint && drawing.element) {
			const x = Math.min(drawing.startPoint[0], pt[0])
			const y = Math.min(drawing.startPoint[1], pt[1])
			const w = Math.abs(pt[0] - drawing.startPoint[0])
			const h = Math.abs(pt[1] - drawing.startPoint[1])
			drawing.element.setAttribute('x', String(x * imageWidth))
			drawing.element.setAttribute('y', String(y * imageHeight))
			drawing.element.setAttribute('width', String(w * imageWidth))
			drawing.element.setAttribute('height', String(h * imageHeight))
		}
	}

	function handlePointerUp(e: React.PointerEvent) {
		const drawing = drawingRef.current
		if (!drawing || drawing.pointerId !== e.pointerId) return

		e.stopPropagation()

		if (drawing.type === 'eraser') {
			svgRef.current?.releasePointerCapture(e.pointerId)
			drawingRef.current = null
			return
		}

		// Remove the preview element
		if (drawing.element) {
			drawing.element.remove()
		}

		const id = crypto.randomUUID()

		if (drawing.type === 'freehand' && drawing.points && drawing.points.length >= 2) {
			const simplified = simplifyPoints(drawing.points, 0.002)
			onAdd({
				id,
				type: 'freehand',
				color,
				strokeWidth,
				opacity,
				points: simplified
			})
		} else if (drawing.type === 'rect' && drawing.startPoint) {
			const pt = pointerToNormalized(e)
			if (pt) {
				const x = Math.min(drawing.startPoint[0], pt[0])
				const y = Math.min(drawing.startPoint[1], pt[1])
				const w = Math.abs(pt[0] - drawing.startPoint[0])
				const h = Math.abs(pt[1] - drawing.startPoint[1])
				if (w > 0.005 && h > 0.005) {
					onAdd({
						id,
						type: 'rect',
						color,
						strokeWidth,
						opacity,
						x,
						y,
						width: w,
						height: h
					})
				}
			}
		}

		svgRef.current?.releasePointerCapture(e.pointerId)
		drawingRef.current = null
	}

	function cancelDrawing(e: React.PointerEvent) {
		const drawing = drawingRef.current
		if (!drawing) return
		if (drawing.element) {
			drawing.element.remove()
		}
		svgRef.current?.releasePointerCapture(e.pointerId)
		drawingRef.current = null
		setEraserPos(null)
	}

	// Cancel in-progress stroke if a second pointer appears (pinch zoom)
	function handleSecondPointerDown(e: React.PointerEvent) {
		if (drawingRef.current && e.pointerId !== drawingRef.current.pointerId) {
			cancelDrawing({
				...e,
				pointerId: drawingRef.current.pointerId
			} as React.PointerEvent)
		}
	}

	const eraserSvgRadius = ERASER_RADIUS * Math.min(imageWidth, imageHeight)

	return (
		<svg
			ref={svgRef}
			viewBox={`0 0 ${imageWidth} ${imageHeight}`}
			preserveAspectRatio="xMidYMid meet"
			style={{
				position: 'absolute',
				inset: 0,
				width: '100%',
				height: '100%',
				pointerEvents: activeTool ? 'auto' : 'none',
				touchAction: activeTool ? 'none' : 'auto',
				cursor: activeTool === 'eraser' ? 'none' : undefined
			}}
			onPointerDown={(e) => {
				handleSecondPointerDown(e)
				handlePointerDown(e)
			}}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={cancelDrawing}
			onPointerLeave={() => setEraserPos(null)}
		>
			{annotations.map((ann) => {
				if (ann.type === 'freehand' && ann.points.length >= 2) {
					const pointsStr = ann.points
						.map(([x, y]) => `${x * imageWidth},${y * imageHeight}`)
						.join(' ')
					return (
						<polyline
							key={ann.id}
							points={pointsStr}
							fill="none"
							stroke={ann.color}
							strokeWidth={ann.strokeWidth * Math.min(imageWidth, imageHeight)}
							strokeLinecap="round"
							strokeLinejoin="round"
							opacity={ann.opacity}
						/>
					)
				}
				if (ann.type === 'rect') {
					return (
						<rect
							key={ann.id}
							x={ann.x * imageWidth}
							y={ann.y * imageHeight}
							width={ann.width * imageWidth}
							height={ann.height * imageHeight}
							fill={ann.fill ?? 'none'}
							stroke={ann.color}
							strokeWidth={ann.strokeWidth * Math.min(imageWidth, imageHeight)}
							opacity={ann.opacity}
						/>
					)
				}
				return null
			})}
			{activeTool === 'eraser' && eraserPos && (
				<circle
					cx={eraserPos[0] * imageWidth}
					cy={eraserPos[1] * imageHeight}
					r={eraserSvgRadius}
					fill="rgba(255,255,255,0.3)"
					stroke="rgba(0,0,0,0.5)"
					strokeWidth={1}
					pointerEvents="none"
				/>
			)}
		</svg>
	)
}

// vim: ts=4
