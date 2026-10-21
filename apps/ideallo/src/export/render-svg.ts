// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * A board rect as one static SVG: the render source's answer to `embed:render.req`.
 *
 * No <foreignObject> anywhere. The pure-SVG renderers go through `renderToStaticMarkup`; text,
 * sticky and shape labels go through `createRichTextSVGElement` (the live RichTextDisplay is a
 * foreignObject); images are inlined as data URIs fetched with this board's token; document
 * objects are nested renders, or a placeholder card when that fails.
 */

import { createRichTextSVGElement, type DeltaOp } from '@cloudillo/canvas-text'
import {
	type EmbedRenderContext,
	embedLabel,
	embedPlaceholderSvg,
	EXPORT_IMAGE_VARIANT,
	escapeHtml,
	fetchAsDataUrl,
	finiteNum,
	getFileUrl,
	nestSvg,
	parseSvg,
	type RenderEmbedOutcome,
	renderEmbedMap,
	stripXmlControl
} from '@cloudillo/core'
import { collectSvgFonts, loadFontFaces, resolveFontFamily } from '@cloudillo/fonts'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { FrameRenderer } from '../components/FrameRenderer.js'
import { FreehandPath } from '../components/FreehandPath.js'
import {
	ConnectorRenderer,
	EllipseRenderer,
	PolygonRenderer,
	RectRenderer
} from '../components/ShapeRenderer.js'
import type {
	DocumentObject,
	IdealloObject,
	ImageObject,
	StickyObject,
	TextBearingObject,
	YIdealloDocument
} from '../crdt/index.js'
import { getObjectYText, toObjectId } from '../crdt/index.js'
import { getRotatedObjectBounds, getRotationCenter } from '../utils/bounds.js'
import { objectTextLayout, STICKY_CORNER_RADIUS } from '../utils/object-text.js'
import { isPaintSet } from '../utils/paint.js'
import { colorToCss } from '../utils/palette.js'

export interface BoardRenderRect {
	x: number
	y: number
	w: number
	h: number
}

export interface BoardRenderContext {
	doc: YIdealloDocument
	ownerTag?: string
	token?: string
	/** Nested document renders (deadline: the request's minus a margin); without it every
	 * document object prints as a placeholder */
	embeds?: EmbedRenderContext
	/** Epoch ms to stop waiting for fonts by */
	deadline?: number
}

/** `x y width height` attributes of an object's box */
const boxAttrs = (o: StickyObject | ImageObject | DocumentObject) =>
	`x="${finiteNum(o.x)}" y="${finiteNum(o.y)}" width="${finiteNum(o.width)}" height="${finiteNum(o.height)}"`
const markup = <P extends object>(type: React.FunctionComponent<P>, props: P) =>
	renderToStaticMarkup(React.createElement(type, props))

async function imageHref(o: ImageObject, ctx: BoardRenderContext): Promise<string | undefined> {
	const url = ctx.ownerTag
		? getFileUrl(ctx.ownerTag, o.fileId, EXPORT_IMAGE_VARIANT, { token: ctx.token })
		: undefined
	return url ? fetchAsDataUrl(url).catch(() => undefined) : undefined
}

/** An object's text (text label, sticky body, shape label) as native <text>, or '' */
function textSvg(doc: YIdealloDocument, o: TextBearingObject): string {
	const { box, baseStyle, padding } = objectTextLayout(o)
	const yText = getObjectYText(doc, toObjectId(o.id))
	const plain = 'text' in o && typeof o.text === 'string' && o.text ? o.text : ''
	const delta =
		(yText?.toDelta() as DeltaOp[] | undefined) ?? (plain ? [{ insert: `${plain}\n` }] : [])
	if (!delta.length) return ''
	const g = createRichTextSVGElement(
		delta,
		{
			x: box.x + padding,
			y: box.y + padding,
			width: Math.max(0, box.width - 2 * padding),
			height: Math.max(0, box.height - 2 * padding)
		},
		{ ...baseStyle, fontFamily: resolveFontFamily(baseStyle.fontFamily) }
	)
	if (!g) return ''
	// Per-run fonts from the delta too: the output names @cloudillo/fonts families only
	for (const el of g.querySelectorAll('[font-family]')) {
		el.setAttribute('font-family', resolveFontFamily(el.getAttribute('font-family') ?? ''))
	}
	return new XMLSerializer().serializeToString(g)
}

