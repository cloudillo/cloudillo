// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Headless renders of embedded views.
 *
 * `renderEmbed` boots the source document in a hidden, offscreen iframe with
 * `mode: 'render'`, asks it for a static SVG of a view (`embed:render.req`) and resolves
 * with the page(s) it answers (`embed:render.res`), each one passed through
 * `sanitizeSvg` — the source iframe is untrusted, so callers never see its raw output.
 * Nothing is cached: every render re-boots the source and re-checks permissions.
 */

import { base64ToBytes } from './base64.js'
import { APP_SANDBOX } from './iframe-sandbox.js'
import { type AppMessageBus, parseAppHash } from './message-bus/app-bus.js'
import { notifyEmbedClosed, setupEmbedRelay } from './message-bus/embed-relay.js'
import type { EmbedRenderResPayload } from './message-bus/types.js'
import {
	MAX_RENDER_PAGES,
	MAX_RENDER_SVG_ELEMENTS,
	MAX_RENDER_SVG_SIZE,
	MAX_RENDER_TOTAL_SIZE
} from './render-limits.js'
import { escapeHtml } from './site.js'
import { docRef } from './urls.js'
import { randomId } from './utils.js'

export {
	MAX_RENDER_PAGES,
	MAX_RENDER_SVG_ELEMENTS,
	MAX_RENDER_SVG_SIZE,
	MAX_RENDER_TOTAL_SIZE
} from './render-limits.js'

/** Boot (15 s) + render (10 s) */
export const RENDER_EMBED_TIMEOUT = 25_000
/** Deepest `data:image/svg+xml` nesting a page may carry; deeper `href`s are dropped */
export const MAX_NESTED_SVG_DEPTH = 2

/** Replace characters XML 1.0 forbids (C0 controls except tab/LF/CR, U+FFFE/U+FFFF) */
export const stripXmlControl = (s: string) =>
	// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point
	s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, ' ')

/** Viewport the hidden source renders in (CSS px) */
const RENDER_FRAME_STYLE =
	'position:fixed;left:-10000px;top:0;width:1280px;height:800px;visibility:hidden;border:0'

export interface RenderEmbedOptions {
	bus: Pick<AppMessageBus, 'requestEmbed'>
	targetFileId: string
	targetContentType: string
	/** The host document (the embed's parent in the ancestor chain) */
	sourceFileId: string
	/** Opaque view nav; absent = the source's default view */
	nav?: string
	/** Page box in CSS px at 96 dpi; absent = one SVG at the view's natural size */
	page?: { w: number; h: number; repeatHead?: boolean }
	/** Epoch ms; default now + {@link RENDER_EMBED_TIMEOUT} */
	deadline?: number
	signal?: AbortSignal
}

export interface RenderEmbedResult {
	/** Sanitized, self-contained SVG, one per page */
	pages: string[]
	natural: { w: number; h: number }
}

export type RenderEmbedOutcome = ({ ok: true } & RenderEmbedResult) | { ok: false; error: string }

/**
 * Render a view of an embedded document to sanitized SVG page(s).
 * Rejects on timeout, abort, a source error or an unsanitizable page; always tears down
 * the iframe and its relay (which tells the shell to drop the embed's token).
 */
