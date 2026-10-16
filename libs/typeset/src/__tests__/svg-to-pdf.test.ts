// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { describe, expect, it, jest } from '@jest/globals'

import { FX } from '../fixed.js'
import { safeDocRef } from '../geometry.js'
import type { PdfGfx } from '../pdf/graphics.js'
import { parseSvg, type SvgPdfEnv, svgToPdf } from '../pdf/svg-to-pdf.js'

const info = jest.spyOn(console, 'info').mockImplementation(() => {})

/**
 * A pdfkit stand-in that records every call; every method chains, except `openImage` (a 10×10
 * image) and `_normalizeColor` (null for `nosuchcolour`).
 */
function recorder() {
	const calls: [string, unknown[]][] = []
	const doc: PdfGfx = new Proxy({} as PdfGfx, {
		get:
			(_t, name) =>
			(...args: unknown[]) => {
				calls.push([String(name), args])
				if (name === 'openImage') return { width: 10, height: 10 }
				if (name === '_normalizeColor' && args[0] === 'nosuchcolour') return null
				return doc
			}
	})
	return { doc, calls }
}

// Text needs real faces; these cases have none.
const env = {
	registry: {},
	face: () => Promise.reject(new Error('no fonts'))
} as unknown as SvgPdfEnv

const box = { x: 0, y: 0, w: 100 * FX, h: 100 * FX }

async function draw(body: string, root = 'viewBox="0 0 100 100"') {
	const r = recorder()
	await svgToPdf(r.doc, `<svg xmlns="http://www.w3.org/2000/svg" ${root}>${body}</svg>`, box, env)
	const of = (name: string) => r.calls.filter(([n]) => n === name).map(([, a]) => a)
	return { calls: r.calls, of }
}

