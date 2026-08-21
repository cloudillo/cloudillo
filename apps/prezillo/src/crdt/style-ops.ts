// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Style system operations and resolution
 */

import type { Gradient } from '@cloudillo/canvas-tools'

import type { StyleId } from './ids'
import { toStyleId } from './ids'
import { getPalette, getResolvedColor, resolvePaletteRef } from './palette-ops'
import type { Palette, ResolvedShapeStyle, ResolvedTextStyle } from './runtime-types'
import type {
	ShapeStyle,
	StoredObject,
	StoredPaletteRef,
	StoredStyle,
	YPrezilloDocument
} from './stored-types'
import { expandPaletteRef, isPaletteRef } from './type-converters'

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

const DEFAULT_IMAGE_STYLE: ResolvedShapeStyle = {
	fill: 'none',
	fillOpacity: 1,
	stroke: 'none',
	strokeWidth: 0,
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
 * Get style inheritance chain (base first, derived last)
 */
function getStyleChain(doc: YPrezilloDocument, styleId: StyleId): StoredStyle[] {
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
	let result = { ...(object.t === 'I' ? DEFAULT_IMAGE_STYLE : DEFAULT_SHAPE_STYLE) }

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
