// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

/**
 * Renders ghost objects being edited (dragged) by remote users
 * Shows objects with offset applied from awareness editing state
 */

import { resolveConnectorRoutes } from '../connectors/index.js'
import { findIncidentArrows } from '../connectors/lifecycle.js'
import type { IdealloObject, StoredObject, YIdealloDocument } from '../crdt/index.js'
import { toObjectId, tryExpandObject } from '../crdt/index.js'
import type { IdealloPresence } from '../hooks/index.js'
import { ObjectRenderer } from './ObjectRenderer.js'

const GHOST_OPACITY = 0.5

export interface GhostEditingProps {
	doc: YIdealloDocument
	remotePresence: Map<number, IdealloPresence>
	objects: Record<string, StoredObject> | null
	/**
	 * The document already expanded, WITHOUT any override applied - Canvas has built exactly this
	 * array for its own render. Optional: without it GhostConnectors expands `objects` itself, so
	 * the component still works standalone, just at one full expansion per remote drag frame.
	 */
	expandedObjects?: IdealloObject[]
	/** Owner of the document, for image URLs */
	ownerTag?: string
	/** Access token for iframe-sandboxed image fetches */
	token?: string
}

/**
 * Awareness is peer-controlled and never runtime-validated. `dx`/`dy` now reach the routers
 * through GhostConnectors, where a non-finite delta comes out as NaN in the emitted path `d` -
 * so drop the whole ghost instead. Sibling of isRenderableShape in GhostShapes.tsx.
 */
export function isRenderableEditing(
	editing: IdealloPresence['editing']
): editing is NonNullable<IdealloPresence['editing']> {
	if (!editing) return false
	if (!Number.isFinite(editing.dx) || !Number.isFinite(editing.dy)) return false
	if (!Array.isArray(editing.objectIds)) return false
	return editing.objectIds.every((id) => typeof id === 'string')
}

