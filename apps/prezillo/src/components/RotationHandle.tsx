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
 * RotationHandle - A draggable handle for rotating objects with snap points
 *
 * Renders a rotation arc with snap blobs at 15° intervals around the object.
 * Users can drag anywhere on the arc for free rotation, or click snap blobs
 * to snap to specific angles.
 */

import * as React from 'react'
import type { Bounds } from '../crdt'

export interface RotationHandleProps {
	bounds: Bounds
	rotation: number
	pivotX: number
	pivotY: number
	scale: number // Current canvas zoom scale for consistent handle size
	onRotateStart: (e: React.PointerEvent) => void
	onSnapClick?: (angle: number) => void // Called when a snap blob is clicked
	isRotating?: boolean // Whether rotation drag is currently active
	isSnapActive?: boolean // Whether snap mode is active (mouse inside inner zone)
}

// Snap zone radius ratio (0.75 = inner 75% of arc radius triggers snapping)
export const SNAP_ZONE_RATIO = 0.75

// Generate snap angles at 15° intervals
const SNAP_ANGLES = Array.from({ length: 24 }, (_, i) => i * 15)

export function RotationHandle({
	bounds,
	rotation,
	pivotX,
	pivotY,
	scale,
	onRotateStart,
	onSnapClick,
	isRotating = false,
	isSnapActive = false
}: RotationHandleProps) {
	// Calculate pivot point in absolute coordinates
	const cx = bounds.x + bounds.width * pivotX
	const cy = bounds.y + bounds.height * pivotY

	// Arc radius: distance from pivot to furthest corner + padding
	const halfW = bounds.width / 2
	const halfH = bounds.height / 2
	// Use the diagonal distance from pivot to corner as base radius
	const maxDist = Math.sqrt(halfW * halfW + halfH * halfH)
	const arcRadius = maxDist + 25 / scale // Add padding for the arc
	const snapZoneRadius = arcRadius * SNAP_ZONE_RATIO // Inner zone where snapping is active

	// Handle sizes (scale-independent)
	const snapBlobRadius = 5 / scale
	const activeSnapRadius = 7 / scale // Slightly larger for the current angle
	const strokeWidth = 1.5 / scale
	const arcStrokeWidth = 1 / scale

	// Calculate snap blob positions on the arc (in unrotated space, relative to pivot)
	const snapPoints = SNAP_ANGLES.map((angle) => {
		const radians = (angle - 90) * (Math.PI / 180) // -90 to start from top
		return {
			angle,
			x: cx + arcRadius * Math.cos(radians),
			y: cy + arcRadius * Math.sin(radians)
		}
	})

	// Find the closest snap angle to current rotation
	const normalizedRotation = ((rotation % 360) + 360) % 360
	const closestSnapAngle = SNAP_ANGLES.reduce((closest, angle) => {
		const diff = Math.abs(normalizedRotation - angle)
		const closestDiff = Math.abs(normalizedRotation - closest)
		return diff < closestDiff ? angle : closest
	}, 0)
	const isSnapped = Math.abs(normalizedRotation - closestSnapAngle) < 2

	// Main rotation handle position (at current rotation angle on the arc)
	const handleRadians = (rotation - 90) * (Math.PI / 180)
	const handleX = cx + arcRadius * Math.cos(handleRadians)
	const handleY = cy + arcRadius * Math.sin(handleRadians)

	// Format angle for display
	const displayAngle = Math.round(normalizedRotation)

	return (
		<g style={{ pointerEvents: 'all' }}>
			{/* Arc circle (dashed) - doesn't rotate with object */}
			<circle
				cx={cx}
				cy={cy}
				r={arcRadius}
				fill="none"
				stroke="#0066ff"
				strokeWidth={arcStrokeWidth}
				strokeOpacity={0.3}
				strokeDasharray={`${4 / scale} ${4 / scale}`}
				pointerEvents="none"
			/>

			{/* Inner snap zone circle - only visible during rotation */}
			{isRotating && (
				<circle
					cx={cx}
					cy={cy}
					r={snapZoneRadius}
					fill={isSnapActive ? 'rgba(0, 102, 255, 0.05)' : 'none'}
					stroke={isSnapActive ? '#0066ff' : '#999999'}
					strokeWidth={arcStrokeWidth}
					strokeOpacity={isSnapActive ? 0.6 : 0.3}
					strokeDasharray={`${3 / scale} ${3 / scale}`}
					pointerEvents="none"
				/>
			)}

			{/* Snap blobs at 15° intervals */}
			{snapPoints.map(({ angle, x, y }) => {
				const isCurrentSnap = isSnapped && angle === closestSnapAngle
				// When snap mode is active, make all blobs larger and more visible
				const baseRadius = isSnapActive ? snapBlobRadius * 1.3 : snapBlobRadius
				const radius = isCurrentSnap ? activeSnapRadius : baseRadius
				// Increase opacity when snap is active
				const baseOpacity = angle % 90 === 0 ? 0.8 : angle % 45 === 0 ? 0.5 : 0.3
				const opacity = isSnapActive ? Math.min(baseOpacity + 0.3, 1) : baseOpacity

				return (
					<circle
						key={angle}
						cx={x}
						cy={y}
						r={radius}
						fill={isCurrentSnap ? '#0066ff' : isSnapActive ? '#e6f0ff' : 'white'}
						stroke={isSnapActive ? '#0066ff' : '#0066ff'}
						strokeWidth={isSnapActive ? strokeWidth * 1.2 : strokeWidth}
						opacity={opacity}
						style={{ cursor: 'pointer' }}
						onClick={(e) => {
							e.stopPropagation()
							onSnapClick?.(angle)
						}}
					/>
				)
			})}

			{/* Connecting line from pivot to current handle position */}
			<line
				x1={cx}
				y1={cy}
				x2={handleX}
				y2={handleY}
				stroke="#0066ff"
				strokeWidth={strokeWidth}
				strokeOpacity={0.5}
				pointerEvents="none"
			/>

			{/* Main rotation handle (draggable, shows current rotation) */}
			<circle
				cx={handleX}
				cy={handleY}
				r={8 / scale}
				fill="white"
				stroke="#0066ff"
				strokeWidth={2 / scale}
				style={{ cursor: 'grab' }}
				onPointerDown={(e) => {
					e.stopPropagation()
					e.preventDefault()
					onRotateStart(e)
				}}
			/>

			{/* Angle display - shown during rotation */}
			{isRotating && (
				<g pointerEvents="none">
					{/* Background pill for readability */}
					<rect
						x={handleX + 12 / scale}
						y={handleY - 10 / scale}
						width={isSnapActive ? 50 / scale : 40 / scale}
						height={20 / scale}
						rx={4 / scale}
						fill={isSnapActive ? '#0066ff' : 'rgba(0, 0, 0, 0.7)'}
					/>
					{/* Angle text */}
					<text
						x={handleX + (isSnapActive ? 37 : 32) / scale}
						y={handleY + 4 / scale}
						fontSize={12 / scale}
						fill="white"
						textAnchor="middle"
						fontFamily="system-ui, sans-serif"
						fontWeight={isSnapActive ? 600 : 400}
					>
						{displayAngle}°{isSnapActive ? ' ⊙' : ''}
					</text>
				</g>
			)}
		</g>
	)
}

// vim: ts=4
