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
	| 'connector'
	| 'text'
	| 'polygon'
	| 'sticky'
	| 'image'
	| 'document'

export type StrokeStyle = 'solid' | 'dashed' | 'dotted'

export type TextAlign = 'left' | 'center' | 'right' | 'justify'

export type VerticalAlign = 'top' | 'middle' | 'bottom'

/**
 * Object-level text styling, shared by text labels and sticky notes.
 *
 * Object-level rather than a per-run Quill format: `BaseTextStyle.textAlign` in
 * @cloudillo/canvas-text is block-level and the delta parser extracts no per-line align
 * attribute, so alignment could not be a run format even if the others were. Keeping all four
 * together also means the controls work on a merely-selected object, without entering edit mode.
 *
 * Every field is optional and falls back to the DEFAULT_* constants below; the converters omit
 * anything at its default so legacy documents stay untouched.
 */
export interface ObjectTextStyle {
	fontFamily?: string
	fontSize?: number
	textAlign?: TextAlign
	verticalAlign?: VerticalAlign
	/** ta/va sub-codes this build did not recognise - see IdealloObjectBase.unknownCodes */
	unknownCodes?: Record<string, unknown>
}

/** @deprecated legacy stored `ah` vocabulary, kept only for the converter migration */
export type ArrowheadPosition = 'start' | 'end' | 'both'

// --- Connector vocabulary (mirrors apps/prezillo/src/crdt/runtime-types.ts) ---

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

/** An anchor is either a named point or a free normalized position in 0..1 object space */
export type AnchorPoint = AnchorPointType | { x: number; y: number }

/** User-facing labels are Straight / Curved / Elbow (see PropertyBar) */
export type Routing = 'straight' | 'curved' | 'orthogonal'

export type ArrowheadType = 'none' | 'arrow' | 'triangle' | 'circle' | 'diamond' | 'bar'

export interface ArrowStyle {
	type: ArrowheadType
	size?: number // multiplier on the derived base length, default 1
	filled?: boolean // default true; ignored by 'arrow' (open V)
}

/** Cardinal direction, used for anchor sides and arrowhead orientation */
export type Dir = 'n' | 's' | 'e' | 'w'

/**
 * A resolved connector route. Runtime-only: derived at render time, never compacted.
 */
export interface ResolvedRoute {
	kind: 'straight' | 'curved' | 'elbow'
	points: [number, number][] // polyline vertices, >= 2, endpoints included
	d: string // ready-to-render SVG path data
	startDir: Dir | null // arrowhead orientation at the start terminal
	endDir: Dir | null
	bounds: Bounds // bbox of the WHOLE route, expanded for arrowheads
}

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
	/**
	 * Stored sub-codes this build did not recognise, kept verbatim so a local edit does not destroy
	 * a peer's (or a future version's) value. Same contract as `waypoints`/`bend`: updateObject does
	 * expand -> merge -> compact, and an unrecognised code expands to a safe DEFAULT, so without
	 * this the next unrelated nudge would write that default back over it. Never rendered.
	 *
	 * Keyed by stored field name (`ss`, `rt`, `sa`, `ea`, `sar`, `ear`, `ta`, `va`). The compactor only
	 * restores an entry whose field it did not itself write, but it cannot tell a field the user never
	 * touched from one the user deliberately set to its default - both compact to an absent key. So an
	 * explicit change retires its code earlier, in updateObject; see retireUnknownCodes.
	 */
	unknownCodes?: Record<string, unknown>
}

export interface FreehandObject extends IdealloObjectBase {
	type: 'freehand'
	width: number // Bounds width
	height: number // Bounds height
	pid?: ObjectId // Optional: if omitted, object ID used as key in paths map (linked copy uses explicit pid)
	pathData: string // SVG path string (expanded from paths map)
	closed: boolean // Whether path is closed
}

export interface RectObject extends IdealloObjectBase, ObjectTextStyle {
	type: 'rect'
	width: number
	height: number
	cornerRadius?: number
	tid?: ObjectId // Optional: if omitted, object ID used as key in txt map (linked copy uses explicit tid)
	/** Optional, unlike TextObject.text: a shape is born without text. */
	text?: string
}

export interface EllipseObject extends IdealloObjectBase, ObjectTextStyle {
	type: 'ellipse'
	width: number
	height: number
	tid?: ObjectId
	/** Optional, unlike TextObject.text: a shape is born without text. */
	text?: string
}

