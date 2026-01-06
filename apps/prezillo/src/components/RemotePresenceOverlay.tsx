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
 * Component for rendering ghost overlays showing remote users' edits
 */

import * as React from 'react'
import type { PrezilloPresence } from '../awareness'
import type { PrezilloObject } from '../crdt'

export interface RemotePresenceOverlayProps {
	remotePresence: Map<number, PrezilloPresence>
	canvasObjects: (PrezilloObject & { _templateId?: string; _isPrototype?: boolean })[]
}

/**
 * Renders ghost shapes showing what remote users are editing
 */
export function RemotePresenceOverlay({
	remotePresence,
	canvasObjects
}: RemotePresenceOverlayProps) {
	return (
		<>
			{Array.from(remotePresence.entries()).map(([clientId, presence]) => {
				if (!presence.editing) return null

				// Find the object being edited
				const obj = canvasObjects.find((o) => o.id === presence.editing!.objectId)
				if (!obj) return null

				const editing = presence.editing
				const user = presence.user
				const color = user?.color || '#888888'
				const x = editing.x
				const y = editing.y
				const width = editing.width ?? obj.width
				const height = editing.height ?? obj.height

				// Render the ghost shape based on object type
				let ghostShape: React.ReactNode
				switch (obj.type) {
					case 'ellipse':
						ghostShape = (
							<ellipse
								cx={x + width / 2}
								cy={y + height / 2}
								rx={width / 2}
								ry={height / 2}
								fill={color}
								stroke={color}
								strokeWidth={2}
								strokeDasharray="4,4"
							/>
						)
						break
					case 'line':
						const points = obj.points || [
							[0, height / 2],
							[width, height / 2]
						]
						ghostShape = (
							<line
								x1={x + points[0][0]}
								y1={y + points[0][1]}
								x2={x + points[1][0]}
								y2={y + points[1][1]}
								stroke={color}
								strokeWidth={3}
								strokeDasharray="4,4"
							/>
						)
						break
					case 'text':
						ghostShape = (
							<text
								x={x}
								y={y + height * 0.8}
								fill={color}
								fontSize={Math.min(height, 64)}
							>
								{obj.text}
							</text>
						)
						break
					default: // rect and fallback
						ghostShape = (
							<rect
								x={x}
								y={y}
								width={width}
								height={height}
								rx={
									'cornerRadius' in obj && typeof obj.cornerRadius === 'number'
										? obj.cornerRadius
										: undefined
								}
								fill={color}
								stroke={color}
								strokeWidth={2}
								strokeDasharray="4,4"
							/>
						)
				}

				return (
					<g key={`ghost-${clientId}`} opacity={0.4} pointerEvents="none">
						{ghostShape}
						<text x={x} y={y - 5} fill={color} fontSize={10}>
							{user?.name || 'Unknown'}
						</text>
					</g>
				)
			})}
		</>
	)
}

// vim: ts=4
