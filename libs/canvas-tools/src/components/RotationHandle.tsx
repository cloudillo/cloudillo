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
import type { Bounds } from 'react-svg-canvas'
import { DEFAULT_SNAP_ANGLES, DEFAULT_SNAP_ZONE_RATIO, normalizeAngle } from 'react-svg-canvas'
import { calculateArcRadius } from '../utils/rotation'

export interface RotationHandleProps {
	/** Bounding box of the object being rotated */
	bounds: Bounds
	/** Current rotation in degrees */
	rotation: number
	/** Pivot X (0-1 normalized), default 0.5 */
	pivotX?: number
	/** Pivot Y (0-1 normalized), default 0.5 */
	pivotY?: number
	/** Canvas zoom scale for consistent handle sizing */
	scale: number
	/** Called when rotation drag starts */
	onRotateStart: (e: React.PointerEvent) => void
	/** Called when a snap blob is clicked */
	onSnapClick?: (angle: number) => void
	/** Whether rotation drag is currently active */
	isRotating?: boolean
	/** Whether snap mode is active (mouse inside inner zone) */
	isSnapActive?: boolean

	// Customization
	/** Custom snap angles in degrees, default: 15° intervals */
	snapAngles?: number[]
	/** Arc color, default: #0066ff */
	arcColor?: string
	/** Handle fill color, default: white */
	handleColor?: string
	/** Snap blob fill color when active, default: #e6f0ff */
	snapBlobActiveColor?: string
	/** Additional padding for arc radius, default: 25 */
	arcPadding?: number
}

export function RotationHandle({
	bounds,
	rotation,
	pivotX = 0.5,
	pivotY = 0.5,
	scale,
	onRotateStart,
	onSnapClick,
	isRotating = false,
	isSnapActive = false,
	snapAngles = DEFAULT_SNAP_ANGLES,
	arcColor = '#0066ff',
	handleColor = 'white',
	snapBlobActiveColor = '#e6f0ff',
	arcPadding = 25
}: RotationHandleProps) {
	// Calculate pivot point in absolute coordinates
	const cx = bounds.x + bounds.width * pivotX
	const cy = bounds.y + bounds.height * pivotY

	// Arc radius with viewport-relative clamping
	const arcRadius = calculateArcRadius({ bounds, scale, arcPadding })
	const snapZoneRadius = arcRadius * DEFAULT_SNAP_ZONE_RATIO

	// Handle sizes (scale-independent)
	const snapBlobRadius = 5 / scale
	const activeSnapRadius = 7 / scale
	const strokeWidth = 1.5 / scale
	const arcStrokeWidth = 1 / scale

	// Calculate snap blob positions on the arc
	const snapPoints = React.useMemo(
		() =>
			snapAngles.map((angle) => {
				const radians = (angle - 90) * (Math.PI / 180) // -90 to start from top
				return {
					angle,
					x: cx + arcRadius * Math.cos(radians),
					y: cy + arcRadius * Math.sin(radians)
				}
			}),
		[snapAngles, cx, cy, arcRadius]
	)

	// Find the closest snap angle to current rotation
	const normalizedRotation = normalizeAngle(rotation)
	const closestSnapAngle = React.useMemo(() => {
		return snapAngles.reduce((closest, angle) => {
			const diff = Math.min(
				Math.abs(normalizedRotation - angle),
				Math.abs(normalizedRotation - angle + 360),
				Math.abs(normalizedRotation - angle - 360)
			)
			const closestDiff = Math.min(
				Math.abs(normalizedRotation - closest),
				Math.abs(normalizedRotation - closest + 360),
				Math.abs(normalizedRotation - closest - 360)
			)
			return diff < closestDiff ? angle : closest
		}, 0)
	}, [normalizedRotation, snapAngles])

	const isSnapped =
		Math.abs(normalizedRotation - closestSnapAngle) < 2 ||
		Math.abs(normalizedRotation - closestSnapAngle + 360) < 2 ||
		Math.abs(normalizedRotation - closestSnapAngle - 360) < 2

	// Main rotation handle position (at current rotation angle on the arc)
	const handleRadians = (rotation - 90) * (Math.PI / 180)
	const handleX = cx + arcRadius * Math.cos(handleRadians)
	const handleY = cy + arcRadius * Math.sin(handleRadians)

	// Format angle for display
	const displayAngle = Math.round(normalizedRotation)

	return (
		<g style={{ pointerEvents: 'all' }}>
			{/* Arc circle and snap points - only visible during rotation */}
			{isRotating && (
				<>
					{/* Arc circle (dashed) */}
					<circle
						cx={cx}
						cy={cy}
						r={arcRadius}
						fill="none"
						stroke={arcColor}
						strokeWidth={arcStrokeWidth}
						strokeOpacity={0.3}
						strokeDasharray={`${4 / scale} ${4 / scale}`}
						pointerEvents="none"
					/>

					{/* Inner snap zone circle */}
					<circle
						cx={cx}
						cy={cy}
						r={snapZoneRadius}
						fill={isSnapActive ? `${arcColor}0d` : 'none'}
						stroke={isSnapActive ? arcColor : '#999999'}
						strokeWidth={arcStrokeWidth}
						strokeOpacity={isSnapActive ? 0.6 : 0.3}
						strokeDasharray={`${3 / scale} ${3 / scale}`}
						pointerEvents="none"
					/>

					{/* Snap blobs at snap angle intervals */}
					{snapPoints.map(({ angle, x, y }) => {
						const isCurrentSnap = isSnapped && angle === closestSnapAngle
						const baseRadius = snapBlobRadius
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
								fill={
									isCurrentSnap
										? arcColor
										: isSnapActive
											? snapBlobActiveColor
											: handleColor
								}
								stroke={arcColor}
								strokeWidth={strokeWidth}
								opacity={opacity}
								style={{ cursor: 'pointer' }}
								onClick={(e) => {
									e.stopPropagation()
									onSnapClick?.(angle)
								}}
							/>
						)
					})}
				</>
			)}

			{/* Connecting line from pivot to current handle position - always visible */}
			<line
				x1={cx}
				y1={cy}
				x2={handleX}
				y2={handleY}
				stroke={arcColor}
				strokeWidth={strokeWidth}
				strokeOpacity={0.5}
				pointerEvents="none"
			/>

			{/* Main rotation handle (draggable, shows current rotation) */}
			<circle
				cx={handleX}
				cy={handleY}
				r={8 / scale}
				fill={handleColor}
				stroke={arcColor}
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
						fill={isSnapActive ? arcColor : 'rgba(0, 0, 0, 0.7)'}
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
