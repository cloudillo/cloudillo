// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Compact CRDT-stored types for Ideallo
 * Uses short field names for storage efficiency
 *
 * Field naming conventions:
 * - t   = type
 * - xy  = position [x, y]
 * - wh  = dimensions [width, height]
 * - tid = text ID (optional: if omitted, object ID used as key in txt map)
 * - gid = geometry ID (optional: if omitted, object ID used as key in geo map)
 * - r   = rotation
 * - sc  = stroke color
 * - fc  = fill color
 * - sw  = stroke width
 * - ss  = stroke style
 * - op  = opacity
 * - lk  = locked
 * - ff  = font family
 * - fz  = font size
 * - ta  = text align
 * - va  = vertical align
 */

import type * as Y from 'yjs'

// Object type codes
export type ObjectTypeCode =
	| 'F' // Freehand path (bezier, stored in paths map as SVG path string)
	| 'R' // Rectangle
	| 'E' // Ellipse
	| 'L' // Line (LEGACY - read only, migrated to a headless connector; never written)
	| 'A' // Arrow (LEGACY - read only, migrated to a connector; never written)
	| 'C' // Connector
	| 'T' // Text label
	| 'P' // Polygon (triangle, pentagon, etc.)
	| 'S' // Sticky note
	| 'I' // Image
	| 'D' // Document (embedded document)
//
// 'C' collides with nothing here: the object codes are F R E L A C T P S I D. It also appears in
// ArrowTypeCode (circle) and RoutingCode (curved), but those are separate code spaces - not a bug.
//
// expandObject() still throws on an unknown `t`, but every READ path goes through
// tryExpandObject() and skips the record instead, so a peer that does not know a code sees a
// document with those objects missing rather than a blank canvas. A peer running 0.8.x predates
// that guard and will still fail hard on 't: C'; anything from this release on degrades.

// Stroke style codes
export type StrokeStyleCode = 'S' | 'D' | 'T' // Solid, Dashed, Dotted

// Arrow type codes: None/Arrow/Triangle/Circle/Diamond/Bar
export type ArrowTypeCode = 'N' | 'A' | 'T' | 'C' | 'D' | 'B'

// Arrow definition: [type, size?, filled?]
// size is a multiplier on the derived base length (default 1)
// filled applies to Triangle/Circle/Diamond (default true); Arrow is an open V and ignores it
export type ArrowDef = [ArrowTypeCode, number?, boolean?]

// Anchor point codes (mirrors apps/prezillo/src/crdt/stored-types.ts)
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
	| 'a' // auto (router picks the side)

// Anchor point: code or relative position [x, y] (0-1) in object space
export type AnchorPoint = AnchorPointCode | [number, number]

// Routing type codes: Straight/Orthogonal (elbow)/Curved (arc)
export type RoutingCode = 'S' | 'O' | 'C'

// Text alignment codes: Left/Center/Right/Justify (mirrors prezillo's `ta`)
export type TextAlignCode = 'l' | 'c' | 'r' | 'j'

// Vertical alignment codes: Top/Middle/Bottom (mirrors prezillo's `va`)
export type VerticalAlignCode = 't' | 'm' | 'b'

/**
 * Text styling shared by the two text-bearing objects.
 *
 * DIVERGENCE, deliberate: font size is `fz` here where prezillo uses `fs`. `fz` predates this
 * struct and is already persisted in real ideallo documents, so renaming it would silently drop
 * the font size of every existing text label on load. Do not "fix" it to match prezillo.
 *
 * Every field is omitted at its default (see DEFAULT_FONT_FAMILY / DEFAULT_TEXT_ALIGN /
 * DEFAULT_VERTICAL_ALIGN in runtime-types.ts), so absent means "inherit" and a document written
 * before this version keeps rendering exactly as it did.
 */
