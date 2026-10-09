// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	clampLayoutScale,
	computeEmbedFrame,
	MAX_NATURAL,
	normalizeEmbedSettings,
	resizeSettings,
	storableNatural
} from '../components/ViewEmbed/sizing.js'

const natural = { w: 800, h: 600 }

describe('computeEmbedFrame — fixed view', () => {
	it('fit-width scales down to the available width', () => {
		expect(
			computeEmbedFrame({ sizing: 'fit-width', kind: 'fixed', natural, availW: 400 })
		).toEqual({ w: 400, h: 300, scale: 0.5, innerScroll: false })
	})

	it('fit-width never upscales above 100%', () => {
		expect(
			computeEmbedFrame({ sizing: 'fit-width', kind: 'fixed', natural, availW: 1600 })
		).toEqual({ w: 800, h: 600, scale: 1, innerScroll: false })
	})

	it('actual uses the requested scale', () => {
		expect(
			computeEmbedFrame({
				sizing: 'actual',
				kind: 'fixed',
				natural,
				availW: 2000,
				scale: 1.5
			})
		).toEqual({ w: 1200, h: 900, scale: 1.5, innerScroll: false })
	})

	it('actual is capped by the available width', () => {
		expect(
			computeEmbedFrame({ sizing: 'actual', kind: 'fixed', natural, availW: 400, scale: 1.5 })
		).toEqual({ w: 400, h: 300, scale: 0.5, innerScroll: false })
	})

	it('actual defaults to 100%', () => {
		expect(
			computeEmbedFrame({ sizing: 'actual', kind: 'fixed', natural, availW: 2000 }).scale
		).toBe(1)
	})

	it('box fits the view inside the box, frame = box', () => {
		expect(
			computeEmbedFrame({
				sizing: 'box',
				kind: 'fixed',
				natural,
				availW: 1000,
				box: { w: 400, h: 600 }
			})
		).toEqual({ w: 400, h: 600, scale: 0.5, innerScroll: false })
	})
})

describe('computeEmbedFrame — reflow view', () => {
	it('fit-width takes the available width and the natural height', () => {
		expect(
			computeEmbedFrame({ sizing: 'fit-width', kind: 'reflow', natural, availW: 500 })
		).toEqual({ w: 500, h: 600, scale: 1, innerScroll: false })
	})

	it('actual caps the height at maxH and scrolls inside', () => {
		expect(
			computeEmbedFrame({ sizing: 'actual', kind: 'reflow', natural, availW: 500, maxH: 200 })
		).toEqual({ w: 500, h: 200, scale: 1, innerScroll: true })
	})

	it('does not scroll when the content fits maxH', () => {
		expect(
			computeEmbedFrame({
				sizing: 'fit-width',
				kind: 'reflow',
				natural,
				availW: 500,
				maxH: 800
			}).innerScroll
		).toBe(false)
	})

	it('box uses the box and always scrolls inside', () => {
		expect(
			computeEmbedFrame({
				sizing: 'box',
				kind: 'reflow',
				natural,
				availW: 500,
				box: { w: 300, h: 200 }
			})
		).toEqual({ w: 300, h: 200, scale: 1, innerScroll: true })
	})
})

describe('computeEmbedFrame — no report yet', () => {
	it('falls back to the available width × 400', () => {
		expect(computeEmbedFrame({ sizing: 'fit-width', kind: 'fixed', availW: 640 })).toEqual({
			w: 640,
			h: 400,
			scale: 1,
			innerScroll: false
		})
		expect(computeEmbedFrame({ sizing: 'fit-width', kind: 'reflow', availW: 640 })).toEqual({
			w: 640,
			h: 400,
			scale: 1,
			innerScroll: false
		})
	})
})

