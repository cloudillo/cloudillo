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
import type {
	YPrezilloDocument,
	StoredStyle,
	StoredObject,
	ShapeStyle,
	TextStyle,
	StoredPaletteRef
} from './stored-types'
import type { StyleId, ObjectId } from './ids'
import { generateStyleId, toStyleId } from './ids'
import type { ResolvedShapeStyle, ResolvedTextStyle, Palette } from './runtime-types'
import { isPaletteRef, expandPaletteRef } from './type-converters'
import { getPalette, getResolvedColor, resolvePaletteRef } from './palette-ops'
import type { Gradient } from '@cloudillo/canvas-tools'

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
	fontSize: 64,
	fontWeight: 'normal',
	fontItalic: false,
	textDecoration: 'none',
	fill: '#333333',
	textAlign: 'center',
	verticalAlign: 'middle',
	lineHeight: 1.2,
	letterSpacing: 0
}

/**
 * Create a new style definition
 */
export function createStyle(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
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
			if (props.lb !== undefined) style.lb = props.lb
		}

		doc.st.set(styleId, style)
	}, yDoc.clientID)

	return styleId
}

/**
 * Get a style by ID
 */
export function getStyle(doc: YPrezilloDocument, styleId: StyleId): StoredStyle | undefined {
	return doc.st.get(styleId)
}

/**
 * Get all styles
 */
