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
 * Fixed-layer wrapper components for canvas overlays
 *
 * These components transform canvas coordinates to screen coordinates
 * and render in the SvgCanvas fixed layer (constant screen size regardless of zoom).
 */

import * as React from 'react'
import {
	useSvgCanvas,
	SelectionBox,
	SnapGuides,
	type SelectionBoxProps,
	type SnapGuidesProps
} from 'react-svg-canvas'
import {
	RotationHandle,
	PivotHandle,
	type RotationHandleProps,
	type PivotHandleProps
} from '@cloudillo/canvas-tools'

import type { Bounds } from '../crdt'

/**
 * Wrapper component for SnapGuides that uses the fixed layer transform
 */
export function FixedSnapGuides(props: Omit<SnapGuidesProps, 'transformPoint'>) {
	const { translateFrom } = useSvgCanvas()
	return <SnapGuides {...props} transformPoint={translateFrom} />
}

/**
 * Wrapper component for SelectionBox that renders in the fixed layer
 * Transforms canvas coordinates to screen coordinates
 */
export function FixedSelectionBox(
	props: Omit<SelectionBoxProps, 'bounds'> & { canvasBounds: Bounds }
) {
	const { translateFrom, scale } = useSvgCanvas()

	// Transform bounds from canvas space to screen space
	const [screenX, screenY] = translateFrom(props.canvasBounds.x, props.canvasBounds.y)
	const screenBounds = {
		x: screenX,
		y: screenY,
		width: props.canvasBounds.width * scale,
		height: props.canvasBounds.height * scale
	}

	return <SelectionBox {...props} bounds={screenBounds} />
}

/**
 * Wrapper component for RotationHandle that renders in the fixed layer
 * Transforms canvas coordinates to screen coordinates
 */
export function FixedRotationHandle(
	props: Omit<RotationHandleProps, 'scale' | 'bounds'> & { canvasBounds: Bounds }
) {
	const { translateFrom, scale } = useSvgCanvas()

	const [screenX, screenY] = translateFrom(props.canvasBounds.x, props.canvasBounds.y)
	const screenBounds = {
		x: screenX,
		y: screenY,
		width: props.canvasBounds.width * scale,
		height: props.canvasBounds.height * scale
	}

	return <RotationHandle {...props} bounds={screenBounds} scale={1} />
}

/**
 * Wrapper component for PivotHandle that renders in the fixed layer
 * Transforms canvas coordinates to screen coordinates
 */
export function FixedPivotHandle(
	props: Omit<PivotHandleProps, 'scale' | 'bounds' | 'originalBounds' | 'initialPivot'> & {
		canvasBounds: Bounds
		canvasOriginalBounds?: Bounds
		initialPivot?: { x: number; y: number }
	}
) {
	const { canvasOriginalBounds, initialPivot, ...rest } = props
	const { translateFrom, scale } = useSvgCanvas()

	const [screenX, screenY] = translateFrom(props.canvasBounds.x, props.canvasBounds.y)
	const screenBounds = {
		x: screenX,
		y: screenY,
		width: props.canvasBounds.width * scale,
		height: props.canvasBounds.height * scale
	}

	// Transform original bounds for snap points during drag
	let screenOriginalBounds: Bounds | undefined
	if (canvasOriginalBounds) {
		const [origX, origY] = translateFrom(canvasOriginalBounds.x, canvasOriginalBounds.y)
		screenOriginalBounds = {
			x: origX,
			y: origY,
			width: canvasOriginalBounds.width * scale,
			height: canvasOriginalBounds.height * scale
		}
	}

	return (
		<PivotHandle
			{...rest}
			bounds={screenBounds}
			originalBounds={screenOriginalBounds}
			initialPivot={initialPivot}
			scale={1}
		/>
	)
}

/**
 * Fixed layer text edit handle bar for dragging text objects during editing
 * Renders at constant screen size regardless of zoom level
 *
 * The handle bar has three zones:
 * - Left third: edge snapping (grab point x=0-0.33, y=0)
 * - Center third: center snapping (grab point 0.5, 0.5) - visually distinct
 * - Right third: edge snapping (grab point x=0.67-1, y=0)
 */
