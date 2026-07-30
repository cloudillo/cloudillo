// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Bidirectional conversion between compact stored types and expanded runtime types
 */

import type { ObjectId } from './ids.js'
import { toObjectId } from './ids.js'
import type {
	AnchorPoint,
	AnchorPointType,
	ArrowheadPosition,
	ArrowheadType,
	ArrowStyle,
	ConnectorObject,
	DocumentObject,
	EllipseObject,
	FreehandObject,
	IdealloObject,
	ImageObject,
	ObjectTextStyle,
	ObjectType,
	PolygonObject,
	RectObject,
	Routing,
	StickyObject,
	StrokeStyle,
	Style,
	TextAlign,
	TextObject,
	VerticalAlign
} from './runtime-types.js'
import {
	DEFAULT_END_ARROW,
	DEFAULT_FONT_FAMILY,
	DEFAULT_ROUTING,
	DEFAULT_START_ARROW,
	DEFAULT_STYLE,
	DEFAULT_TEXT_ALIGN,
	DEFAULT_VERTICAL_ALIGN
} from './runtime-types.js'
import type {
	AnchorPointCode,
	ArrowDef,
	ArrowTypeCode,
	ObjectTypeCode,
	RoutingCode,
	AnchorPoint as StoredAnchorPoint,
	StoredConnector,
	StoredCornerRadius,
	StoredDocument,
	StoredEllipse,
	StoredFreehand,
	StoredImage,
	StoredLine,
	StoredObject,
	StoredPolygon,
	StoredRect,
	StoredSticky,
	StoredText,
	StoredTextStyle,
	StrokeStyleCode,
	TextAlignCode,
	VerticalAlignCode,
	YIdealloDocument
} from './stored-types.js'

// Type code mappings. There is deliberately no reverse map: 'L', 'A' and 'C' all expand to
// `connector`, so a one-to-one Record<ObjectTypeCode, ObjectType> would be a lie.
const TYPE_TO_TYPE_CODE: Record<ObjectType, ObjectTypeCode> = {
	freehand: 'F',
	rect: 'R',
	ellipse: 'E',
	connector: 'C',
	text: 'T',
	polygon: 'P',
	sticky: 'S',
	image: 'I',
	document: 'D'
}

// NOTE: StoredBezierFreehand removed - we just use StoredFreehand with type 'B' removed

// Stroke style mappings
const STROKE_STYLE_CODE_TO_STYLE: Record<StrokeStyleCode, StrokeStyle> = {
	S: 'solid',
	D: 'dashed',
	T: 'dotted'
}

const STROKE_STYLE_TO_CODE: Record<StrokeStyle, StrokeStyleCode> = {
	solid: 'S',
	dashed: 'D',
	dotted: 'T'
}

// Legacy arrowhead position mappings (stored `ah`)
const ARROWHEAD_CODE_TO_POSITION: Record<string, ArrowheadPosition> = {
	S: 'start',
	E: 'end',
	B: 'both'
}

// Routing mappings
const ROUTING_MAP: Record<RoutingCode, Routing> = {
	S: 'straight',
	O: 'orthogonal',
	C: 'curved'
}

const ROUTING_REVERSE: Record<Routing, RoutingCode> = {
	straight: 'S',
	orthogonal: 'O',
	curved: 'C'
}

// Anchor point mappings
const ANCHOR_MAP: Record<AnchorPointCode, AnchorPointType> = {
	c: 'center',
	t: 'top',
	b: 'bottom',
	l: 'left',
	r: 'right',
	tl: 'top-left',
	tr: 'top-right',
	bl: 'bottom-left',
	br: 'bottom-right',
	a: 'auto'
}

const ANCHOR_REVERSE: Record<AnchorPointType, AnchorPointCode> = {
	center: 'c',
	top: 't',
	bottom: 'b',
	left: 'l',
	right: 'r',
	'top-left': 'tl',
	'top-right': 'tr',
	'bottom-left': 'bl',
	'bottom-right': 'br',
	auto: 'a'
}

// Arrowhead shape mappings
const ARROWHEAD_MAP: Record<ArrowTypeCode, ArrowheadType> = {
	N: 'none',
	A: 'arrow',
	T: 'triangle',
	C: 'circle',
	D: 'diamond',
	B: 'bar'
}

const ARROWHEAD_REVERSE: Record<ArrowheadType, ArrowTypeCode> = {
	none: 'N',
	arrow: 'A',
	triangle: 'T',
	circle: 'C',
	diamond: 'D',
	bar: 'B'
}

