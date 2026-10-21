// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * `svgToReactPdf` turns an embed render into react-pdf elements: only SVG props pass through,
 * transforms come out in react-pdf's syntax, and each font family is registered once.
 *
 * `.tsx` for the jsdom project (DOMParser). The react-pdf module is a stub of string tags.
 */

import type * as ReactPdf from '@react-pdf/renderer'
import type * as React from 'react'

import { rasterizeImages, svgToReactPdf } from '../export/svg-to-react-pdf.js'

const registered: string[] = []
const TAGS = ['Svg', 'G', 'Rect', 'Text', 'Tspan', 'Path', 'Defs', 'LinearGradient', 'Stop']
const R = {
	...Object.fromEntries(TAGS.map((t) => [t, t])),
	Font: { register: (o: { family: string }) => registered.push(o.family) }
} as unknown as typeof ReactPdf

type El = React.ReactElement<Record<string, unknown> & { children?: El | El[] }>
const NS = 'xmlns="http://www.w3.org/2000/svg"'

/** Depth-first list of every element in the tree */
function walk(el: El, out: El[] = []): El[] {
	out.push(el)
	const kids = el.props.children
	for (const k of Array.isArray(kids) ? kids : kids ? [kids] : []) {
		if (k && typeof k === 'object') walk(k, out)
	}
	return out
}

const convert = (body: string) =>
	walk(svgToReactPdf(`<svg ${NS} viewBox="0 0 100 100">${body}</svg>`, R, { w: 50, h: 50 }) as El)

describe('svgToReactPdf', () => {
	it('normalizes transforms', () => {
		const els = convert('<rect transform="translate(1 2)  scale(3)" width="1" height="1"/>')
		expect(els.find((e) => e.type === 'Rect')?.props.transform).toBe('translate(1,2) scale(3)')
	})

	it('turns a nested <svg viewBox> into a <G> transform', () => {
		const els = convert(
			`<svg x="10" y="20" width="40" height="20" viewBox="0 0 20 10"><rect width="1" height="1"/></svg>`
		)
		const nested = els.filter((e) => e.type === 'G')[1]
		expect(nested.props.transform).toBe(
			'translate(10,20) translate(0,0) scale(2) translate(0,0)'
		)
		expect(nested.props.viewBox).toBeUndefined()
	})

	it('drops attributes that are not SVG props', () => {
		const rect = convert(
			'<rect width="1" height="1" source="x" key="y" style="children:z;fill:red"/>'
		).find((e) => e.type === 'Rect') as El
		expect(rect.props).not.toHaveProperty('source')
		expect(rect.props.children).toBeUndefined()
		expect(rect.key).not.toBe('y')
		expect(rect.props.fill).toBe('red')
	})

	it('registers each font family once', () => {
		registered.length = 0
		convert('<text font-family="\'Lato\', serif">a<tspan font-family="Lato">b</tspan></text>')
		convert('<text font-family="Lato">c</text>')
		expect(registered).toEqual(['Lato'])
	})
})

describe('rasterizeImages', () => {
	it('leaves PNG-only renders untouched', async () => {
		const svg = `<svg ${NS}><image href="data:image/png;base64,AAAA"/></svg>`
		expect(await rasterizeImages(svg)).toBe(svg)
	})
})

// vim: ts=4
