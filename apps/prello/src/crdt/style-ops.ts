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
 * Style system operations and resolution
 */

import * as Y from 'yjs'
import type { YPrelloDocument, StoredStyle, StoredObject, ShapeStyle, TextStyle } from './stored-types'
import type { StyleId, ObjectId } from './ids'
import { generateStyleId, toStyleId } from './ids'
import type {
	ResolvedShapeStyle,
	ResolvedTextStyle,
	StyleDefinition,
	PrelloObject
} from './runtime-types'
import { expandObject, expandShapeStyle, expandTextStyle } from './type-converters'

// Default styles
export const DEFAULT_SHAPE_STYLE: ResolvedShapeStyle = {
	fill: '#e0e0e0',
	fillOpacity: 1,
	stroke: '#999999',
	strokeWidth: 1,
	strokeOpacity: 1,
	strokeDasharray: '',
	strokeLinecap: 'butt',
	strokeLinejoin: 'miter'
}

export const DEFAULT_TEXT_STYLE: ResolvedTextStyle = {
	fontFamily: 'system-ui, sans-serif',
	fontSize: 16,
	fontWeight: 'normal',
	fontItalic: false,
	textDecoration: 'none',
	fill: '#333333',
	textAlign: 'left',
	verticalAlign: 'top',
	lineHeight: 1.2,
	letterSpacing: 0
}

/**
 * Create a new style definition
 */
export function createStyle(
	yDoc: Y.Doc,
	doc: YPrelloDocument,
	name: string,
	type: 'shape' | 'text',
	properties: Partial<ShapeStyle | TextStyle>,
	parentId?: StyleId
): StyleId {
	const styleId = generateStyleId()

	yDoc.transact(() => {
		const style: StoredStyle = {
			n: name,
			t: type === 'shape' ? 'S' : 'T'
		}

		if (parentId) {
			style.p = parentId
		}

		// Merge in properties
		if (type === 'shape') {
			const props = properties as Partial<ShapeStyle>
			if (props.f !== undefined) style.f = props.f
			if (props.fo !== undefined) style.fo = props.fo
			if (props.s !== undefined) style.s = props.s
			if (props.sw !== undefined) style.sw = props.sw
			if (props.so !== undefined) style.so = props.so
			if (props.sd !== undefined) style.sd = props.sd
			if (props.sc !== undefined) style.sc = props.sc
			if (props.sj !== undefined) style.sj = props.sj
			if (props.sh !== undefined) style.sh = props.sh
		} else {
			const props = properties as Partial<TextStyle>
			if (props.ff !== undefined) style.ff = props.ff
			if (props.fs !== undefined) style.fs = props.fs
			if (props.fw !== undefined) style.fw = props.fw
			if (props.fi !== undefined) style.fi = props.fi
			if (props.td !== undefined) style.td = props.td
			if (props.fc !== undefined) style.fc = props.fc
			if (props.ta !== undefined) style.ta = props.ta
			if (props.va !== undefined) style.va = props.va
			if (props.lh !== undefined) style.lh = props.lh
			if (props.ls !== undefined) style.ls = props.ls
		}

		doc.st.set(styleId, style)
	})

	return styleId
}

/**
 * Get a style by ID
 */
export function getStyle(
	doc: YPrelloDocument,
	styleId: StyleId
): StoredStyle | undefined {
	return doc.st.get(styleId)
}

/**
 * Get all styles
 */
export function getAllStyles(
	doc: YPrelloDocument,
	type?: 'shape' | 'text'
): Array<{ id: StyleId; style: StoredStyle }> {
	const styles: Array<{ id: StyleId; style: StoredStyle }> = []

	doc.st.forEach((style, id) => {
		if (!type || (type === 'shape' && style.t === 'S') || (type === 'text' && style.t === 'T')) {
			styles.push({ id: toStyleId(id), style })
		}
	})

	return styles
}

