// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

// SVG → PDF for embed render SVGs (already `sanitizeSvg`'d), through pdfkit's public drawing API.
// Subset: svg (nested viewports), g, path, rect, circle, ellipse, line, polyline, polygon,
// clip-path, linear/radial gradients, image (PNG/JPEG data URIs; SVG data URIs recursively) and
// text/tspan. Text is shaped by our engine (`@cloudillo/fonts` faces, single line at the given x/y)
// and written by `writeGlyphRun`, so it stays selectable; text whose fill is none/transparent is
// written in render mode 3 (invisible). `a` draws as `g` (no link); `use` draws its `#id` target, a
// `symbol` as a nested viewport. Anything else (mask, pattern, filter, …) is dropped with one
// console note per SVG.
//
// Parsing is a minimal DOM-free XML reader (no dependency, worker-safe): the input is
// XMLSerializer output, so it is well-formed and holds no DTD, comments or CDATA.

import type { FontRef } from '../display-list.js'
import { FX, fxToPt } from '../fixed.js'
import type { FontRegistry } from '../fonts/registry.js'
import { textGlyphs } from '../layout/fields.js'
import type { Box } from '../model.js'
import { shapeRun } from '../shape/hb.js'
import { type GlyphsItem, type PdfFace, writeGlyphRun } from './glyph-ops.js'
import { type PdfGfx, type PdfImage, pdfColor } from './graphics.js'

export interface SvgPdfEnv {
	registry: FontRegistry
	/** Load `ref` for shaping and embed it in the document (once per face). */
	face(ref: FontRef): Promise<PdfFace>
}

/** pdfkit's public gradient API. */
interface PdfGradient {
	stop(offset: number, color: string, opacity?: number): PdfGradient
	setTransform(a: number, b: number, c: number, d: number, e: number, f: number): PdfGradient
}

/** The public pdfkit API the converter uses beyond `PdfGfx`. */
interface SvgGfx extends PdfGfx {
	linearGradient(x1: number, y1: number, x2: number, y2: number): PdfGradient
	radialGradient(
		x1: number,
		y1: number,
		r1: number,
		x2: number,
		y2: number,
		r2: number
	): PdfGradient
	fillColor(color: string | PdfGradient, opacity?: number): SvgGfx
	strokeColor(color: string | PdfGradient, opacity?: number): SvgGfx
	/** A fill rule (`'even-odd'`/`'non-zero'`) in place of the colour. */
	fill(rule?: string): SvgGfx
	fillAndStroke(rule?: string): SvgGfx
	clip(rule?: string): SvgGfx
	fillOpacity(o: number): SvgGfx
	// pdfkit's private colour check, the only way to validate a named colour without a
	// copy of its table; a test fails if pdfkit drops it.
	_normalizeColor?(c: string): unknown
}

interface XEl {
	name: string
	attrs: Record<string, string>
	kids: (XEl | string)[]
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

const decode = (s: string) =>
	s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
		e[0] === '#'
			? String.fromCodePoint(
					e[1] === 'x' || e[1] === 'X'
						? Number.parseInt(e.slice(2), 16)
						: Number(e.slice(1))
				)
			: Object.hasOwn(ENTITIES, e)
				? ENTITIES[e]
				: m
	)

/** Local name (`svg:rect` → `rect`). */
const local = (name: string) => name.slice(name.indexOf(':') + 1)

