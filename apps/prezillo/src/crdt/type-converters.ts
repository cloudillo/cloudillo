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
 * Conversion functions between stored (compact) and runtime (expanded) types
 */

import type { ObjectId, ContainerId, ViewId, StyleId, RichTextId } from './ids'
import { toObjectId, toContainerId, toViewId, toStyleId, toRichTextId } from './ids'
import type * as Stored from './stored-types'
import type * as Runtime from './runtime-types'
import type { Gradient, GradientStop } from '@cloudillo/canvas-tools'

// Type code mappings
const OBJECT_TYPE_MAP: Record<Stored.ObjectTypeCode, Runtime.ObjectType> = {
	R: 'rect',
	E: 'ellipse',
	L: 'line',
	P: 'path',
	G: 'polygon',
	T: 'text',
	B: 'textbox',
	I: 'image',
	M: 'embed',
	C: 'connector',
	Q: 'qrcode',
	F: 'pollframe'
}

const OBJECT_TYPE_REVERSE: Record<Runtime.ObjectType, Stored.ObjectTypeCode> = {
	rect: 'R',
	ellipse: 'E',
	line: 'L',
	path: 'P',
	polygon: 'G',
	text: 'T',
	textbox: 'B',
	image: 'I',
	embed: 'M',
	connector: 'C',
	qrcode: 'Q',
	pollframe: 'F'
}

// Poll frame shape mappings
const POLL_SHAPE_MAP: Record<'R' | 'E', 'rect' | 'ellipse'> = {
	R: 'rect',
	E: 'ellipse'
}

const POLL_SHAPE_REVERSE: Record<'rect' | 'ellipse', 'R' | 'E'> = {
	rect: 'R',
	ellipse: 'E'
}

// QR Code error correction level mappings
const QR_ERROR_CORRECTION_MAP: Record<Stored.QrErrorCorrectionLevel, Runtime.QrErrorCorrection> = {
	L: 'low',
	M: 'medium',
	Q: 'quartile',
	H: 'high'
}

const QR_ERROR_CORRECTION_REVERSE: Record<
	Runtime.QrErrorCorrection,
	Stored.QrErrorCorrectionLevel
> = {
	low: 'L',
	medium: 'M',
	quartile: 'Q',
	high: 'H'
}

const CONTAINER_TYPE_MAP: Record<Stored.ContainerTypeCode, Runtime.ContainerType> = {
	L: 'layer',
	G: 'group'
}

const CONTAINER_TYPE_REVERSE: Record<Runtime.ContainerType, Stored.ContainerTypeCode> = {
	layer: 'L',
	group: 'G'
}

const BLEND_MODE_MAP: Record<Stored.BlendModeCode, Runtime.BlendMode> = {
	N: 'normal',
	M: 'multiply',
	S: 'screen',
	O: 'overlay',
	D: 'darken',
	L: 'lighten',
	CD: 'color-dodge',
	CB: 'color-burn',
	HL: 'hard-light',
	SL: 'soft-light',
	DF: 'difference',
	EX: 'exclusion'
}

const BLEND_MODE_REVERSE: Record<Runtime.BlendMode, Stored.BlendModeCode> = {
	normal: 'N',
	multiply: 'M',
	screen: 'S',
	overlay: 'O',
	darken: 'D',
	lighten: 'L',
	'color-dodge': 'CD',
	'color-burn': 'CB',
	'hard-light': 'HL',
	'soft-light': 'SL',
	difference: 'DF',
	exclusion: 'EX'
}

const ARROW_TYPE_MAP: Record<Stored.ArrowTypeCode, Runtime.ArrowType> = {
	N: 'none',
	A: 'arrow',
	T: 'triangle',
	C: 'circle',
	D: 'diamond',
	B: 'bar'
}

const ARROW_TYPE_REVERSE: Record<Runtime.ArrowType, Stored.ArrowTypeCode> = {
	none: 'N',
	arrow: 'A',
	triangle: 'T',
	circle: 'C',
	diamond: 'D',
	bar: 'B'
}

