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
 * Renders remote user cursors via awareness
 * Shows cursor pointer with user name label
 */

import * as React from 'react'
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