// Text alignment mappings. They live here with the other stored-code maps rather than in
// utils/text-styles.ts (where prezillo keeps its copies): every code space in this app is
// translated in this file, and a second copy would be a second thing to keep in sync.
const TEXT_ALIGN_MAP: Record<TextAlignCode, TextAlign> = {
	l: 'left',
	c: 'center',
	r: 'right',
	j: 'justify'
}

const TEXT_ALIGN_REVERSE: Record<TextAlign, TextAlignCode> = {
	left: 'l',
	center: 'c',
	right: 'r',
	justify: 'j'
}

const VERTICAL_ALIGN_MAP: Record<VerticalAlignCode, VerticalAlign> = {
	t: 'top',
	m: 'middle',
	b: 'bottom'
}

const VERTICAL_ALIGN_REVERSE: Record<VerticalAlign, VerticalAlignCode> = {
	top: 't',
	middle: 'm',
	bottom: 'b'
}

/**
 * Bundle up the sub-codes an expander could not translate, or undefined when it understood all of
 * them. See IdealloObjectBase.unknownCodes for why they have to survive the round trip.
 */
function unknownCodeBag(entries: [string, unknown][]): Record<string, unknown> | undefined {
	const known = entries.filter(([, value]) => value !== undefined)
	return known.length ? Object.fromEntries(known) : undefined
}

/**
 * Put back every unrecognised sub-code whose field the compactor did NOT just write.
 *
 * "Did not write" is the whole rule: an unrecognised code expanded to a default, so if the field is
 * still absent the user never touched it and the peer's value must be preserved. If it IS present
 * the user picked something concrete and that wins.
 */
function applyUnknownCodes(
	stored: object,
	unknownCodes: Record<string, unknown> | undefined
): void {
	if (!unknownCodes) return
	const rec = stored as Record<string, unknown>
	for (const [key, value] of Object.entries(unknownCodes)) {
		if (rec[key] === undefined) rec[key] = value
	}
}

/**
 * Stored sub-code -> the runtime field whose explicit assignment retires it.
 *
 * `applyUnknownCodes` restores a code whenever its field is absent from the compacted record, and
 * a field is absent BOTH when the user never touched it and when the user deliberately chose the
 * default. Those two cases are indistinguishable by then, so the ambiguity is resolved earlier,
 * at the update: a caller that names the field has made a choice, and the peer's code is dropped.
 */
const UNKNOWN_CODE_FIELD: Record<string, string> = {
	ss: 'strokeStyle',
	rt: 'routing',
	sa: 'startAnchor',
	ea: 'endAnchor',
	sar: 'startArrow',
	ear: 'endArrow',
	ta: 'textAlign',
	va: 'verticalAlign'
}

/**
 * Drop the unknown codes whose field this update assigns. `ss` lives under `style`, everything
 * else at the top level. Returns the same reference when nothing is retired, so the common path
 * allocates nothing.
 */
export function retireUnknownCodes(
	unknownCodes: Record<string, unknown> | undefined,
	updates: Partial<IdealloObject>
): Record<string, unknown> | undefined {
	if (!unknownCodes) return unknownCodes
	const style = (updates as { style?: Record<string, unknown> }).style
	const named = (field: string) =>
		field === 'strokeStyle' ? !!style && field in style : field in updates
	const kept = Object.entries(unknownCodes).filter(
		([key]) => !named(UNKNOWN_CODE_FIELD[key] ?? '')
	)
	if (kept.length === Object.keys(unknownCodes).length) return unknownCodes
	return kept.length ? Object.fromEntries(kept) : undefined
}

/**
 * Expand the four text style fields shared by text labels and sticky notes.
 *
 * ta/va expand to their defaults so a consumer always has a concrete value; ff/fz stay undefined
 * when absent, matching the pre-existing contract the renderers already default against.
 */
function expandTextStyle(stored: StoredTextStyle): ObjectTextStyle {
	const unknownCodes = unknownCodeBag([
		['ta', stored.ta !== undefined && !TEXT_ALIGN_MAP[stored.ta] ? stored.ta : undefined],
		['va', stored.va !== undefined && !VERTICAL_ALIGN_MAP[stored.va] ? stored.va : undefined]
	])
	return {
		fontFamily: stored.ff,
		fontSize: stored.fz,
		// `?? DEFAULT` rather than a plain lookup: an unrecognised code must still hand the renderer
		// a concrete value, and the raw code is kept above instead of being thrown away.
		textAlign: (stored.ta ? TEXT_ALIGN_MAP[stored.ta] : undefined) ?? DEFAULT_TEXT_ALIGN,
		verticalAlign:
			(stored.va ? VERTICAL_ALIGN_MAP[stored.va] : undefined) ?? DEFAULT_VERTICAL_ALIGN,
		...(unknownCodes ? { unknownCodes } : {})
	}
}