export async function renderEmbed(opts: RenderEmbedOptions): Promise<RenderEmbedResult> {
	const deadline = opts.deadline ?? Date.now() + RENDER_EMBED_TIMEOUT
	const reqId = randomId()
	let iframe: HTMLIFrameElement | undefined
	let relay: ReturnType<typeof setupEmbedRelay> | undefined
	let timer: ReturnType<typeof setTimeout> | undefined
	let onAbort: (() => void) | undefined

	try {
		return await new Promise<RenderEmbedResult>((resolve, reject) => {
			let settled = false
			const fail = (msg: string) => {
				if (settled) return
				settled = true
				reject(new Error(msg))
			}
			const ms = deadline - Date.now()
			if (ms <= 0) return fail('Render deadline passed')
			if (opts.signal?.aborted) return fail('Render aborted')
			timer = setTimeout(() => fail('Render timed out'), ms)
			onAbort = () => fail('Render aborted')
			opts.signal?.addEventListener('abort', onAbort)

			let requested = false
			let answered = false
			const onChildNotification = (type: string, payload: unknown) => {
				if (settled) return
				if (type === 'app:ready.notify') {
					// The child bus buffers requests until its renderer is set, so the
					// first ready stage (whichever) is enough
					if (requested) return
					requested = true
					relay?.sendToChild('embed:render.req', {
						reqId,
						nav: opts.nav,
						page: opts.page,
						deadline
					})
				} else if (type === 'app:error.notify') {
					fail((payload as { message?: string }).message || 'Source failed to load')
				} else if (type === 'embed:render.res') {
					const res = payload as EmbedRenderResPayload
					if (res.reqId !== reqId || answered) return
					answered = true
					if (!res.ok) return fail(res.error || 'Render failed')
					const { pages: raw, natural } = res
					if (!raw?.length || !natural) return fail('Empty render')
					const total = raw.reduce((n, p) => n + p.length, 0)
					if (raw.length > MAX_RENDER_PAGES || total > MAX_RENDER_TOTAL_SIZE) {
						return fail('Render output too large')
					}
					// Yield between pages, so the deadline can still fire during a long sanitize
					void (async () => {
						try {
							const pages: string[] = []
							for (const p of raw) {
								if (settled) return
								const clean = sanitizeSvg(p)
								if (clean === null) return fail('Render output rejected')
								pages.push(clean)
								await new Promise((r) => setTimeout(r, 0))
							}
							if (settled) return
							settled = true
							resolve({ pages, natural })
						} catch (err) {
							fail(err instanceof Error ? err.message : 'Render output rejected')
						}
					})()
				}
			}

			opts.bus
				.requestEmbed({
					targetFileId: opts.targetFileId,
					targetContentType: opts.targetContentType,
					sourceFileId: opts.sourceFileId,
					access: 'read',
					navState: opts.nav,
					mode: 'render'
				})
				.then(
					({ embedUrl, nonce, resId }) => {
						// Same hash format as `useDocumentEmbed`: the relay and the shell read the
						// embed key from it
						const hash = resId ? `${resId}:_embed:${nonce}` : `_embed:${nonce}`
						if (settled) {
							// No relay to clean up yet, so drop the shell's token here
							const key = parseAppHash(`#${hash}`).embedAuthKey
							if (key) notifyEmbedClosed(key)
							return
						}
						const el = document.createElement('iframe')
						el.setAttribute('sandbox', APP_SANDBOX)
						el.setAttribute('aria-hidden', 'true')
						el.tabIndex = -1
						el.style.cssText = RENDER_FRAME_STYLE
						el.src = `${embedUrl}?v=1#${hash}`
						iframe = el
						relay = setupEmbedRelay(el, { onChildNotification })
						document.body.appendChild(el)
					},
					(err: unknown) => fail(err instanceof Error ? err.message : String(err))
				)
		})
	} finally {
		clearTimeout(timer)
		if (onAbort) opts.signal?.removeEventListener('abort', onAbort)
		relay?.cleanup()
		iframe?.remove()
	}
}

export interface EmbedRenderContext {
	bus: Pick<AppMessageBus, 'requestEmbed'>
	/** The host document */
	sourceFileId: string
	/** Epoch ms, shared by every render */
	deadline?: number
	signal?: AbortSignal
	onProgress?: (done: number, total: number) => void
}

/** How much earlier than its own deadline a render-mode source answers, to leave the host time */
export const RENDER_ANSWER_MARGIN_MS = 1000

/** Context for a render-mode source rendering its own nested embeds; undefined without a file id */
export function nestedEmbedCtx(
	bus: Pick<AppMessageBus, 'requestEmbed'>,
	sourceFileId: string | undefined,
	deadline: number
): EmbedRenderContext | undefined {
	return sourceFileId
		? { bus, sourceFileId, deadline: deadline - RENDER_ANSWER_MARGIN_MS }
		: undefined
}

export interface EmbedRef {
	/** Dedupe key: one render per distinct id */
	id: string
	fileId: string
	contentType: string
	navState?: string
}