/**
 * Update a style definition
 */
export function updateStyle(
	yDoc: Y.Doc,
	doc: YPrelloDocument,
	styleId: StyleId,
	updates: Partial<StoredStyle>
): void {
	const existing = doc.st.get(styleId)
	if (!existing) return

	yDoc.transact(() => {
		doc.st.set(styleId, { ...existing, ...updates })
	})
}

/**
 * Delete a style
 */
export function deleteStyle(
	yDoc: Y.Doc,
	doc: YPrelloDocument,
	styleId: StyleId
): void {
	yDoc.transact(() => {
		// Remove style references from objects that use it
		doc.o.forEach((obj, id) => {
			let updated = false
			const newObj = { ...obj }

			if (obj.si === styleId) {
				delete newObj.si
				updated = true
			}
			if (obj.ti === styleId) {
				delete newObj.ti
				updated = true
			}

			if (updated) {
				doc.o.set(id, newObj)
			}
		})

		// Remove parent references from child styles
		doc.st.forEach((style, id) => {
			if (style.p === styleId) {
				const newStyle = { ...style }
				delete newStyle.p
				doc.st.set(id, newStyle)
			}
		})

		doc.st.delete(styleId)
	})
}

/**
 * Get style inheritance chain (base first, derived last)
 */
export function getStyleChain(
	doc: YPrelloDocument,
	styleId: StyleId
): StoredStyle[] {
	const chain: StoredStyle[] = []
	let currentId: string | undefined = styleId
	const visited = new Set<string>()  // Prevent cycles

	while (currentId && !visited.has(currentId)) {
		visited.add(currentId)
		const style = doc.st.get(currentId)
		if (style) {
			chain.unshift(style)  // Add to front (base first)
			currentId = style.p   // Move to parent
		} else {
			break
		}
	}

	return chain
}

/**
 * Resolve full shape style for an object
 */
export function resolveShapeStyle(
	doc: YPrelloDocument,
	object: StoredObject
): ResolvedShapeStyle {
	// Start with defaults
	let result = { ...DEFAULT_SHAPE_STYLE }

	// Apply referenced style (with inheritance chain)
	if (object.si) {
		const styleChain = getStyleChain(doc, toStyleId(object.si))
		for (const style of styleChain) {
			result = mergeShapeStyle(result, style)
		}
	}

	// Apply inline style (if no reference)
	if (object.s && !object.si) {
		result = mergeShapeStyle(result, object.s)
	}

	// Apply overrides (if reference exists)
	if (object.so) {
		result = mergeShapeStyle(result, object.so)
	}

	return result
}

/**
 * Resolve full text style for an object
 */
export function resolveTextStyle(
	doc: YPrelloDocument,
	object: StoredObject
): ResolvedTextStyle {
	// Start with defaults
	let result = { ...DEFAULT_TEXT_STYLE }

	// Apply referenced style (with inheritance chain)
	if (object.ti) {
		const styleChain = getStyleChain(doc, toStyleId(object.ti))
		for (const style of styleChain) {
			result = mergeTextStyle(result, style)
		}
	}

	// Apply inline style (if no reference)
	if (object.ts && !object.ti) {
		result = mergeTextStyleFromStored(result, object.ts)
	}

	// Apply overrides (if reference exists)
	if (object.to) {
		result = mergeTextStyleFromStored(result, object.to)
	}

	return result
}

/**
 * Merge shape style properties
 */
function mergeShapeStyle(
	base: ResolvedShapeStyle,
	override: Partial<StoredStyle | ShapeStyle>
): ResolvedShapeStyle {
	return {
		fill: override.f ?? base.fill,
		fillOpacity: override.fo ?? base.fillOpacity,
		stroke: override.s ?? base.stroke,
		strokeWidth: override.sw ?? base.strokeWidth,
		strokeOpacity: override.so ?? base.strokeOpacity,
		strokeDasharray: override.sd ?? base.strokeDasharray,
		strokeLinecap: override.sc ?? base.strokeLinecap,
		strokeLinejoin: override.sj ?? base.strokeLinejoin,
		shadow: override.sh
			? { offsetX: override.sh[0], offsetY: override.sh[1], blur: override.sh[2], color: override.sh[3] }
			: base.shadow
	}
}

