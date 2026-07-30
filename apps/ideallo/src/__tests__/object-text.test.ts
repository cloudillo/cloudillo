// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * objectTextLayout is the ONE builder the display component and the edit overlay both call. These
 * tests pin what it produces, per type, against the constants the four original components used.
 */

import { toObjectId } from '../crdt/ids.js'
import type {
	Bounds,
	PolygonObject,
	RectObject,
	StickyObject,
	TextObject
} from '../crdt/runtime-types.js'
import { DEFAULT_STYLE } from '../crdt/runtime-types.js'
import {
	clearInscribedCache,
	INSCRIBED_CACHE_MAX,
	inscribedBox,
	inscribedCacheSize
} from '../utils/geometry.js'
import { OBJECT_TEXT_COLOR, objectTextLayout } from '../utils/object-text.js'

const BASE = {
	id: toObjectId('o1'),
	x: 10,
	y: 20,
	rotation: 0,
	pivotX: 0.5,
	pivotY: 0.5,
	locked: false,
	style: { ...DEFAULT_STYLE }
}

const sticky: StickyObject = { ...BASE, type: 'sticky', width: 200, height: 200, text: '' }
const label: TextObject = { ...BASE, type: 'text', width: 200, height: 32, text: '' }
const rect: RectObject = { ...BASE, type: 'rect', width: 120, height: 80 }

/** A unit diamond scaled to a 100x100 box at the origin */
const diamond: PolygonObject = {
	...BASE,
	x: 0,
	y: 0,
	type: 'polygon',
	vertices: [
		[50, 0],
		[100, 50],
		[50, 100],
		[0, 50]
	]
}

describe('objectTextLayout', () => {
	// Entering edit mode must not change a single number, or the glyphs jump
	it('is a pure function of the object, so edit mode cannot shift the glyphs', () => {
		for (const object of [sticky, label, rect, diamond]) {
			expect(objectTextLayout(object)).toEqual(objectTextLayout(object))
		}
	})

	// Pinned against StickyNote's own constants, verbatim
	it('reproduces the sticky note`s previous layout exactly', () => {
		const { box, baseStyle, padding } = objectTextLayout(sticky)
		expect(box).toEqual({ x: 10, y: 20, width: 200, height: 200 })
		expect(padding).toBe(16)
		expect(baseStyle).toEqual({
			fontFamily: 'system-ui, sans-serif',
			fontSize: 18,
			fontWeight: 'normal',
			fontItalic: false,
			textDecoration: 'none',
			fill: OBJECT_TEXT_COLOR,
			textAlign: 'center',
			verticalAlign: 'middle',
			lineHeight: 1.4,
			letterSpacing: 0
		})
	})

	// Pinned against TextLabel's own constants: 16px, lineHeight 1.2, no padding, and glyphs
	// painted in strokeColor
	it('reproduces the text label`s previous layout exactly', () => {
		const { box, baseStyle, padding } = objectTextLayout(label)
		expect(box).toEqual({ x: 10, y: 20, width: 200, height: 32 })
		expect(padding).toBe(0)
		expect(baseStyle.fontSize).toBe(16)
		expect(baseStyle.lineHeight).toBe(1.2)
		expect(baseStyle.fill).not.toBe(OBJECT_TEXT_COLOR)
	})

	/*
	 * A shape does NOT paint its text in strokeColor. That keeps "stroke = outline" true, and it
	 * survives a cleared stroke with no special case anywhere.
	 */
	it('paints a shape`s label in the neutral colour, not its stroke colour', () => {
		expect(objectTextLayout(rect).baseStyle.fill).toBe(OBJECT_TEXT_COLOR)
		expect(objectTextLayout(diamond).baseStyle.fill).toBe(OBJECT_TEXT_COLOR)
		expect(objectTextLayout(rect).baseStyle.fontSize).toBe(16)
	})

	/*
	 * The glyph colour used to be pinned to --palette-n0 whatever the fill. That variable is
	 * black in light mode and white under `.dark`, so a shape filled with the `n0` key printed its
	 * label in exactly its own background - invisible in BOTH themes.
	 */
	describe('label colour against the fill', () => {
		function filled(fillColor: string): RectObject {
			return { ...rect, style: { ...DEFAULT_STYLE, fillColor } }
		}

		// n0 and n5 flip together, so answering with the other end of the ramp holds in both themes
		it('flips to the other end of the neutral ramp on a dark neutral fill', () => {
			expect(objectTextLayout(filled('n0')).baseStyle.fill).not.toBe(OBJECT_TEXT_COLOR)
			expect(objectTextLayout(filled('n5')).baseStyle.fill).toBe(OBJECT_TEXT_COLOR)
		})

		// The pastels flip lightness with the theme, so n0 tracks them - already correct
		it('leaves a pastel fill on the neutral colour', () => {
			expect(objectTextLayout(filled('yellow-p')).baseStyle.fill).toBe(OBJECT_TEXT_COLOR)
		})

		// The saturated keys are a fixed 40-50% L in both themes, so a theme-flipping var would
		// break in one of them - a literal is the only safe answer
		it('uses a literal white on a saturated fill', () => {
			expect(objectTextLayout(filled('blue')).baseStyle.fill).toBe('#ffffff')
		})

		// The one case where the real colour is known at JS time
		it('picks by relative luminance for a custom hex', () => {
			expect(objectTextLayout(filled('#111111')).baseStyle.fill).toBe('#ffffff')
			expect(objectTextLayout(filled('#eeeeee')).baseStyle.fill).toBe('#1e1e1e')
		})

		it('leaves an unfilled shape exactly as it was', () => {
			expect(objectTextLayout(filled('transparent')).baseStyle.fill).toBe(OBJECT_TEXT_COLOR)
		})
	})

	it('lays a polygon`s text into its inscribed box, not its bounding box', () => {
		const { box } = objectTextLayout(diamond)
		expect(box.width).toBeLessThan(100)
		expect(box.x + box.width / 2).toBeCloseTo(50)
		expect(box.y + box.height / 2).toBeCloseTo(50)
	})
})

