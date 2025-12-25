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
 * Bidirectional conversion between compact stored types and expanded runtime types
 */

import type { ObjectId } from './ids.js'
import { toObjectId } from './ids.js'
import type {
	StoredObject,
	StoredFreehand,
	StoredRect,
	StoredEllipse,
	StoredLine,
	StoredArrow,
	StoredText,
	StoredPolygon,
	StoredSticky,
	StoredImage,
	ObjectTypeCode,
	StrokeStyleCode,
	YIdealloDocument
} from './stored-types.js'
import type {
	IdealloObject,
	FreehandObject,
	RectObject,
	EllipseObject,
	LineObject,
	ArrowObject,
	TextObject,
	PolygonObject,
	StickyObject,
	ImageObject,
	ObjectType,
	StrokeStyle,
	ArrowheadPosition,
	Style
} from './runtime-types.js'
import { DEFAULT_STYLE } from './runtime-types.js'

// Type code mappings
const TYPE_CODE_TO_TYPE: Record<ObjectTypeCode, ObjectType> = {
	F: 'freehand',
	R: 'rect',
	E: 'ellipse',
	L: 'line',
	A: 'arrow',
	T: 'text',
	P: 'polygon',
	S: 'sticky',
	I: 'image'
}

const TYPE_TO_TYPE_CODE: Record<ObjectType, ObjectTypeCode> = {
	freehand: 'F',
	rect: 'R',
	ellipse: 'E',
	line: 'L',
	arrow: 'A',
	text: 'T',
	polygon: 'P',
	sticky: 'S',
	image: 'I'
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

// Arrowhead mappings
const ARROWHEAD_CODE_TO_POSITION: Record<string, ArrowheadPosition> = {
	S: 'start',
	E: 'end',
	B: 'both'
}

const ARROWHEAD_POSITION_TO_CODE: Record<ArrowheadPosition, 'S' | 'E' | 'B'> = {
	start: 'S',
	end: 'E',
	both: 'B'
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
	const baseStyle: Style = {
		strokeColor: stored.sc ?? DEFAULT_STYLE.strokeColor,
		fillColor: stored.fc ?? DEFAULT_STYLE.fillColor,
		strokeWidth: stored.sw ?? DEFAULT_STYLE.strokeWidth,
		strokeStyle: stored.ss ? STROKE_STYLE_CODE_TO_STYLE[stored.ss] : DEFAULT_STYLE.strokeStyle,
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
		style: baseStyle
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
			return {
				...base,
				type: 'rect',
				width: rect.wh[0],
				height: rect.wh[1],
				cornerRadius: rect.cr
			} as RectObject
		}
		case 'E': {
			const ellipse = stored as StoredEllipse
			return {
				...base,
				type: 'ellipse',
				width: ellipse.wh[0],
				height: ellipse.wh[1]
			} as EllipseObject
		}
		case 'L': {
			const line = stored as StoredLine
			return {
				...base,
				type: 'line',
				startX: line.pts[0][0],
				startY: line.pts[0][1],
				endX: line.pts[1][0],
				endY: line.pts[1][1]
			} as LineObject
		}
		case 'A': {
			const arrow = stored as StoredArrow
			return {
				...base,
				type: 'arrow',
				startX: arrow.pts[0][0],
				startY: arrow.pts[0][1],
				endX: arrow.pts[1][0],
				endY: arrow.pts[1][1],
				arrowheadPosition: arrow.ah ? ARROWHEAD_CODE_TO_POSITION[arrow.ah] : 'end'
			} as ArrowObject
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
				fontFamily: text.ff,
				fontSize: text.fz
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
			return {
				...base,
				type: 'polygon',
				// Only include gid if it's a linked copy (differs from object ID)
				...(polygon.gid ? { gid: toObjectId(polygon.gid) } : {}),
				vertices
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
				text: yText?.toString() ?? ''
			} as StickyObject
		}
		case 'I': {
			const img = stored as StoredImage
			return {
				...base,
				type: 'image',
				width: img.wh[0],
				height: img.wh[1],
				fileId: img.fid
			} as ImageObject
		}
		default:
			throw new Error(`Unknown object type: ${(stored as any).t}`)
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
			const stored: StoredFreehand = {
				...(baseStored as any),
				t: 'F',
				wh: [fh.width, fh.height]
			}
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
			const stored: StoredRect = {
				...(baseStored as any),
				t: 'R',
				wh: [rect.width, rect.height]
			}
			if (rect.cornerRadius !== undefined && rect.cornerRadius > 0) {
				stored.cr = rect.cornerRadius
			}
			return stored
		}
		case 'ellipse': {
			const ellipse = obj as EllipseObject
			return {
				...baseStored,
				t: 'E',
				wh: [ellipse.width, ellipse.height]
			} as StoredEllipse
		}
		case 'line': {
			const line = obj as LineObject
			return {
				...baseStored,
				t: 'L',
				pts: [
					[line.startX, line.startY],
					[line.endX, line.endY]
				]
			} as StoredLine
		}
		case 'arrow': {
			const arrow = obj as ArrowObject
			const stored: StoredArrow = {
				...(baseStored as any),
				t: 'A',
				pts: [
					[arrow.startX, arrow.startY],
					[arrow.endX, arrow.endY]
				]
			}
			if (arrow.arrowheadPosition !== 'end') {
				stored.ah = ARROWHEAD_POSITION_TO_CODE[arrow.arrowheadPosition]
			}
			return stored
		}
		case 'text': {
			const text = obj as TextObject
			const stored: StoredText = {
				...(baseStored as any),
				t: 'T',
				wh: [text.width, text.height]
			}
			// Only store tid if it's a linked copy (explicit tid set)
			if (text.tid) {
				stored.tid = text.tid
			}
			if (text.fontFamily) {
				stored.ff = text.fontFamily
			}
			if (text.fontSize) {
				stored.fz = text.fontSize
			}
			return stored
		}
		case 'polygon': {
			const polygon = obj as PolygonObject
			const stored: StoredPolygon = {
				...(baseStored as any),
				t: 'P'
			}
			// Only store gid if it's a linked copy (explicit gid set)
			if (polygon.gid) {
				stored.gid = polygon.gid
			}
			return stored
		}
		case 'sticky': {
			const sticky = obj as StickyObject
			const stored: StoredSticky = {
				...(baseStored as any),
				t: 'S',
				wh: [sticky.width, sticky.height]
			}
			// Only store tid if it's a linked copy (explicit tid set)
			if (sticky.tid) {
				stored.tid = sticky.tid
			}
			return stored
		}
		case 'image': {
			const img = obj as ImageObject
			return {
				...baseStored,
				t: 'I',
				wh: [img.width, img.height],
				fid: img.fileId
			} as StoredImage
		}
		default:
			throw new Error(`Unknown object type: ${(obj as any).type}`)
	}
}

// vim: ts=4
