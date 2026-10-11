// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `renderBoardSvg` interpolates peer-written object fields into markup: a string where a number
 * belongs must not break out of its attribute.
 */

import { type BaseTextStyle, createRichTextSVGElement, type DeltaOp } from '@cloudillo/canvas-text'
import * as Y from 'yjs'

import { getOrCreateDocument } from '../crdt/document.js'
import { toObjectId } from '../crdt/ids.js'
import { getAllResolvedObjects } from '../crdt/object-ops.js'
import type { StoredObject } from '../crdt/stored-types.js'
import { renderBoardSvg } from '../export/render-svg.js'

const EVIL = '1" onload="x'

function makeDoc(objects: Record<string, unknown>) {
	const doc = getOrCreateDocument(new Y.Doc())
	for (const [id, stored] of Object.entries(objects)) {
		doc.o.set(toObjectId(id), stored as StoredObject)
		doc.r.push([toObjectId(id)])
	}
	return doc
}

const parse = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml')

describe('renderBoardSvg', () => {
	it('keeps peer-controlled fields inside their attributes', async () => {
		const doc = makeDoc({
			s1: { t: 'S', xy: [EVIL, 2], wh: [EVIL, 40] },
			i1: { t: 'I', xy: [5, EVIL], wh: [10, 10], fid: 'f1', cr: EVIL }
		})
		const svg = await renderBoardSvg(
			getAllResolvedObjects(doc),
			{ x: 0, y: 0, w: 100, h: 100 },
			{ doc }
		)
		const out = parse(svg)
		expect(out.getElementsByTagName('parsererror')).toHaveLength(0)
		expect(out.querySelector('[onload]')).toBeNull()
		expect(svg).not.toContain('onload')
	})

	it('draws the board rect as the viewBox', async () => {
		const doc = makeDoc({
			s1: { t: 'S', xy: [10, 10], wh: [40, 40] },
			s2: { t: 'S', xy: [60, 10], wh: [20, 20] }
		})
		const svg = await renderBoardSvg(
			getAllResolvedObjects(doc),
			{ x: 0, y: 0, w: 200, h: 100 },
			{ doc }
		)
		const root = parse(svg).documentElement
		expect(root.getAttribute('viewBox')).toBe('0 0 200 100')
		expect(root.querySelector('[filter]')).toBeNull()
		expect(root.querySelector('svg > g[clip-path] > rect')?.getAttribute('width')).toBe('200')
	})

	it('resolves palette hsl() to rgb() and clips to the rect', async () => {
		document.documentElement.style.setProperty('--palette-red', 'hsl(0, 70%, 50%)')
		const doc = makeDoc({ r1: { t: 'R', xy: [10, 10], wh: [40, 40], fc: 'red' } })
		const svg = await renderBoardSvg(
			getAllResolvedObjects(doc),
			{ x: 0, y: 0, w: 100, h: 100 },
			{ doc }
		)
		expect(svg).toContain('rgb(')
		expect(svg).not.toMatch(/hsl\(|var\(/)
		expect(parse(svg).querySelector('svg > g[clip-path]')).not.toBeNull()
	})

	it('leaves var(...) in text alone and strips XML-illegal characters', async () => {
		const doc = makeDoc({ t1: { t: 'T', xy: [10, 10], wh: [200, 40] } })
		const text = new Y.Text()
		doc.txt.set('t1', text)
		text.insert(0, 'use var(--col-primary)\u0001 here\n')
		const svg = await renderBoardSvg(
			getAllResolvedObjects(doc),
			{ x: 0, y: 0, w: 300, h: 100 },
			{ doc }
		)
		expect(parse(svg).getElementsByTagName('parsererror')).toHaveLength(0)
		expect(svg).toContain('var(--col-primary)')
		expect(svg).not.toContain('\u0001')
	})
})

describe('createRichTextSVGElement list markers', () => {
	const delta: DeltaOp[] = [{ insert: 'Item' }, { insert: '\n', attributes: { list: 'bullet' } }]
	const bounds = { x: 0, y: 0, width: 400, height: 100 }
	const style: BaseTextStyle = {
		fontFamily: 'Lato',
		fontSize: 20,
		fontWeight: 'normal',
		fontItalic: false,
		textDecoration: 'none',
		fill: '#000',
		textAlign: 'center',
		verticalAlign: 'top',
		lineHeight: 1.2,
		letterSpacing: 0
	}
	const textX = (g: SVGGElement) => Number(g.querySelector('tspan')?.getAttribute('x'))

	it('puts the default bullet just before centred text', () => {
		const g = createRichTextSVGElement(delta, bounds, style)!
		const cx = Number(g.querySelector('circle')?.getAttribute('cx'))
		expect(cx).toBeLessThan(textX(g))
		expect(cx).toBeGreaterThan(textX(g) - 20)
	})

	it('draws a custom bullet icon as a path', () => {
		const icon = {
			pathData: 'M0 0h16v16H0z',
			viewBox: [0, 0, 16, 16] as [number, number, number, number]
		}
		const g = createRichTextSVGElement(delta, bounds, style, icon)!
		expect(g.querySelector('circle')).toBeNull()
		expect(g.querySelector('path')?.getAttribute('d')).toBe(icon.pathData)
	})
})

// vim: ts=4
