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
 * Expanded runtime types for application logic
 * These are developer-friendly with full field names
 */

import type { ObjectId } from './ids.js'

export type ObjectType =
	| 'freehand'
	| 'rect'
	| 'ellipse'
	| 'line'
	| 'arrow'
	| 'text'
	| 'polygon'
	| 'sticky'

export type StrokeStyle = 'solid' | 'dashed' | 'dotted'

export type ArrowheadPosition = 'start' | 'end' | 'both'

export interface Style {
	strokeColor: string
	fillColor: string
	strokeWidth: number
	strokeStyle: StrokeStyle
	opacity: number
}

export interface IdealloObjectBase {
	id: ObjectId
	type: ObjectType
	x: number
	y: number
	rotation: number
	pivotX: number // 0-1 normalized, default 0.5
	pivotY: number // 0-1 normalized, default 0.5
	locked: boolean
	snapped?: boolean // Smart Ink: was auto-detected as shape
	style: Style
}

export interface FreehandObject extends IdealloObjectBase {
	type: 'freehand'
	points: [number, number][] // Absolute coordinates
}

export interface RectObject extends IdealloObjectBase {
	type: 'rect'
	width: number
	height: number
	cornerRadius?: number
}

export interface EllipseObject extends IdealloObjectBase {
	type: 'ellipse'
	width: number
	height: number
}

export interface LineObject extends IdealloObjectBase {
	type: 'line'
	startX: number
	startY: number
	endX: number
	endY: number
}

export interface ArrowObject extends IdealloObjectBase {
	type: 'arrow'
	startX: number
	startY: number
	endX: number
	endY: number
	arrowheadPosition: ArrowheadPosition
}

export interface TextObject extends IdealloObjectBase {
	type: 'text'
	width: number
	height: number
	text: string
	fontFamily?: string
	fontSize?: number
}

export interface PolygonObject extends IdealloObjectBase {
	type: 'polygon'
	vertices: [number, number][] // Array of vertex points (absolute coords)
}

// Sticky note (uses standard style.fillColor for background)
export interface StickyObject extends IdealloObjectBase {
	type: 'sticky'
	width: number
	height: number
	text: string
}

export type IdealloObject =
	| FreehandObject
	| RectObject
	| EllipseObject
	| LineObject
	| ArrowObject
	| TextObject
	| PolygonObject
	| StickyObject

// Bounds helper type
export interface Bounds {
	x: number
	y: number
	width: number
	height: number
}

// Default style values (using palette keys for theme support)
export const DEFAULT_STYLE: Style = {
	strokeColor: 'n0', // Black/dark neutral
	fillColor: 'transparent',
	strokeWidth: 2,
	strokeStyle: 'solid',
	opacity: 1
}

// vim: ts=4
