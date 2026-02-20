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

/**
 * Hook for canvas viewport state, bounds calculation, and auto-centering effects
 */

import * as React from 'react'
import type { SvgCanvasContext, SvgCanvasHandle } from 'react-svg-canvas'

import type { Bounds, ViewId, TemplateId, ViewNode } from '../crdt'
import { getView } from '../crdt'
import type { UsePrezilloDocumentResult } from './usePrezilloDocument'
import type { TemplateLayout } from './useTemplateLayout'

export interface UseCanvasViewportOptions {
	prezillo: UsePrezilloDocumentResult
	canvasContextRef: React.MutableRefObject<SvgCanvasContext | null>
	canvasRef: React.MutableRefObject<SvgCanvasHandle | null>
	canvasContainerRef: React.MutableRefObject<HTMLDivElement | null>
	templateLayouts: Map<TemplateId, TemplateLayout>
	forceZoomRef: React.MutableRefObject<boolean>
	forceZoomTemplateRef: React.MutableRefObject<boolean>
}

export interface UseCanvasViewportResult {
	canvasScale: number
	viewportBounds: Bounds | null
	handleCanvasContextReady: (ctx: SvgCanvasContext) => void
}

export function useCanvasViewport({
	prezillo,
	canvasContextRef,
	canvasRef,
	canvasContainerRef,
	templateLayouts,
	forceZoomRef,
	forceZoomTemplateRef
}: UseCanvasViewportOptions): UseCanvasViewportResult {
	// Canvas scale for image variant selection
	const [canvasScale, setCanvasScale] = React.useState(1)

	// Viewport bounds in canvas coordinates (for multi-page visibility culling)
	const [viewportBounds, setViewportBounds] = React.useState<Bounds | null>(null)

	// Calculate viewport bounds from canvas context
	const updateViewportBounds = React.useCallback(
		(ctx: SvgCanvasContext) => {
			// Get the canvas container dimensions
			const container = canvasContainerRef.current
			if (!container) return

			const rect = container.getBoundingClientRect()
			// Convert screen corners to canvas coordinates
			const [x1, y1] = ctx.translateTo(0, 0)
			const [x2, y2] = ctx.translateTo(rect.width, rect.height)

			setViewportBounds({
				x: Math.min(x1, x2),
				y: Math.min(y1, y2),
				width: Math.abs(x2 - x1),
				height: Math.abs(y2 - y1)
			})
		},
		[canvasContainerRef]
	)

	const handleCanvasContextReady = React.useCallback(
		(ctx: SvgCanvasContext) => {
			canvasContextRef.current = ctx
			setCanvasScale(ctx.scale)
			updateViewportBounds(ctx)
		},
		[canvasContextRef, updateViewportBounds]
	)

	// Update viewport bounds on pan/zoom (tracked via context scale changes)
	React.useEffect(() => {
		const ctx = canvasContextRef.current
		if (ctx) {
			updateViewportBounds(ctx)
		}
	}, [canvasScale, canvasContextRef, updateViewportBounds])

	// Also update viewport bounds on window resize
	React.useEffect(() => {
		const handleResize = () => {
			const ctx = canvasContextRef.current
			if (ctx) {
				updateViewportBounds(ctx)
			}
		}
		window.addEventListener('resize', handleResize)
		return () => window.removeEventListener('resize', handleResize)
	}, [canvasContextRef, updateViewportBounds])

	// Center on active view when it changes (smart zoom - only if page is off-screen or explicit navigation)
	const activeView = prezillo.activeViewId ? getView(prezillo.doc, prezillo.activeViewId) : null
	React.useEffect(() => {
		if (activeView && canvasRef.current) {
			const isInView = canvasRef.current.isRectInView(
				activeView.x,
				activeView.y,
				activeView.width,
				activeView.height
			)

			// Zoom if: explicit navigation (ViewPicker click) OR page center is off-screen
			const shouldZoom = forceZoomRef.current || !isInView
			forceZoomRef.current = false // Reset flag

			if (shouldZoom) {
				canvasRef.current.centerOnRectAnimated(
					activeView.x,
					activeView.y,
					activeView.width,
					activeView.height,
					{ duration: 350, zoomOutFactor: 0.15 }
				)
			}
		}
	}, [prezillo.activeViewId])

	// Center on selected template (template frames above views)
	React.useEffect(() => {
		if (!prezillo.selectedTemplateId || !canvasRef.current) return

		const layout = templateLayouts.get(prezillo.selectedTemplateId)
		if (!layout) return

		const isInView = canvasRef.current.isRectInView(
			layout.x,
			layout.y,
			layout.width,
			layout.height
		)

		// Zoom if: explicit selection OR template center is off-screen
		const shouldZoom = forceZoomTemplateRef.current || !isInView
		forceZoomTemplateRef.current = false

		if (shouldZoom) {
			canvasRef.current.centerOnRectAnimated(
				layout.x,
				layout.y,
				layout.width,
				layout.height,
				{ duration: 350, zoomOutFactor: 0.15 }
			)
		}
	}, [prezillo.selectedTemplateId, templateLayouts])

	return {
		canvasScale,
		viewportBounds,
		handleCanvasContextReady
	}
}

// vim: ts=4