/**
 * Merge text style properties from stored style
 */
function mergeTextStyle(
	base: ResolvedTextStyle,
	override: StoredStyle
): ResolvedTextStyle {
	return {
		fontFamily: override.ff ?? base.fontFamily,
		fontSize: override.fs ?? base.fontSize,
		fontWeight: override.fw ?? base.fontWeight,
		fontItalic: override.fi ?? base.fontItalic,
		textDecoration: override.td
			? (override.td === 'u' ? 'underline' : 'line-through')
			: base.textDecoration,
		fill: override.fc ?? base.fill,
		textAlign: override.ta
			? ({ 'l': 'left', 'c': 'center', 'r': 'right', 'j': 'justify' }[override.ta] as any)
			: base.textAlign,
		verticalAlign: override.va
			? ({ 't': 'top', 'm': 'middle', 'b': 'bottom' }[override.va] as any)
			: base.verticalAlign,
		lineHeight: override.lh ?? base.lineHeight,
		letterSpacing: override.ls ?? base.letterSpacing
	}
}

/**
 * Merge text style from stored text style (not full StoredStyle)
 */
function mergeTextStyleFromStored(
	base: ResolvedTextStyle,
	override: TextStyle
): ResolvedTextStyle {
	return {
		fontFamily: override.ff ?? base.fontFamily,
		fontSize: override.fs ?? base.fontSize,
		fontWeight: override.fw ?? base.fontWeight,
		fontItalic: override.fi ?? base.fontItalic,
		textDecoration: override.td
			? (override.td === 'u' ? 'underline' : 'line-through')
			: base.textDecoration,
		fill: override.fc ?? base.fill,
		textAlign: override.ta
			? ({ 'l': 'left', 'c': 'center', 'r': 'right', 'j': 'justify' }[override.ta] as any)
			: base.textAlign,
		verticalAlign: override.va
			? ({ 't': 'top', 'm': 'middle', 'b': 'bottom' }[override.va] as any)
			: base.verticalAlign,
		lineHeight: override.lh ?? base.lineHeight,
		letterSpacing: override.ls ?? base.letterSpacing
	}
}

/**
 * Apply style to objects
 */
export function applyStyleToObjects(
	yDoc: Y.Doc,
	doc: YPrelloDocument,
	objectIds: ObjectId[],
	styleId: StyleId,
	type: 'shape' | 'text' = 'shape'
): void {
	yDoc.transact(() => {
		objectIds.forEach(id => {
			const object = doc.o.get(id)
			if (object) {
				const updated = { ...object }

				if (type === 'shape') {
					updated.si = styleId
					delete updated.so  // Clear overrides
					delete updated.s   // Clear inline style
				} else {
					updated.ti = styleId
					delete updated.to  // Clear overrides
					delete updated.ts  // Clear inline text style
				}

				doc.o.set(id, updated)
			}
		})
	})
}

/**
 * Remove style from objects (convert to inline)
 */
