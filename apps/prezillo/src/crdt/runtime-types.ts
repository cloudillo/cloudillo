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

import type { ObjectId, ContainerId, ViewId, StyleId, RichTextId, TemplateId } from './ids'
import type { Gradient } from '@cloudillo/canvas-tools'

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
	| 'qrcode'

// QR Code error correction levels (expanded)
export type QrErrorCorrection = 'low' | 'medium' | 'quartile' | 'high'

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
	listBullet?: string
}

// Resolved (fully computed) styles with defaults applied
export interface ResolvedShapeStyle {
	fill: string
	fillOpacity: number
	/** Optional gradient for fill (when using palette gradient) */
	fillGradient?: Gradient
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
	listBullet?: string
}

// Base object (common fields)
export interface PrezilloObjectBase {
	id: ObjectId
	type: ObjectType
	parentId?: ContainerId
	pageId?: ViewId // If set, x/y are relative to page origin (page-relative coords)
	prototypeId?: ObjectId // If set, this object inherits from prototype (single level)
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
	// Style system - resolution: defaults → styleId chain → style/textStyle
	shapeStyleId?: StyleId
	textStyleId?: StyleId
	style?: ShapeStyle // applied on top of shapeStyleId chain
	textStyle?: TextStyle // applied on top of textStyleId chain
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
	minHeight?: number // Original height at creation for auto-sizing
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

// QR Code object
export interface QrCodeObject extends PrezilloObjectBase {
	type: 'qrcode'
	url: string // URL to encode
	errorCorrection?: QrErrorCorrection // default 'medium'
	foreground?: string // QR code color (default '#000000')
	background?: string // background color (default '#ffffff')
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
	| QrCodeObject

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
	backgroundGradient?: Gradient // Background gradient (takes precedence over backgroundColor)
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
	// Template support
	templateId?: TemplateId
	backgroundOverrides?: {
		backgroundColor?: boolean
		backgroundGradient?: boolean
		backgroundImage?: boolean
		backgroundFit?: boolean
	}
	hiddenPrototypeObjects?: Set<ObjectId>
}

// ============================================================================
// Template System Types (Runtime)
// ============================================================================

// Snap guide (runtime)
export interface SnapGuide {
	direction: 'horizontal' | 'vertical'
	position: number // percentage (0-1) or absolute pixels
	absolute?: boolean // if true, position is in pixels
}

// Template (runtime)
export interface Template {
	id: TemplateId
	name: string
	width: number
	height: number
	backgroundColor?: string
	backgroundGradient?: Gradient
	backgroundImage?: string
	backgroundFit?: 'contain' | 'cover' | 'fill' | 'tile'
	snapGuides: SnapGuide[]
}

// Resolved view background (with inheritance info)
export interface ResolvedViewBackground {
	backgroundColor?: string
	backgroundGradient?: Gradient
	backgroundImage?: string
	backgroundFit?: 'contain' | 'cover' | 'fill' | 'tile'
	inheritedFrom?: TemplateId
	overrides: {
		backgroundColor: boolean
		backgroundGradient: boolean
		backgroundImage: boolean
		backgroundFit: boolean
	}
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

// ============================================================================
// Palette System Types (Runtime)
// ============================================================================

// Palette color slot names (expanded)
export type PaletteColorSlotName =
	| 'background'
	| 'text'
	| 'accent1'
	| 'accent2'
	| 'accent3'
	| 'accent4'
	| 'accent5'
	| 'accent6'

// Palette gradient slot names
export type PaletteGradientSlotName = 'gradient1' | 'gradient2' | 'gradient3' | 'gradient4'

// All palette slot names
export type PaletteSlotName = PaletteColorSlotName | PaletteGradientSlotName

// Palette color entry (runtime)
export interface PaletteColor {
	color: string // hex color
}

// Full palette definition (runtime)
export interface Palette {
	name: string
	// Color slots
	background?: PaletteColor
	text?: PaletteColor
	accent1?: PaletteColor
	accent2?: PaletteColor
	accent3?: PaletteColor
	accent4?: PaletteColor
	accent5?: PaletteColor
	accent6?: PaletteColor
	// Gradient slots
	gradient1?: Gradient
	gradient2?: Gradient
	gradient3?: Gradient
	gradient4?: Gradient
}

// Palette reference (runtime)
export interface PaletteRef {
	slotId: PaletteSlotName
	opacity?: number // 0-1, default 1
	tint?: number // -1 to 1 (negative = shade, positive = tint)
}

// Resolved color value (after palette lookup)
export interface ResolvedColorValue {
	type: 'solid' | 'gradient'
	color?: string // for solid colors
	gradient?: Gradient // for gradients
	opacity: number
	isPaletteRef: boolean
	paletteSlot?: PaletteSlotName
}

// Re-export generic types from react-svg-canvas
export type { Point, Bounds, Transform } from 'react-svg-canvas'

// vim: ts=4
