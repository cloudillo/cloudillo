// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Diamond and triangle, as vertex presets on the existing `polygon` object type.
 *
 * No new wire code: `polygon`/`P` has always been in the stored union, with a renderer,
 * hit-testing, bounds and connector-outline maths that already handle a concave outline. A new
 * type code would hard-fail `expandObject` on a 0.8.x peer; a polygon simply draws.
 *
 * One builder, shared by the commit path, the local preview and the remote ghost, so the three
 * cannot disagree about what a drag produces.
 */

import type { Bounds } from '../crdt/runtime-types.js'
import type { ToolType } from './types.js'

export type PolygonPreset = 'diamond' | 'triangle'

/** Vertices in the unit square, wound clockwise from the top. */
export const POLYGON_PRESETS: Record<PolygonPreset, readonly (readonly [number, number])[]> = {
	diamond: [
		[0.5, 0],
		[1, 0.5],
		[0.5, 1],
		[0, 0.5]
	],
	triangle: [
		[0.5, 0],
		[1, 1],
		[0, 1]
	]
}

/** ABSOLUTE world vertices - PolygonObject.vertices is not relative to x/y. */
export function polygonPresetVertices(preset: PolygonPreset, b: Bounds): [number, number][] {
	return POLYGON_PRESETS[preset].map(
		([nx, ny]) => [b.x + nx * b.width, b.y + ny * b.height] as [number, number]
	)
}

function isPolygonPreset(type: string): type is PolygonPreset {
	return type === 'diamond' || type === 'triangle'
}

/** SVG `points` for the preview and the ghost; null for a non-polygon preview type. */
export function polygonPresetPoints(type: string, b: Bounds): string | null {
	if (!isPolygonPreset(type)) return null
	return polygonPresetVertices(type, b)
		.map(([x, y]) => `${x},${y}`)
		.join(' ')
}

export const TOOL_TO_POLYGON_PRESET: Partial<Record<ToolType, PolygonPreset>> = {
	diamond: 'diamond',
	triangle: 'triangle'
}

// vim: ts=4