export function GhostEditing({
	doc,
	remotePresence,
	objects,
	expandedObjects,
	ownerTag,
	token
}: GhostEditingProps) {
	if (!objects) return null

	return (
		<g className="ghost-editing" pointerEvents="none" opacity={GHOST_OPACITY}>
			{Array.from(remotePresence.entries()).map(([clientId, presence]) => {
				if (!isRenderableEditing(presence.editing)) return null

				const { objectIds, action, dx, dy } = presence.editing
				// dx/dy are true deltas only for 'drag' - resize and rotate overload them with
				// absolute bounds coordinates (see broadcastEditing in app.tsx), so treating
				// them uniformly would fling ghosts across the canvas.
				if (action !== 'drag' || (dx === 0 && dy === 0)) return null

				const user = presence.user
				// Anchors the name label. Null when the record is missing or of a type this
				// build cannot read, which drops the label rather than the whole ghost layer.
				const labelAnchor = objectIds.length
					? objects[objectIds[0]] &&
						tryExpandObject(toObjectId(objectIds[0]), objects[objectIds[0]], doc)
					: null

				return (
					<g key={`ghost-editing-${clientId}`}>
						{objectIds.map((id) => {
							const stored = objects[id]
							if (!stored) return null

							const objectId = toObjectId(id)
							const obj = tryExpandObject(objectId, stored, doc)
							if (!obj) return null

							// Apply offset to the object
							const offsetObj = applyOffset(obj, dx, dy)

							return (
								<g
									key={id}
									style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.3))' }}
								>
									{/*
										`doc` feeds the text label - without it a peer dragging a
										captioned shape shows everyone else an unlabelled box.
										`ownerTag`/`token` feed the image URL: ideallo is sandboxed
										on the app origin, which does not serve /api/files, so the
										fallback URL renders the "failed to load" box instead.
									*/}
									<ObjectRenderer
										object={offsetObj}
										doc={doc}
										ownerTag={ownerTag}
										token={token}
									/>
								</g>
							)
						})}

						{/*
							Connectors bound to what the remote user is dragging.
							The committed arrow stays where it is and a ghost shows where it is
							heading, which is exactly how remote shape drags already read - the
							committed layer is never rerouted for a remote edit.
						*/}
						<GhostConnectors
							doc={doc}
							objects={objects}
							expandedObjects={expandedObjects}
							draggedIds={objectIds}
							dx={dx}
							dy={dy}
						/>
						{/* User label */}
						{user && labelAnchor && (
							<text
								x={getObjectX(labelAnchor) + dx + 12}
								y={getObjectY(labelAnchor) + dy - 8}
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

/**
 * Ghost copies of the connectors incident to a remote user's dragged shapes, resolved against
 * the remote override.
 */
function GhostConnectors({
	doc,
	objects,
	expandedObjects,
	draggedIds,
	dx,
	dy
}: {
	doc: YIdealloDocument
	objects: Record<string, StoredObject>
	expandedObjects?: IdealloObject[]
	draggedIds: string[]
	dx: number
	dy: number
}) {
	// Awareness hands back a freshly decoded array on every remote pointermove, so `draggedIds`
	// has a new identity each frame and memoising on it memoises nothing. The CONTENT is what the
	// lookup depends on.
	const draggedKey = draggedIds.join(',')

	// dx/dy change on every remote pointermove, so anything that does NOT depend on them is kept
	// out of the frame-rate memo below. Which arrows are incident is a property of the document
	// and the selection, not of how far the pointer has travelled.
	const wanted = React.useMemo(() => {
		// `draggedIds` is read here but `draggedKey` is the dependency - see above
		const incident = findIncidentArrows(doc, draggedIds.map(toObjectId))
		// An arrow the remote user is dragging directly is already rendered above
		const dragged = new Set(draggedIds)
		return new Set(
			incident.filter((inc) => !dragged.has(inc.arrowId)).map((inc) => inc.arrowId as string)
		)
	}, [doc, draggedKey])

	// The fallback for a standalone caller that did not pass the expanded array; same result, just
	// recomputed whenever the document changes rather than shared with Canvas's own render.
	const ownExpanded = React.useMemo(() => {
		if (expandedObjects) return expandedObjects
		const all: IdealloObject[] = []
		for (const [id, stored] of Object.entries(objects)) {
			// Null when this build cannot read the record's type - skipped, not fatal
			const obj = tryExpandObject(toObjectId(id), stored, doc)
			if (obj) all.push(obj)
		}
		return all
	}, [expandedObjects, objects, doc])

	const ghosts = React.useMemo(() => {
		if (!wanted.size) return []
		// `draggedKey` stands in for `draggedIds` in the deps, same as above
		const overrides = new Map(draggedIds.map((id) => [toObjectId(id), { dx, dy }]))
		return resolveConnectorRoutes(ownExpanded, overrides).filter((obj) => wanted.has(obj.id))
	}, [ownExpanded, wanted, draggedKey, dx, dy])

	return (
		<>
			{ghosts.map((obj) => (
				<ObjectRenderer key={`ghost-connector-${obj.id}`} object={obj} />
			))}
		</>
	)
}

function getObjectX(obj: IdealloObject): number {
	if (obj.type === 'connector') {
		return Math.min(obj.startX, obj.endX)
	}
	return obj.x
}

function getObjectY(obj: IdealloObject): number {
	if (obj.type === 'connector') {
		return Math.min(obj.startY, obj.endY)
	}
	return obj.y
}

function applyOffset(obj: IdealloObject, dx: number, dy: number): IdealloObject {
	switch (obj.type) {
		case 'connector':
			return {
				...obj,
				x: obj.x + dx,
				y: obj.y + dy,
				startX: obj.startX + dx,
				startY: obj.startY + dy,
				endX: obj.endX + dx,
				endY: obj.endY + dy
			}
		// A polygon's vertices are ABSOLUTE, so shifting x/y alone would leave the ghost's outline
		// standing still while its bounding box moved
		case 'polygon':
			return {
				...obj,
				x: obj.x + dx,
				y: obj.y + dy,
				vertices: obj.vertices.map((v) => [v[0] + dx, v[1] + dy] as [number, number])
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