describe('svgToPdf', () => {
	it('parses an svg root, and nothing from non-XML', () => {
		expect(parseSvg('<svg viewBox="0 0 1 1"><rect/></svg>')?.attrs.viewBox).toBe('0 0 1 1')
		expect(parseSvg('not svg at all')).toBeUndefined()
	})

	it('applies a transform list in order', async () => {
		const { of } = await draw(
			'<g transform="translate(1 2) rotate(90) scale(2) matrix(1 0 0 1 3 4)"><rect width="1" height="1"/></g>'
		)
		const r = (m: unknown[]) => (m as number[]).map((v) => Math.round(v * 1000) / 1000 + 0)
		// The first is the root viewBox mapping.
		expect(of('transform').slice(1).map(r)).toEqual([
			[1, 0, 0, 1, 1, 2],
			[1, 0, 0, 1, 0, 0],
			[0, 1, -1, 0, 0, 0],
			[1, 0, 0, 1, 0, 0],
			[2, 0, 0, 2, 0, 0],
			[1, 0, 0, 1, 3, 4]
		])
	})

	it('rounds rect corners, leaves a polyline open, keeps evenodd', async () => {
		const { of } = await draw(
			'<rect width="10" height="10" rx="2"/><polyline points="0 0 1 1 2 0" fill="none" stroke="red"/>' +
				'<path d="M0 0H5V5Z" fill-rule="evenodd"/>'
		)
		const [rect, poly] = of('path').map(([d]) => d as string)
		expect(rect).toContain('A2 2')
		expect(poly).toBe('M0 0L1 1L2 0')
		expect(of('fill')).toEqual([['non-zero'], ['even-odd']])
	})

	it('falls back for a missing paint server', async () => {
		const { of } = await draw(
			'<rect width="1" height="1" fill="url(#nope) red"/><rect width="1" height="1" fill="url(#nope)"/>'
		)
		expect(of('fill')).toHaveLength(1)
		expect(of('fillColor')[0][0]).toBe('red')
	})

	it('reads percentage opacity', async () => {
		const { of } = await draw('<rect width="1" height="1" opacity="50%"/>')
		expect(of('fillColor')[0][1]).toBe(0.5)
	})

	it('draws a use of a symbol, and stops a self-referencing use', async () => {
		const sym = await draw(
			'<defs><symbol id="s" viewBox="0 0 10 10"><rect width="10" height="10"/></symbol></defs>' +
				'<use href="#s" x="5" width="20" height="20"/>'
		)
		expect(sym.of('path')).toHaveLength(1)
		expect(sym.of('transform')).toContainEqual([1, 0, 0, 1, 5, 0])
		const loop = await draw('<g id="g"><use href="#g"/><rect width="1" height="1"/></g>')
		// The group itself, then once through the use (which does not re-enter it).
		expect(loop.of('path')).toHaveLength(2)
	})

	it('does not recurse into SVG images past MAX_DEPTH', async () => {
		const level = (k: number): string =>
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="1" height="1"/>' +
			(k
				? `<image width="10" height="10" href="data:image/svg+xml,${encodeURIComponent(level(k - 1))}"/>`
				: '') +
			'</svg>'
		const r = recorder()
		await svgToPdf(r.doc, level(8), box, env)
		// The root and 4 nested images.
		expect(r.calls.filter(([n]) => n === 'path')).toHaveLength(5)
	})

	it('does not paint an unknown colour, and a stop with one does not throw', async () => {
		const { of } = await draw(
			'<linearGradient id="g"><stop stop-color="nosuchcolour"/></linearGradient>' +
				'<rect width="1" height="1" fill="nosuchcolour"/><rect width="1" height="1" fill="url(#g)"/>'
		)
		expect(of('fill')).toHaveLength(1)
		expect(of('stop')[0][1]).toBe('#000000')
	})

	it('reads currentcolor case-insensitively', async () => {
		const { of } = await draw('<rect width="1" height="1" color="red" fill="currentcolor"/>')
		expect(of('fillColor')[0][0]).toBe('red')
	})

	it('writes no non-finite or exponent numbers', async () => {
		const { of } = await draw(
			'<rect width="1e300" height="1" stroke="red" stroke-miterlimit="1e30" stroke-dasharray="1e300 1"/>'
		)
		const text = [...of('addContent'), ...of('path')].flat().join(' ')
		expect(text).toContain('M')
		expect(text).not.toMatch(/Infinity|NaN|e\+/)
	})

	it('clamps a huge stroke width and scale, and reports the embed drawn', async () => {
		const r = recorder()
		const ok = await svgToPdf(
			r.doc,
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g transform="scale(1e300)"><rect width="1" height="1" stroke="red" stroke-width="1e300"/></g></svg>',
			box,
			env
		)
		expect(ok).toBe(true)
		const nums = r.calls
			.filter(([n]) => n === 'transform' || n === 'lineWidth')
			.flatMap(([, a]) => a as number[])
		expect(nums.every((v) => Number.isFinite(v) && Math.abs(v) <= 1e7)).toBe(true)
	})

	it('draws nothing for an empty viewBox, and says so', async () => {
		const r = recorder()
		const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 10"><rect/></svg>'
		expect(await svgToPdf(r.doc, svg, box, env)).toBe(false)
		expect(r.calls).toEqual([])
	})

	it('pads gradient stops to 0 and 1', async () => {
		const { of } = await draw(
			'<linearGradient id="g"><stop offset="0.3" stop-color="red"/><stop offset="0.7" stop-color="blue"/></linearGradient>' +
				'<rect width="10" height="10" fill="url(#g)"/>'
		)
		expect(of('stop').map((a) => a[0])).toEqual([0, 0.3, 0.7, 1])
	})

	it('inherits attributes along a gradient href chain', async () => {
		const { of } = await draw(
			'<linearGradient id="a" gradientUnits="userSpaceOnUse" x1="5"><stop stop-color="red"/></linearGradient>' +
				'<linearGradient id="b" href="#a"/><path d="M0 0H5V5Z" fill="url(#b)"/>'
		)
		expect(of('linearGradient')[0][0]).toBe(5)
	})

	const png = 'data:image/png;base64,AAAA'

	it('opens a repeated image once, and applies opacity to it', async () => {
		const { of } = await draw(
			`<image href="${png}" width="1" height="1"/><image href="${png}" width="1" height="1" opacity="0.5"/>`
		)
		expect(of('openImage')).toHaveLength(1)
		expect(of('image')).toHaveLength(2)
		expect(of('fillOpacity')).toEqual([[0.5]])
	})

	it('draws unclipped through an unsupported clipPath', async () => {
		const { of } = await draw(
			'<clipPath id="c"><g/></clipPath><rect clip-path="url(#c)" width="1" height="1"/>'
		)
		// The root viewport's clip only.
		expect(of('clip')).toHaveLength(1)
		expect(of('fill')).toHaveLength(1)
	})

	it('draws a nested SVG image through many uses, and notes a rejected image once', async () => {
		const inner = encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>'
		)
		const { of } = await draw(
			`<defs><image id="i" width="1" height="1" href="data:image/svg+xml,${inner}"/></defs>` +
				'<use href="#i"/>'.repeat(500)
		)
		expect(of('path')).toHaveLength(500)

		info.mockClear()
		await draw('<image href="data:image/gif;base64,AAAA" width="1" height="1"/>'.repeat(2))
		const notes = info.mock.calls.map(([m]) => String(m))
		expect(notes).toHaveLength(1)
		expect(notes[0].match(/image \(image\/gif\)/g)).toHaveLength(1)
	})

	it('keeps an unknown or prototype entity literal', () => {
		const t = parseSvg('<svg><text>&constructor;&amp;</text></svg>')
		expect(t && (t.kids[0] as { kids: string[] }).kids.join('')).toBe('&constructor;&')
	})

	it('relies on pdfkit _normalizeColor', async () => {
		const { default: PDFDocument } = await import('pdfkit')
		expect(
			typeof (new PDFDocument() as unknown as { _normalizeColor: unknown })._normalizeColor
		).toBe('function')
	})

	it('accepts only cl:<app>/<owner>:<file> doc refs', () => {
		expect(safeDocRef('cl:calcillo/a.tld:f1?nav=x')).toBe('cl:calcillo/a.tld:f1?nav=x')
		expect(safeDocRef('cl:a/x)(')).toBeUndefined()
		expect(safeDocRef('javascript:alert(1)')).toBeUndefined()
	})

	it('reads length units', async () => {
		const { of } = await draw('<rect width="1" height="1"/>', 'width="10mm" height="10mm"')
		expect(100 / (of('transform')[0][0] as number)).toBeCloseTo(37.8, 1)
	})
})

// vim: ts=4