/** StickyNote's card and organic tilt, with the text drawn as text */
function stickySvg(doc: YIdealloDocument, o: StickyObject): string {
	const tilt = finiteNum((((o.id.charCodeAt(0) + o.id.charCodeAt(1)) % 3) - 1) * 0.5)
	const cx = finiteNum(o.x) + finiteNum(o.width) / 2
	const cy = finiteNum(o.y) + finiteNum(o.height) / 2
	const tf = tilt ? ` transform="rotate(${tilt} ${cx} ${cy})"` : ''
	const op = finiteNum(o.style.opacity, 1)
	const [x, y, w, h] = [finiteNum(o.x), finiteNum(o.y), finiteNum(o.width), finiteNum(o.height)]
	// Stacked rects approximate the feDropShadow blur; svg2pdf/react-pdf have no filters
	let shadow = ''
	// Layers at -3..+6 around the offset edge follow the Gaussian falloff (~0.11 at the edge)
	for (const s of [6, 3, 0, -3]) {
		shadow +=
			`<rect x="${x + 3 - s}" y="${y + 6 - s}" width="${Math.max(0, w + 2 * s)}"` +
			` height="${Math.max(0, h + 2 * s)}" rx="${Math.max(0, STICKY_CORNER_RADIUS + s)}"` +
			` fill="#000" fill-opacity="${0.045 * op}"/>`
	}
	return (
		`<g${tf}>${shadow}<rect ${boxAttrs(o)}` +
		` fill="${escapeHtml(colorToCss(o.style.fillColor))}" rx="${STICKY_CORNER_RADIUS}"` +
		` opacity="${op}"/>${textSvg(doc, o)}</g>`
	)
}

/** ImageRenderer's output with the image inlined; a dashed box when it could not be fetched */
function imageSvg(o: ImageObject, href: string | undefined, clipId: string): string {
	const { style } = o
	const box = boxAttrs(o)
	const rx = finiteNum(o.cornerRadius)
	let s = `<g opacity="${finiteNum(style.opacity, 1)}">`
	if (!href) {
		s += `<rect ${box} fill="#f0f0f0" stroke="#ccc" stroke-width="1" stroke-dasharray="8,4"/>`
	} else {
		if (rx > 0) {
			s += `<defs><clipPath id="${clipId}"><rect ${box} rx="${rx}"/></clipPath></defs>`
		}
		s +=
			`<image href="${escapeHtml(href)}" ${box} preserveAspectRatio="xMidYMid slice"` +
			`${rx > 0 ? ` clip-path="url(#${clipId})"` : ''}/>`
	}
	if (isPaintSet(style.strokeColor) && finiteNum(style.strokeWidth) > 0) {
		s +=
			`<rect ${box} rx="${rx}" fill="none" stroke="${escapeHtml(colorToCss(style.strokeColor))}"` +
			` stroke-width="${finiteNum(style.strokeWidth)}"/>`
	}
	return `${s}</g>`
}

/** A sanitized render nested into the object box, letterboxed; null if it does not parse */
function nestRender(svg: string, o: DocumentObject): string | null {
	const box = {
		x: finiteNum(o.x),
		y: finiteNum(o.y),
		width: finiteNum(o.width),
		height: finiteNum(o.height)
	}
	const el = nestSvg(svg, box)
	return el ? new XMLSerializer().serializeToString(el) : null
}

/** The nested render, else the placeholder card (app name + `cl:` ref); border on top */
function documentSvg(
	o: DocumentObject,
	rendered: RenderEmbedOutcome | undefined,
	ownerTag?: string
) {
	const box = boxAttrs(o)
	let s = rendered?.ok ? nestRender(rendered.pages[0], o) : null
	if (!s) {
		const { app, ref } = embedLabel(o, ownerTag)
		s = embedPlaceholderSvg(o, app, ref)
	}
	if (isPaintSet(o.style.strokeColor) && finiteNum(o.style.strokeWidth) > 0) {
		s +=
			`<rect ${box} rx="${finiteNum(o.cornerRadius)}" fill="none"` +
			` stroke="${escapeHtml(colorToCss(o.style.strokeColor))}"` +
			` stroke-width="${finiteNum(o.style.strokeWidth)}"/>`
	}
	return s
}

function objectSvg(
	o: IdealloObject,
	ctx: BoardRenderContext,
	images: Map<string, string | undefined>,
	embeds: Map<string, RenderEmbedOutcome>,
	clipId: string
): string {
	switch (o.type) {
		case 'freehand':
			return markup(FreehandPath, { object: o })
		case 'rect':
			return markup(RectRenderer, { object: o }) + textSvg(ctx.doc, o)
		case 'ellipse':
			return markup(EllipseRenderer, { object: o }) + textSvg(ctx.doc, o)
		case 'polygon':
			return markup(PolygonRenderer, { object: o }) + textSvg(ctx.doc, o)
		case 'connector':
			return markup(ConnectorRenderer, { object: o })
		case 'frame':
			return markup(FrameRenderer, { object: o })
		case 'text':
			return textSvg(ctx.doc, o)
		case 'sticky':
			return stickySvg(ctx.doc, o)
		case 'image':
			return imageSvg(o, images.get(o.id), clipId)
		case 'document':
			return documentSvg(o, embeds.get(o.id), ctx.ownerTag)
		default:
			return ''
	}
}

