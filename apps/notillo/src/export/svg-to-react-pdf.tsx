// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Sanitized SVG (an embed render) → react-pdf `<Svg>` element tree.
 *
 * Supported: svg (root; nested ones become a translated/scaled `<G>`), g, rect, circle, ellipse,
 * line, polyline, polygon, path, text, tspan, defs, linearGradient, radialGradient, stop,
 * clipPath, image (base64 PNG/JPEG data URIs only; {@link rasterizeImages} converts WebP, AVIF,
 * GIF and SVG images first). Everything else — use/symbol, mask, pattern,
 * filter, style/class rules, title/desc — is dropped.
 */

import { blobToDataUrl, parseSvg } from '@cloudillo/core'
import { firstFamily, fontFaceSources, resolveFontFamily } from '@cloudillo/fonts'
import type * as ReactPdf from '@react-pdf/renderer'
import * as React from 'react'

type ReactPdfModule = typeof ReactPdf

const TAGS = {
	g: 'G',
	rect: 'Rect',
	circle: 'Circle',
	ellipse: 'Ellipse',
	line: 'Line',
	polyline: 'Polyline',
	polygon: 'Polygon',
	path: 'Path',
	text: 'Text',
	tspan: 'Tspan',
	defs: 'Defs',
	linearGradient: 'LinearGradient',
	radialGradient: 'RadialGradient',
	stop: 'Stop',
	clipPath: 'ClipPath',
	image: 'Image'
} as const

type Tag = keyof typeof TAGS

/** react-pdf draws only base64 PNG/JPEG; these get re-encoded as PNG */
const NEEDS_RASTER = /^data:image\/(webp|avif|gif|svg\+xml)/i
/** Longest side of a re-encoded image */
const MAX_RASTER_PX = 4096

/**
 * Re-encode an image data URL as a PNG data URL (needs a browser: HTMLImageElement + OffscreenCanvas).
 * `<img>`, not `createImageBitmap`, which rejects SVG blobs. An SVG with no intrinsic size draws at
 * twice its `<image>` box.
 */
async function toPngDataUrl(href: string, boxW: number, boxH: number): Promise<string> {
	const img = new Image()
	img.src = href
	await img.decode()
	let w = img.naturalWidth || boxW * 2
	let h = img.naturalHeight || boxH * 2
	if (!(w > 0 && h > 0)) throw new Error('No image size')
	const k = Math.min(1, MAX_RASTER_PX / Math.max(w, h))
	w = Math.max(1, Math.round(w * k))
	h = Math.max(1, Math.round(h * k))
	const canvas = new OffscreenCanvas(w, h)
	canvas.getContext('2d')?.drawImage(img, 0, 0, w, h)
	return blobToDataUrl(await canvas.convertToBlob({ type: 'image/png' }))
}

/** Re-encode webp/avif/gif/svg `<image>`s as PNG, so react-pdf can draw them; others untouched */
export async function rasterizeImages(svg: string): Promise<string> {
	const root = parseSvg(svg)
	if (!root) return svg
	let changed = false
	for (const img of Array.from(root.getElementsByTagName('image'))) {
		const boxW = Number(img.getAttribute('width')) || 0
		const boxH = Number(img.getAttribute('height')) || 0
		for (const attr of Array.from(img.attributes)) {
			if (attr.localName !== 'href' || !NEEDS_RASTER.test(attr.value)) continue
			try {
				attr.value = await toPngDataUrl(attr.value, boxW, boxH)
				changed = true
			} catch {
				// Left as is; svgToReactPdf drops it
			}
		}
	}
	return changed ? new XMLSerializer().serializeToString(root) : svg
}
type Props = Record<string, string | number>

/** Families already handed to react-pdf's (global) font store */
const registered = new Set<string>()

/** Register all four faces so react-pdf's weight/style resolution never throws */
function registerFamily(R: ReactPdfModule, family: string) {
	if (registered.has(family)) return
	const fonts = fontFaceSources(family)
	if (!fonts.length) return
	R.Font.register({ family, fonts })
	registered.add(family)
}

const camel = (name: string) =>
	name.replace(/^(xlink|xml):/, '').replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())

/** react-pdf's transform parser wants `fn(a,b) fn(c)`: one space between, commas within */
const normalizeTransform = (t: string) =>
	t
		.replace(
			/\(([^)]*)\)/g,
			(_, a: string) =>
				`(${a
					.trim()
					.split(/[\s,]+/)
					.join(',')})`
		)
		.replace(/\)\s*,?\s*/g, ') ')
		.trim()

/** The only (camelCased) names that become react-pdf props: the rest (`key`, `source`, …) are not SVG */
const SVG_PROPS = new Set(
	[
		// Geometry
		'x y x1 y1 x2 y2 cx cy r rx ry fx fy dx dy width height d points viewBox',
		'preserveAspectRatio transform offset',
		// Paint
		'fill fillOpacity fillRule stroke strokeWidth strokeOpacity strokeLinecap strokeLinejoin',
		'strokeDasharray strokeDashoffset opacity visibility display clipPath clipRule stopColor',
		'stopOpacity gradientTransform gradientUnits',
		// Text
		'fontFamily fontSize fontWeight fontStyle textAnchor dominantBaseline letterSpacing',
		'textDecoration',
		// Refs
		'id href'
	]
		.join(' ')
		.split(' ')
)

