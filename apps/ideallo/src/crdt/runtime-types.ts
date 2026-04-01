// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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
	| 'image'
	| 'document'

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
	width: number // Bounds width
	height: number // Bounds height
	pid?: ObjectId // Optional: if omitted, object ID used as key in paths map (linked copy uses explicit pid)
	pathData: string // SVG path string (expanded from paths map)
	closed: boolean // Whether path is closed
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
	tid?: ObjectId // Optional: if omitted, object ID used as key in txt map (linked copy uses explicit tid)
	text: string // Expanded text content (from txt map)
	fontFamily?: string
	fontSize?: number
}

export interface PolygonObject extends IdealloObjectBase {
	type: 'polygon'
	gid?: ObjectId // Optional: if omitted, object ID used as key in geo map (linked copy uses explicit gid)
	vertices: [number, number][] // Array of vertex points (expanded from geo map)
}

// Sticky note (uses standard style.fillColor for background)
export interface StickyObject extends IdealloObjectBase {
	type: 'sticky'
	width: number
	height: number
	tid?: ObjectId // Optional: if omitted, object ID used as key in txt map (linked copy uses explicit tid)
	text: string // Expanded text content (from txt map)
}

// Image
export interface ImageObject extends IdealloObjectBase {
	type: 'image'
	width: number
	height: number
	fileId: string // fileId from MediaPicker
}

// Embedded document
export interface DocumentObject extends IdealloObjectBase {
	type: 'document'
	width: number
	height: number
	fileId: string // fileId of the embedded document
	contentType: string // e.g. 'cloudillo/quillo'
	appId?: string // resolved from contentType
	navState?: string // navigation state (opaque, app-specific)
	aspectRatio?: [number, number] // aspect ratio from embedded doc
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
	| ImageObject
	| DocumentObject

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
