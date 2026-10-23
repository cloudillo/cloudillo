// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { parseTileSources } from '@cloudillo/core'

import { getTileLayer, sanitizeAttribution, toTileLayers } from '../styles.js'

const OSM_ATTRIBUTION =
	'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

function src(name: string) {
	return { name, url: `https://${name}/{z}/{x}/{y}.png`, attribution: name }
}

describe('parseTileSources', () => {
	it('drops malformed entries and repeated names, keeping the first', () => {
		const first = src('A')
		const out = parseTileSources([
			first,
			null,
			{ name: 'B', url: 'https://b' },
			{ ...src('A'), url: 'https://other' },
			src('C')
		])
		expect(out).toEqual([first, src('C')])
	})

	it('drops non-https URLs', () => {
		expect(parseTileSources([{ ...src('A'), url: 'http://a/{z}/{x}/{y}.png' }])).toEqual([])
	})

	it('returns nothing for a non-array', () => {
		expect(parseTileSources({ name: 'A' })).toEqual([])
	})
})

describe('toTileLayers', () => {
	it('applies the style hints of a well-known name', () => {
		const [dark, other] = toTileLayers([src('Dark Matter'), src('Mine')])
		expect(dark).toMatchObject({ id: 'Dark Matter', tileSize: 512, skipDarkFilter: true })
		expect(other).toMatchObject({ id: 'Mine', tileSize: 256, skipDarkFilter: false })
	})
})

describe('getTileLayer', () => {
	const layers = toTileLayers([src('OpenStreetMap'), src('Dark Matter')])

	it('resolves a legacy id', () => {
		expect(getTileLayer(layers, 'carto-dark').id).toBe('Dark Matter')
	})

	it('falls back to the first layer', () => {
		expect(getTileLayer(layers, 'esri-imagery').id).toBe('OpenStreetMap')
		expect(getTileLayer(layers, 'gone').id).toBe('OpenStreetMap')
	})
})

describe('sanitizeAttribution', () => {
	it('keeps the OSM default unchanged', () => {
		const out = sanitizeAttribution(OSM_ATTRIBUTION)
		// `&copy;` comes back as the character itself
		expect(out).toContain('© <a href="https://www.openstreetmap.org/copyright"')
		expect(out).toContain('>OpenStreetMap</a> contributors')
	})

	it('strips scripts and event handlers', () => {
		const out = sanitizeAttribution('a<script>alert(1)</script><img src=x onerror="alert(2)">b')
		expect(out).not.toContain('<script')
		expect(out).not.toContain('<img')
		expect(out).not.toContain('onerror')
	})

	it('drops links that are not https', () => {
		const out = sanitizeAttribution('<a href="javascript:alert(1)">x</a>')
		expect(out).toBe('x')
	})
})

// vim: ts=4