export interface ConnectorObject extends IdealloObjectBase {
	type: 'connector'
	// Endpoints. For a BOUND terminal these are overwritten with the resolved point by
	// resolveConnectorRoutes() before any downstream consumer sees the object; the stored values
	// are the bind-time snapshot used as a fallback when the target is missing.
	startX: number
	startY: number
	endX: number
	endY: number
	startObjectId?: ObjectId
	startAnchor?: AnchorPoint
	endObjectId?: ObjectId
	endAnchor?: AnchorPoint
	routing: Routing
	startArrow: ArrowStyle
	endArrow: ArrowStyle
	/**
	 * User-draggable waypoints. Not rendered by this version, but carried through the converters
	 * on purpose: updateObject does expand -> merge -> compact, so dropping them here would let a
	 * local edit silently destroy a peer's (or a future version's) stored waypoints.
	 */
	waypoints?: [number, number][]
	/** Arc bend factor. Not rendered by this version; round-tripped for the same reason. */
	bend?: number
	/** Derived at render time by the connector resolver. Never stored. */
	route?: ResolvedRoute
}

export interface TextObject extends IdealloObjectBase, ObjectTextStyle {
	type: 'text'
	width: number
	height: number
	tid?: ObjectId // Optional: if omitted, object ID used as key in txt map (linked copy uses explicit tid)
	text: string // Expanded text content (from txt map)
}

export interface PolygonObject extends IdealloObjectBase, ObjectTextStyle {
	type: 'polygon'
	gid?: ObjectId // Optional: if omitted, object ID used as key in geo map (linked copy uses explicit gid)
	vertices: [number, number][] // Array of vertex points (expanded from geo map)
	tid?: ObjectId
	/** Optional, unlike TextObject.text: a shape is born without text. */
	text?: string
}

// Sticky note (uses standard style.fillColor for background)
export interface StickyObject extends IdealloObjectBase, ObjectTextStyle {
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
	cornerRadius?: number
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
	cornerRadius?: number
}

export type IdealloObject =
	| FreehandObject
	| RectObject
	| EllipseObject
	| ConnectorObject
	| TextObject
	| PolygonObject
	| StickyObject
	| ImageObject
	| DocumentObject

/**
 * The types that can carry a text label.
 *
 * A shape's label lives in the same `txt` map, under the same key convention, as a text object's
 * or a sticky's - the only difference is that a shape is born without one.
 */
export const TEXT_BEARING_TYPES: ReadonlySet<ObjectType> = new Set<ObjectType>([
	'text',
	'sticky',
	'rect',
	'ellipse',
	'polygon'
])

export function isTextBearing(type: ObjectType): boolean {
	return TEXT_BEARING_TYPES.has(type)
}

export type TextBearingObject =
	| TextObject
	| StickyObject
	| RectObject
	| EllipseObject
	| PolygonObject

// Bounds helper type
export interface Bounds {
	x: number
	y: number
	width: number
	height: number
}

// Connector defaults - what a fresh connector gets, and the values omitted from a stored 'C'.
// These two roles coincide on purpose: 'C' is a new code with no legacy readers, so an omitted
// sar/ear simply means "no head". The legacy 'A' code cannot do this - see LEGACY_A_* in
// type-converters.ts - which is why the two branches have different fallbacks.
export const DEFAULT_START_ARROW: ArrowStyle = { type: 'none' }
export const DEFAULT_END_ARROW: ArrowStyle = { type: 'none' }
export const DEFAULT_ROUTING: Routing = 'straight'
export const DEFAULT_ANCHOR: AnchorPoint = 'auto'

// Text defaults - what an object with no ff/ta/va renders as, and the values the converters omit.
// Matching prezillo's `system-ui, sans-serif` on purpose: neither app's default is a member of the
// @cloudillo/fonts collection, and FontPicker shows an unknown value verbatim rather than blanking.
//
// Text is centred both ways: a label or a note on a whiteboard is a caption on a box, not a
// paragraph. These constants RE-INTERPRET existing documents - `ta`/`va` are omitted whenever they
// equal the default, so everything created without touching the alignment buttons re-flows from
// left/top to centre/middle. Intended; do not change them back to make an old board look as it did.
export const DEFAULT_FONT_FAMILY = 'system-ui, sans-serif'
export const DEFAULT_TEXT_ALIGN: TextAlign = 'center'
export const DEFAULT_VERTICAL_ALIGN: VerticalAlign = 'middle'

// Default style values (using palette keys for theme support)
export const DEFAULT_STYLE: Style = {
	strokeColor: 'n0', // Black/dark neutral
	fillColor: 'transparent',
	strokeWidth: 2,
	strokeStyle: 'solid',
	opacity: 1
}

// vim: ts=4