/** Render each distinct embed once, keyed by ref id */
export async function renderEmbedMap(
	refs: EmbedRef[],
	ctx: EmbedRenderContext,
	render?: (o: RenderEmbedOptions) => Promise<RenderEmbedResult>
): Promise<Map<string, RenderEmbedOutcome>> {
	const unique = [...new Map(refs.map((r) => [r.id, r])).values()]
	if (!unique.length) return new Map()
	const outcomes = await renderEmbeds(
		unique.map((r) => ({
			bus: ctx.bus,
			targetFileId: r.fileId,
			targetContentType: r.contentType,
			sourceFileId: ctx.sourceFileId,
			nav: r.navState || undefined,
			deadline: ctx.deadline
		})),
		{ signal: ctx.signal, onProgress: ctx.onProgress },
		render
	)
	return new Map(unique.map((r, i) => [r.id, outcomes[i]]))
}

/**
 * Render many embeds, `concurrency` at a time. Resolves in input order; a failure is an
 * `{ ok: false }` entry, never a rejection. `render` is injectable for tests.
 */
export async function renderEmbeds(
	items: RenderEmbedOptions[],
	opts: {
		onProgress?: (done: number, total: number) => void
		signal?: AbortSignal
		concurrency?: number
	} = {},
	render: (o: RenderEmbedOptions) => Promise<RenderEmbedResult> = renderEmbed
): Promise<RenderEmbedOutcome[]> {
	const { onProgress, signal, concurrency = 2 } = opts
	const results: RenderEmbedOutcome[] = new Array(items.length)
	let next = 0
	let done = 0
	if (items.length > 0) onProgress?.(0, items.length)

	const worker = async () => {
		while (next < items.length) {
			const i = next++
			const item = items[i]
			try {
				if (signal?.aborted) throw new Error('Render aborted')
				const r = await render({ ...item, signal: item.signal ?? signal })
				results[i] = { ok: true, ...r }
			} catch (err) {
				results[i] = { ok: false, error: err instanceof Error ? err.message : String(err) }
			}
			onProgress?.(++done, items.length)
		}
	}

	const n = Math.min(Math.max(1, concurrency), items.length)
	await Promise.all(Array.from({ length: n }, worker))
	return results
}

// ============================================
// SANITIZER
// ============================================

const SVG_NS = 'http://www.w3.org/2000/svg'

const ALLOWED_ELEMENTS = new Set([
	'svg',
	'g',
	'defs',
	'use',
	'symbol',
	'path',
	'rect',
	'circle',
	'ellipse',
	'line',
	'polyline',
	'polygon',
	'text',
	'tspan',
	'image',
	'linearGradient',
	'radialGradient',
	'stop',
	'clipPath',
	'mask',
	'pattern',
	'title',
	'desc',
	'filter',
	// Filter primitives that load nothing (no feImage)
	'feBlend',
	'feColorMatrix',
	'feComponentTransfer',
	'feComposite',
	'feDropShadow',
	'feFlood',
	'feFuncA',
	'feFuncB',
	'feFuncG',
	'feFuncR',
	'feGaussianBlur',
	'feMerge',
	'feMergeNode',
	'feMorphology',
	'feOffset'
])

