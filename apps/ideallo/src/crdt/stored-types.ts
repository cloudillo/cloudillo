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
 * Compact CRDT-stored types for Ideallo
 * Uses short field names for storage efficiency
 *
 * Field naming conventions:
 * - t   = type
 * - xy  = position [x, y]
 * - wh  = dimensions [width, height]
 * - pts = points (freehand path, line endpoints)
 * - txt = text content
 * - r   = rotation
 * - sc  = stroke color
 * - fc  = fill color
 * - sw  = stroke width
 * - ss  = stroke style
 * - op  = opacity
 * - lk  = locked
 */

import * as Y from 'yjs'

// Object type codes
export type ObjectTypeCode =
	| 'F' // Freehand path
	| 'R' // Rectangle
	| 'E' // Ellipse
	| 'L' // Line
	| 'A' // Arrow
	| 'T' // Text label
	| 'P' // Polygon (triangle, pentagon, etc.)
	| 'S' // Sticky note

// Stroke style codes
export type StrokeStyleCode = 'S' | 'D' | 'T' // Solid, Dashed, Dotted

// Base style fields (compact)
export interface StoredStyle {
	sc?: string // stroke color
	fc?: string // fill color
	sw?: number // stroke width (default 2)
	ss?: StrokeStyleCode // stroke style (default 'S')
	op?: number // opacity (default 1)
}

// Base stored object (all objects share these)
export interface StoredObjectBase extends StoredStyle {
	t: ObjectTypeCode
	xy: [number, number] // position
	r?: number // rotation (omit if 0)
	pv?: [number, number] // pivot [x, y] normalized 0-1 (omit if center [0.5, 0.5])
	lk?: true // locked (omit if false)
	sn?: true // snapped (omit if false) - Smart Ink: was auto-detected as shape
}

// Freehand path
export interface StoredFreehand extends StoredObjectBase {
	t: 'F'
	pts: number[] // Flat array [x0,y0,x1,y1,...] - absolute coords
}

// Rectangle
export interface StoredRect extends StoredObjectBase {
	t: 'R'
	wh: [number, number] // [width, height]
	cr?: number // corner radius
}

// Ellipse
export interface StoredEllipse extends StoredObjectBase {
	t: 'E'
	wh: [number, number] // [width, height]
}

// Line
export interface StoredLine extends StoredObjectBase {
	t: 'L'
	pts: [[number, number], [number, number]] // [start, end] absolute positions
}

// Arrow
export interface StoredArrow extends StoredObjectBase {
	t: 'A'
	pts: [[number, number], [number, number]] // [start, end] absolute positions
	ah?: 'S' | 'E' | 'B' // arrowhead: Start, End, Both (default 'E')
}

// Text label
export interface StoredText extends StoredObjectBase {
	t: 'T'
	wh: [number, number] // [width, height]
	txt: string // text content
	ff?: string // font family
	fz?: number // font size
}

// Polygon (triangle, pentagon, hexagon, etc.)
export interface StoredPolygon extends StoredObjectBase {
	t: 'P'
	vts: number[] // Flat vertices array [x0,y0,x1,y1,...] - absolute coords
}

// Sticky note (uses standard fillColor from style for background)
export interface StoredSticky extends StoredObjectBase {
	t: 'S'
	wh: [number, number] // [width, height]
	txt: string // text content
}

// Union of all stored object types
export type StoredObject =
	| StoredFreehand
	| StoredRect
	| StoredEllipse
	| StoredLine
	| StoredArrow
	| StoredText
	| StoredPolygon
	| StoredSticky

// Document metadata
export interface StoredMeta {
	name?: string
	backgroundColor?: string
	gridSize?: number
	snapToGrid?: boolean
}

// Document structure - simpler than prezillo (no containers, views)
export interface YIdealloDocument {
	o: Y.Map<StoredObject> // objects
	m: Y.Map<unknown> // metadata
}

// vim: ts=4
