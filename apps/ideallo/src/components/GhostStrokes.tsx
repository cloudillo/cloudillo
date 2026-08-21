// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

/**
 * Renders ghost strokes from remote users via awareness
 * Shown as dashed lines with user label
 */

import { presenceColor } from '@cloudillo/core'
import { useDarkMode } from '@cloudillo/react'

import type { IdealloPresence } from '../hooks/index.js'
import { pointsToSvgPath } from '../utils/index.js'
import { colorToCss } from '../utils/palette.js'

const GHOST_OPACITY = 0.6
const GHOST_DASH_ARRAY = '4,4'

export interface GhostStrokesProps {
	remotePresence: Map<number, IdealloPresence>
}

export function GhostStrokes({ remotePresence }: GhostStrokesProps) {
	// Subscribed, not threaded down: this sits inside `CanvasScene`'s `React.memo`
	// boundary, which `darkMode` is not a prop of.
	const dark = useDarkMode()

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
								fill={presenceColor(user.idTag, clientId, dark)}
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
