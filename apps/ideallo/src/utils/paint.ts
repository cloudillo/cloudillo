// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * When a paint can be cleared without leaving nothing on screen.
 *
 * "No paint" is the string sentinel `'transparent'` (and the legacy `'none'`), never `undefined`.
 * The invariant the whole thing exists for: a drawn shape always has at least one of stroke and
 * fill, so no object can be made fully invisible. Enforced in the UI by DISABLING the "None"
 * swatch of whichever palette would clear the last paint - never by silently restoring the other.
 */

import type { IdealloObject, ObjectType } from '../crdt/runtime-types.js'

export function isPaintSet(color: string): boolean {
	return color !== 'transparent' && color !== 'none'
}

/** `'needsFill'` / `'needsStroke'` mean "clearable only if the OTHER paint is set". */
type ClearRule = boolean | 'needsFill' | 'needsStroke'

/** `Record<ObjectType, ...>`: a new object type without a rule is a compile error. */
export const TYPE_PAINT_RULES: Record<ObjectType, { stroke: ClearRule; fill: ClearRule }> = {
	// The stroke IS the object. A text label's glyphs are painted in strokeColor (see the Caps
	// doc comment in PropertyBar.tsx), so clearing it makes the label invisible.
	freehand: { stroke: false, fill: true },
	connector: { stroke: false, fill: true },
	text: { stroke: false, fill: true },
	// Drawn shapes: outline or fill, at least one.
	rect: { stroke: 'needsFill', fill: 'needsStroke' },
	ellipse: { stroke: 'needsFill', fill: 'needsStroke' },
	polygon: { stroke: 'needsFill', fill: 'needsStroke' },
	// StickyNote draws no stroke at all - the fill IS the card.
	sticky: { stroke: true, fill: false },
	// The content is the body; a border is decoration.
	image: { stroke: true, fill: true },
	document: { stroke: true, fill: true }
}

function allows(rule: ClearRule, obj: IdealloObject): boolean {
	if (rule === 'needsFill') return isPaintSet(obj.style.fillColor)
	if (rule === 'needsStroke') return isPaintSet(obj.style.strokeColor)
	return rule
}

export function canClearStroke(obj: IdealloObject): boolean {
	return allows(TYPE_PAINT_RULES[obj.type].stroke, obj)
}

export function canClearFill(obj: IdealloObject): boolean {
	return allows(TYPE_PAINT_RULES[obj.type].fill, obj)
}

// vim: ts=4
