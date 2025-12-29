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
 * Compact CRDT-stored types
 * Uses short field names and tuples for storage efficiency
 *
 * Field naming conventions:
 * - t  = type
 * - p  = parentId (container hierarchy)
 * - vi = viewId (page association - if set, xy is relative to view origin)
 * - xy = position [x, y]
 * - wh = dimensions [width, height]
 * - r  = rotation
 * - pv = pivot point [x, y] relative (0-1), center is [0.5, 0.5]
 * - o  = opacity
 * - v  = visible (only stored if false)
 * - k  = locked (only stored if true)
 * - n  = name
 * - s  = style (shape style)
 * - ts = text style
 * - si = styleId (reference to global style)
 * - so = style overrides
 * - ch = children
 */

import * as Y from 'yjs'

// Child reference: [type, id] where 0=object, 1=container
export type ChildRef = [0 | 1, string]

// Object type codes
export type ObjectTypeCode = 'R' | 'E' | 'L' | 'P' | 'G' | 'T' | 'B' | 'I' | 'M' | 'C'
// R=rect, E=ellipse, L=line, P=path, G=polygon
// T=text, B=textbox
// I=image, M=embed (media)
// C=connector

// Container type codes
export type ContainerTypeCode = 'L' | 'G' // Layer or Group

// Blend mode codes
export type BlendModeCode =
	| 'N' // normal
	| 'M' // multiply
	| 'S' // screen
	| 'O' // overlay
	| 'D' // darken
	| 'L' // lighten
	| 'CD' // color-dodge
	| 'CB' // color-burn
	| 'HL' // hard-light
	| 'SL' // soft-light
	| 'DF' // difference
	| 'EX' // exclusion

// Arrow type codes: None/Arrow/Triangle/Circle/Diamond/Bar
export type ArrowTypeCode = 'N' | 'A' | 'T' | 'C' | 'D' | 'B'

// Arrow definition: [type, size?, filled?]
export type ArrowDef = [ArrowTypeCode, number?, boolean?]

// Anchor point codes
export type AnchorPointCode =
	| 'c'
	| 't'
	| 'b'
	| 'l'
	| 'r' // center/top/bottom/left/right
	| 'tl'
	| 'tr'
	| 'bl'
	| 'br' // corners
	| 'a' // auto

// Anchor point: code or relative position [x, y] (0-1)
export type AnchorPoint = AnchorPointCode | [number, number]

// Routing type codes
export type RoutingCode = 'S' | 'O' | 'C' // Straight/Orthogonal/Curved

// Shape style (compact)
export interface ShapeStyle {
	f?: string // fill color
	fo?: number // fillOpacity
	s?: string // stroke color
	sw?: number // strokeWidth
	so?: number // strokeOpacity
	sd?: string // strokeDasharray
	sc?: 'butt' | 'round' | 'square' // strokeLinecap
	sj?: 'miter' | 'round' | 'bevel' // strokeLinejoin
	sh?: [number, number, number, string] // shadow: [offsetX, offsetY, blur, color]
}

// Text style (compact)
export interface TextStyle {
	ff?: string // fontFamily
	fs?: number // fontSize
	fw?: 'normal' | 'bold' | number // fontWeight
	fi?: boolean // fontItalic
	td?: 'u' | 's' // textDecoration: underline/strikethrough
	fc?: string // fill color
	ta?: 'l' | 'c' | 'r' | 'j' // textAlign: left/center/right/justify
	va?: 't' | 'm' | 'b' // verticalAlign: top/middle/bottom
	lh?: number // lineHeight
	ls?: number // letterSpacing
	lb?: string // listBullet: UTF-8 character for list prefix
}

// Base object fields (common to all objects)
export interface StoredObjectBase {
	t: ObjectTypeCode
	p?: string // parentId (omit if root)
	vi?: string // viewId - if set, xy is relative to view origin (page-relative coords)
	xy: [number, number] // [x, y] - global canvas coords OR page-relative if vi is set
	wh: [number, number] // [width, height]
	r?: number // rotation (omit if 0)
	pv?: [number, number] // pivot point [px, py] relative (0-1), center [0.5, 0.5] is default
	o?: number // opacity (omit if 1)
	v?: false // visible (omit if true)
	k?: true // locked (omit if false)
	n?: string // name
	// Style system
	si?: string // shapeStyleId (reference to global style)
	so?: Partial<ShapeStyle> // shape style overrides
	ti?: string // textStyleId (for text objects)
	to?: Partial<TextStyle> // text style overrides
	// Inline style (when no si/ti reference)
	s?: ShapeStyle
	ts?: TextStyle
}

// Rect
export interface StoredRect extends StoredObjectBase {
	t: 'R'
	cr?: number | [number, number, number, number] // cornerRadius
}

// Ellipse
export interface StoredEllipse extends StoredObjectBase {
	t: 'E'
}

// Line
export interface StoredLine extends StoredObjectBase {
	t: 'L'
	pts: [[number, number], [number, number]] // [start, end] relative
	sa?: ArrowDef // startArrow
	ea?: ArrowDef // endArrow
}