const ROUTING_MAP: Record<Stored.RoutingCode, Runtime.Routing> = {
	S: 'straight',
	O: 'orthogonal',
	C: 'curved'
}

const ROUTING_REVERSE: Record<Runtime.Routing, Stored.RoutingCode> = {
	straight: 'S',
	orthogonal: 'O',
	curved: 'C'
}

const ANCHOR_MAP: Record<Stored.AnchorPointCode, Runtime.AnchorPointType> = {
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

const ANCHOR_REVERSE: Record<Runtime.AnchorPointType, Stored.AnchorPointCode> = {
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

const TEXT_ALIGN_MAP: Record<string, Runtime.TextStyle['textAlign']> = {
	l: 'left',
	c: 'center',
	r: 'right',
	j: 'justify'
}

const TEXT_ALIGN_REVERSE: Record<string, string> = {
	left: 'l',
	center: 'c',
	right: 'r',
	justify: 'j'
}

const VERT_ALIGN_MAP: Record<string, Runtime.TextStyle['verticalAlign']> = {
	t: 'top',
	m: 'middle',
	b: 'bottom'
}

const VERT_ALIGN_REVERSE: Record<string, string> = {
	top: 't',
	middle: 'm',
	bottom: 'b'
}

const TEXT_DECO_MAP: Record<string, Runtime.TextStyle['textDecoration']> = {
	u: 'underline',
	s: 'line-through'
}

const TEXT_DECO_REVERSE: Record<string, string> = {
	underline: 'u',
	'line-through': 's',
	none: ''
}

// Shape style conversion
// Note: Color fields can be string or PaletteRef in stored format.
// This function only extracts string colors - palette refs should be resolved in style-ops.ts
export function expandShapeStyle(
	stored: Stored.ShapeStyle | undefined
): Runtime.ShapeStyle | undefined {
	if (!stored) return undefined
	const result: Runtime.ShapeStyle = {}

	// Only extract string colors, skip PaletteRefs (they'll be resolved in style-ops)
	if (stored.f !== undefined && typeof stored.f === 'string') result.fill = stored.f
	if (stored.fo !== undefined) result.fillOpacity = stored.fo
	if (stored.s !== undefined && typeof stored.s === 'string') result.stroke = stored.s
	if (stored.sw !== undefined) result.strokeWidth = stored.sw
	if (stored.so !== undefined) result.strokeOpacity = stored.so
	if (stored.sd !== undefined) result.strokeDasharray = stored.sd
	if (stored.sc !== undefined) result.strokeLinecap = stored.sc
	if (stored.sj !== undefined) result.strokeLinejoin = stored.sj
	if (stored.sh !== undefined) {
		const shadowColor = stored.sh[3]
		result.shadow = {
			offsetX: stored.sh[0],
			offsetY: stored.sh[1],
			blur: stored.sh[2],
			color: typeof shadowColor === 'string' ? shadowColor : '#000000'
		}
	}

	return result
}

export function compactShapeStyle(
	runtime: Runtime.ShapeStyle | undefined
): Stored.ShapeStyle | undefined {
	if (!runtime) return undefined
	const result: Stored.ShapeStyle = {}

	if (runtime.fill !== undefined) result.f = runtime.fill
	if (runtime.fillOpacity !== undefined) result.fo = runtime.fillOpacity
	if (runtime.stroke !== undefined) result.s = runtime.stroke
	if (runtime.strokeWidth !== undefined) result.sw = runtime.strokeWidth
	if (runtime.strokeOpacity !== undefined) result.so = runtime.strokeOpacity
	if (runtime.strokeDasharray !== undefined) result.sd = runtime.strokeDasharray
	if (runtime.strokeLinecap !== undefined) result.sc = runtime.strokeLinecap
	if (runtime.strokeLinejoin !== undefined) result.sj = runtime.strokeLinejoin
	if (runtime.shadow !== undefined) {
		result.sh = [
			runtime.shadow.offsetX,
			runtime.shadow.offsetY,
			runtime.shadow.blur,
			runtime.shadow.color
		]
	}

	return Object.keys(result).length > 0 ? result : undefined
}

// Text style conversion
// Note: Color field (fc) can be string or PaletteRef in stored format.
// This function only extracts string colors - palette refs should be resolved in style-ops.ts
export function expandTextStyle(
	stored: Stored.TextStyle | undefined
): Runtime.TextStyle | undefined {
	if (!stored) return undefined
	const result: Runtime.TextStyle = {}

	if (stored.ff !== undefined) result.fontFamily = stored.ff
	if (stored.fs !== undefined) result.fontSize = stored.fs
	if (stored.fw !== undefined) result.fontWeight = stored.fw
	if (stored.fi !== undefined) result.fontItalic = stored.fi
	if (stored.td !== undefined) result.textDecoration = TEXT_DECO_MAP[stored.td]
	// Only extract string colors, skip PaletteRefs
	if (stored.fc !== undefined && typeof stored.fc === 'string') result.fill = stored.fc
	if (stored.ta !== undefined) result.textAlign = TEXT_ALIGN_MAP[stored.ta]
	if (stored.va !== undefined) result.verticalAlign = VERT_ALIGN_MAP[stored.va]
	if (stored.lh !== undefined) result.lineHeight = stored.lh
	if (stored.ls !== undefined) result.letterSpacing = stored.ls
	if (stored.lb !== undefined) result.listBullet = stored.lb

	return result
}

export function compactTextStyle(
	runtime: Runtime.TextStyle | undefined
): Stored.TextStyle | undefined {
	if (!runtime) return undefined
	const result: Stored.TextStyle = {}

	if (runtime.fontFamily !== undefined) result.ff = runtime.fontFamily
	if (runtime.fontSize !== undefined) result.fs = runtime.fontSize
	if (runtime.fontWeight !== undefined) result.fw = runtime.fontWeight
	if (runtime.fontItalic !== undefined) result.fi = runtime.fontItalic
	if (runtime.textDecoration !== undefined && runtime.textDecoration !== 'none') {
		result.td = TEXT_DECO_REVERSE[runtime.textDecoration] as 'u' | 's'
	}
	if (runtime.fill !== undefined) result.fc = runtime.fill
	if (runtime.textAlign !== undefined)
		result.ta = TEXT_ALIGN_REVERSE[runtime.textAlign] as 'l' | 'c' | 'r' | 'j'
	if (runtime.verticalAlign !== undefined)
		result.va = VERT_ALIGN_REVERSE[runtime.verticalAlign] as 't' | 'm' | 'b'
	if (runtime.lineHeight !== undefined) result.lh = runtime.lineHeight
	if (runtime.letterSpacing !== undefined) result.ls = runtime.letterSpacing
	if (runtime.listBullet !== undefined) result.lb = runtime.listBullet

	return Object.keys(result).length > 0 ? result : undefined
}

// Arrow style conversion
export function expandArrowStyle(
	stored: Stored.ArrowDef | undefined
): Runtime.ArrowStyle | undefined {
	if (!stored) return undefined
	return {
		type: ARROW_TYPE_MAP[stored[0]],
		size: stored[1],
		filled: stored[2]
	}
}

export function compactArrowStyle(
	runtime: Runtime.ArrowStyle | undefined
): Stored.ArrowDef | undefined {
	if (!runtime || runtime.type === 'none') return undefined
	const result: Stored.ArrowDef = [ARROW_TYPE_REVERSE[runtime.type]]
	if (runtime.size !== undefined) result[1] = runtime.size
	if (runtime.filled !== undefined) result[2] = runtime.filled
	return result
}

// Anchor point conversion
export function expandAnchorPoint(
	stored: Stored.AnchorPoint | undefined
): Runtime.AnchorPoint | undefined {
	if (!stored) return undefined
	if (Array.isArray(stored)) {
		return { x: stored[0], y: stored[1] }
	}
	return ANCHOR_MAP[stored]
}

export function compactAnchorPoint(
	runtime: Runtime.AnchorPoint | undefined
): Stored.AnchorPoint | undefined {
	if (!runtime) return undefined
	if (typeof runtime === 'object' && 'x' in runtime) {
		return [runtime.x, runtime.y]
	}
	return ANCHOR_REVERSE[runtime as Runtime.AnchorPointType]
}

// Object conversion
export function expandObject(id: string, stored: Stored.StoredObject): Runtime.PrezilloObject {
	const base: Partial<Runtime.PrezilloObjectBase> = {
		id: toObjectId(id),
		type: OBJECT_TYPE_MAP[stored.t],
		parentId: stored.p ? toContainerId(stored.p) : undefined,
		pageId: stored.vi ? toViewId(stored.vi) : undefined,
		prototypeId: stored.proto ? toObjectId(stored.proto) : undefined,
		x: stored.xy[0],
		y: stored.xy[1],
		width: stored.wh[0],
		height: stored.wh[1],
		rotation: stored.r ?? 0,
		pivotX: stored.pv?.[0] ?? 0.5,
		pivotY: stored.pv?.[1] ?? 0.5,
		opacity: stored.o ?? 1,
		visible: stored.v !== false,
		locked: stored.k === true,
		hidden: stored.hid === true,
		name: stored.n,
		shapeStyleId: stored.si ? toStyleId(stored.si) : undefined,
		textStyleId: stored.ti ? toStyleId(stored.ti) : undefined,
		style: expandShapeStyle(stored.s),
		textStyle: expandTextStyle(stored.ts)
	}

	switch (stored.t) {
		case 'R':
			return {
				...base,
				type: 'rect',
				cornerRadius: stored.cr
			} as Runtime.RectObject

		case 'E':
			return {
				...base,
				type: 'ellipse'
			} as Runtime.EllipseObject

		case 'L':
			return {
				...base,
				type: 'line',
				points: (stored as Stored.StoredLine).pts,
				startArrow: expandArrowStyle((stored as Stored.StoredLine).sa),
				endArrow: expandArrowStyle((stored as Stored.StoredLine).ea)
			} as Runtime.LineObject

		case 'P':
			return {
				...base,
				type: 'path',
				pathData: (stored as Stored.StoredPath).d
			} as Runtime.PathObject

		case 'G':
			return {
				...base,
				type: 'polygon',
				points: (stored as Stored.StoredPolygon).pts,
				closed: (stored as Stored.StoredPolygon).cl
			} as Runtime.PolygonObject

		case 'T':
			return {
				...base,
				type: 'text',
				text: (stored as Stored.StoredText).tx,
				minHeight: (stored as Stored.StoredText).mh
			} as Runtime.TextObject

		case 'B':
			return {
				...base,
				type: 'textbox',
				textContentId: toRichTextId((stored as Stored.StoredTextbox).tid),
				padding: (stored as Stored.StoredTextbox).pd,
				background: (stored as Stored.StoredTextbox).bg,
				border: expandShapeStyle((stored as Stored.StoredTextbox).bd)
			} as Runtime.TextboxObject

		case 'I':
			return {
				...base,
				type: 'image',
				fileId: (stored as Stored.StoredImage).fid
			} as Runtime.ImageObject

		case 'M':
			return {
				...base,
				type: 'embed',
				embedType: (stored as Stored.StoredEmbed).mt,
				src: (stored as Stored.StoredEmbed).src
			} as Runtime.EmbedObject

		case 'C':
			const conn = stored as Stored.StoredConnector
			return {
				...base,
				type: 'connector',
				startObjectId: conn.so_ ? toObjectId(conn.so_) : undefined,
				startAnchor: expandAnchorPoint(conn.sa),
				endObjectId: conn.eo ? toObjectId(conn.eo) : undefined,
				endAnchor: expandAnchorPoint(conn.ea),
				waypoints: conn.wp,
				routing: conn.rt ? ROUTING_MAP[conn.rt] : undefined,
				startArrow: expandArrowStyle(conn.sar),
				endArrow: expandArrowStyle(conn.ear)
			} as Runtime.ConnectorObject

		case 'Q':
			const qr = stored as Stored.StoredQrCode
			return {
				...base,
				type: 'qrcode',
				url: qr.url,
				errorCorrection: qr.ecl ? QR_ERROR_CORRECTION_MAP[qr.ecl] : 'medium',
				foreground: qr.fg ?? '#000000',
				background: qr.bg ?? '#ffffff'
			} as Runtime.QrCodeObject

		case 'F':
			const pf = stored as Stored.StoredPollFrame
			return {
				...base,
				type: 'pollframe',
				shape: pf.sh ? POLL_SHAPE_MAP[pf.sh] : 'rect',
				label: pf.lb
			} as Runtime.PollFrameObject

		default:
			throw new Error(`Unknown object type: ${(stored as any).t}`)
	}
}

export function compactObject(runtime: Runtime.PrezilloObject): Stored.StoredObject {
	const base: Partial<Stored.StoredObjectBase> = {
		t: OBJECT_TYPE_REVERSE[runtime.type],
		xy: [runtime.x, runtime.y],
		wh: [runtime.width, runtime.height]
	}

	// Only include non-default values
	if (runtime.parentId) base.p = runtime.parentId
	if (runtime.pageId) base.vi = runtime.pageId
	if (runtime.prototypeId) base.proto = runtime.prototypeId
	if (runtime.rotation) base.r = runtime.rotation
	// Only store pivot if not center (default is 0.5, 0.5)
	if (runtime.pivotX !== 0.5 || runtime.pivotY !== 0.5) {
		base.pv = [runtime.pivotX, runtime.pivotY]
	}
	if (runtime.opacity !== 1) base.o = runtime.opacity
	if (!runtime.visible) base.v = false
	if (runtime.locked) base.k = true
	if (runtime.hidden) base.hid = true
	if (runtime.name) base.n = runtime.name
	if (runtime.shapeStyleId) base.si = runtime.shapeStyleId
	if (runtime.textStyleId) base.ti = runtime.textStyleId
	if (runtime.style) base.s = compactShapeStyle(runtime.style)
	if (runtime.textStyle) base.ts = compactTextStyle(runtime.textStyle)

	switch (runtime.type) {
		case 'rect':
			const rect = runtime as Runtime.RectObject
			return {
				...base,
				t: 'R',
				cr: rect.cornerRadius
			} as Stored.StoredRect

		case 'ellipse':
			return {
				...base,
				t: 'E'
			} as Stored.StoredEllipse

		case 'line':
			const line = runtime as Runtime.LineObject
			return {
				...base,
				t: 'L',
				pts: line.points,
				sa: compactArrowStyle(line.startArrow),
				ea: compactArrowStyle(line.endArrow)
			} as Stored.StoredLine

		case 'path':
			return {
				...base,
				t: 'P',
				d: (runtime as Runtime.PathObject).pathData
			} as Stored.StoredPath

		case 'polygon':
			const poly = runtime as Runtime.PolygonObject
			return {
				...base,
				t: 'G',
				pts: poly.points,
				cl: poly.closed
			} as Stored.StoredPolygon

		case 'text':
			const textObj = runtime as Runtime.TextObject
			return {
				...base,
				t: 'T',
				tx: textObj.text,
				mh: textObj.minHeight
			} as Stored.StoredText

		case 'textbox':
			const textbox = runtime as Runtime.TextboxObject
			return {
				...base,
				t: 'B',
				tid: textbox.textContentId,
				pd: textbox.padding,
				bg: textbox.background,
				bd: compactShapeStyle(textbox.border)
			} as Stored.StoredTextbox

		case 'image':
			const img = runtime as Runtime.ImageObject
			return {
				...base,
				t: 'I',
				fid: img.fileId
			} as Stored.StoredImage

		case 'embed':
			const embed = runtime as Runtime.EmbedObject
			return {
				...base,
				t: 'M',
				mt: embed.embedType,
				src: embed.src
			} as Stored.StoredEmbed

		case 'connector':
			const conn = runtime as Runtime.ConnectorObject
			return {
				...base,
				t: 'C',
				so_: conn.startObjectId,
				sa: compactAnchorPoint(conn.startAnchor),
				eo: conn.endObjectId,
				ea: compactAnchorPoint(conn.endAnchor),
				wp: conn.waypoints,
				rt: conn.routing ? ROUTING_REVERSE[conn.routing] : undefined,
				sar: compactArrowStyle(conn.startArrow),
				ear: compactArrowStyle(conn.endArrow)
			} as Stored.StoredConnector

		case 'qrcode':
			const qrObj = runtime as Runtime.QrCodeObject
			return {
				...base,
				t: 'Q',
				url: qrObj.url,
				ecl:
					qrObj.errorCorrection && qrObj.errorCorrection !== 'medium'
						? QR_ERROR_CORRECTION_REVERSE[qrObj.errorCorrection]
						: undefined,
				fg:
					qrObj.foreground && qrObj.foreground !== '#000000'
						? qrObj.foreground
						: undefined,
				bg:
					qrObj.background && qrObj.background !== '#ffffff'
						? qrObj.background
						: undefined
			} as Stored.StoredQrCode

		case 'pollframe':
			const pfObj = runtime as Runtime.PollFrameObject
			return {
				...base,
				t: 'F',
				sh:
					pfObj.shape && pfObj.shape !== 'rect'
						? POLL_SHAPE_REVERSE[pfObj.shape]
						: undefined,
				lb: pfObj.label || undefined
			} as Stored.StoredPollFrame

		default:
			throw new Error(`Unknown object type: ${(runtime as any).type}`)
	}
}

// Container conversion
export function expandContainer(id: string, stored: Stored.StoredContainer): Runtime.ContainerNode {
	return {
		id: toContainerId(id),
		type: CONTAINER_TYPE_MAP[stored.t],
		parentId: stored.p ? toContainerId(stored.p) : undefined,
		name: stored.n,
		x: stored.xy[0],
		y: stored.xy[1],
		rotation: stored.r ?? 0,
		scaleX: stored.sc?.[0] ?? 1,
		scaleY: stored.sc?.[1] ?? 1,
		opacity: stored.o ?? 1,
		blendMode: stored.bm ? BLEND_MODE_MAP[stored.bm] : 'normal',
		visible: stored.v !== false,
		locked: stored.k === true,
		expanded: stored.x ?? false
	}
}

export function compactContainer(runtime: Runtime.ContainerNode): Stored.StoredContainer {
	const result: Stored.StoredContainer = {
		t: CONTAINER_TYPE_REVERSE[runtime.type],
		xy: [runtime.x, runtime.y]
	}

	if (runtime.parentId) result.p = runtime.parentId
	if (runtime.name) result.n = runtime.name
	if (runtime.rotation) result.r = runtime.rotation
	if (runtime.scaleX !== 1 || runtime.scaleY !== 1) {
		result.sc = [runtime.scaleX, runtime.scaleY]
	}
	if (runtime.opacity !== 1) result.o = runtime.opacity
	if (runtime.blendMode !== 'normal') result.bm = BLEND_MODE_REVERSE[runtime.blendMode]
	if (!runtime.visible) result.v = false
	if (runtime.locked) result.k = true
	if (runtime.expanded) result.x = runtime.expanded

	return result
}

// Background gradient conversion
export function expandBackgroundGradient(
	stored: Stored.StoredBackgroundGradient | undefined
): Gradient | undefined {
	if (!stored) return undefined

	// Determine type from gt field
	const type = stored.gt === 'l' ? 'linear' : stored.gt === 'r' ? 'radial' : 'solid'

	const gradient: Gradient = { type }

	if (type === 'linear') {
		gradient.angle = stored.ga ?? 180
		gradient.stops = stored.gs?.map(([color, position]) => ({ color, position })) ?? []
	} else if (type === 'radial') {
		gradient.centerX = stored.gx ?? 0.5
		gradient.centerY = stored.gy ?? 0.5
		gradient.stops = stored.gs?.map(([color, position]) => ({ color, position })) ?? []
	}

	return gradient
}

export function compactBackgroundGradient(
	runtime: Gradient | undefined
): Stored.StoredBackgroundGradient | undefined {
	if (!runtime) return undefined

	// Solid color doesn't need gradient storage
	if (runtime.type === 'solid') {
		return undefined
	}

	const compact: Stored.StoredBackgroundGradient = {
		gt: runtime.type === 'linear' ? 'l' : 'r'
	}

	if (runtime.type === 'linear') {
		if (runtime.angle !== undefined && runtime.angle !== 180) {
			compact.ga = runtime.angle
		}
	} else if (runtime.type === 'radial') {
		if (runtime.centerX !== undefined && runtime.centerX !== 0.5) {
			compact.gx = runtime.centerX
		}
		if (runtime.centerY !== undefined && runtime.centerY !== 0.5) {
			compact.gy = runtime.centerY
		}
	}

	if (runtime.stops && runtime.stops.length > 0) {
		compact.gs = runtime.stops.map((s) => [s.color, s.position])
	}

	return compact
}

// View conversion
export function expandView(id: string, stored: Stored.StoredView): Runtime.ViewNode {
	return {
		id: toViewId(id),
		name: stored.name,
		x: stored.x,
		y: stored.y,
		width: stored.width,
		height: stored.height,
		backgroundColor: stored.backgroundColor,
		backgroundGradient: expandBackgroundGradient(stored.backgroundGradient),
		backgroundImage: stored.backgroundImage,
		backgroundFit: stored.backgroundFit,
		showBorder: stored.showBorder,
		transition: stored.transition,
		notes: stored.notes,
		hidden: stored.hidden,
		duration: stored.duration
	}
}

export function compactView(runtime: Runtime.ViewNode): Stored.StoredView {
	const result: Stored.StoredView = {
		name: runtime.name,
		x: runtime.x,
		y: runtime.y,
		width: runtime.width,
		height: runtime.height
	}

	if (runtime.backgroundColor) result.backgroundColor = runtime.backgroundColor
	const compactGradient = compactBackgroundGradient(runtime.backgroundGradient)
	if (compactGradient) result.backgroundGradient = compactGradient
	if (runtime.backgroundImage) result.backgroundImage = runtime.backgroundImage
	if (runtime.backgroundFit) result.backgroundFit = runtime.backgroundFit
	if (runtime.showBorder !== undefined) result.showBorder = runtime.showBorder
	if (runtime.transition) result.transition = runtime.transition
	if (runtime.notes) result.notes = runtime.notes
	if (runtime.hidden) result.hidden = runtime.hidden
	if (runtime.duration) result.duration = runtime.duration

	return result
}

// ============================================================================
// Palette Converters
// ============================================================================

// Palette slot mapping (compact to expanded)
const PALETTE_SLOT_MAP: Record<Stored.PaletteSlot, Runtime.PaletteSlotName> = {
	bg: 'background',
	tx: 'text',
	a1: 'accent1',
	a2: 'accent2',
	a3: 'accent3',
	a4: 'accent4',
	a5: 'accent5',
	a6: 'accent6',
	g1: 'gradient1',
	g2: 'gradient2',
	g3: 'gradient3',
	g4: 'gradient4'
}

const PALETTE_SLOT_REVERSE: Record<Runtime.PaletteSlotName, Stored.PaletteSlot> = {
	background: 'bg',
	text: 'tx',
	accent1: 'a1',
	accent2: 'a2',
	accent3: 'a3',
	accent4: 'a4',
	accent5: 'a5',
	accent6: 'a6',
	gradient1: 'g1',
	gradient2: 'g2',
	gradient3: 'g3',
	gradient4: 'g4'
}

/**
 * Type guard to check if a color value is a palette reference
 * Accepts unknown for flexibility in checking arbitrary values
 */
export function isPaletteRef(value: unknown): value is Stored.StoredPaletteRef {
	return typeof value === 'object' && value !== null && 'pi' in value
}

/**
 * Expand a stored palette reference to runtime format
 */
export function expandPaletteRef(stored: Stored.StoredPaletteRef): Runtime.PaletteRef {
	return {
		slotId: PALETTE_SLOT_MAP[stored.pi],
		opacity: stored.o,
		tint: stored.t
	}
}

/**
 * Compact a runtime palette reference to stored format
 */
export function compactPaletteRef(runtime: Runtime.PaletteRef): Stored.StoredPaletteRef {
	const result: Stored.StoredPaletteRef = {
		pi: PALETTE_SLOT_REVERSE[runtime.slotId]
	}
	if (runtime.opacity !== undefined && runtime.opacity !== 1) {
		result.o = runtime.opacity
	}
	if (runtime.tint !== undefined && runtime.tint !== 0) {
		result.t = runtime.tint
	}
	return result
}

/**
 * Expand a color value (string or palette ref) to string or PaletteRef
 */
export function expandColorValue(
	value: Stored.ColorValue | undefined
): string | Runtime.PaletteRef | undefined {
	if (value === undefined) return undefined
	if (typeof value === 'string') return value
	return expandPaletteRef(value)
}

/**
 * Compact a color value (string or PaletteRef) to stored format
 */
export function compactColorValue(
	value: string | Runtime.PaletteRef | undefined
): Stored.ColorValue | undefined {
	if (value === undefined) return undefined
	if (typeof value === 'string') return value
	return compactPaletteRef(value)
}

/**
 * Expand a stored palette to runtime format
 */
export function expandPalette(stored: Stored.StoredPalette): Runtime.Palette {
	const palette: Runtime.Palette = { name: stored.n }

	// Color slots
	if (stored.bg) palette.background = { color: stored.bg.c }
	if (stored.tx) palette.text = { color: stored.tx.c }
	if (stored.a1) palette.accent1 = { color: stored.a1.c }
	if (stored.a2) palette.accent2 = { color: stored.a2.c }
	if (stored.a3) palette.accent3 = { color: stored.a3.c }
	if (stored.a4) palette.accent4 = { color: stored.a4.c }
	if (stored.a5) palette.accent5 = { color: stored.a5.c }
	if (stored.a6) palette.accent6 = { color: stored.a6.c }

	// Gradient slots
	if (stored.g1) palette.gradient1 = expandBackgroundGradient(stored.g1)
	if (stored.g2) palette.gradient2 = expandBackgroundGradient(stored.g2)
	if (stored.g3) palette.gradient3 = expandBackgroundGradient(stored.g3)
	if (stored.g4) palette.gradient4 = expandBackgroundGradient(stored.g4)

	return palette
}

/**
 * Compact a runtime palette to stored format
 */
export function compactPalette(runtime: Runtime.Palette): Stored.StoredPalette {
	const stored: Stored.StoredPalette = { n: runtime.name }

	// Color slots
	if (runtime.background) stored.bg = { c: runtime.background.color }
	if (runtime.text) stored.tx = { c: runtime.text.color }
	if (runtime.accent1) stored.a1 = { c: runtime.accent1.color }
	if (runtime.accent2) stored.a2 = { c: runtime.accent2.color }
	if (runtime.accent3) stored.a3 = { c: runtime.accent3.color }
	if (runtime.accent4) stored.a4 = { c: runtime.accent4.color }
	if (runtime.accent5) stored.a5 = { c: runtime.accent5.color }
	if (runtime.accent6) stored.a6 = { c: runtime.accent6.color }

	// Gradient slots
	if (runtime.gradient1) {
		stored.g1 = compactBackgroundGradient(runtime.gradient1) as Stored.StoredBackgroundGradient
	}
	if (runtime.gradient2) {
		stored.g2 = compactBackgroundGradient(runtime.gradient2) as Stored.StoredBackgroundGradient
	}
	if (runtime.gradient3) {
		stored.g3 = compactBackgroundGradient(runtime.gradient3) as Stored.StoredBackgroundGradient
	}
	if (runtime.gradient4) {
		stored.g4 = compactBackgroundGradient(runtime.gradient4) as Stored.StoredBackgroundGradient
	}

	return stored
}

// Child reference conversion
export function expandChildRef(stored: Stored.ChildRef): Runtime.ChildRef {
	return {
		type: stored[0] === 0 ? 'object' : 'container',
		id: stored[0] === 0 ? toObjectId(stored[1]) : toContainerId(stored[1])
	}
}

export function compactChildRef(runtime: Runtime.ChildRef): Stored.ChildRef {
	return [runtime.type === 'object' ? 0 : 1, runtime.id]
}

// vim: ts=4
