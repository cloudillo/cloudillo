// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The invariant: a drawn shape always keeps at least one of stroke and fill, so no object can be
 * cleared into invisibility. Enforced in the UI as a disabled "None" swatch; enforced here as the
 * rule table that swatch reads.
 */

import { toObjectId } from '../crdt/ids.js'
import type { IdealloObject, ObjectType, Style } from '../crdt/runtime-types.js'
import { DEFAULT_STYLE } from '../crdt/runtime-types.js'
import { canClearFill, canClearStroke, isPaintSet } from '../utils/paint.js'

/** Only `type` and `style` are ever read, so the rest of the object can stay a stub */
function obj(type: ObjectType, style: Partial<Style> = {}): IdealloObject {
	return {
		id: toObjectId('o1'),
		type,
		x: 0,
		y: 0,
		rotation: 0,
		pivotX: 0.5,
		pivotY: 0.5,
		locked: false,
		style: { ...DEFAULT_STYLE, ...style }
	} as IdealloObject
}

const PAINTED = { strokeColor: 'n9', fillColor: 'red-p' }
const HOLLOW = { strokeColor: 'n9', fillColor: 'transparent' }
const UNSTROKED = { strokeColor: 'transparent', fillColor: 'red-p' }

describe('isPaintSet', () => {
	it('treats the legacy `none` exactly like `transparent`', () => {
		expect(isPaintSet('none')).toBe(false)
		expect(isPaintSet('transparent')).toBe(false)
		expect(isPaintSet('n0')).toBe(true)
		expect(isPaintSet('#ff0000')).toBe(true)
	})
})

describe('paint clear rules', () => {
	it('lets a filled shape drop its stroke but not a hollow one', () => {
		for (const type of ['rect', 'ellipse', 'polygon'] as const) {
			expect(canClearStroke(obj(type, PAINTED))).toBe(true)
			expect(canClearStroke(obj(type, HOLLOW))).toBe(false)
		}
	})

	it('lets a stroked shape drop its fill but not an unstroked one', () => {
		for (const type of ['rect', 'ellipse', 'polygon'] as const) {
			expect(canClearFill(obj(type, PAINTED))).toBe(true)
			expect(canClearFill(obj(type, UNSTROKED))).toBe(false)
		}
	})

	// A text label's glyphs ARE its strokeColor, so clearing it makes the label invisible - which
	// is why no call site needs a special case for text
	it('never lets a text label, a freehand stroke or a connector clear its stroke', () => {
		for (const type of ['text', 'freehand', 'connector'] as const) {
			expect(canClearStroke(obj(type, PAINTED))).toBe(false)
			expect(canClearStroke(obj(type, UNSTROKED))).toBe(false)
		}
	})

	// The fill IS the card; a sticky draws no stroke at all
	it('never lets a sticky note clear its fill, but always its stroke', () => {
		expect(canClearFill(obj('sticky', PAINTED))).toBe(false)
		expect(canClearFill(obj('sticky', UNSTROKED))).toBe(false)
		expect(canClearStroke(obj('sticky', HOLLOW))).toBe(true)
	})

	// The content is the body; a border is pure decoration
	it('always lets an image or a document clear either paint', () => {
		for (const type of ['image', 'document'] as const) {
			expect(canClearStroke(obj(type, HOLLOW))).toBe(true)
			expect(canClearFill(obj(type, UNSTROKED))).toBe(true)
		}
	})
})

// vim: ts=4