// Path
export interface StoredPath extends StoredObjectBase {
	t: 'P'
	d: string // SVG path data
}

// Polygon
export interface StoredPolygon extends StoredObjectBase {
	t: 'G'
	pts: [number, number][] // points array
	cl?: boolean // closed
}

// Text (plain)
export interface StoredText extends StoredObjectBase {
	t: 'T'
	tx: string // text content
	mh?: number // minHeight - original height at creation for auto-sizing
}

// Textbox (rich text)
export interface StoredTextbox extends StoredObjectBase {
	t: 'B'
	tid: string // textContentId (ref to richTexts)
	pd?: number | [number, number, number, number] // padding
	bg?: string // background
	bd?: ShapeStyle // border
}

// Image
export interface StoredImage extends StoredObjectBase {
	t: 'I'
	fid: string // fileId from MediaPicker
}

// Embed (media)
export interface StoredEmbed extends StoredObjectBase {
	t: 'M'
	mt: 'iframe' | 'video' | 'audio' // mediaType
	src: string
}

// Connector
export interface StoredConnector extends StoredObjectBase {
	t: 'C'
	so_?: string // startObjectId (using so_ to avoid conflict with style override)
	sa?: AnchorPoint // startAnchor
	eo?: string // endObjectId
	ea?: AnchorPoint // endAnchor
	wp?: [number, number][] // waypoints
	rt?: RoutingCode // routing
	sar?: ArrowDef // startArrow
	ear?: ArrowDef // endArrow
}

// Union of all stored object types
export type StoredObject =
	| StoredRect
	| StoredEllipse
	| StoredLine
	| StoredPath
	| StoredPolygon
	| StoredText
	| StoredTextbox
	| StoredImage
	| StoredEmbed
	| StoredConnector

// Container (layer or group)
export interface StoredContainer {
	t: ContainerTypeCode // 'L' layer, 'G' group
	p?: string // parentId
	n?: string // name
	xy: [number, number] // position
	r?: number // rotation
	sc?: [number, number] // scale [scaleX, scaleY]
	o?: number // opacity
	bm?: BlendModeCode // blendMode
	v?: false // visible (omit if true)
	k?: true // locked (omit if false)
	x?: boolean // expanded (UI state)
	// Note: children is a Y.Array, not stored directly
}

// View (page/slide)
export interface StoredView {
	name: string
	x: number
	y: number
	width: number
	height: number
	backgroundColor?: string
	backgroundImage?: string
	backgroundFit?: 'contain' | 'cover' | 'fill' | 'tile'
	showBorder?: boolean
	transition?: {
		type: 'none' | 'fade' | 'slide' | 'zoom' | 'push'
		duration?: number
		direction?: 'left' | 'right' | 'up' | 'down'
	}
	notes?: string
	hidden?: boolean
	duration?: number
}

// Document meta
export interface StoredMeta {
	name?: string
	defaultViewWidth?: number
	defaultViewHeight?: number
	gridSize?: number
	snapToGrid?: boolean
	snapToObjects?: boolean
}

// Global style definition
export interface StoredStyle {
	n: string // name (user-visible)
	t: 'S' | 'T' // type: Shape or Text
	p?: string // parent styleId (inheritance)
	// Shape style properties (when t='S')
	f?: string // fill
	fo?: number // fillOpacity
	s?: string // stroke
	sw?: number // strokeWidth
	so?: number // strokeOpacity
	sd?: string // strokeDasharray
	sc?: 'butt' | 'round' | 'square' // strokeLinecap
	sj?: 'miter' | 'round' | 'bevel' // strokeLinejoin
	sh?: [number, number, number, string] // shadow
	cr?: number // cornerRadius (for rects)
	// Text style properties (when t='T')
	ff?: string // fontFamily
	fs?: number // fontSize
	fw?: 'normal' | 'bold' | number // fontWeight
	fi?: boolean // fontItalic
	td?: 'u' | 's' // textDecoration
	fc?: string // fill color
	ta?: 'l' | 'c' | 'r' | 'j' // textAlign
	va?: 't' | 'm' | 'b' // verticalAlign
	lh?: number // lineHeight
	ls?: number // letterSpacing
	lb?: string // listBullet
}

// Document structure with Yjs types
export interface YPrezilloDocument {
	o: Y.Map<StoredObject> // objects (high volume)
	c: Y.Map<StoredContainer> // containers (medium volume)
	r: Y.Array<ChildRef> // rootChildren
	v: Y.Map<StoredView> // views (low volume)
	vo: Y.Array<string> // viewOrder (ViewId strings)
	m: Y.Map<unknown> // meta
	rt: Y.Map<Y.Text> // richTexts (for textbox content)
	st: Y.Map<StoredStyle> // styles (global definitions)
	// Container children are stored separately
	ch: Y.Map<Y.Array<ChildRef>> // children arrays by containerId
}

// vim: ts=4
