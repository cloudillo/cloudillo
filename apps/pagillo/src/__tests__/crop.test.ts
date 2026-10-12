// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { cropDrag } from '../editor/FrameOverlay.js'
import { cropGeom } from '../view/PageSvg.js'

describe('cropGeom', () => {
	it('fill stretches the crop over the box', () => {
		const box = { x: 0, y: 0, w: 100, h: 50 }
		expect(cropGeom(box, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 'fill', 2)).toEqual({
			r: box,
			full: { x: -50, y: -25, w: 200, h: 100 },
			clip: box
		})
	})

	it('contain letterboxes, cover overflows and clips to the box', () => {
		const box = { x: 0, y: 0, w: 100, h: 100 }
		const c = { x: 0, y: 0, w: 1, h: 1 }
		const contain = cropGeom(box, c, 'contain', 2)
		expect(contain.r).toEqual({ x: 0, y: 25, w: 100, h: 50 })
		expect(contain.clip).toEqual(contain.r)
		const cover = cropGeom(box, c, 'cover', 2)
		expect(cover.r).toEqual({ x: -50, y: 0, w: 200, h: 100 })
		expect(cover.clip).toEqual(box)
	})
})

describe('cropDrag', () => {
	const d = {
		k: 'crop' as const,
		page: 0,
		x0: 0,
		y0: 0,
		b: { x: 0, y: 0, w: 100, h: 100, rot: 0 },
		c0: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
		r: { x: 0, y: 0, w: 100, h: 100 },
		full: { x: -50, y: -50, w: 200, h: 200 }
	}

	it('pans within the free travel', () => {
		expect(cropDrag(d, 20, 0)).toEqual({ x: 0.15, y: 0.25, w: 0.5, h: 0.5 })
		expect(cropDrag(d, 1000, 0).x).toBe(0)
		expect(cropDrag(d, -1000, 0).x).toBe(0.5)
	})

	it('zooms about the opposite corner, square and clamped to 1/8..1', () => {
		const z = { ...d, corner: [1, 1] as [number, number] }
		expect(cropDrag(z, 150, 150)).toEqual(d.c0)
		expect(cropDrag(z, 50, 50)).toEqual({ x: 0, y: 0, w: 1, h: 1 })
		const tight = cropDrag(z, 1550, 1550)
		expect(tight.w).toBe(1 / 8)
		expect(tight.h).toBe(tight.w)
	})
})