const TOKEN =
	/<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<[?!][^>]*>|<\/[^>]*>|<([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g
const ATTR = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

/** The root `<svg>` element, or undefined when there is none or the text is not XML. */
export function parseSvg(src: string): XEl | undefined {
	try {
		const root: XEl = { name: '', attrs: {}, kids: [] }
		const stack = [root]
		for (const m of src.matchAll(TOKEN)) {
			const top = stack[stack.length - 1]
			if (m[1] !== undefined) top.kids.push(m[1])
			else if (m[2]) {
				const el: XEl = { name: m[2], attrs: {}, kids: [] }
				for (const a of m[3].matchAll(ATTR)) el.attrs[a[1]] = decode(a[2] ?? a[3])
				top.kids.push(el)
				if (!m[4]) stack.push(el)
			} else if (m[5] !== undefined) top.kids.push(decode(m[5]))
			else if (m[0].startsWith('</') && stack.length > 1) stack.pop()
		}
		const svg = root.kids.find(
			(k): k is XEl => typeof k !== 'string' && local(k.name) === 'svg'
		)
		return svg
	} catch {
		return undefined
	}
}

type Mat = [number, number, number, number, number, number]

const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi

/** Every number in `v` (lists like `10,20 30-5`). */
const nums = (v?: string) => (v?.match(NUM) ?? []).map(Number).filter(Number.isFinite)

// em/ex are taken as 16 px (no font-size context here).
const UNITS: Record<string, number> = {
	px: 1,
	pt: 4 / 3,
	pc: 16,
	mm: 96 / 25.4,
	cm: 96 / 2.54,
	in: 96,
	em: 16,
	ex: 16
}

/** A length in user units (px); `%` of `of`; `d` when absent or unparseable. */
function len(v: string | undefined, d: number, of = 0): number {
	const n = Number.parseFloat(v ?? '')
	if (!Number.isFinite(n)) return d
	const t = v?.trim() ?? ''
	if (t.endsWith('%')) return (n / 100) * of
	const u = /(px|pt|pc|mm|cm|in|em|ex)$/i.exec(t)
	return u ? n * UNITS[u[1].toLowerCase()] : n
}

/** An opacity (`0.5` or `50%`), clamped to 0–1. */
const alpha = (v?: string) => Math.min(1, Math.max(0, len(v, 1, 1)))

/** Rounded and clamped for content-stream numbers (never an exponent, never Infinity/NaN). */
const f = (v: number) =>
	Number.isFinite(v) ? Math.round(Math.max(-1e7, Math.min(1e7, v)) * 1000) / 1000 : 0
/** Clamped like {@link f} but not rounded (small scale factors matter). */
const fin = (v: number) => (Number.isFinite(v) ? Math.max(-1e7, Math.min(1e7, v)) : 0)

/** `m` then `n` (PDF row-vector order). */
const mul = (m: Mat, n: Mat): Mat => [
	m[0] * n[0] + m[1] * n[2],
	m[0] * n[1] + m[1] * n[3],
	m[2] * n[0] + m[3] * n[2],
	m[2] * n[1] + m[3] * n[3],
	m[4] * n[0] + m[5] * n[2] + n[4],
	m[4] * n[1] + m[5] * n[3] + n[5]
]
const ID: Mat = [1, 0, 0, 1, 0, 0]

/** An SVG transform list, in `cm` order. */
function transforms(v?: string): Mat[] {
	const out: Mat[] = []
	for (const m of (v ?? '').matchAll(
		/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g
	)) {
		const a = nums(m[2])
		const rad = ((a[0] ?? 0) * Math.PI) / 180
		switch (m[1]) {
			case 'matrix':
				if (a.length === 6) out.push(a as Mat)
				break
			case 'translate':
				out.push([1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0])
				break
			case 'scale':
				out.push([a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0])
				break
			case 'rotate': {
				const [cx = 0, cy = 0] = a.slice(1)
				const c = Math.cos(rad)
				const s = Math.sin(rad)
				out.push([1, 0, 0, 1, cx, cy], [c, s, -s, c, 0, 0], [1, 0, 0, 1, -cx, -cy])
				break
			}
			case 'skewX':
				out.push([1, 0, Math.tan(rad), 1, 0, 0])
				break
			case 'skewY':
				out.push([1, Math.tan(rad), 0, 1, 0, 0])
				break
		}
	}
	return out
}

/** `preserveAspectRatio` of a `vw`×`vh` content in `w`×`h`: `[sx, sy, tx, ty]`. */
function fitView(
	vw: number,
	vh: number,
	w: number,
	h: number,
	par = ''
): [number, number, number, number] {
	if (/^\s*none/.test(par)) return [w / vw, h / vh, 0, 0]
	const s = /slice/.test(par) ? Math.max(w / vw, h / vh) : Math.min(w / vw, h / vh)
	const ax = /xMin/.test(par) ? 0 : /xMax/.test(par) ? 1 : 0.5
	const ay = /YMin/.test(par) ? 0 : /YMax/.test(par) ? 1 : 0.5
	return [s, s, (w - vw * s) * ax, (h - vh * s) * ay]
}

/** Presentation attributes, overridden by the `style` attribute. */
function props(el: XEl): Record<string, string> {
	const p = { ...el.attrs }
	for (const decl of (el.attrs.style ?? '').split(';')) {
		const i = decl.indexOf(':')
		if (i > 0)
			p[decl.slice(0, i).trim().toLowerCase()] = decl
				.slice(i + 1)
				.replace(/!important/i, '')
				.trim()
	}
	return p
}

const INHERITED = [
	'fill',
	'fill-opacity',
	'fill-rule',
	'stroke',
	'stroke-opacity',
	'stroke-width',
	'stroke-linecap',
	'stroke-linejoin',
	'stroke-miterlimit',
	'stroke-dasharray',
	'stroke-dashoffset',
	'font-family',
	'font-size',
	'font-weight',
	'font-style',
	'text-anchor',
	'color',
	'visibility'
]

interface St {
	/** Inherited properties. */
	p: Record<string, string>
	// group opacity is multiplied into each descendant's paint, not composited as a
	// group; overlapping children of a translucent group show through each other.
	op: number
	/** Viewport size (user units), for `%` lengths. */
	vw: number
	vh: number
}

const ROOT_PROPS: Record<string, string> = { fill: 'black', 'font-size': '16' }

function child(st: St, p: Record<string, string>): St {
	const q = { ...st.p }
	for (const k of INHERITED) if (p[k] !== undefined && p[k] !== 'inherit') q[k] = p[k]
	return { ...st, p: q, op: st.op * alpha(p.opacity) }
}

const hidden = (st: St) => st.p.visibility === 'hidden' || st.p.visibility === 'collapse'

const URL_ID = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/

interface Ctx {
	doc: SvgGfx
	env: SvgPdfEnv
	ids: Map<string, XEl>
	dropped: Set<string>
	/** Nesting of SVG data-URI images. */
	depth: number
	/**
	 * Shared across nested SVG images: `use` expansions and elements drawn so far (bound the
	 * output), and the `use` targets being expanded (breaks cycles).
	 */
	lim: { uses: number; nodes: number; pixels: number; bytes: number; active: Set<XEl> }
	/** Opened raster images by data URI. */
	images: Map<string, PdfImage>
	/** Parsed nested SVG roots by data URI; null = unparseable. */
	svgs: Map<string, XEl | null>
	/** Data URIs already dropped (noted once). */
	rejected: Set<string>
}

const MAX_DEPTH = 4
const MAX_USES = 1000
/** Elements drawn per embed. */
const MAX_NODES = 100_000
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_IMAGE_PIXELS = 40_000_000
/** Raster pixels per embed, all distinct images together. */
const MAX_TOTAL_IMAGE_PIXELS = 80_000_000
/** Decoded data-URI bytes per embed, all distinct images together. */
const MAX_TOTAL_IMAGE_BYTES = 64 * 1024 * 1024
/** Not painted themselves (definitions, metadata), silently. */
const SKIP = new Set([
	'defs',
	'title',
	'desc',
	'metadata',
	'linearGradient',
	'radialGradient',
	'stop',
	'clipPath',
	'symbol'
])
const DRAWN = new Set(['svg', 'g', 'a', 'use', 'text', 'image'])
const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'])

function index(root: XEl, ids = new Map<string, XEl>()): Map<string, XEl> {
	const walk = (el: XEl) => {
		if (el.attrs.id && !ids.has(el.attrs.id)) ids.set(el.attrs.id, el)
		for (const k of el.kids) if (typeof k !== 'string') walk(k)
	}
	walk(root)
	return ids
}

/** Path data of a basic shape plus its bounding box (gradient `objectBoundingBox`). */
function geometry(
	tag: string,
	a: Record<string, string>,
	st: St
): { d: string; bb?: [number, number, number, number] } | undefined {
	const X = (k: string) => len(a[k], 0, st.vw)
	const Y = (k: string) => len(a[k], 0, st.vh)
	switch (tag) {
		case 'path':
			return a.d ? { d: a.d } : undefined
		case 'rect': {
			const [x, y, w, h] = [X('x'), Y('y'), X('width'), Y('height')]
			if (!(w > 0 && h > 0)) return
			let rx = len(a.rx, Number.NaN, st.vw)
			let ry = len(a.ry, Number.NaN, st.vh)
			if (Number.isNaN(rx)) rx = Number.isNaN(ry) ? 0 : ry
			if (Number.isNaN(ry)) ry = rx
			rx = Math.min(rx, w / 2)
			ry = Math.min(ry, h / 2)
			const arc = (ex: number, ey: number) => `A${f(rx)} ${f(ry)} 0 0 1 ${f(ex)} ${f(ey)}`
			const d =
				rx > 0 && ry > 0
					? `M${f(x + rx)} ${f(y)}H${f(x + w - rx)}${arc(x + w, y + ry)}V${f(y + h - ry)}` +
						`${arc(x + w - rx, y + h)}H${f(x + rx)}${arc(x, y + h - ry)}V${f(y + ry)}${arc(x + rx, y)}Z`
					: `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`
			return { d, bb: [x, y, w, h] }
		}
		case 'circle':
		case 'ellipse': {
			const cx = X('cx')
			const cy = Y('cy')
			const rx =
				tag === 'circle' ? len(a.r, 0, Math.hypot(st.vw, st.vh) / Math.SQRT2) : X('rx')
			const ry = tag === 'circle' ? rx : Y('ry')
			if (!(rx > 0 && ry > 0)) return
			const arc = (ex: number) => `A${f(rx)} ${f(ry)} 0 1 0 ${f(ex)} ${f(cy)}`
			return {
				d: `M${f(cx - rx)} ${f(cy)}${arc(cx + rx)}${arc(cx - rx)}Z`,
				bb: [cx - rx, cy - ry, 2 * rx, 2 * ry]
			}
		}
		case 'line':
		case 'polyline':
		case 'polygon': {
			const n = tag === 'line' ? [X('x1'), Y('y1'), X('x2'), Y('y2')] : nums(a.points)
			if (n.length < 4) return
			const xs: number[] = []
			const ys: number[] = []
			for (let i = 0; i + 1 < n.length; i += 2) {
				xs.push(n[i])
				ys.push(n[i + 1])
			}
			const pts = xs.map((x, i) => `${f(x)} ${f(ys[i])}`)
			const x0 = Math.min(...xs)
			const y0 = Math.min(...ys)
			return {
				d: `M${pts.join('L')}${tag === 'polygon' ? 'Z' : ''}`,
				bb: [x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0]
			}
		}
	}
}

/** A gradient for `el` over `bb` (needed for `objectBoundingBox`), or undefined. */
function gradient(
	c: Ctx,
	el: XEl,
	st: St,
	opacity: number,
	bb?: [number, number, number, number]
): PdfGradient | undefined {
	const tag = local(el.name)
	const { a, stops } = gradientSource(c, el)
	if (!stops.length) return
	const box = a.gradientUnits !== 'userSpaceOnUse'
	// `objectBoundingBox` needs the shape's box; paths and text have none here, so their
	// gradient falls back to the last stop's colour. Compute a path bbox if that shows up.
	if (box && !(bb && bb[2] > 0 && bb[3] > 0)) return
	const L = (k: string, pct: number, ext: number) => len(a[k] ?? `${pct}%`, 0, box ? 1 : ext)
	let g: PdfGradient
	if (tag === 'linearGradient') {
		g = c.doc.linearGradient(
			L('x1', 0, st.vw),
			L('y1', 0, st.vh),
			L('x2', 100, st.vw),
			L('y2', 0, st.vh)
		)
	} else {
		const cx = L('cx', 50, st.vw)
		const cy = L('cy', 50, st.vh)
		const r = L('r', 50, Math.hypot(st.vw, st.vh) / Math.SQRT2)
		g = c.doc.radialGradient(
			a.fx ? L('fx', 50, st.vw) : cx,
			a.fy ? L('fy', 50, st.vh) : cy,
			0,
			cx,
			cy,
			r
		)
	}
	// The list's last transform applies first.
	let m = transforms(a.gradientTransform).reduce<Mat>((acc, t) => mul(t, acc), ID)
	if (box && bb) m = mul(m, [bb[2], 0, 0, bb[3], bb[0], bb[1]])
	g.setTransform(...m)
	const ss: [number, string, number][] = []
	let prev = 0
	for (const s of stops) {
		const p = props(s)
		const o = Math.min(1, Math.max(prev, len(p.offset, 0, 1)))
		prev = o
		const col = stopColor(c, p, st)
		ss.push([o, col[0], col[1] * opacity])
	}
	// pdfkit spreads the stops over 0..1: pad both ends so the offsets hold.
	if (ss[0][0] > 0) ss.unshift([0, ss[0][1], ss[0][2]])
	const last = ss[ss.length - 1]
	if (last[0] < 1) ss.push([1, last[1], last[2]])
	for (const [o, col, op] of ss) g.stop(o, col, op)
	return g
}

const isStop = (k: XEl | string): k is XEl => typeof k !== 'string' && local(k.name) === 'stop'

/** A gradient's attributes and stops along its `href` chain (own attributes win; first non-empty stop list). */
function gradientSource(c: Ctx, el: XEl): { a: Record<string, string>; stops: XEl[] } {
	const a = { ...el.attrs }
	let stops = el.kids.filter(isStop)
	let src: XEl | undefined = el
	for (let i = 0; i < 8; i++) {
		const id: string = (src.attrs.href ?? src.attrs['xlink:href'] ?? '').replace(/^#/, '')
		src = id ? c.ids.get(id) : undefined
		if (!src) break
		for (const [k, v] of Object.entries(src.attrs)) if (!Object.hasOwn(a, k)) a[k] = v
		if (!stops.length) stops = src.kids.filter(isStop)
	}
	return { a, stops }
}

/** A CSS colour → pdfkit colour + alpha; undefined when none or unknown to pdfkit (noted). */
function colorOf(c: Ctx, v: string, st: St): [string, number | undefined] | undefined {
	const col = pdfColor(v.trim().toLowerCase() === 'currentcolor' ? (st.p.color ?? 'black') : v)
	if (
		col &&
		typeof c.doc._normalizeColor === 'function' &&
		c.doc._normalizeColor(col[0]) == null
	) {
		c.dropped.add(`colour ${v}`)
		return
	}
	return col
}

function stopColor(c: Ctx, p: Record<string, string>, st: St): [string, number] {
	const col = colorOf(c, p['stop-color'] ?? 'black', st) ?? ['#000000', 0]
	return [col[0], (col[1] ?? 1) * alpha(p['stop-opacity'])]
}

/** A fill/stroke value → pdfkit colour or gradient + opacity; undefined = not painted. */
function paintOf(
	c: Ctx,
	v: string | undefined,
	opacity: number,
	st: St,
	bb?: [number, number, number, number]
): [string | PdfGradient, number] | undefined {
	if (!v || v === 'none') return
	const ref = URL_ID.exec(v)
	if (ref) {
		const el = c.ids.get(ref[1])
		const t = el && local(el.name)
		if (el && (t === 'linearGradient' || t === 'radialGradient')) {
			const g = gradient(c, el, st, opacity, bb)
			if (g) return [g, 1]
			const last = gradientSource(c, el).stops.pop()
			if (last) {
				const col = stopColor(c, props(last), st)
				return [col[0], col[1] * opacity]
			}
		}
		// `url(#x) <fallback>`
		const fb = v.slice(ref[0].length).trim()
		return fb ? paintOf(c, fb, opacity, st, bb) : undefined
	}
	const col = colorOf(c, v, st)
	return col && [col[0], (col[1] ?? 1) * opacity]
}

const CAP: Record<string, number> = { butt: 0, round: 1, square: 2 }
const JOIN: Record<string, number> = { miter: 0, round: 1, bevel: 2 }

function paintShape(c: Ctx, d: string, st: St, bb?: [number, number, number, number]): void {
	if (hidden(st)) return
	const p = st.p
	const fill = paintOf(c, p.fill, alpha(p['fill-opacity']) * st.op, st, bb)
	const sw = len(p['stroke-width'], 1, Math.hypot(st.vw, st.vh) / Math.SQRT2)
	const stroke =
		sw > 0 ? paintOf(c, p.stroke, alpha(p['stroke-opacity']) * st.op, st, bb) : undefined
	if (!fill && !stroke) return
	const doc = c.doc
	if (fill) doc.fillColor(fill[0], fill[1])
	if (stroke) {
		doc.strokeColor(stroke[0], stroke[1])
		doc.lineWidth(fin(sw))
		const capV = p['stroke-linecap'] ?? ''
		const joinV = p['stroke-linejoin'] ?? ''
		const cap = Object.hasOwn(CAP, capV) ? CAP[capV] : undefined
		const join = Object.hasOwn(JOIN, joinV) ? JOIN[joinV] : undefined
		const miter = len(p['stroke-miterlimit'], 4)
		const ops: string[] = []
		if (cap !== undefined) ops.push(`${cap} J`)
		if (join !== undefined) ops.push(`${join} j`)
		if (miter >= 1) ops.push(`${f(miter)} M`)
		let dash = nums(p['stroke-dasharray'])
		if (dash.length && dash.every((v) => v >= 0) && dash.some((v) => v > 0)) {
			if (dash.length % 2) dash = [...dash, ...dash]
			ops.push(`[${dash.map(f).join(' ')}] ${f(len(p['stroke-dashoffset'], 0))} d`)
		}
		if (ops.length) doc.addContent(ops.join(' '))
	}
	doc.path(d)
	const rule = p['fill-rule'] === 'evenodd' ? 'even-odd' : 'non-zero'
	if (fill && stroke) doc.fillAndStroke(rule)
	else if (fill) doc.fill(rule)
	else doc.stroke()
}

/** `clip-path="url(#id)"`: intersect the clip with the clipPath's shapes (their own transforms ignored). */
function clipTo(c: Ctx, v: string | undefined, st: St): void {
	const ref = v ? URL_ID.exec(v) : null
	const el = ref ? c.ids.get(ref[1]) : undefined
	if (!el || local(el.name) !== 'clipPath') return
	// Unsupported clips are dropped, not applied as empty: the content stays visible.
	if (el.attrs.clipPathUnits === 'objectBoundingBox') {
		c.dropped.add('clipPath (objectBoundingBox)')
		return
	}
	const kids = el.kids.filter((k): k is XEl => typeof k !== 'string' && !SKIP.has(local(k.name)))
	const bad = kids.find((k) => !SHAPES.has(local(k.name)))
	if (bad) {
		c.dropped.add(`clipPath (${local(bad.name)})`)
		return
	}
	let rule = 'non-zero'
	let any = false
	for (const k of kids) {
		const g = geometry(local(k.name), k.attrs, st)
		if (!g) continue
		c.doc.path(g.d)
		any = true
		if (props(k)['clip-rule'] === 'evenodd') rule = 'even-odd'
	}
	if (!any) c.doc.rect(0, 0, 0, 0)
	c.doc.clip(rule)
}

async function node(c: Ctx, el: XEl, st: St): Promise<void> {
	const tag = local(el.name)
	if (SKIP.has(tag)) return
	if (!DRAWN.has(tag) && !SHAPES.has(tag)) {
		c.dropped.add(tag)
		return
	}
	if (++c.lim.nodes > MAX_NODES) {
		c.dropped.add('elements past the limit')
		return
	}
	const p = props(el)
	if (p.display === 'none') return
	const s = child(st, p)
	c.doc.save()
	try {
		for (const m of transforms(el.attrs.transform)) c.doc.transform(...(m.map(fin) as Mat))
		clipTo(c, p['clip-path'], s)
		const a = el.attrs
		switch (tag) {
			case 'g':
			case 'a':
				for (const k of el.kids) if (typeof k !== 'string') await node(c, k, s)
				break
			case 'use':
				await use(c, el, s)
				break
			case 'svg': {
				const w = len(a.width, s.vw, s.vw)
				const h = len(a.height, s.vh, s.vh)
				const vb = nums(a.viewBox)
				await viewport(
					c,
					el,
					s,
					vb.length === 4 ? vb : [0, 0, w, h],
					len(a.x, 0, s.vw),
					len(a.y, 0, s.vh),
					w,
					h
				)
				break
			}
			case 'text':
				await text(c, el, s)
				break
			case 'image':
				await image(c, el, s)
				break
			default: {
				const g = geometry(tag, a, s)
				if (g) paintShape(c, g.d, s, g.bb)
			}
		}
	} finally {
		c.doc.restore()
	}
}

/** `<use href="#id" x y width height>`: the target at (x, y); a `symbol` as a nested viewport. */
async function use(c: Ctx, el: XEl, st: St): Promise<void> {
	const a = el.attrs
	const t = c.ids.get((a.href ?? a['xlink:href'] ?? '').replace(/^#/, ''))
	if (!t || c.lim.active.has(t) || ++c.lim.uses > MAX_USES) return
	c.lim.active.add(t)
	try {
		c.doc.transform(1, 0, 0, 1, fin(len(a.x, 0, st.vw)), fin(len(a.y, 0, st.vh)))
		if (local(t.name) !== 'symbol') return await node(c, t, st)
		const p = props(t)
		if (p.display === 'none') return
		const w = len(a.width, st.vw, st.vw)
		const h = len(a.height, st.vh, st.vh)
		const vb = nums(t.attrs.viewBox)
		await viewport(c, t, child(st, p), vb.length === 4 ? vb : [0, 0, w, h], 0, 0, w, h)
	} finally {
		c.lim.active.delete(t)
	}
}

/** Content of `el` with viewBox `vb` in the rect `x y w h` of the current user space, clipped to it. */
async function viewport(
	c: Ctx,
	el: XEl,
	st: St,
	vb: number[],
	x: number,
	y: number,
	w: number,
	h: number
): Promise<void> {
	if (!(w > 0 && h > 0 && vb[2] > 0 && vb[3] > 0)) return
	const [sx, sy, tx, ty] = fitView(vb[2], vb[3], w, h, el.attrs.preserveAspectRatio)
	c.doc.rect(x, y, w, h).clip()
	c.doc.transform(fin(sx), 0, 0, fin(sy), fin(x + tx - vb[0] * sx), fin(y + ty - vb[1] * sy))
	const s = { ...st, vw: vb[2], vh: vb[3] }
	for (const k of el.kids) if (typeof k !== 'string') await node(c, k, s)
}

/** A root `<svg>` in the rect `x y w h` (false, drawing nothing, for an empty viewBox); without a viewBox its width/height (else `w`×`h` · `unit`) is the content size. */
async function drawRoot(
	c: Ctx,
	root: XEl,
	x: number,
	y: number,
	w: number,
	h: number,
	unit: number,
	op = 1
): Promise<boolean> {
	const a = root.attrs
	const vb = nums(a.viewBox)
	const box =
		vb.length === 4
			? vb
			: [0, 0, len(a.width, w * unit, w * unit), len(a.height, h * unit, h * unit)]
	if (!(box[2] > 0 && box[3] > 0)) return false
	const st = child({ p: ROOT_PROPS, op, vw: box[2], vh: box[3] }, props(root))
	c.doc.save()
	try {
		await viewport(c, root, st, box, x, y, w, h)
	} finally {
		c.doc.restore()
	}
	return true
}

const bytesOf = (bin: string) => Uint8Array.from(bin, (ch) => ch.charCodeAt(0))

async function image(c: Ctx, el: XEl, st: St): Promise<void> {
	if (hidden(st)) return
	const a = el.attrs
	const [x, y, w, h] = [
		len(a.x, 0, st.vw),
		len(a.y, 0, st.vh),
		len(a.width, 0, st.vw),
		len(a.height, 0, st.vh)
	]
	const m = /^data:([^;,]*)((?:;[^;,]*)*),([\s\S]*)$/.exec(a.href ?? a['xlink:href'] ?? '')
	if (!(w > 0 && h > 0) || !m) return
	const type = m[1].toLowerCase()
	const uri = m[0]
	if (c.rejected.has(uri)) return
	const reject = (note: string) => {
		c.rejected.add(uri)
		c.dropped.add(note)
	}
	try {
		if (type !== 'image/svg+xml' && type !== 'image/png' && type !== 'image/jpeg')
			return reject(`image (${type})`)
		let root = type === 'image/svg+xml' ? c.svgs.get(uri) : undefined
		let img = c.images.get(uri)
		if (root === undefined && !img) {
			const body = decodeURIComponent(m[3])
			const raw = /;base64/i.test(m[2]) ? atob(body) : body
			c.lim.bytes += raw.length
			if (raw.length > MAX_IMAGE_BYTES || c.lim.bytes > MAX_TOTAL_IMAGE_BYTES)
				return reject('image (too large)')
			if (type === 'image/svg+xml') {
				root = parseSvg(raw === body ? raw : new TextDecoder().decode(bytesOf(raw))) ?? null
				c.svgs.set(uri, root)
			} else {
				img = c.doc.openImage(bytesOf(raw))
				const px = img.width * img.height
				if (px > MAX_IMAGE_PIXELS || c.lim.pixels + px > MAX_TOTAL_IMAGE_PIXELS)
					return reject('image (too large)')
				c.lim.pixels += px
				c.images.set(uri, img)
			}
		}
		if (type === 'image/svg+xml') {
			if (root && c.depth < MAX_DEPTH)
				await drawRoot(
					{ ...c, ids: index(root), depth: c.depth + 1 },
					root,
					x,
					y,
					w,
					h,
					1,
					st.op
				)
			return
		}
		if (!img) return
		const [sx, sy, tx, ty] = fitView(img.width, img.height, w, h, a.preserveAspectRatio)
		c.doc.rect(x, y, w, h).clip()
		if (st.op < 1) c.doc.fillOpacity(st.op)
		c.doc.image(img, x + tx, y + ty, { width: img.width * sx, height: img.height * sy })
	} catch {
		reject(`image (${type || 'unreadable'})`)
	}
}

const family = (v?: string) =>
	(v ?? '')
		.split(',')[0]
		.trim()
		.replace(/^['"]|['"]$/g, '')
const weight = (v?: string) => (v === 'bold' || v === 'bolder' ? 700 : len(v, 400))

interface TextRun {
	ref: FontRef
	face: PdfFace
	size: number
	x: number
	y: number
	st: St
	g: ReturnType<typeof textGlyphs>
	/** Advance width, Fx of user space. */
	w: number
}

/**
 * `<text>` and its `<tspan>`s on one line each: runs flow from the pen; an absolute `x` starts a
 * new anchored chunk. Only the first value of an x/y/dx/dy list is used (no per-glyph positions).
 */
async function text(c: Ctx, el: XEl, st: St): Promise<void> {
	const chunks: TextRun[][] = [[]]
	const pen = { x: 0, y: 0 }
	let space = true
	const walk = async (e: XEl, s: St) => {
		const a = e.attrs
		const xs = nums(a.x)
		const ys = nums(a.y)
		if (xs.length) {
			pen.x = xs[0]
			chunks.push([])
		}
		if (ys.length) pen.y = ys[0]
		pen.x += nums(a.dx)[0] ?? 0
		pen.y += nums(a.dy)[0] ?? 0
		for (const k of e.kids) {
			if (typeof k !== 'string') {
				const t = local(k.name)
				const p = props(k)
				if (t === 'tspan' && p.display !== 'none') await walk(k, child(s, p))
				else if (!SKIP.has(t) && t !== 'tspan') c.dropped.add(t)
				continue
			}
			// xml:space="default": newlines and tabs are spaces, runs of spaces collapse.
			let t = k.replace(/[\n\r\t]/g, ' ').replace(/ {2,}/g, ' ')
			if (space) t = t.replace(/^ /, '')
			if (!t) continue
			space = t.endsWith(' ')
			const size = len(s.p['font-size'], 16)
			// A size rounding to 0 Fx would scale glyphs by Infinity in `writeGlyphRun`.
			if (!(size > 0 && size <= 1e4 && Math.round(size * FX) >= 1)) continue
			const ref = c.env.registry.resolveFace(
				family(s.p['font-family']),
				weight(s.p['font-weight']),
				/italic|oblique/.test(s.p['font-style'] ?? '')
			)
			const face = await c.env.face(ref)
			const g = textGlyphs(
				{ registry: c.env.registry, shape: shapeRun },
				ref,
				Math.round(size * FX),
				t
			)
			let w = 0
			for (const adv of g.advances) w += adv
			chunks[chunks.length - 1].push({ ref, face, size, x: pen.x, y: pen.y, st: s, g, w })
			pen.x += w / FX
		}
	}
	await walk(el, st)
	for (const ch of chunks) {
		const w = ch.reduce((n, r) => n + r.w, 0) / FX
		const anchor = ch[0]?.st.p['text-anchor']
		const dx = anchor === 'middle' ? -w / 2 : anchor === 'end' ? -w : 0
		for (const r of ch) glyphRun(c, r, dx)
	}
}

function glyphRun(c: Ctx, r: TextRun, dx: number): void {
	const s = r.st
	if (hidden(s) || !r.g.glyphs.length) return
	const x = r.x + dx
	if (!Number.isFinite(x) || !Number.isFinite(r.y) || Math.abs(x) > 1e7 || Math.abs(r.y) > 1e7)
		return
	const fill = s.p.fill
	// gradient-filled text is written black (writeGlyphRun sets a plain fill colour).
	const col =
		fill === undefined || URL_ID.test(fill)
			? (['#000000', undefined] as const)
			: colorOf(c, fill, s)
	const invisible = !col || col[1] === 0
	c.doc.save()
	try {
		// Render mode 3: no paint, still selectable/searchable (the pagillo-source text layer).
		if (invisible) c.doc.addContent('3 Tr')
		const color = col?.[0] ?? '#000000'
		c.doc.fillColor(color, invisible ? 1 : (col?.[1] ?? 1) * alpha(s.p['fill-opacity']) * s.op)
		const it: GlyphsItem = {
			k: 'glyphs',
			font: r.ref,
			size: Math.round(r.size * FX),
			color,
			x: Math.round(x * FX),
			y: Math.round(r.y * FX),
			...r.g,
			tag: 0
		}
		writeGlyphRun(c.doc, r.face, it)
	} finally {
		c.doc.restore()
	}
}

/**
 * Draw a sanitized render SVG into `box` (Fx, current page space; the root's viewBox fits it as
 * `preserveAspectRatio` says, clipped to the box). False when `svg` has no `<svg>` root or an
 * empty viewBox: nothing was drawn. Throws only when a font cannot be loaded (q/Q stay balanced).
 */
export async function svgToPdf(
	doc: PdfGfx,
	svg: string,
	box: Box,
	env: SvgPdfEnv
): Promise<boolean> {
	const root = parseSvg(svg)
	if (!root) return false
	const c: Ctx = {
		doc: doc as SvgGfx,
		env,
		ids: index(root),
		dropped: new Set(),
		depth: 0,
		lim: { uses: 0, nodes: 0, pixels: 0, bytes: 0, active: new Set() },
		images: new Map(),
		svgs: new Map(),
		rejected: new Set()
	}
	// No viewBox and no size: the render was asked for at the box size in CSS px.
	const ok = await drawRoot(
		c,
		root,
		fxToPt(box.x),
		fxToPt(box.y),
		fxToPt(box.w),
		fxToPt(box.h),
		96 / 72
	)
	if (c.dropped.size)
		console.info(`[typeset] SVG→PDF: dropped unsupported ${[...c.dropped].join(', ')}`)
	return ok
}

// vim: ts=4
