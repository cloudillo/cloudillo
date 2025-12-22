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
 * Renders ghost shapes from remote users via awareness
 * Shown as dashed shapes with user label
 */

import * as React from 'react'
import type { IdealloPresence } from '../hooks/index.js'
import { colorToCss } from '../utils/palette.js'

const GHOST_OPACITY = 0.6
const GHOST_DASH_ARRAY = '6,4'

export interface GhostShapesProps {
	remotePresence: Map<number, IdealloPresence>
}

export function GhostShapes({ remotePresence }: GhostShapesProps) {
	return (
		<g className="ghost-shapes" pointerEvents="none">
			{Array.from(remotePresence.entries()).map(([clientId, presence]) => {
				if (!presence.shape) return null

				const { type, startX, startY, endX, endY, style } = presence.shape
				const user = presence.user

				// Normalize bounds
				const minX = Math.min(startX, endX)
				const minY = Math.min(startY, endY)
				const width = Math.abs(endX - startX)
				const height = Math.abs(endY - startY)

				const commonProps = {
					stroke: colorToCss(style.strokeColor),
					strokeWidth: style.strokeWidth,
					strokeDasharray: GHOST_DASH_ARRAY,
					fill: style.fillColor === 'transparent' ? 'none' : colorToCss(style.fillColor),
					opacity: GHOST_OPACITY
				}

				let shapeElement: React.ReactNode = null

				if (type === 'rect') {
					shapeElement = (
						<rect x={minX} y={minY} width={width} height={height} {...commonProps} />
					)
				} else if (type === 'ellipse') {
					shapeElement = (
						<ellipse
							cx={minX + width / 2}
							cy={minY + height / 2}
							rx={width / 2}
							ry={height / 2}
							{...commonProps}
						/>
					)
				} else if (type === 'line') {
					shapeElement = (
						<line
							x1={startX}
							y1={startY}
							x2={endX}
							y2={endY}
							{...commonProps}
							fill="none"
						/>
					)
				} else if (type === 'arrow') {
					const angle = Math.atan2(endY - startY, endX - startX)
					const headLength = 12
					const headAngle = Math.PI / 6
					const ax1 = endX - headLength * Math.cos(angle - headAngle)
					const ay1 = endY - headLength * Math.sin(angle - headAngle)
					const ax2 = endX - headLength * Math.cos(angle + headAngle)
					const ay2 = endY - headLength * Math.sin(angle + headAngle)

					shapeElement = (
						<g {...commonProps} fill="none">
							<line x1={startX} y1={startY} x2={endX} y2={endY} />
							<polyline points={`${ax1},${ay1} ${endX},${endY} ${ax2},${ay2}`} />
						</g>
					)
				}

				return (
					<g key={`ghost-shape-${clientId}`}>
						{shapeElement}
						{/* User label at current position */}
						{user && (
							<text
								x={endX + 12}
								y={endY - 8}
								fill={user.color}
								fontSize={11}
								fontFamily="system-ui, sans-serif"
								fontWeight={500}
								opacity={GHOST_OPACITY}
							>
								{user.name}
							</text>
						)}
					</g>
				)
			})}
		</g>
	)
}

// vim: ts=4