export function detachStyleFromObjects(
	yDoc: Y.Doc,
	doc: YPrelloDocument,
	objectIds: ObjectId[],
	type: 'shape' | 'text' = 'shape'
): void {
	yDoc.transact(() => {
		objectIds.forEach(id => {
			const object = doc.o.get(id)
			if (!object) return

			if (type === 'shape' && object.si) {
				// Resolve full style
				const resolved = resolveShapeStyle(doc, object)
				const updated = { ...object }

				// Convert to inline style
				delete updated.si
				delete updated.so
				updated.s = {
					f: resolved.fill,
					s: resolved.stroke,
					sw: resolved.strokeWidth
				}
				if (resolved.fillOpacity !== 1) updated.s.fo = resolved.fillOpacity
				if (resolved.strokeOpacity !== 1) updated.s.so = resolved.strokeOpacity
				if (resolved.strokeDasharray) updated.s.sd = resolved.strokeDasharray
				if (resolved.strokeLinecap !== 'butt') updated.s.sc = resolved.strokeLinecap
				if (resolved.strokeLinejoin !== 'miter') updated.s.sj = resolved.strokeLinejoin
				if (resolved.shadow) {
					updated.s.sh = [
						resolved.shadow.offsetX,
						resolved.shadow.offsetY,
						resolved.shadow.blur,
						resolved.shadow.color
					]
				}

				doc.o.set(id, updated)
			}

			if (type === 'text' && object.ti) {
				// Resolve full style
				const resolved = resolveTextStyle(doc, object)
				const updated = { ...object }

				// Convert to inline style
				delete updated.ti
				delete updated.to
				updated.ts = {
					ff: resolved.fontFamily,
					fs: resolved.fontSize,
					fc: resolved.fill
				}
				if (resolved.fontWeight !== 'normal') updated.ts.fw = resolved.fontWeight
				if (resolved.fontItalic) updated.ts.fi = resolved.fontItalic
				if (resolved.textDecoration !== 'none') {
					updated.ts.td = resolved.textDecoration === 'underline' ? 'u' : 's'
				}
				if (resolved.textAlign !== 'left') {
					updated.ts.ta = { 'left': 'l', 'center': 'c', 'right': 'r', 'justify': 'j' }[resolved.textAlign] as any
				}
				if (resolved.verticalAlign !== 'top') {
					updated.ts.va = { 'top': 't', 'middle': 'm', 'bottom': 'b' }[resolved.verticalAlign] as any
				}
				if (resolved.lineHeight !== 1.2) updated.ts.lh = resolved.lineHeight
				if (resolved.letterSpacing !== 0) updated.ts.ls = resolved.letterSpacing

				doc.o.set(id, updated)
			}
		})
	})
}

/**
 * Set style override on an object
 */
export function setStyleOverride(
	yDoc: Y.Doc,
	doc: YPrelloDocument,
	objectId: ObjectId,
	type: 'shape' | 'text',
	property: string,
	value: any
): void {
	const object = doc.o.get(objectId)
	if (!object) return

	yDoc.transact(() => {
		const updated = { ...object }

		if (type === 'shape') {
			if (!updated.so) updated.so = {}
			;(updated.so as any)[property] = value
		} else {
			if (!updated.to) updated.to = {}
			;(updated.to as any)[property] = value
		}

		doc.o.set(objectId, updated)
	})
}

/**
 * Clear style overrides on an object
 */
export function clearStyleOverrides(
	yDoc: Y.Doc,
	doc: YPrelloDocument,
	objectId: ObjectId,
	type: 'shape' | 'text'
): void {
	const object = doc.o.get(objectId)
	if (!object) return

	yDoc.transact(() => {
		const updated = { ...object }

		if (type === 'shape') {
			delete updated.so
		} else {
			delete updated.to
		}

		doc.o.set(objectId, updated)
	})
}

/**
 * Create a style variation (child style)
 */
export function createStyleVariation(
	yDoc: Y.Doc,
	doc: YPrelloDocument,
	parentStyleId: StyleId,
	name: string,
	overrides: Partial<StoredStyle>
): StyleId {
	const parent = doc.st.get(parentStyleId)
	if (!parent) {
		throw new Error(`Parent style ${parentStyleId} not found`)
	}

	const styleId = generateStyleId()

	yDoc.transact(() => {
		doc.st.set(styleId, {
			n: name,
			t: parent.t,
			p: parentStyleId,
			...overrides
		})
	})

	return styleId
}

// vim: ts=4