/**
 * Palette and theme colours are CSS variables, which mean nothing outside this document. Resolve
 * them against <html> (the light values: `.dark` sits on <body>), else their fallback.
 * Only inside attribute values, so text that reads `var(--x)` stays as typed.
 */
function resolveCssVars(svg: string): string {
	const root = getComputedStyle(document.documentElement)
	// The palette is hsl(), which svg2pdf drops; a detached element serialises colours as rgb()
	const probe = document.createElement('i')
	const toRgb = (v: string) => {
		probe.style.color = ''
		probe.style.color = v
		return probe.style.color || v
	}
	const resolve = (value: string) =>
		value.replace(
			/var\((--[\w-]+)\s*(?:,\s*([^)]*))?\)/g,
			(_, name: string, fallback?: string) => {
				const v = root.getPropertyValue(name).trim() || fallback?.trim()
				return v ? toRgb(v) : 'currentColor'
			}
		)
	return svg.replace(/="([^"]*var\([^"]*)"/g, (_, value: string) => `="${resolve(value)}"`)
}

/**
 * `objects` in paint order, with connector routes resolved (`getAllResolvedObjects`). Only objects
 * whose rotated bounds touch `rect` are drawn; the root svg's viewport clips the rest.
 */
export async function renderBoardSvg(
	objects: IdealloObject[],
	rect: BoardRenderRect,
	ctx: BoardRenderContext
): Promise<string> {
	const shown = objects.filter((o) => {
		const b = getRotatedObjectBounds(o)
		return (
			b.x <= rect.x + rect.w &&
			b.x + b.width >= rect.x &&
			b.y <= rect.y + rect.h &&
			b.y + b.height >= rect.y
		)
	})
	const imageObjs = shown.filter((o): o is ImageObject => o.type === 'image')
	const docObjs = shown.filter((o): o is DocumentObject => o.type === 'document')
	const [hrefs, embeds] = await Promise.all([
		Promise.all(imageObjs.map((o) => imageHref(o, ctx))),
		ctx.embeds ? renderEmbedMap(docObjs, ctx.embeds) : new Map<string, RenderEmbedOutcome>()
	])
	const images = new Map(imageObjs.map((o, i) => [o.id, hrefs[i]]))

	const render = () => boardSvg(shown, rect, ctx, images, embeds)
	let svg = render()
	// Text is laid out with whatever font is loaded: redo it once the board's faces are in
	const wait = Math.min(3000, (ctx.deadline ?? Number.POSITIVE_INFINITY) - Date.now())
	const root = wait > 0 ? parseSvg(svg) : undefined
	if (root && (await loadFontFaces(collectSvgFonts(root), wait))) svg = render()
	return svg
}

function boardSvg(
	shown: IdealloObject[],
	rect: BoardRenderRect,
	ctx: BoardRenderContext,
	images: Map<string, string | undefined>,
	embeds: Map<string, RenderEmbedOutcome>
): string {
	// Clip ids are per render: a host may nest several renders of this board into one document
	const uid = `ir${Math.random().toString(36).slice(2, 8)}`
	let body = ''
	shown.forEach((o, i) => {
		const content = objectSvg(o, ctx, images, embeds, `${uid}c${i}`)
		if (!content) return
		const rotation = finiteNum(o.rotation)
		if (Math.abs(rotation) > 0.1) {
			const [cx, cy] = getRotationCenter(o)
			body += `<g transform="rotate(${rotation} ${finiteNum(cx)} ${finiteNum(cy)})">${content}</g>`
		} else {
			body += `<g>${content}</g>`
		}
	})

	// XMLSerializer and React markup write control characters as is, which a parse rejects
	return stripXmlControl(
		resolveCssVars(
			`<svg xmlns="http://www.w3.org/2000/svg"` +
				` viewBox="${finiteNum(rect.x)} ${finiteNum(rect.y)} ${finiteNum(rect.w)} ${finiteNum(rect.h)}"` +
				` width="${finiteNum(rect.w)}" height="${finiteNum(rect.h)}">` +
				// A letterboxing host shows past the viewBox (e.g. a frame title), so clip to the rect
				`<defs><clipPath id="${uid}v"><rect x="${finiteNum(rect.x)}" y="${finiteNum(rect.y)}"` +
				` width="${finiteNum(rect.w)}" height="${finiteNum(rect.h)}"/></clipPath></defs>` +
				`<g clip-path="url(#${uid}v)"><rect x="${finiteNum(rect.x)}" y="${finiteNum(rect.y)}"` +
				` width="${finiteNum(rect.w)}" height="${finiteNum(rect.h)}" fill="var(--col-surface, #f8f9fa)"/>` +
				`${body}</g></svg>`
		)
	)
}

// vim: ts=4
