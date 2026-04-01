// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
/**
 * Renders remote user cursors via awareness
 * Shows cursor pointer with user name label
 */

import type { IdealloPresence } from '../hooks/index.js'

export interface CursorsProps {
	remotePresence: Map<number, IdealloPresence>
}

export function Cursors({ remotePresence }: CursorsProps) {
	return (
		<g className="remote-cursors" pointerEvents="none">
			{Array.from(remotePresence.entries()).map(([clientId, presence]) => {
				if (!presence.cursor || !presence.user) return null

				const { x, y } = presence.cursor
				const { name, color } = presence.user

				return (
					<g key={`cursor-${clientId}`} transform={`translate(${x}, ${y})`}>
						{/* Cursor pointer shape */}
						<path
							d="M0 0 L0 14 L4 10 L7 16 L9 15 L6 9 L11 9 Z"
							fill={color}
							stroke="white"
							strokeWidth={1}
						/>
						{/* User name label */}
						<g transform="translate(12, 16)">
							<rect
								x={0}
								y={0}
								width={name.length * 7 + 8}
								height={18}
								rx={4}
								fill={color}
							/>
							<text
								x={4}
								y={13}
								fill="white"
								fontSize={11}
								fontFamily="system-ui, sans-serif"
								fontWeight={500}
							>
								{name}
							</text>
						</g>
					</g>
				)
			})}
		</g>
	)
}

// vim: ts=4