export interface StoredTextStyle {
	ff?: string // font family
	fz?: number // font size
	// Defaults live in runtime-types.ts (DEFAULT_TEXT_ALIGN / DEFAULT_VERTICAL_ALIGN) and are what
	// expandTextStyle applies to an absent field - that is the single source of truth.
	ta?: TextAlignCode // text align (omitted => 'c' / centre)
	va?: VerticalAlignCode // vertical align (omitted => 'm' / middle)
}

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

// Freehand path (bezier, SVG path string stored in paths map)
export interface StoredFreehand extends StoredObjectBase {
	t: 'F'
	wh: [number, number] // [width, height] - bounds of the path
	pid?: string // Optional: if omitted, uses object ID as key in paths map
	cl?: true // closed path (omit if open)
}

// Rectangle
/**
 * Rounded corners, shared by every type that has a box to round.
 *
 * Additive and ignored in both directions: an older peer reading `cr` drops it and draws square
 * corners, which is what it drew before the field existed.
 */
export interface StoredCornerRadius {
	cr?: number // corner radius (omitted => 0, i.e. square)
}

/**
 * Rect, optionally labelled.
 *
 * The text keys are the ESTABLISHED ones - ff/fz/ta/va from StoredTextStyle and the usual `tid` -
 * so nothing new is invented on the wire. An older peer reading them ignores the lot and draws a
 * plain rect, which is graceful both ways.
 *
 * One caveat worth knowing: if an older peer EDITS a labelled rect, its compact branch drops the
 * text-style keys. `tid` is omitted in the normal (non-linked-copy) case, so the Y.Text stays in
 * `doc.txt` under the object id and the label itself survives - only its styling is lost.
 */
export interface StoredRect extends StoredObjectBase, StoredTextStyle, StoredCornerRadius {
	t: 'R'
	wh: [number, number] // [width, height]
	tid?: string // Optional: if omitted, uses object ID as key in txt map
}

// Ellipse
export interface StoredEllipse extends StoredObjectBase, StoredTextStyle {
	t: 'E'
	wh: [number, number] // [width, height]
	tid?: string // Optional: if omitted, uses object ID as key in txt map
}

/**
 * @deprecated Legacy line. READ ONLY - nothing writes 'L' any more; expandObject() migrates it to
 * a headless connector, and the first edit rewrites the record as 'C'. Kept so `t === 'L'` stays
 * reachable in the StoredObject union: drop it and the read path for old documents goes with it.
 */
export interface StoredLine extends StoredObjectBase {
	t: 'L'
	pts: [[number, number], [number, number]] // [start, end] absolute positions
}