/**
 * Compact the shared text style fields onto an already-built stored record.
 *
 * Writes a key only when it differs from the default, so "absent" keeps meaning "inherit" and a
 * document written before these fields existed is not rewritten by an unrelated edit.
 */
function compactTextStyle(stored: StoredTextStyle, runtime: ObjectTextStyle): void {
	if (runtime.fontFamily && runtime.fontFamily !== DEFAULT_FONT_FAMILY) {
		stored.ff = runtime.fontFamily
	}
	if (runtime.fontSize) {
		stored.fz = runtime.fontSize
	}
	if (runtime.textAlign && runtime.textAlign !== DEFAULT_TEXT_ALIGN) {
		stored.ta = TEXT_ALIGN_REVERSE[runtime.textAlign]
	}
	if (runtime.verticalAlign && runtime.verticalAlign !== DEFAULT_VERTICAL_ALIGN) {
		stored.va = VERTICAL_ALIGN_REVERSE[runtime.verticalAlign]
	}
	applyUnknownCodes(stored, runtime.unknownCodes)
}

/**
 * Sibling of compactTextStyle for the shared corner radius.
 *
 * 0 is the default, so it is written as ABSENT rather than as an explicit zero - otherwise every
 * square-cornered object gets a new key the first time anything else about it is edited.
 */
function compactCornerRadius(stored: StoredCornerRadius, radius: number | undefined): void {
	if (radius !== undefined && radius > 0) stored.cr = radius
}

/** Expand a stored anchor point; `undefined` falls back to 'auto' */
export function expandAnchorPoint(stored: StoredAnchorPoint | undefined): AnchorPoint {
	if (!stored) return 'auto'
	if (Array.isArray(stored)) return { x: stored[0], y: stored[1] }
	return ANCHOR_MAP[stored] ?? 'auto'
}

/** Compact an anchor point; returns undefined at the 'auto' default */
export function compactAnchorPoint(
	runtime: AnchorPoint | undefined
): StoredAnchorPoint | undefined {
	if (!runtime || runtime === 'auto') return undefined
	if (typeof runtime === 'object') return [runtime.x, runtime.y]
	return ANCHOR_REVERSE[runtime]
}

/** Expand a stored arrow definition tuple, falling back to the given default */
export function expandArrowDef(def: ArrowDef | undefined, fallback: ArrowStyle): ArrowStyle {
	if (!def) return { ...fallback }
	const style: ArrowStyle = { type: ARROWHEAD_MAP[def[0]] ?? 'none' }
	if (def[1] !== undefined) style.size = def[1]
	if (def[2] !== undefined) style.filled = def[2]
	return style
}

/** A named anchor code this build has no entry for; a free [x, y] pair is always understood */
function unknownAnchor(stored: StoredAnchorPoint | undefined): StoredAnchorPoint | undefined {
	if (!stored || Array.isArray(stored)) return undefined
	return ANCHOR_MAP[stored] ? undefined : stored
}

/** An arrowhead tuple whose SHAPE code this build has no entry for; size/filled are plain numbers */
function unknownArrowDef(def: ArrowDef | undefined): ArrowDef | undefined {
	if (!def) return undefined
	return ARROWHEAD_MAP[def[0]] ? undefined : def
}

/**
 * The sub-codes of a connector record this build could not translate.
 * Every one of them expanded to a default above, so they only survive by riding along - see
 * IdealloObjectBase.unknownCodes.
 */
function unknownConnectorCodes(stored: StoredConnector): Record<string, unknown> | undefined {
	return unknownCodeBag([
		['rt', stored.rt !== undefined && !ROUTING_MAP[stored.rt] ? stored.rt : undefined],
		['sa', unknownAnchor(stored.sa)],
		['ea', unknownAnchor(stored.ea)],
		['sar', unknownArrowDef(stored.sar)],
		['ear', unknownArrowDef(stored.ear)]
	])
}

function arrowStyleEquals(a: ArrowStyle, b: ArrowStyle): boolean {
	return (
		a.type === b.type &&
		(a.size ?? 1) === (b.size ?? 1) &&
		(a.filled ?? true) === (b.filled ?? true)
	)
}