export function FixedTextEditHandle({
	canvasBounds,
	rotation,
	onDragStart
}: {
	canvasBounds: { x: number; y: number; width: number; height: number }
	rotation?: number
	onDragStart: (e: React.PointerEvent, grabPointOverride: { x: number; y: number }) => void
}) {
	const { translateFrom, scale } = useSvgCanvas()

	// Transform canvas coords to screen coords
	const [screenX, screenY] = translateFrom(canvasBounds.x, canvasBounds.y)
	const screenWidth = canvasBounds.width * scale
	const screenHeight = canvasBounds.height * scale

	const HANDLE_HEIGHT = 20
	const HANDLE_GAP = 6

	// Position handle bar above the text box (in screen coords)
	const handleY = screenY - HANDLE_GAP - HANDLE_HEIGHT
	const handleCenterY = handleY + HANDLE_HEIGHT / 2

	// Center zone boundaries (middle third)
	const CENTER_ZONE_START = 1 / 3
	const CENTER_ZONE_END = 2 / 3

	function handlePointerDown(e: React.PointerEvent) {
		e.preventDefault()
		e.stopPropagation()
		const rect = (e.target as SVGElement).getBoundingClientRect()
		const relativeX = (e.clientX - rect.left) / rect.width
		const normalizedX = Math.max(0, Math.min(1, relativeX))

		// Check if click is in center zone
		const isInCenterZone = normalizedX >= CENTER_ZONE_START && normalizedX <= CENTER_ZONE_END

		if (isInCenterZone) {
			// Center zone: use true center grab point for center snapping (both axes)
			onDragStart(e, { x: 0.5, y: 0.5 })
		} else {
			// Edge zones: use horizontal position, y=0 (top edge)
			onDragStart(e, { x: normalizedX, y: 0 })
		}
	}

	// Calculate rotation transform around object center (in screen coords)
	const centerX = screenX + screenWidth / 2
	const centerY = screenY + screenHeight / 2
	const rotationTransform = rotation ? `rotate(${rotation} ${centerX} ${centerY})` : undefined

	// Center zone visual boundaries
	const centerZoneX = screenX + screenWidth * CENTER_ZONE_START
	const centerZoneWidth = screenWidth * (CENTER_ZONE_END - CENTER_ZONE_START)

	return (
		<g transform={rotationTransform}>
			{/* Main handle bar background */}
			<rect
				data-text-edit-handle="true"
				x={screenX}
				y={handleY}
				width={screenWidth}
				height={HANDLE_HEIGHT}
				fill="#0066ff"
				fillOpacity={0.1}
				stroke="#0066ff"
				strokeWidth={1}
				rx={4}
				style={{ cursor: 'grab', pointerEvents: 'all' }}
				onPointerDown={handlePointerDown}
			/>
			{/* Center zone highlight */}
			<rect
				x={centerZoneX}
				y={handleY}
				width={centerZoneWidth}
				height={HANDLE_HEIGHT}
				fill="#0066ff"
				fillOpacity={0.15}
				rx={2}
				style={{ pointerEvents: 'none' }}
			/>
			{/* Center zone grip pattern (denser vertical lines) */}
			<g pointerEvents="none" opacity={0.5}>
				{[-8, -4, 0, 4, 8].map((offset) => (
					<line
						key={offset}
						x1={centerX + offset}
						y1={handleCenterY - 5}
						x2={centerX + offset}
						y2={handleCenterY + 5}
						stroke="#0066ff"
						strokeWidth={1.5}
						strokeLinecap="round"
					/>
				))}
			</g>
			{/* Edge zone grip pattern (lighter dots) */}
			<g pointerEvents="none" opacity={0.3}>
				{/* Left edge indicator */}
				<circle cx={screenX + screenWidth * 0.15} cy={handleCenterY} r={2} fill="#0066ff" />
				{/* Right edge indicator */}
				<circle cx={screenX + screenWidth * 0.85} cy={handleCenterY} r={2} fill="#0066ff" />
			</g>
		</g>
	)
}

// vim: ts=4
