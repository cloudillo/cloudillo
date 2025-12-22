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
	ObjectTypeCode,
	StrokeStyleCode
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
	S: 'sticky'
}

const TYPE_TO_TYPE_CODE: Record<ObjectType, ObjectTypeCode> = {
	freehand: 'F',
	rect: 'R',
	ellipse: 'E',
	line: 'L',
	arrow: 'A',
	text: 'T',
	polygon: 'P',
	sticky: 'S'
}

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
 */
export function expandObject(id: ObjectId, stored: StoredObject): IdealloObject {
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
			const points: [number, number][] = []
			for (let i = 0; i < fh.pts.length; i += 2) {
				points.push([fh.pts[i], fh.pts[i + 1]])
			}
			return {
				...base,
				type: 'freehand',
				points
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
			return {
				...base,
				type: 'text',
				width: text.wh[0],
				height: text.wh[1],
				text: text.txt,
				fontFamily: text.ff,
				fontSize: text.fz
			} as TextObject
		}
		case 'P': {
			const polygon = stored as StoredPolygon
			const vertices: [number, number][] = []
			for (let i = 0; i < polygon.vts.length; i += 2) {
				vertices.push([polygon.vts[i], polygon.vts[i + 1]])
			}
			return {
				...base,
				type: 'polygon',
				vertices
			} as PolygonObject
		}
		case 'S': {
			const sticky = stored as StoredSticky
			return {
				...base,
				type: 'sticky',
				width: sticky.wh[0],
				height: sticky.wh[1],
				text: sticky.txt
			} as StickyObject
		}
		default:
			throw new Error(`Unknown object type: ${(stored as any).t}`)
	}
}

/**
 * Compact a runtime object to stored format
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
			const pts: number[] = []
			for (const [x, y] of fh.points) {
				pts.push(x, y)
			}
			return {
				...baseStored,
				t: 'F',
				pts
			} as StoredFreehand
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
				wh: [text.width, text.height],
				txt: text.text
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
			const vts: number[] = []
			for (const [x, y] of polygon.vertices) {
				vts.push(x, y)
			}
			return {
				...baseStored,
				t: 'P',
				vts
			} as StoredPolygon
		}
		case 'sticky': {
			const sticky = obj as StickyObject
			return {
				...baseStored,
				t: 'S',
				wh: [sticky.width, sticky.height],
				txt: sticky.text
			} as StoredSticky
		}
		default:
			throw new Error(`Unknown object type: ${(obj as any).type}`)
	}
}

// vim: ts=4
