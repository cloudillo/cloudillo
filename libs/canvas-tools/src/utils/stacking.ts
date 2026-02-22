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
 * Shared stacking utilities for canvas apps.
 *
 * When dragging an object, all objects resting on top of it (>=50% overlap,
 * higher z-order) should move together. These pure geometry functions are
 * app-agnostic: each app prepares a pre-filtered, z-ordered StackableObject[]
 * array and calls these generic functions.
 */

import type { Bounds } from 'react-svg-canvas'

export interface StackableObject {
	id: string
	bounds: Bounds
}

export interface FindStackedOptions {
	/** Minimum overlap fraction (0-1) to consider an object "stacked". Default: 0.5 */
	overlapThreshold?: number
}

/**
 * Calculate the overlap percentage of boundsB relative to its own area.
 * Returns a value from 0 to 1 representing how much of boundsB overlaps with boundsA.
 */
export function calculateOverlapPercentage(boundsA: Bounds, boundsB: Bounds): number {
	const intersectLeft = Math.max(boundsA.x, boundsB.x)
	const intersectRight = Math.min(boundsA.x + boundsA.width, boundsB.x + boundsB.width)
	const intersectTop = Math.max(boundsA.y, boundsB.y)
	const intersectBottom = Math.min(boundsA.y + boundsA.height, boundsB.y + boundsB.height)

	if (intersectLeft >= intersectRight || intersectTop >= intersectBottom) {
		return 0
	}

	const intersectionArea = (intersectRight - intersectLeft) * (intersectBottom - intersectTop)
	const boundsBArea = boundsB.width * boundsB.height

	if (boundsBArea === 0) return 0

	return intersectionArea / boundsBArea
}

/**
 * Find all objects stacked on top of a target object.
 *
 * The `objects` array must be pre-filtered (no locked/invisible/prototype objects)
 * and sorted in z-order (lowest index = backmost). Only objects appearing AFTER
 * the target in the array are candidates.
 *
 * Recursively collects: if A is on B and C is on A, moving B also moves A and C.
 */
export function findStackedObjects(
	objects: StackableObject[],
	targetId: string,
	opts?: FindStackedOptions
): string[] {
	const threshold = opts?.overlapThreshold ?? 0.5

	// Build an index map for O(1) lookups
	const indexById = new Map<string, number>()
	for (let i = 0; i < objects.length; i++) {
		indexById.set(objects[i].id, i)
	}

	const targetIndex = indexById.get(targetId)
	if (targetIndex === undefined) return []

	const allStacked = new Set<string>()
	const visited = new Set<string>([targetId])

	function collectAbove(baseId: string) {
		const baseIdx = indexById.get(baseId)
		if (baseIdx === undefined) return
		const baseBounds = objects[baseIdx].bounds

		for (let i = baseIdx + 1; i < objects.length; i++) {
			const candidate = objects[i]
			if (allStacked.has(candidate.id) || visited.has(candidate.id)) continue

			const overlap = calculateOverlapPercentage(baseBounds, candidate.bounds)
			if (overlap >= threshold) {
				allStacked.add(candidate.id)
			}
		}
	}

	// Collect direct children of target
	collectAbove(targetId)

	// Recursively collect children of children
	let frontier = Array.from(allStacked)
	while (frontier.length > 0) {
		const nextFrontier: string[] = []
		for (const id of frontier) {
			if (visited.has(id)) continue
			visited.add(id)

			const sizeBefore = allStacked.size
			collectAbove(id)
			// Any newly added IDs form the next frontier
			for (const sid of allStacked) {
				if (!visited.has(sid) && !frontier.includes(sid)) {
					nextFrontier.push(sid)
				}
			}
		}
		frontier = nextFrontier
	}

	return Array.from(allStacked)
}

/**
 * Multi-selection variant of findStackedObjects.
 * Finds all objects stacked on any of the given target IDs, deduplicates,
 * and excludes the input IDs themselves.
 */
export function findStackedObjectsForSelection(
	objects: StackableObject[],
	targetIds: string[],
	opts?: FindStackedOptions
): string[] {
	const inputSet = new Set(targetIds)
	const allStacked = new Set<string>()

	for (const id of targetIds) {
		const stacked = findStackedObjects(objects, id, opts)
		for (const stackedId of stacked) {
			if (!inputSet.has(stackedId)) {
				allStacked.add(stackedId)
			}
		}
	}

	return Array.from(allStacked)
}

// vim: ts=4