describe('inscribedBox', () => {
	const UNIT_DIAMOND: [number, number][] = [
		[0.5, 0],
		[1, 0.5],
		[0.5, 1],
		[0, 0.5]
	]
	const UNIT_TRIANGLE: [number, number][] = [
		[0.5, 0],
		[1, 1],
		[0, 1]
	]
	const UNIT = { x: 0, y: 0, width: 1, height: 1 }

	function inside(vertices: [number, number][], [px, py]: [number, number]): boolean {
		let hit = false
		for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
			const [xi, yi] = vertices[i]
			const [xj, yj] = vertices[j]
			if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit
		}
		return hit
	}

	/*
	 * Shrunk by a hair first: the maximal box TOUCHES the outline by construction, so its corners
	 * sit exactly on an edge and a strict ray cast could call them either way.
	 */
	function cornersInside(vertices: [number, number][], box: Bounds): boolean {
		const w = box.width * 0.999
		const h = box.height * 0.999
		const x = box.x + box.width / 2 - w / 2
		const y = box.y + box.height / 2 - h / 2
		return (
			[
				[x, y],
				[x + w, y],
				[x + w, y + h],
				[x, y + h]
			] as [number, number][]
		).every((corner) => inside(vertices, corner))
	}

	it('keeps every corner of a diamond`s box inside the diamond', () => {
		expect(cornersInside(UNIT_DIAMOND, inscribedBox(UNIT_DIAMOND, UNIT))).toBe(true)
	})

	it('stays centred on a shape that is symmetric about its centre', () => {
		const box = inscribedBox(UNIT_DIAMOND, UNIT)
		expect(box.x + box.width / 2).toBeCloseTo(0.5)
		expect(box.y + box.height / 2).toBeCloseTo(0.5)
	})

	/*
	 * A triangle is not symmetric about its bbox centre: a box pinned there cannot grow past a
	 * third of the bbox before its top corners leave the shape, so it lands over-narrow and hanging
	 * in the empty upper half. The text belongs over the wide base.
	 */
	it('drops the box onto a triangle`s base instead of pinning it to the bbox centre', () => {
		const box = inscribedBox(UNIT_TRIANGLE, UNIT)
		expect(cornersInside(UNIT_TRIANGLE, box)).toBe(true)
		expect(box.x + box.width / 2).toBeCloseTo(0.5) // still centred left-to-right
		expect(box.y + box.height / 2).toBeGreaterThan(0.5) // but below the bbox centre
		expect(box.width).toBeGreaterThan(0.4) // and clear of the 40% floor
		expect(box.height).toBeGreaterThan(0.4)
	})

	it('leaves a convex-enough shape alone rather than shrinking it needlessly', () => {
		const square: [number, number][] = [
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 1]
		]
		expect(inscribedBox(square, UNIT).width).toBeCloseTo(1)
	})

	/*
	 * A spike has essentially no inscribable area, and a box of width 0 would give the text
	 * nowhere at all to go. The floor trades exactness for a usable result.
	 */
	it('floors at 40% of the bounding box for a spiky shape', () => {
		const spike: [number, number][] = [
			[0.5, 0],
			[0.52, 1],
			[0.48, 1]
		]
		const box = inscribedBox(spike, UNIT)
		// Only the width needs the floor - a sliver is as tall as the bbox, just not wide enough
		// to hold a syllable, so this box knowingly pokes out of the outline
		expect(box.width).toBeCloseTo(0.4)
		expect(box.height).toBeGreaterThanOrEqual(0.4)
		expect(box.x + box.width / 2).toBeCloseTo(0.5)
	})

	it('returns the bounding box unchanged for a degenerate outline', () => {
		expect(inscribedBox([[0, 0]], UNIT)).toEqual(UNIT)
	})

	/*
	 * ~2,300 iterations per call, invoked from five component BODIES with no useMemo - and a
	 * React memo cannot help there, because Canvas hands down a fresh object identity on every
	 * document revision and every drag frame. The cache keys on (vertices, bounds) instead.
	 */
	describe('cache', () => {
		beforeEach(() => {
			clearInscribedCache()
		})

		it('answers an equal-but-not-identical vertex list from the cache', () => {
			const first = inscribedBox(UNIT_DIAMOND, UNIT)
			const second = inscribedBox(
				UNIT_DIAMOND.map((v) => [v[0], v[1]] as [number, number]),
				{ ...UNIT }
			)
			expect(second).toEqual(first)
			expect(inscribedCacheSize()).toBe(1)
		})

		// A caller mutating a shared Bounds would silently move every polygon with that outline
		it('hands out a copy, not the cached object', () => {
			const first = inscribedBox(UNIT_DIAMOND, UNIT)
			first.width = -1
			expect(inscribedBox(UNIT_DIAMOND, UNIT).width).toBeGreaterThan(0)
		})

		// Bounded, unlike hit-testing's pathBoundsCache: this module lives for the whole SPA
		// session and a user may open board after board
		it('stays bounded as distinct shapes accumulate', () => {
			for (let i = 0; i < INSCRIBED_CACHE_MAX + 50; i++) {
				inscribedBox(UNIT_DIAMOND, { x: i, y: 0, width: 1, height: 1 })
			}
			expect(inscribedCacheSize()).toBeLessThanOrEqual(INSCRIBED_CACHE_MAX)
		})
	})
})

// vim: ts=4