/** Compact an arrow definition; returns undefined at the default, and trims trailing defaults */
export function compactArrowDef(
	style: ArrowStyle | undefined,
	fallback: ArrowStyle
): ArrowDef | undefined {
	if (!style) return undefined
	if (arrowStyleEquals(style, fallback)) return undefined
	const def: ArrowDef = [ARROWHEAD_REVERSE[style.type]]
	// Trim the tuple: ['A'] rather than ['A', 1, true]
	const filledSet = style.filled !== undefined && style.filled !== true
	if (style.size !== undefined && style.size !== 1) {
		def[1] = style.size
		if (filledSet) def[2] = style.filled
	} else if (filledSet) {
		def[1] = 1
		def[2] = style.filled
	}
	return def
}

/**
 * Turn a start/end/both position into a pair of plain open-V arrowheads.
 * Used by the legacy `ah` migration and by Smart Ink's arrow detector, which still reports
 * an arrowhead *position* rather than a pair of shapes.
 */
export function arrowheadsFromPosition(position: ArrowheadPosition): [ArrowStyle, ArrowStyle] {
	const head: ArrowStyle = { type: 'arrow' }
	const none: ArrowStyle = { type: 'none' }
	switch (position) {
		case 'start':
			return [{ ...head }, { ...none }]
		case 'both':
			return [{ ...head }, { ...head }]
		default:
			return [{ ...none }, { ...head }]
	}
}

/**
 * What an omitted sar/ear means in a legacy 'A' record. FROZEN by the legacy `ah` rule: an absent
 * `ah` was read as 'end', so an 'A' with no arrowhead fields has an end arrowhead. New records use
 * code 'C', where an omitted field means no head - see DEFAULT_*_ARROW.
 */
const LEGACY_A_DEFAULT_START: ArrowStyle = { type: 'none' }
const LEGACY_A_DEFAULT_END: ArrowStyle = { type: 'arrow' }

/**
 * Expand the legacy stored `ah` code. Absent `ah` means 'E' (the historical default).
 * Read path only - `ah` is never written.
 */
function expandLegacyArrowheads(ah: 'S' | 'E' | 'B' | undefined): [ArrowStyle, ArrowStyle] {
	if (!ah) return [{ ...LEGACY_A_DEFAULT_START }, { ...LEGACY_A_DEFAULT_END }]
	return arrowheadsFromPosition(ARROWHEAD_CODE_TO_POSITION[ah])
}

/**
 * The two absolute terminal points of a stored connector, in [start, end] order.
 *
 * THE reader for connector geometry - nothing should touch `xy`/`wh`/`pts` directly. `xy` is the
 * start point and `wh` the signed delta to the end; `pts` is the legacy spelling, still present on
 * every 'A' record and on the pre-release 'C' records written before `wh` existed, and is read here
 * as a fallback so those documents keep opening.
 */
export function storedConnectorTerminals(
	stored: StoredConnector | StoredLine
): [[number, number], [number, number]] {
	// `wh` is declared required on StoredConnector because everything WRITTEN has it; the legacy
	// records above do not, which is exactly what this fallback is for.
	const wh: [number, number] | undefined = (stored as StoredConnector).wh
	if (wh) {
		return [
			[stored.xy[0], stored.xy[1]],
			[stored.xy[0] + wh[0], stored.xy[1] + wh[1]]
		]
	}
	const pts = stored.pts
	if (pts) {
		return [
			[pts[0][0], pts[0][1]],
			[pts[1][0], pts[1][1]]
		]
	}
	// Neither spelling: a degenerate zero-length connector at the origin beats throwing on read
	return [
		[stored.xy[0], stored.xy[1]],
		[stored.xy[0], stored.xy[1]]
	]
}

/**
 * Expand a stored object to runtime format
 *
 * @param id - The object ID
 * @param stored - The stored object data
 * @param doc - The document (needed to access txt/geo maps)
 */
