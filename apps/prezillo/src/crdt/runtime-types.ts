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
 * Runtime types - expanded from compact stored types
 * These are the types used in application logic and UI
 */

import type { ObjectId, ContainerId, ViewId, StyleId, RichTextId } from './ids'

// Object types (expanded)
export type ObjectType =
	| 'rect'
	| 'ellipse'
	| 'line'
	| 'path'
	| 'polygon'
	| 'text'
	| 'textbox'
	| 'image'
	| 'embed'
	| 'connector'

// Container types
export type ContainerType = 'layer' | 'group'

// Blend modes (expanded)
export type BlendMode =
	| 'normal'
	| 'multiply'
	| 'screen'
	| 'overlay'
	| 'darken'
	| 'lighten'
	| 'color-dodge'
	| 'color-burn'
	| 'hard-light'
	| 'soft-light'
	| 'difference'
	| 'exclusion'

// Arrow types
export type ArrowType = 'none' | 'arrow' | 'triangle' | 'circle' | 'diamond' | 'bar'

// Arrow style
export interface ArrowStyle {
	type: ArrowType
	size?: number
	filled?: boolean
}

// Anchor point types
export type AnchorPointType =
	| 'center'
	| 'top'
	| 'bottom'
	| 'left'
	| 'right'
	| 'top-left'
	| 'top-right'
	| 'bottom-left'
	| 'bottom-right'
	| 'auto'

// Anchor point
export type AnchorPoint = AnchorPointType | { x: number; y: number }

// Routing types
export type Routing = 'straight' | 'orthogonal' | 'curved'

// Shape style (expanded)
export interface ShapeStyle {
	fill?: string
	fillOpacity?: number
	stroke?: string
	strokeWidth?: number
	strokeOpacity?: number
	strokeDasharray?: string
	strokeLinecap?: 'butt' | 'round' | 'square'
	strokeLinejoin?: 'miter' | 'round' | 'bevel'
	shadow?: {
		offsetX: number
		offsetY: number
		blur: number
		color: string
	}
}

// Text style (expanded)
export interface TextStyle {
	fontFamily?: string
	fontSize?: number
	fontWeight?: 'normal' | 'bold' | number
	fontItalic?: boolean
	textDecoration?: 'none' | 'underline' | 'line-through'
	fill?: string
	textAlign?: 'left' | 'center' | 'right' | 'justify'
	verticalAlign?: 'top' | 'middle' | 'bottom'
	lineHeight?: number
	letterSpacing?: number
}

// Resolved (fully computed) styles with defaults applied
export interface ResolvedShapeStyle {
	fill: string
	fillOpacity: number
	stroke: string
	strokeWidth: number
	strokeOpacity: number
	strokeDasharray: string
	strokeLinecap: 'butt' | 'round' | 'square'
	strokeLinejoin: 'miter' | 'round' | 'bevel'
	shadow?: {
		offsetX: number
		offsetY: number
		blur: number
		color: string
	}
}

export interface ResolvedTextStyle {
	fontFamily: string
	fontSize: number
	fontWeight: 'normal' | 'bold' | number
	fontItalic: boolean
	textDecoration: 'none' | 'underline' | 'line-through'
	fill: string
	textAlign: 'left' | 'center' | 'right' | 'justify'
	verticalAlign: 'top' | 'middle' | 'bottom'
	lineHeight: number
	letterSpacing: number
}

// Base object (common fields)
export interface PrezilloObjectBase {
	id: ObjectId
	type: ObjectType
	parentId?: ContainerId
	x: number
	y: number
	width: number
	height: number
	rotation: number
	pivotX: number // 0-1, default 0.5 (center)
	pivotY: number // 0-1, default 0.5 (center)
	opacity: number
	visible: boolean
	locked: boolean
	name?: string
	// Style references
	shapeStyleId?: StyleId
	shapeStyleOverrides?: Partial<ShapeStyle>
	textStyleId?: StyleId
	textStyleOverrides?: Partial<TextStyle>
	// Inline styles (when no reference)
	style?: ShapeStyle
	textStyle?: TextStyle
}

// Rect object
export interface RectObject extends PrezilloObjectBase {
	type: 'rect'
	cornerRadius?: number | [number, number, number, number]
}

// Ellipse object
export interface EllipseObject extends PrezilloObjectBase {
	type: 'ellipse'
}

// Line object
export interface LineObject extends PrezilloObjectBase {
	type: 'line'
	points: [[number, number], [number, number]]
	startArrow?: ArrowStyle
	endArrow?: ArrowStyle
}

// Path object
export interface PathObject extends PrezilloObjectBase {
	type: 'path'
	pathData: string
}

// Polygon object
export interface PolygonObject extends PrezilloObjectBase {
	type: 'polygon'
	points: [number, number][]
	closed?: boolean
}

// Text object (plain text)
export interface TextObject extends PrezilloObjectBase {
	type: 'text'
	text: string
}

// Textbox object (rich text)
export interface TextboxObject extends PrezilloObjectBase {
	type: 'textbox'
	textContentId: RichTextId
	padding?: number | [number, number, number, number]
	background?: string
	border?: ShapeStyle
}

// Image object
export interface ImageObject extends PrezilloObjectBase {
	type: 'image'
	fileId: string
}

// Embed object
export interface EmbedObject extends PrezilloObjectBase {
	type: 'embed'
	embedType: 'iframe' | 'video' | 'audio'
	src: string
}

// Connector object
export interface ConnectorObject extends PrezilloObjectBase {
	type: 'connector'
	startObjectId?: ObjectId
	startAnchor?: AnchorPoint
	endObjectId?: ObjectId
	endAnchor?: AnchorPoint
	waypoints?: [number, number][]
	routing?: Routing
	startArrow?: ArrowStyle
	endArrow?: ArrowStyle
}

// Union of all object types
export type PrezilloObject =
	| RectObject
	| EllipseObject
	| LineObject
	| PathObject
	| PolygonObject
	| TextObject
	| TextboxObject
	| ImageObject
	| EmbedObject
	| ConnectorObject

// Container (layer or group)
export interface ContainerNode {
	id: ContainerId
	type: ContainerType
	parentId?: ContainerId
	name?: string
	x: number
	y: number
	rotation: number
	scaleX: number
	scaleY: number
	opacity: number
	blendMode: BlendMode
	visible: boolean
	locked: boolean
	expanded: boolean
}

// Child reference
export interface ChildRef {
	type: 'object' | 'container'
	id: ObjectId | ContainerId
}

// View (page/slide)
export interface ViewNode {
	id: ViewId
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

// Document metadata
export interface DocumentMeta {
	name?: string
	defaultViewWidth: number
	defaultViewHeight: number
	gridSize?: number
	snapToGrid?: boolean
	snapToObjects?: boolean
}

// Global style definition
export interface StyleDefinition {
	id: StyleId
	name: string
	type: 'shape' | 'text'
	parentId?: StyleId
	// Shape properties
	shapeStyle?: Partial<ShapeStyle>
	// Text properties
	textStyle?: Partial<TextStyle>
	// Extra shape-specific
	cornerRadius?: number
}

// Re-export generic types from react-svg-canvas
export type { Point, Bounds, Transform } from 'react-svg-canvas'

// vim: ts=4