/** Allow-listed attributes plus inline `style` declarations (which win), camelCased */
function readProps(el: Element): Props {
	const props: Props = {}
	const set = (name: string, value: string) => {
		const n = camel(name)
		if (SVG_PROPS.has(n)) props[n] = value
	}
	for (const a of Array.from(el.attributes)) set(a.name, a.value)
	for (const decl of (el.getAttribute('style') ?? '').split(';')) {
		const i = decl.indexOf(':')
		if (i > 0) set(decl.slice(0, i).trim(), decl.slice(i + 1).trim())
	}
	return props
}

/** Font props → a registered bundled family, numeric weight, normal/italic */
function fixFonts(props: Props, families: Set<string>) {
	if (typeof props.fontFamily === 'string') {
		const family = resolveFontFamily(firstFamily(props.fontFamily))
		families.add(family)
		props.fontFamily = family
	}
	if (props.fontWeight != null) {
		const w = String(props.fontWeight).toLowerCase()
		props.fontWeight = w === 'bold' || w === 'bolder' || Number(w) >= 700 ? 700 : 400
	}
	if (props.fontStyle != null) {
		props.fontStyle = /italic|oblique/i.test(String(props.fontStyle)) ? 'italic' : 'normal'
	}
}

const num = (v: string | number | undefined) => {
	const n = Number.parseFloat(String(v ?? ''))
	return Number.isFinite(n) ? n : undefined
}

/** A nested `<svg x y width height viewBox>` as a `<G>` transform (xMidYMid meet; no clip) */
function nestedSvgTransform(props: Props): string {
	const x = num(props.x) ?? 0
	const y = num(props.y) ?? 0
	const vb = String(props.viewBox ?? '')
		.trim()
		.split(/[\s,]+/)
		.map(Number)
	let t = `translate(${x},${y})`
	if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
		const w = num(props.width) ?? vb[2]
		const h = num(props.height) ?? vb[3]
		const s = Math.min(w / vb[2], h / vb[3])
		t += ` translate(${(w - vb[2] * s) / 2},${(h - vb[3] * s) / 2}) scale(${s}) translate(${-vb[0]},${-vb[1]})`
	}
	for (const k of ['x', 'y', 'width', 'height', 'viewBox', 'preserveAspectRatio', 'transform']) {
		delete props[k]
	}
	return t
}

/**
 * Convert a sanitized render into a react-pdf `<Svg>` of `box` (points), letterboxed.
 * Registers the fonts its text uses. Returns null when the SVG cannot be converted.
 */
export function svgToReactPdf(
	svg: string,
	R: ReactPdfModule,
	box: { w: number; h: number }
): React.ReactElement | null {
	try {
		const root = parseSvg(svg)
		if (!root) return null
		const families = new Set<string>()
		let key = 0

		function convert(el: Element, inText: boolean): React.ReactNode[] {
			const out: React.ReactNode[] = []
			for (const node of Array.from(el.childNodes)) {
				if (node.nodeType === 3) {
					// Text content only counts inside <text>/<tspan>; whitespace collapses
					const s = (node.textContent ?? '').replace(/\s+/g, ' ')
					if (inText && s.trim()) out.push(s)
					continue
				}
				if (node.nodeType !== 1) continue
				const child = node as Element
				const tag = child.localName
				const props = readProps(child)
				if (props.display === 'none') continue
				delete props.display
				fixFonts(props, families)
				if (typeof props.transform === 'string') {
					props.transform = normalizeTransform(props.transform)
				}

				let type: string
				if (tag === 'svg') {
					props.transform = nestedSvgTransform(props)
					type = 'G'
				} else if (Object.hasOwn(TAGS, tag)) {
					type = TAGS[tag as Tag]
				} else {
					continue
				}
				if (type === 'Image') {
					const src = String(props.href ?? '')
					if (!/^data:image\/(png|jpe?g);base64,/i.test(src)) continue
					props.src = src
				}
				// Gradient templates (`href="#id"`) would be mistaken for react-pdf xlinks
				delete props.href
				if (typeof props.gradientTransform === 'string') {
					props.gradientTransform = normalizeTransform(props.gradientTransform)
				}

				const Comp = R[type as keyof ReactPdfModule] as React.ElementType
				const children = convert(child, type === 'Text' || type === 'Tspan')
				out.push(
					<Comp key={key++} {...props}>
						{children.length ? children : undefined}
					</Comp>
				)
			}
			return out
		}

		// Root presentation attributes go on a wrapping <G> so they inherit
		const rootProps = readProps(root)
		const vb =
			typeof rootProps.viewBox === 'string'
				? rootProps.viewBox
				: `0 0 ${num(rootProps.width) ?? box.w} ${num(rootProps.height) ?? box.h}`
		for (const k of [
			'x',
			'y',
			'width',
			'height',
			'viewBox',
			'preserveAspectRatio',
			'transform'
		]) {
			delete rootProps[k]
		}
		fixFonts(rootProps, families)
		const children = convert(root, false)
		for (const f of families) registerFamily(R, f)

		return (
			<R.Svg width={box.w} height={box.h} viewBox={vb} preserveAspectRatio="xMidYMid meet">
				<R.G {...rootProps}>{children}</R.G>
			</R.Svg>
		)
	} catch (err) {
		console.warn('[notillo] SVG → PDF conversion failed', err)
		return null
	}
}

// vim: ts=4