export function expandObject(
	id: ObjectId,
	stored: StoredObject,
	doc: YIdealloDocument
): IdealloObject {
	const styleUnknown = unknownCodeBag([
		[
			'ss',
			stored.ss !== undefined && !STROKE_STYLE_CODE_TO_STYLE[stored.ss]
				? stored.ss
				: undefined
		]
	])

	/**
	 * Merge the base-style unknown codes with a case's own bag - the connector and text-style cases
	 * spread their own `unknownCodes` after `...base` and would otherwise drop the style's.
	 */
	const withUnknown = (extra?: Record<string, unknown>) => {
		const merged = { ...styleUnknown, ...extra }
		return Object.keys(merged).length ? { unknownCodes: merged } : {}
	}

	/** expandTextStyle's own bag has to be merged rather than replace the style's */
	const withTextStyle = (textStored: StoredTextStyle) => {
		const textStyle = expandTextStyle(textStored)
		return { ...textStyle, ...withUnknown(textStyle.unknownCodes) }
	}

	const baseStyle: Style = {
		strokeColor: stored.sc ?? DEFAULT_STYLE.strokeColor,
		fillColor: stored.fc ?? DEFAULT_STYLE.fillColor,
		strokeWidth: stored.sw ?? DEFAULT_STYLE.strokeWidth,
		// `?? DEFAULT` rather than a plain lookup: an unrecognised code must still hand the
		// renderer a concrete value, and the raw code is kept above instead of being thrown away.
		strokeStyle:
			(stored.ss ? STROKE_STYLE_CODE_TO_STYLE[stored.ss] : undefined) ??
			DEFAULT_STYLE.strokeStyle,
		opacity: stored.op ?? DEFAULT_STYLE.opacity
	}

	const base = {
		id,
		x: stored.xy[0],
		y: stored.xy[1],
		rotation: stored.r ?? 0,
		pivotX: stored.pv?.[0] ?? 0.5,
		pivotY: stored.pv?.[1] ?? 0.5,
		locked: stored.lk ?? false,
		snapped: stored.sn ?? false,
		style: baseStyle,
		...withUnknown()
	}

	switch (stored.t) {
		case 'F': {
			const fh = stored as StoredFreehand
			// Use pid if present (linked copy), otherwise use object ID
			const pathKey = fh.pid ?? id
			const pathData = doc.paths.get(pathKey) ?? ''
			return {
				...base,
				type: 'freehand',
				width: fh.wh[0],
				height: fh.wh[1],
				// Only include pid if it's a linked copy (differs from object ID)
				...(fh.pid ? { pid: toObjectId(fh.pid) } : {}),
				pathData,
				closed: fh.cl ?? false
			} as FreehandObject
		}
		case 'R': {
			const rect = stored as StoredRect
			// A shape's label lives in the same txt map under the same key convention as a text
			// object's; `tid` is present only on a linked copy.
			const rectText = doc.txt.get(rect.tid ?? id)
			return {
				...base,
				type: 'rect',
				width: rect.wh[0],
				height: rect.wh[1],
				cornerRadius: rect.cr,
				...(rect.tid ? { tid: toObjectId(rect.tid) } : {}),
				...(rectText ? { text: rectText.toString() } : {}),
				...withTextStyle(rect)
			} as RectObject
		}
		case 'E': {
			const ellipse = stored as StoredEllipse
			const ellipseText = doc.txt.get(ellipse.tid ?? id)
			return {
				...base,
				type: 'ellipse',
				width: ellipse.wh[0],
				height: ellipse.wh[1],
				...(ellipse.tid ? { tid: toObjectId(ellipse.tid) } : {}),
				...(ellipseText ? { text: ellipseText.toString() } : {}),
				...withTextStyle(ellipse)
			} as EllipseObject
		}
		// Legacy line objects. The 'line' tool and LineObject are gone; a stored line reads as a
		// headless connector. Read-side only - nothing writes 'L', and the first edit rewrites the
		// record as 'C' (updateObject does expand -> merge -> compact). Deliberately NOT routed
		// through expandLegacyArrowheads: a line has no `ah`, and the absent-`ah` rule would hand
		// it an end arrowhead it never had.
		case 'L': {
			const line = stored as StoredLine
			const [lineStart, lineEnd] = storedConnectorTerminals(line)
			return {
				...base,
				// x/y are the START terminal for every connector, whatever code it came from, so
				// obj.x === obj.startX holds and compactObject can write xy from startX/startY
				x: lineStart[0],
				y: lineStart[1],
				type: 'connector',
				startX: lineStart[0],
				startY: lineStart[1],
				endX: lineEnd[0],
				endY: lineEnd[1],
				startAnchor: expandAnchorPoint(undefined),
				endAnchor: expandAnchorPoint(undefined),
				routing: DEFAULT_ROUTING,
				startArrow: { ...DEFAULT_START_ARROW },
				endArrow: { ...DEFAULT_END_ARROW }
			} as ConnectorObject
		}
		// Legacy arrow objects. Read-side only; rewritten as 'C' on the first edit.
		case 'A': {
			const arrow = stored as StoredConnector
			// sar/ear win when present; otherwise migrate the legacy `ah` position code
			const [legacyStart, legacyEnd] = expandLegacyArrowheads(arrow.ah)
			const [arrowStart, arrowEnd] = storedConnectorTerminals(arrow)
			const arrowUnknown = unknownConnectorCodes(arrow)
			return {
				...base,
				x: arrowStart[0],
				y: arrowStart[1],
				type: 'connector',
				startX: arrowStart[0],
				startY: arrowStart[1],
				endX: arrowEnd[0],
				endY: arrowEnd[1],
				...(arrow.so_ ? { startObjectId: toObjectId(arrow.so_) } : {}),
				...(arrow.eo ? { endObjectId: toObjectId(arrow.eo) } : {}),
				startAnchor: expandAnchorPoint(arrow.sa),
				endAnchor: expandAnchorPoint(arrow.ea),
				routing: (arrow.rt ? ROUTING_MAP[arrow.rt] : undefined) ?? 'straight',
				startArrow: expandArrowDef(arrow.sar, legacyStart),
				endArrow: expandArrowDef(arrow.ear, legacyEnd),
				...(arrow.wp ? { waypoints: arrow.wp } : {}),
				...(arrow.bd !== undefined ? { bend: arrow.bd } : {}),
				...withUnknown(arrowUnknown)
			} as ConnectorObject
		}
		case 'C': {
			const conn = stored as StoredConnector
			// xy + signed wh; storedConnectorTerminals falls back to `pts` for the pre-release
			// records written before `wh` existed
			const [connStart, connEnd] = storedConnectorTerminals(conn)
			const connUnknown = unknownConnectorCodes(conn)
			return {
				...base,
				x: connStart[0],
				y: connStart[1],
				type: 'connector',
				startX: connStart[0],
				startY: connStart[1],
				endX: connEnd[0],
				endY: connEnd[1],
				...(conn.so_ ? { startObjectId: toObjectId(conn.so_) } : {}),
				...(conn.eo ? { endObjectId: toObjectId(conn.eo) } : {}),
				startAnchor: expandAnchorPoint(conn.sa),
				endAnchor: expandAnchorPoint(conn.ea),
				routing: (conn.rt ? ROUTING_MAP[conn.rt] : undefined) ?? 'straight',
				// No `ah` involvement: an omitted head on a 'C' record simply means no head
				startArrow: expandArrowDef(conn.sar, DEFAULT_START_ARROW),
				endArrow: expandArrowDef(conn.ear, DEFAULT_END_ARROW),
				...(conn.wp ? { waypoints: conn.wp } : {}),
				...(conn.bd !== undefined ? { bend: conn.bd } : {}),
				...withUnknown(connUnknown)
			} as ConnectorObject
		}
		case 'T': {
			const text = stored as StoredText
			// Use tid if present (linked copy), otherwise use object ID
			const txtKey = text.tid ?? id
			const yText = doc.txt.get(txtKey)
			return {
				...base,
				type: 'text',
				width: text.wh[0],
				height: text.wh[1],
				// Only include tid if it's a linked copy (differs from object ID)
				...(text.tid ? { tid: toObjectId(text.tid) } : {}),
				text: yText?.toString() ?? '',
				...withTextStyle(text)
			} as TextObject
		}
		case 'P': {
			const polygon = stored as StoredPolygon
			// Use gid if present (linked copy), otherwise use object ID
			const geoKey = polygon.gid ?? id
			const yArray = doc.geo.get(geoKey)
			const vts = yArray?.toArray() ?? []
			const vertices: [number, number][] = []
			for (let i = 0; i < vts.length; i += 2) {
				vertices.push([vts[i], vts[i + 1]])
			}
			const polygonText = doc.txt.get(polygon.tid ?? id)
			return {
				...base,
				type: 'polygon',
				// Only include gid if it's a linked copy (differs from object ID)
				...(polygon.gid ? { gid: toObjectId(polygon.gid) } : {}),
				vertices,
				...(polygon.tid ? { tid: toObjectId(polygon.tid) } : {}),
				...(polygonText ? { text: polygonText.toString() } : {}),
				...withTextStyle(polygon)
			} as PolygonObject
		}
		case 'S': {
			const sticky = stored as StoredSticky
			// Use tid if present (linked copy), otherwise use object ID
			const txtKey = sticky.tid ?? id
			const yText = doc.txt.get(txtKey)
			return {
				...base,
				type: 'sticky',
				width: sticky.wh[0],
				height: sticky.wh[1],
				// Only include tid if it's a linked copy (differs from object ID)
				...(sticky.tid ? { tid: toObjectId(sticky.tid) } : {}),
				text: yText?.toString() ?? '',
				...withTextStyle(sticky)
			} as StickyObject
		}
		case 'I': {
			const img = stored as StoredImage
			return {
				...base,
				type: 'image',
				width: img.wh[0],
				height: img.wh[1],
				fileId: img.fid,
				cornerRadius: img.cr
			} as ImageObject
		}
		case 'D': {
			const docEmbed = stored as StoredDocument
			return {
				...base,
				type: 'document',
				width: docEmbed.wh[0],
				height: docEmbed.wh[1],
				fileId: docEmbed.fid,
				contentType: docEmbed.ct,
				appId: docEmbed.aid,
				navState: docEmbed.ns,
				aspectRatio: docEmbed.ar,
				cornerRadius: docEmbed.cr
			} as DocumentObject
		}
		default:
			throw new Error(`Unknown object type: ${(stored as Record<string, unknown>).t}`)
	}
}