const DATA_RASTER = /^data:image\/(png|jpeg|gif|webp|avif)[;,]/i
const DATA_SVG = /^data:image\/svg\+xml[;,]/i
const URL_REF = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi
/** CSS functions that load a resource without `url(` */
const CSS_FETCH = /(?:^|[^\w-])(?:-webkit-)?(?:image-set|image|cross-fade|element|src)\s*\(/i
/** `style` declarations that could lift content out of the page box (overlays) */
const STYLE_PLACEMENT = /(?:^|;)\s*(?:position|z-index|inset|top|left|right|bottom|content)\s*:/i

/** Every `url(…)` in `text` passes `ok` (no `url(` at all passes too) */
function urlsPass(text: string, ok: (target: string) => boolean): boolean {
	if (/url\(/i.test(text.replace(URL_REF, ''))) return false // unparsed url( form
	for (const m of text.matchAll(URL_REF)) if (!ok(m[2].trim())) return false
	return true
}

const isLocal = (t: string) => t.startsWith('#')

/** Shared across one page and its nested SVGs, so nesting can't multiply the element budget */
type SanitizeBudget = { depth: number; nodes: number }
/** Thrown by `cleanElement` once the element budget is spent */
const OVER_BUDGET = Symbol('over budget')

/** A nested `data:image/svg+xml` gets the same treatment as the page; null if unusable */
function cleanSvgData(href: string, budget: SanitizeBudget): string | null {
	if (budget.depth >= MAX_NESTED_SVG_DEPTH) return null
	try {
		const comma = href.indexOf(',')
		const head = href.slice(0, comma)
		const body = href.slice(comma + 1)
		const svg = /;base64$/i.test(head)
			? new TextDecoder().decode(base64ToBytes(decodeURIComponent(body)))
			: decodeURIComponent(body)
		budget.depth++
		let clean: string | null
		try {
			clean = sanitizeSvgWith(svg, budget)
		} finally {
			budget.depth--
		}
		return clean === null
			? null
			: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean)}`
	} catch (err) {
		if (err === OVER_BUDGET) throw err
		return null
	}
}

function cleanElement(el: Element, budget: SanitizeBudget): void {
	if (++budget.nodes > MAX_RENDER_SVG_ELEMENTS) throw OVER_BUDGET
	for (const attr of Array.from(el.attributes)) {
		const name = attr.localName.toLowerCase()
		const value = attr.value.trim()
		if (name.startsWith('on')) el.removeAttributeNode(attr)
		else if (name === 'style' && STYLE_PLACEMENT.test(value.replace(/\/\*[\s\S]*?\*\//g, '')))
			el.removeAttributeNode(attr)
		else if (name === 'href') {
			if (isLocal(value)) continue
			if (el.localName !== 'image') el.removeAttributeNode(attr)
			else if (DATA_SVG.test(value)) {
				const clean = cleanSvgData(value, budget)
				if (clean === null) el.removeAttributeNode(attr)
				else attr.value = clean
			} else if (!DATA_RASTER.test(value)) el.removeAttributeNode(attr)
		} else if (value.includes('\\') || CSS_FETCH.test(value) || !urlsPass(value, isLocal)) {
			el.removeAttributeNode(attr)
		}
	}

	for (const child of Array.from(el.childNodes)) {
		if (child.nodeType === 1) {
			const c = child as Element
			if (c.namespaceURI === SVG_NS && ALLOWED_ELEMENTS.has(c.localName))
				cleanElement(c, budget)
			else c.remove()
		} else if (child.nodeType === 4) {
			// CDATA re-serializes as-is; a text node gets escaped
			child.replaceWith(el.ownerDocument.createTextNode((child as CDATASection).data))
		} else if (child.nodeType !== 3) {
			// Comments, processing instructions (xml-stylesheet loads CSS)
			child.remove()
		}
	}
}

/** The id an element's `href="#id"` names, or undefined */
function localHref(el: Element): string | undefined {
	for (const attr of Array.from(el.attributes)) {
		if (attr.localName === 'href' && isLocal(attr.value)) return attr.value.slice(1)
	}
	return undefined
}

/**
 * `<use href="#id">` clones its target, so count the clone against the budget; drop it when the target is
 * missing or holds a `<use>` itself (no chains, no cycles, so one level is all it expands)
 */
function cleanUses(root: SVGSVGElement, budget: SanitizeBudget): void {
	for (const use of Array.from(root.getElementsByTagNameNS(SVG_NS, 'use'))) {
		const id = localHref(use)
		if (!id) continue
		const target = root.ownerDocument.getElementById(id)
		if (
			!target ||
			target.localName === 'use' ||
			target.querySelector('use') ||
			target.contains(use)
		) {
			use.remove()
			continue
		}
		budget.nodes += target.getElementsByTagName('*').length + 1
		if (budget.nodes > MAX_RENDER_SVG_ELEMENTS) throw OVER_BUDGET
	}
}

/**
 * Reduce an untrusted SVG to an allow-list of elements and attributes: no script,
 * foreignObject, event handlers or external references: `href` only `#id`, or on
 * `<image>` a raster `data:image/…` or a (recursively sanitized) `data:image/svg+xml`;
 * `url(…)` in attributes only `#id`. No `<style>`: its rules would go document-global once
 * a page is nested into a host SVG, so renderers use presentation attributes instead.
 * Returns null on a parse error, a non-`<svg>` root, input over 5 MB or over
 * {@link MAX_RENDER_SVG_ELEMENTS} elements; nested SVGs deeper than
 * {@link MAX_NESTED_SVG_DEPTH} are dropped.
 */
export function sanitizeSvg(svg: string): string | null {
	return sanitizeSvgWith(svg, { depth: 0, nodes: 0 })
}

// The DOMParser parse itself is not interruptible; the 5 MB per-page cap and the
// element budget bound the work after it
function sanitizeSvgWith(svg: string, budget: SanitizeBudget): string | null {
	// UTF-16 length, not bytes — up to 3x lenient for non-ASCII text
	if (svg.length > MAX_RENDER_SVG_SIZE) return null
	const root = parseSvg(svg)
	if (!root) return null
	try {
		cleanElement(root, budget)
		cleanUses(root, budget)
	} catch (err) {
		// Only the outermost call turns an exhausted budget into a rejection
		if (err === OVER_BUDGET && budget.depth === 0) return null
		throw err
	}
	return new XMLSerializer().serializeToString(root)
}

/** Parse an SVG string; null unless the root is an SVG-namespace `<svg>` with no parsererror */
export function parseSvg(svg: string): SVGSVGElement | null {
	let doc: Document
	try {
		doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
	} catch {
		return null
	}
	if (doc.getElementsByTagName('parsererror').length) return null
	const root = doc.documentElement
	return root instanceof SVGSVGElement && root.namespaceURI === SVG_NS ? root : null
}

/** Parse a render page and position it as a nested `<svg>` in `box`, letterboxed */
export function nestSvg(
	svg: string,
	box: { x: number; y: number; width: number; height: number }
): SVGSVGElement | null {
	const el = parseSvg(svg)
	if (!el) return null
	el.setAttribute('x', String(box.x))
	el.setAttribute('y', String(box.y))
	el.setAttribute('width', String(box.width))
	el.setAttribute('height', String(box.height))
	el.setAttribute('preserveAspectRatio', 'xMidYMid meet')
	// Clip to the box; a root `style` could re-enable `overflow:visible`
	el.setAttribute('overflow', 'hidden')
	el.removeAttribute('transform')
	el.removeAttribute('style')
	prefixIds(el, `e${randomId()}-`)
	return el
}

/** `v` as a finite number, else `d`: peer-supplied values get interpolated into markup */
export function finiteNum(v: unknown, d = 0): number {
	const x = Number(v)
	return Number.isFinite(x) ? x : d
}

/** Card drawn in place of an embed that failed to render: app name, plus its `cl:` ref if given */
export function embedPlaceholderSvg(
	box: { x: unknown; y: unknown; width: unknown; height: unknown },
	app: string,
	ref?: string
): string {
	const [x, y, width, height] = [
		finiteNum(box.x),
		finiteNum(box.y),
		finiteNum(box.width),
		finiteNum(box.height)
	]
	const cx = x + width / 2
	const cy = y + height / 2
	return (
		`<rect x="${x}" y="${y}" width="${width}" height="${height}"` +
		` fill="#f0f0f0" stroke="#ccc" stroke-width="1" stroke-dasharray="4 2"/>` +
		`<text x="${cx}" y="${cy}" text-anchor="middle" font-family="Lato" font-size="14"` +
		` fill="#666">${escapeHtml(app)}</text>` +
		(ref
			? `<text x="${cx}" y="${cy + 18}" text-anchor="middle" font-family="Lato"` +
				` font-size="10" fill="#999">${escapeHtml(ref)}</text>`
			: '')
	)
}

/** The app name and `cl:` ref (when the owner is known) {@link embedPlaceholderSvg} labels an embed with */
export function embedLabel(
	e: { appId?: string; contentType: string; fileId: string; navState?: string | null },
	ownerTag?: string
): { app: string; ref?: string } {
	const app = e.appId || e.contentType.replace(/^cloudillo\//, '')
	return { app, ref: ownerTag ? docRef(app, `${ownerTag}:${e.fileId}`, e.navState) : undefined }
}

/**
 * Prefix every id and local reference, so a nested page's ids can't collide with the host's.
 * Sanitized pages carry no `<style>`; nested `data:` SVGs have their own scope.
 */
function prefixIds(root: Element, prefix: string): void {
	for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
		for (const attr of Array.from(el.attributes)) {
			if (attr.localName === 'id') attr.value = prefix + attr.value
			else if (attr.localName === 'href') {
				if (attr.value.startsWith('#')) attr.value = `#${prefix}${attr.value.slice(1)}`
			} else if (/url\(/i.test(attr.value)) {
				attr.value = attr.value.replace(/url\(\s*(['"]?)#/gi, `url($1#${prefix}`)
			}
		}
	}
}

// vim: ts=4
