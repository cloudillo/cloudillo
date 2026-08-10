// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { decodeFormatVersion, encodeFormatVersion } from '../format-version'

describe('encodeFormatVersion', () => {
	it('packs three decimal digits per component', () => {
		expect(encodeFormatVersion('2.1.42')).toBe(2001042)
	})

	it('encodes the bounds of the namespace', () => {
		expect(encodeFormatVersion('0.0.0')).toBe(0)
		expect(encodeFormatVersion('999.999.999')).toBe(999999999)
	})

	it('preserves version ordering as integer ordering', () => {
		// The whole point of the encoding: the server orders two registrations with
		// one `<`.
		const encoded = ['1.0.0', '1.0.1', '1.1.0', '2.0.0'].map(encodeFormatVersion)
		expect(encoded).toEqual([...encoded].sort((a, b) => a - b))
		expect(new Set(encoded).size).toBe(encoded.length)
	})

	it.each([
		['2.1', 'too few components'],
		['2.1.0.0', 'too many components'],
		['2.1.1000', 'a component past 999'],
		['v2.1.0', 'a leading v'],
		['2.1.0-beta', 'a prerelease suffix'],
		// Rejected so two spellings can never encode to one integer.
		['02.1.0', 'a leading zero'],
		['', 'the empty string'],
		['a.b.c', 'non-numeric components']
	])('rejects %p (%s)', (version) => {
		expect(() => encodeFormatVersion(version)).toThrow(/Invalid formatVersion/)
	})
})

describe('decodeFormatVersion', () => {
	it('round-trips every component independently', () => {
		for (const version of ['0.0.0', '1.0.0', '2.1.42', '999.999.999']) {
			expect(decodeFormatVersion(encodeFormatVersion(version))).toBe(version)
		}
	})

	it('rejects anything outside the encodable range', () => {
		expect(() => decodeFormatVersion(-1)).toThrow()
		expect(() => decodeFormatVersion(1_000_000_000)).toThrow()
		expect(() => decodeFormatVersion(1.5)).toThrow()
	})
})

// vim: ts=4