/**
 * Compact a runtime object to stored format
 * Note: This only stores the reference IDs (tid/gid), not the actual content.
 * The content (text/points) is stored separately in the txt/geo maps.
 */
export function compactObject(obj: IdealloObject): StoredObject {
	const baseStored: Partial<StoredObject> = {
		t: TYPE_TO_TYPE_CODE[obj.type],
		xy: [obj.x, obj.y]
	}

	// Only store non-default style values
	if (obj.style.strokeColor !== DEFAULT_STYLE.strokeColor) {
		baseStored.sc = obj.style.strokeColor
	}
	if (obj.style.fillColor !== DEFAULT_STYLE.fillColor) {
		baseStored.fc = obj.style.fillColor
	}
	if (obj.style.strokeWidth !== DEFAULT_STYLE.strokeWidth) {
		baseStored.sw = obj.style.strokeWidth
	}
	if (obj.style.strokeStyle !== DEFAULT_STYLE.strokeStyle) {
		baseStored.ss = STROKE_STYLE_TO_CODE[obj.style.strokeStyle]
	}
	// Same rule as applyUnknownCodes, scoped to `ss`: the field is still absent, so the user never
	// touched it and the peer's code must survive. Scoped rather than a whole-bag apply because the
	// connector keys in the bag are restored by the connector branch, on the connector record.
	if (baseStored.ss === undefined && typeof obj.unknownCodes?.ss === 'string') {
		baseStored.ss = obj.unknownCodes.ss as StrokeStyleCode
	}
	if (obj.style.opacity !== DEFAULT_STYLE.opacity) {
		baseStored.op = obj.style.opacity
	}

	// Only store non-default values
	if (obj.rotation !== 0) {
		baseStored.r = obj.rotation
	}
	// Store pivot if not center (0.5, 0.5)
	if (obj.pivotX !== 0.5 || obj.pivotY !== 0.5) {
		baseStored.pv = [obj.pivotX, obj.pivotY]
	}
	if (obj.locked) {
		baseStored.lk = true
	}
	if (obj.snapped) {
		baseStored.sn = true
	}

	switch (obj.type) {
		case 'freehand': {
			const fh = obj as FreehandObject
			const stored = {
				...baseStored,
				t: 'F' as const,
				wh: [fh.width, fh.height] as [number, number]
			} as StoredFreehand
			// Only store pid if it's a linked copy (explicit pid set)
			if (fh.pid) {
				stored.pid = fh.pid
			}
			// Only store closed flag if true
			if (fh.closed) {
				stored.cl = true
			}
			return stored
		}
		case 'rect': {
			const rect = obj as RectObject
			const stored = {
				...baseStored,
				t: 'R' as const,
				wh: [rect.width, rect.height] as [number, number]
			} as StoredRect
			if (rect.tid) {
				stored.tid = rect.tid
			}
			compactCornerRadius(stored, rect.cornerRadius)
			compactTextStyle(stored, rect)
			return stored
		}
		case 'ellipse': {
			const ellipse = obj as EllipseObject
			const stored = {
				...baseStored,
				t: 'E' as const,
				wh: [ellipse.width, ellipse.height] as [number, number]
			} as StoredEllipse
			if (ellipse.tid) {
				stored.tid = ellipse.tid
			}
			compactTextStyle(stored, ellipse)
			return stored
		}
		case 'connector': {
			const arrow = obj as ConnectorObject
			const stored = {
				...baseStored,
				t: 'C' as const,
				// The endpoints ARE the position: xy overrides the generic [obj.x, obj.y] above,
				// which several callers set to the endpoint bbox origin rather than the start
				// terminal. wh is the signed delta and is never normalised - see StoredConnector.
				// `pts` is deliberately not written; it is read-only legacy.
				xy: [arrow.startX, arrow.startY] as [number, number],
				wh: [arrow.endX - arrow.startX, arrow.endY - arrow.startY] as [number, number]
			} as StoredConnector

			// Bindings. `route` is deliberately not in this whitelist - it is derived.
			if (arrow.startObjectId) stored.so_ = arrow.startObjectId
			if (arrow.endObjectId) stored.eo = arrow.endObjectId
			const sa = compactAnchorPoint(arrow.startAnchor)
			if (sa !== undefined) stored.sa = sa
			const ea = compactAnchorPoint(arrow.endAnchor)
			if (ea !== undefined) stored.ea = ea
			if (arrow.waypoints?.length) stored.wp = arrow.waypoints
			if (arrow.bend !== undefined) stored.bd = arrow.bend
			if (arrow.routing && arrow.routing !== 'straight') {
				stored.rt = ROUTING_REVERSE[arrow.routing]
			}

			// Arrowheads: per-terminal shapes, omitted when there is no head. The legacy `ah` is
			// deliberately NOT written - it existed so pre-sar/ear peers drew heads in the right
			// place, and no such peer can read a 'C' record at all.
			const sar = compactArrowDef(
				arrow.startArrow ?? DEFAULT_START_ARROW,
				DEFAULT_START_ARROW
			)
			if (sar !== undefined) stored.sar = sar
			const ear = compactArrowDef(arrow.endArrow ?? DEFAULT_END_ARROW, DEFAULT_END_ARROW)
			if (ear !== undefined) stored.ear = ear

			applyUnknownCodes(stored, arrow.unknownCodes)

			return stored
		}
		case 'text': {
			const text = obj as TextObject
			const stored = {
				...baseStored,
				t: 'T' as const,
				wh: [text.width, text.height] as [number, number]
			} as StoredText
			// Only store tid if it's a linked copy (explicit tid set)
			if (text.tid) {
				stored.tid = text.tid
			}
			compactTextStyle(stored, text)
			return stored
		}
		case 'polygon': {
			const polygon = obj as PolygonObject
			const stored = {
				...baseStored,
				t: 'P' as const
			} as StoredPolygon
			// Only store gid if it's a linked copy (explicit gid set)
			if (polygon.gid) {
				stored.gid = polygon.gid
			}
			if (polygon.tid) {
				stored.tid = polygon.tid
			}
			compactTextStyle(stored, polygon)
			return stored
		}
		case 'sticky': {
			const sticky = obj as StickyObject
			const stored = {
				...baseStored,
				t: 'S' as const,
				wh: [sticky.width, sticky.height] as [number, number]
			} as StoredSticky
			// Only store tid if it's a linked copy (explicit tid set)
			if (sticky.tid) {
				stored.tid = sticky.tid
			}
			compactTextStyle(stored, sticky)
			return stored
		}
		case 'image': {
			const img = obj as ImageObject
			const stored = {
				...baseStored,
				t: 'I' as const,
				wh: [img.width, img.height] as [number, number],
				fid: img.fileId
			} as StoredImage
			compactCornerRadius(stored, img.cornerRadius)
			return stored
		}
		case 'document': {
			const docObj = obj as DocumentObject
			const stored = {
				...baseStored,
				t: 'D' as const,
				wh: [docObj.width, docObj.height] as [number, number],
				fid: docObj.fileId,
				ct: docObj.contentType
			} as StoredDocument
			if (docObj.appId) {
				stored.aid = docObj.appId
			}
			if (docObj.navState) {
				stored.ns = docObj.navState
			}
			if (docObj.aspectRatio) {
				stored.ar = docObj.aspectRatio
			}
			compactCornerRadius(stored, docObj.cornerRadius)
			return stored
		}
		default:
			throw new Error(`Unknown object type: ${(obj as Record<string, unknown>).type}`)
	}
}

// vim: ts=4