export function getAllStyles(
	doc: YPrezilloDocument,
	type?: 'shape' | 'text'
): Array<{ id: StyleId; style: StoredStyle }> {
	const styles: Array<{ id: StyleId; style: StoredStyle }> = []

	doc.st.forEach((style, id) => {
		if (
			!type ||
			(type === 'shape' && style.t === 'S') ||
			(type === 'text' && style.t === 'T')
		) {
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
	doc: YPrezilloDocument,
	styleId: StyleId,
	updates: Partial<StoredStyle>
): void {
	const existing = doc.st.get(styleId)
	if (!existing) return

	yDoc.transact(() => {
		doc.st.set(styleId, { ...existing, ...updates })
	}, yDoc.clientID)
}

/**
 * Delete a style
 */
export function deleteStyle(yDoc: Y.Doc, doc: YPrezilloDocument, styleId: StyleId): void {
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
	}, yDoc.clientID)
}

/**
 * Get style inheritance chain (base first, derived last)
 */
export function getStyleChain(doc: YPrezilloDocument, styleId: StyleId): StoredStyle[] {
	const chain: StoredStyle[] = []
	let currentId: string | undefined = styleId
	const visited = new Set<string>() // Prevent cycles

	while (currentId && !visited.has(currentId)) {
		visited.add(currentId)
		const style = doc.st.get(currentId)
		if (style) {
			chain.unshift(style) // Add to front (base first)
			currentId = style.p // Move to parent
		} else {
			break
		}
	}

	return chain
}

/**
 * Resolve full shape style for an object
 * Gets the palette from the document to resolve palette color references
 * Handles prototype inheritance for instance objects (1 level)
 *
 * Resolution order:
 * - Non-instance: defaults → si chain → s
 * - Instance: prototype's resolved style → s
 */
export function resolveShapeStyle(
	doc: YPrezilloDocument,
	object: StoredObject
): ResolvedShapeStyle {
	const palette = getPalette(doc)
	let result = { ...DEFAULT_SHAPE_STYLE }

	if (object.proto) {
		// Instance: start with prototype's fully resolved style
		const prototype = doc.o.get(object.proto)
		if (prototype) {
			// Apply prototype's named style chain
			if (prototype.si) {
				const styleChain = getStyleChain(doc, toStyleId(prototype.si))
				for (const style of styleChain) {
					result = mergeShapeStyle(result, style, palette)
				}
			}
			// Apply prototype's inline style (always)
			if (prototype.s) {
				result = mergeShapeStyle(result, prototype.s, palette)
			}
		}
	} else {
		// Non-instance: apply own named style chain
		if (object.si) {
			const styleChain = getStyleChain(doc, toStyleId(object.si))
			for (const style of styleChain) {
				result = mergeShapeStyle(result, style, palette)
			}
		}
	}

	// Apply this object's s (always - works as overrides for both cases)
	if (object.s) {
		result = mergeShapeStyle(result, object.s, palette)
	}

	return result
}

/**
 * Resolve full text style for an object
 * Gets the palette from the document to resolve palette color references
 * Handles prototype inheritance for instance objects (1 level)
 *
 * Resolution order:
 * - Non-instance: defaults → ti chain → ts
 * - Instance: prototype's resolved style → ts
 */
export function resolveTextStyle(doc: YPrezilloDocument, object: StoredObject): ResolvedTextStyle {
	const palette = getPalette(doc)
	let result = { ...DEFAULT_TEXT_STYLE }

	if (object.proto) {
		// Instance: start with prototype's fully resolved style
		const prototype = doc.o.get(object.proto)
		if (prototype) {
			// Apply prototype's named style chain
			if (prototype.ti) {
				const styleChain = getStyleChain(doc, toStyleId(prototype.ti))
				for (const style of styleChain) {
					result = mergeTextStyle(result, style, palette)
				}
			}
			// Apply prototype's inline style (always)
			if (prototype.ts) {
				result = mergeTextStyleFromStored(result, prototype.ts, palette)
			}
		}
	} else {
		// Non-instance: apply own named style chain
		if (object.ti) {
			const styleChain = getStyleChain(doc, toStyleId(object.ti))
			for (const style of styleChain) {
				result = mergeTextStyle(result, style, palette)
			}
		}
	}

	// Apply this object's ts (always - works as overrides for both cases)
	if (object.ts) {
		result = mergeTextStyleFromStored(result, object.ts, palette)
	}

	return result
}

/**
 * Resolve a color value (string or palette ref) to a string color
 * If palette is provided and value is a palette ref, resolves it
 * Otherwise returns the string value or undefined
 */
function resolveColorField(
	value: unknown,
	palette: Palette | undefined,
	defaultColor: string
): string {
	if (typeof value === 'string') {
		return value
	}
	if (palette && isPaletteRef(value)) {
		return getResolvedColor(palette, value as StoredPaletteRef, defaultColor)
	}
	return defaultColor
}

/**
 * Resolve a fill value and extract gradient info if applicable
 * Returns both the color string and optional gradient
 */
function resolveFillField(
	value: unknown,
	palette: Palette | undefined,
	defaultColor: string
): { color: string; gradient?: Gradient } {
	if (typeof value === 'string') {
		return { color: value }
	}
	if (palette && isPaletteRef(value)) {
		const storedRef = value as StoredPaletteRef
		// Expand stored ref to runtime format before resolving
		const ref = expandPaletteRef(storedRef)
		const resolved = resolvePaletteRef(palette, ref)
		if (resolved.type === 'gradient' && resolved.gradient) {
			// For gradients, return first stop color as fallback + gradient info
			const fallbackColor = resolved.gradient.stops?.[0]?.color ?? defaultColor
			return { color: fallbackColor, gradient: resolved.gradient }
		}
		return { color: resolved.color ?? defaultColor }
	}
	return { color: defaultColor }
}

/**
 * Merge shape style properties
 * Resolves palette refs if palette is provided
 */
function mergeShapeStyle(
	base: ResolvedShapeStyle,
	override: Partial<StoredStyle | ShapeStyle>,
	palette?: Palette
): ResolvedShapeStyle {
	const fill =
		override.f !== undefined
			? resolveFillField(override.f, palette, base.fill)
			: { color: base.fill, gradient: base.fillGradient }
	const strokeColor =
		override.s !== undefined ? resolveColorField(override.s, palette, base.stroke) : base.stroke
	const shadowColor = override.sh
		? resolveColorField(override.sh[3], palette, base.shadow?.color ?? '#000000')
		: (base.shadow?.color ?? '#000000')

	return {
		fill: fill.color,
		fillOpacity: override.fo ?? base.fillOpacity,
		fillGradient: fill.gradient,
		stroke: strokeColor,
		strokeWidth: override.sw ?? base.strokeWidth,
		strokeOpacity: override.so ?? base.strokeOpacity,
		strokeDasharray: override.sd ?? base.strokeDasharray,
		strokeLinecap: override.sc ?? base.strokeLinecap,
		strokeLinejoin: override.sj ?? base.strokeLinejoin,
		shadow: override.sh
			? {
					offsetX: override.sh[0],
					offsetY: override.sh[1],
					blur: override.sh[2],
					color: shadowColor
				}
			: base.shadow
	}
}

// Text style field mappings (stored abbreviation -> runtime value)
const TEXT_DECORATION_MAP = { u: 'underline', s: 'line-through' } as const
const TEXT_ALIGN_MAP = { l: 'left', c: 'center', r: 'right', j: 'justify' } as const
const VERTICAL_ALIGN_MAP = { t: 'top', m: 'middle', b: 'bottom' } as const

/**
 * Text style override source - can be either StoredStyle or TextStyle
 * Both have the same text style fields
 */
type TextStyleSource = Partial<
	Pick<StoredStyle, 'ff' | 'fs' | 'fw' | 'fi' | 'td' | 'fc' | 'ta' | 'va' | 'lh' | 'ls' | 'lb'>
>

/**
 * Merge text style properties from any source (StoredStyle or TextStyle)
 * Resolves palette refs if palette is provided
 */
function mergeTextStyleFields(
	base: ResolvedTextStyle,
	override: TextStyleSource,
	palette?: Palette
): ResolvedTextStyle {
	const fillColor =
		override.fc !== undefined ? resolveColorField(override.fc, palette, base.fill) : base.fill
	return {
		fontFamily: override.ff ?? base.fontFamily,
		fontSize: override.fs ?? base.fontSize,
		fontWeight: override.fw ?? base.fontWeight,
		fontItalic: override.fi ?? base.fontItalic,
		textDecoration: override.td
			? (TEXT_DECORATION_MAP[override.td as keyof typeof TEXT_DECORATION_MAP] ??
				base.textDecoration)
			: base.textDecoration,
		fill: fillColor,
		textAlign: override.ta
			? (TEXT_ALIGN_MAP[override.ta as keyof typeof TEXT_ALIGN_MAP] ?? base.textAlign)
			: base.textAlign,
		verticalAlign: override.va
			? (VERTICAL_ALIGN_MAP[override.va as keyof typeof VERTICAL_ALIGN_MAP] ??
				base.verticalAlign)
			: base.verticalAlign,
		lineHeight: override.lh ?? base.lineHeight,
		letterSpacing: override.ls ?? base.letterSpacing,
		listBullet: override.lb ?? base.listBullet
	}
}

// Aliases for backward compatibility with existing call sites
const mergeTextStyle = mergeTextStyleFields
const mergeTextStyleFromStored = mergeTextStyleFields

// vim: ts=4
