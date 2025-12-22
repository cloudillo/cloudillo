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
 * Renders ghost strokes from remote users via awareness
 * Shown as dashed lines with user label
 */

import * as React from 'react'
import type { IdealloPresence } from '../hooks/index.js'
import { pointsToSvgPath } from '../utils/index.js'
import { colorToCss } from '../utils/palette.js'

const GHOST_OPACITY = 0.6
const GHOST_DASH_ARRAY = '4,4'

export interface GhostStrokesProps {
	remotePresence: Map<number, IdealloPresence>
}

export function GhostStrokes({ remotePresence }: GhostStrokesProps) {
	return (
		<g className="ghost-strokes" pointerEvents="none">
			{Array.from(remotePresence.entries()).map(([clientId, presence]) => {
				if (!presence.drawing) return null

				const { strokeId, points, style } = presence.drawing
				const user = presence.user

				if (points.length < 2) return null

				const pathData = pointsToSvgPath(points)

				return (
					<g key={`ghost-${clientId}-${strokeId}`} opacity={GHOST_OPACITY}>
						<path
							d={pathData}
							fill="none"
							stroke={colorToCss(style.color)}
							strokeWidth={style.width}
							strokeDasharray={GHOST_DASH_ARRAY}
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
						{/* User label follows current position */}
						{user && points.length > 0 && (
							<text
								x={points[points.length - 1][0] + 12}
								y={points[points.length - 1][1] - 8}
								fill={user.color}
								fontSize={11}
								fontFamily="system-ui, sans-serif"
								fontWeight={500}
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