describe('computeEmbedFrame — untrusted reports', () => {
	it.each([
		{ w: Number.NaN, h: Number.NaN },
		{ w: Number.POSITIVE_INFINITY, h: Number.POSITIVE_INFINITY },
		{ w: 1e12, h: 1e12 },
		{ w: -50, h: -50 }
	])('keeps the frame finite and bounded for %o', (natural) => {
		for (const kind of ['fixed', 'reflow'] as const) {
			const f = computeEmbedFrame({ sizing: 'actual', kind, natural, availW: 500, scale: 2 })
			for (const v of [f.w, f.h, f.scale]) {
				expect(Number.isFinite(v)).toBe(true)
				expect(v).toBeGreaterThanOrEqual(0)
			}
			expect(f.h).toBeLessThanOrEqual(MAX_NATURAL * 2)
		}
	})

	it('leaves room for the placeholder when the view is missing', () => {
		for (const kind of ['fixed', 'reflow'] as const) {
			expect(
				computeEmbedFrame({
					sizing: 'fit-width',
					kind,
					natural: { w: 0, h: 0 },
					availW: 500,
					missing: true
				}).h
			).toBeGreaterThanOrEqual(96)
		}
	})
})

describe('width %', () => {
	it('narrows a reflow frame', () => {
		expect(
			computeEmbedFrame({
				sizing: 'fit-width',
				kind: 'reflow',
				natural,
				availW: 500,
				width: 50
			}).w
		).toBe(250)
	})

	it('caps a fixed frame at its share of the line', () => {
		expect(
			computeEmbedFrame({
				sizing: 'fit-width',
				kind: 'fixed',
				natural,
				availW: 800,
				width: 50
			}).w
		).toBeLessThanOrEqual(400)
	})
})

describe('resizeSettings', () => {
	const base = { sizing: 'fit-width' as const }

	it('fixed: switches to actual at the dragged scale, snapped and clamped', () => {
		expect(resizeSettings(base, 'fixed', natural, 1000, 598)).toEqual({
			sizing: 'actual',
			scale: 0.75
		})
		expect(resizeSettings(base, 'fixed', natural, 1000, 10).scale).toBe(0.25)
		expect(resizeSettings(base, 'fixed', natural, 10000, 8000).scale).toBe(4)
	})

	it('reflow: stores width % of the line, snapped and clamped', () => {
		expect(resizeSettings(base, 'reflow', natural, 500, 312)).toEqual({ ...base, width: 60 })
		expect(resizeSettings(base, 'reflow', natural, 500, 5).width).toBe(10)
		expect(resizeSettings(base, 'reflow', natural, 500, 900).width).toBe(100)
	})
})

describe('normalizeEmbedSettings', () => {
	it('drops unknown sizing / align and non-positive numbers', () => {
		expect(
			normalizeEmbedSettings(
				{ sizing: 'huge', align: 'justify', scale: -1, maxH: 'NaN', width: 100, lastW: 5 },
				'center'
			)
		).toEqual({
			sizing: 'fit-width',
			align: 'center',
			scale: undefined,
			maxH: undefined,
			textScale: undefined,
			lastNatural: undefined,
			width: undefined
		})
	})

	it('maps the retired flow-host box sizing to fit-width', () => {
		expect(normalizeEmbedSettings({ sizing: 'box' }, 'left').sizing).toBe('fit-width')
	})

	it('keeps valid values, numeric strings included', () => {
		expect(
			normalizeEmbedSettings(
				{
					sizing: 'actual',
					align: 'right',
					scale: '1.5',
					width: 60,
					lastW: 800,
					lastH: 600
				},
				'left'
			)
		).toMatchObject({
			sizing: 'actual',
			align: 'right',
			scale: 1.5,
			width: 60,
			lastNatural: [800, 600]
		})
	})
})

describe('clampLayoutScale', () => {
	it('bounds the wire scale to 0.05–20', () => {
		expect(clampLayoutScale(0.001)).toBe(0.05)
		expect(clampLayoutScale(1e6)).toBe(20)
		expect(clampLayoutScale(1.5)).toBe(1.5)
	})
})

describe('storableNatural', () => {
	it('drops a size without area', () => {
		expect(storableNatural({ w: 0, h: 5 })).toBeNull()
		expect(storableNatural({ w: Number.NaN, h: 5 })).toBeNull()
	})

	it('rounds and clamps', () => {
		expect(storableNatural({ w: 10.6, h: 3.2 })).toEqual([11, 3])
		expect(storableNatural({ w: 1e9, h: 1 })).toEqual([MAX_NATURAL, 1])
	})
})

// vim: ts=4