// Connector (may bind either terminal to an object)
//
// Covers both codes: 'C' is what we write, 'A' is the legacy arrow that reads as the same shape.
//
// GEOMETRY: `xy` is the START terminal - an absolute point, NOT a bounding-box origin - and `wh`
// is the SIGNED delta from it to the end terminal. A connector drawn right-to-left therefore has a
// negative wh[0], and one drawn bottom-to-top a negative wh[1]; neither is a bug and neither may be
// normalised, or the two terminals would swap. This mirrors prezillo's StoredConnector, which has
// no endpoint fields of its own and reads its terminals straight off StoredObjectBase.xy/wh, so a
// document can move between the two apps. It also makes `xy` mean for a connector exactly what it
// means for every other type, which is what lets the generic offset in duplicateObject() work.
//
// xy/wh are authoritative only for UNBOUND terminals. For a bound terminal they hold a snapshot
// taken at bind time and are NOT rewritten when the target moves - routes are derived at render
// time from the target's current geometry. The snapshot is read only as a fallback when the
// referenced id is missing from doc.o (dangling-ref tolerance).
export interface StoredConnector extends StoredObjectBase {
	t: 'A' | 'C'
	wh: [number, number] // signed [dx, dy] from the start terminal (xy) to the end terminal
	/** @deprecated legacy [start, end] absolute positions. READ ONLY - present on every 'A' record
	 * and on the pre-release 'C' records that predate `wh`; migrated on expand and never written.
	 * Absent from anything this version writes, hence optional - and absent from an 'A' record's
	 * `wh` for the same reason, so read the pair through storedConnectorTerminals(). */
	pts?: [[number, number], [number, number]]
	/** @deprecated legacy arrowhead position (Start/End/Both), only ever present on a 'A' record.
	 * READ ONLY - migrated to sar/ear on expand and never written. */
	ah?: 'S' | 'E' | 'B'
	// Named so_ (not so) to mirror prezillo's StoredConnector, where the underscore avoids a
	// collision with a style-override key. ideallo has no such collision, but the two apps keep
	// the same stored vocabulary so a document can migrate between them.
	so_?: string // startObjectId
	sa?: AnchorPoint // startAnchor (omitted => 'a' auto)
	eo?: string // endObjectId
	ea?: AnchorPoint // endAnchor (omitted => 'a' auto)
	// Not rendered by this version, but round-tripped by the converters so a local edit does not
	// destroy a peer's or a future version's value
	wp?: [number, number][] // waypoints
	rt?: RoutingCode // routing (omitted => 'S' straight)
	// Arrowheads. On a 'C' record an omitted field means no head. On a legacy 'A' it falls back to
	// the `ah` rule instead, where an absent `ah` implies an end arrowhead.
	sar?: ArrowDef // startArrow
	ear?: ArrowDef // endArrow
	bd?: number // arc bend factor (round-tripped like wp above)
}

// Text label (content stored separately in txt map)
export interface StoredText extends StoredObjectBase, StoredTextStyle {
	t: 'T'
	wh: [number, number] // [width, height]
	tid?: string // Optional: if omitted, uses object ID as key in txt map
}

// Polygon (triangle, pentagon, hexagon, etc.) - geometry stored separately in geo map
export interface StoredPolygon extends StoredObjectBase, StoredTextStyle {
	t: 'P'
	gid?: string // Optional: if omitted, uses object ID as key in geo map
	tid?: string // Optional: if omitted, uses object ID as key in txt map
}

// Sticky note (uses standard fillColor from style for background)
export interface StoredSticky extends StoredObjectBase, StoredTextStyle {
	t: 'S'
	wh: [number, number] // [width, height]
	tid?: string // Optional: if omitted, uses object ID as key in txt map
}

// Image
export interface StoredImage extends StoredObjectBase, StoredCornerRadius {
	t: 'I'
	wh: [number, number] // [width, height]
	fid: string // fileId from MediaPicker
}

// Embedded document
export interface StoredDocument extends StoredObjectBase, StoredCornerRadius {
	t: 'D'
	wh: [number, number] // [width, height]
	fid: string // fileId of the embedded document
	ct: string // contentType (e.g. 'cloudillo/quillo')
	aid?: string // appId (resolved from contentType)
	ns?: string // navigation state (opaque, app-specific)
	ar?: [number, number] // aspect ratio from embedded doc (e.g. [16, 9])
}

// Union of all stored object types
export type StoredObject =
	| StoredFreehand
	| StoredRect
	| StoredEllipse
	| StoredLine
	| StoredConnector
	| StoredText
	| StoredPolygon
	| StoredSticky
	| StoredImage
	| StoredDocument

// Document metadata
export interface StoredMeta {
	name?: string
	backgroundColor?: string
	gridSize?: number
	snapToGrid?: boolean
}

// Document structure - simpler than prezillo (no containers, views)
export interface YIdealloDocument {
	o: Y.Map<StoredObject> // objects (metadata + style only)
	r: Y.Array<string> // z-order: array of objectId strings (index 0 = backmost)
	m: Y.Map<unknown> // metadata
	txt: Y.Map<Y.Text> // text content for Text/Sticky objects
	geo: Y.Map<Y.Array<number>> // geometry for Polygon objects
	paths: Y.Map<string> // SVG path strings for Freehand objects
}

// vim: ts=4
