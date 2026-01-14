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
 * Hook to generate snap targets from table grid objects
 *
 * Generates snap targets for:
 * - Cell edges (column and row dividers)
 * - Cell centers (horizontal and vertical)
 */

import * as React from 'react'
import type { SnapTarget } from 'react-svg-canvas'
import type { TableGridObject, Bounds } from '../crdt'
import { calculateGridPositions } from '../components/TableGridRenderer'

/**
 * Generate snap targets for a single table grid
 */
export function generateTableGridSnapTargets(grid: TableGridObject, bounds?: Bounds): SnapTarget[] {
	const targets: SnapTarget[] = []

	const x = bounds?.x ?? grid.x
	const y = bounds?.y ?? grid.y
	const width = bounds?.width ?? grid.width
	const height = bounds?.height ?? grid.height

	// Get column and row positions
	const colPositions = calculateGridPositions(grid.cols, grid.columnWidths, width)
	const rowPositions = calculateGridPositions(grid.rows, grid.rowHeights, height)

	// Add vertical snap lines for all column edges (including outer bounds)
	for (const xOffset of colPositions) {
		targets.push({
			type: 'edge',
			axis: 'x',
			value: x + xOffset,
			sourceObjectId: grid.id,
			sourceEdge: xOffset === 0 ? 'left' : xOffset === width ? 'right' : 'centerX',
			priority: 1.0
		})
	}

	// Add horizontal snap lines for all row edges (including outer bounds)
	for (const yOffset of rowPositions) {
		targets.push({
			type: 'edge',
			axis: 'y',
			value: y + yOffset,
			sourceObjectId: grid.id,
			sourceEdge: yOffset === 0 ? 'top' : yOffset === height ? 'bottom' : 'centerY',
			priority: 1.0
		})
	}

	// Add cell center snap points (X axis - column centers)
	for (let c = 0; c < grid.cols; c++) {
		const cellCenterX = x + (colPositions[c] + colPositions[c + 1]) / 2
		targets.push({
			type: 'center',
			axis: 'x',
			value: cellCenterX,
			sourceObjectId: grid.id,
			sourceEdge: 'centerX',
			priority: 0.8 // Slightly lower than edges
		})
	}

	// Add cell center snap points (Y axis - row centers)
	for (let r = 0; r < grid.rows; r++) {
		const cellCenterY = y + (rowPositions[r] + rowPositions[r + 1]) / 2
		targets.push({
			type: 'center',
			axis: 'y',
			value: cellCenterY,
			sourceObjectId: grid.id,
			sourceEdge: 'centerY',
			priority: 0.8 // Slightly lower than edges
		})
	}

	return targets
}

export interface UseTableGridSnapsResult {
	/** All snap targets generated from table grids */
	targets: SnapTarget[]
}

/**
 * Hook to generate snap targets from all table grid objects in view
 *
 * @param objects Objects visible in the current view (filtered to tablegrid type)
 * @param getBounds Optional function to get current bounds (for temp drag state)
 */
export function useTableGridSnaps(
	objects: TableGridObject[],
	getBounds?: (id: string) => Bounds | undefined
): UseTableGridSnapsResult {
	const targets = React.useMemo(() => {
		return objects.flatMap((grid) => {
			const bounds = getBounds?.(grid.id)
			return generateTableGridSnapTargets(grid, bounds)
		})
	}, [objects, getBounds])

	return { targets }
}

// vim: ts=4
