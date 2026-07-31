// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The ONE text-layout builder.
 *
 * The display component and the edit overlay must produce a byte-identical `baseStyle`, or the
 * glyphs jump the moment editing starts. Enforced by there being exactly one function.
 */

import type { BaseTextStyle } from '@cloudillo/canvas-text'

import type { Bounds, IdealloObject, TextBearingObject } from '../crdt/runtime-types.js'
import {
	DEFAULT_FONT_FAMILY,
	DEFAULT_TEXT_ALIGN,
	DEFAULT_VERTICAL_ALIGN
} from '../crdt/runtime-types.js'
import { getBoundsFromPoints, inscribedBox } from './geometry.js'
import { colorToCss, contrastingTextColor } from './palette.js'
import { DEFAULT_LINE_HEIGHT, DEFAULT_PADDING } from './text-scaling.js'
import { DEFAULT_STICKY_FONT_SIZE, DEFAULT_TEXT_FONT_SIZE } from './text-styles.js'

/**
 * Glyph colour for everything except a text label, on an unfilled shape.
 *
 * A shape deliberately does NOT paint its text in strokeColor: that keeps "stroke = outline" true,
 * and it survives a cleared stroke with no special case. A text label is the exception - its
 * glyphs ARE its strokeColor, which is what the property bar's "Colour" label refers to.
 *
 * This is the UNFILLED answer only: a shape with a fill goes through contrastingTextColor(), or a
 * label on an `n0` fill would be painted in exactly its own background and vanish in both themes.
 */
export const OBJECT_TEXT_COLOR = 'var(--palette-n0, #1e1e1e)'

/** The sticky card's corner radius. One constant, shared by the SVG `rx` and the editor's CSS. */
export const STICKY_CORNER_RADIUS = 2

/** The sticky card's drop-shadow filter. One id, shared by the <defs> and every note that uses it. */
export const STICKY_SHADOW_FILTER_ID = 'ideallo-sticky-shadow'

/**
 * A polygon pays for its own margin.
 *
 * Its text goes into the INSCRIBED box, which is already well inside the outline - a triangle's is
 * half the bbox. Charging the full 16px on top of that leaves a narrow column that wraps every
 * other word.
 */
export const POLYGON_TEXT_PADDING = 4

export interface ObjectTextLayout {
	/** The box the text is laid into, in world coordinates */
	box: Bounds
	baseStyle: BaseTextStyle
	/** Merged into containerStyle by BOTH the display and the editor */
	padding: number
}

/**
 * The box an object's text is laid into.
 *
 * Split out from the full layout because the editing slot needs only the box, and computing a
 * whole BaseTextStyle to fill in four numbers would be noise.
 */
export function objectTextBox(object: IdealloObject): Bounds {
	if (object.type === 'polygon') {
		// A diamond's bbox corners lie outside the shape, so centred text laid into the bbox would
		// spill into empty space
		return inscribedBox(object.vertices, getBoundsFromPoints(object.vertices))
	}
	if ('width' in object && 'height' in object) {
		return { x: object.x, y: object.y, width: object.width, height: object.height }
	}
	return { x: object.x, y: object.y, width: 0, height: 0 }
}

/** The size a text-bearing object with no stored `fz` renders at */
export function defaultObjectFontSize(type: TextBearingObject['type']): number {
	return type === 'sticky' ? DEFAULT_STICKY_FONT_SIZE : DEFAULT_TEXT_FONT_SIZE
}

/**
 * The one builder. Display and edit overlays both call it, so they cannot drift.
 *
 * The per-type values below are pinned to what each renderer used before: changing a line height
 * or a default size would reflow every existing board.
 */
export function objectTextLayout(object: TextBearingObject): ObjectTextLayout {
	const {
		fontSize = defaultObjectFontSize(object.type),
		fontFamily = DEFAULT_FONT_FAMILY,
		textAlign = DEFAULT_TEXT_ALIGN,
		verticalAlign = DEFAULT_VERTICAL_ALIGN
	} = object

	return {
		box: objectTextBox(object),
		padding:
			object.type === 'text'
				? 0
				: object.type === 'polygon'
					? POLYGON_TEXT_PADDING
					: DEFAULT_PADDING,
		baseStyle: {
			fontFamily,
			fontSize,
			fontWeight: 'normal',
			fontItalic: false,
			textDecoration: 'none',
			fill:
				object.type === 'text'
					? colorToCss(object.style.strokeColor)
					: contrastingTextColor(object.style.fillColor),
			textAlign,
			verticalAlign,
			// A text label's 1.2 and everything else's 1.4 are both pre-existing; unifying them
			// would reflow every label in every document
			lineHeight: object.type === 'text' ? 1.2 : DEFAULT_LINE_HEIGHT,
			letterSpacing: 0
		}
	}
}

// vim: ts=4
