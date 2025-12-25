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
 * Renders ghost objects being edited (dragged) by remote users
 * Shows objects with offset applied from awareness editing state
 */

import * as React from 'react'
import type { IdealloPresence } from '../hooks/index.js'
import type { IdealloObject, ObjectId, StoredObject, YIdealloDocument } from '../crdt/index.js'
import { expandObject, toObjectId } from '../crdt/index.js'
import { ObjectRenderer } from './ObjectRenderer.js'

const GHOST_OPACITY = 0.5

export interface GhostEditingProps {
	doc: YIdealloDocument
	remotePresence: Map<number, IdealloPresence>
	objects: Record<string, StoredObject> | null
}

export function GhostEditing({ doc, remotePresence, objects }: GhostEditingProps) {
	if (!objects) return null

	return (
		<g className="ghost-editing" pointerEvents="none" opacity={GHOST_OPACITY}>
			{Array.from(remotePresence.entries()).map(([clientId, presence]) => {
				if (!presence.editing) return null

				const { objectIds, action, dx, dy } = presence.editing
				if (action !== 'drag' || (dx === 0 && dy === 0)) return null

				const user = presence.user

				return (
					<g key={`ghost-editing-${clientId}`}>
						{objectIds.map((id) => {
							const stored = objects[id]
							if (!stored) return null

							const objectId = toObjectId(id)
							const obj = expandObject(objectId, stored, doc)

							// Apply offset to the object
							const offsetObj = applyOffset(obj, dx, dy)

							return (
								<g
									key={id}
									style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.3))' }}
								>
									<ObjectRenderer object={offsetObj} />
								</g>
							)
						})}
						{/* User label */}
						{user && objectIds.length > 0 && objects[objectIds[0]] && (
							<text
								x={
									getObjectX(
										expandObject(
											toObjectId(objectIds[0]),
											objects[objectIds[0]],
											doc
										)
									) +
									dx +
									12
								}
								y={
									getObjectY(
										expandObject(
											toObjectId(objectIds[0]),
											objects[objectIds[0]],
											doc
										)
									) +
									dy -
									8
								}
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

function getObjectX(obj: IdealloObject): number {
	if (obj.type === 'line' || obj.type === 'arrow') {
		return Math.min(obj.startX, obj.endX)
	}
	return obj.x
}

function getObjectY(obj: IdealloObject): number {
	if (obj.type === 'line' || obj.type === 'arrow') {
		return Math.min(obj.startY, obj.endY)
	}
	return obj.y
}

function applyOffset(obj: IdealloObject, dx: number, dy: number): IdealloObject {
	switch (obj.type) {
		case 'line':
		case 'arrow':
			return {
				...obj,
				x: obj.x + dx,
				y: obj.y + dy,
				startX: obj.startX + dx,
				startY: obj.startY + dy,
				endX: obj.endX + dx,
				endY: obj.endY + dy
			}
		default:
			// For freehand, pathData uses absolute coords - position only update
			// (ghost rendering will use transform for visual offset)
			return {
				...obj,
				x: obj.x + dx,
				y: obj.y + dy
			}
	}
}

// vim: ts=4
