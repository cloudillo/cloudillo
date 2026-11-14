// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { compactUnknownRecord, readUnknownGeometry, setIfChanged } from '../unknown-objects.js'

describe('readUnknownGeometry', () => {
	it('defaults everything a raw record lacks or garbles', () => {
		expect(readUnknownGeometry({ xy: 'nope', r: NaN })).toEqual({
			x: 0,
			y: 0,
			width: 100,
			height: 100,
			rotation: 0,
			pivotX: 0.5,
			pivotY: 0.5
		})
	})
})

describe('compactUnknownRecord', () => {
	it('returns an unchanged record with no xy unchanged', () => {
		const raw = { t: 'Z', zz: 1 }
		expect(compactUnknownRecord({ raw, ...readUnknownGeometry(raw) })).toEqual(raw)
	})

	it('writes xy when moved, never invents wh', () => {
		const raw = { t: 'Z' }
		expect(
			compactUnknownRecord({
				raw,
				...readUnknownGeometry(raw),
				x: 5,
				y: 6,
				width: 7,
				height: 8
			})
		).toEqual({ t: 'Z', xy: [5, 6] })
	})

	it('writes a changed rotation/pivot, deletes them when reset to the default', () => {
		const raw = { t: 'Z' }
		expect(compactUnknownRecord({ raw, ...readUnknownGeometry(raw), rotation: 30 })).toEqual({
			t: 'Z',
			r: 30
		})
		const turned = { t: 'Z', r: 30, pv: [0.1, 0.9] }
		expect(
			compactUnknownRecord({
				raw: turned,
				...readUnknownGeometry(turned),
				rotation: 0,
				pivotX: 0.5,
				pivotY: 0.5
			})
		).toEqual({ t: 'Z' })
	})
})

describe('setIfChanged', () => {
	it('skips unchanged, deletes defaults, writes the rest', () => {
		const s: Record<string, unknown> = { pv: [0.2, 0.2], r: 5 }
		setIfChanged(s, 'pv', [0.2, 0.2], [0.2, 0.2], () => false)
		setIfChanged(s, 'r', 0, 5, (v) => v === 0)
		setIfChanged(s, 'o', 0.3, 1, (v) => v === 1)
		expect(s).toEqual({ pv: [0.2, 0.2], o: 0.3 })
	})
})
