// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * One page's display-list content on a `<canvas>` (painted by `drawPage`), plus an invisible
 * loader per image item. Must be a direct child of the page-sized, `position: relative` page div.
 * Whole-page mode: backing store = CSS size × devicePixelRatio, never redrawn on scroll. Past
 * `MAX_CANVAS_PX` / `MAX_SIDE` (Safari's limits) region mode takes over: the canvas covers only
 * the part of the page visible in `.pagillo-pages` plus up to half a viewport on each side,
 * absolutely positioned, and redraws when the visible part leaves the drawn region.
 */

import { useFileImage } from '@cloudillo/react'
import { type DLItem, FX, type PageDL, type Rect } from '@cloudillo/typeset'
import * as React from 'react'

import { clamp } from '../editor/frames'
import { EmbedRendersContext } from '../embeds/useEmbedRenders'
import { drawPage } from './draw-page'
import type { ImageSource } from './PageSvg'

/** Fx → pt. */
const pt = (fx: number) => fx / FX

/** Safari's per-canvas area limit, device px. */
const MAX_CANVAS_PX = 16_777_216
/** Largest backing-store side, device px. */
const MAX_SIDE = 8192
/** Region-mode margins, fractions of the viewport per side, tried until the canvas fits. */
const MARGINS = [0.5, 0.25, 0.125, 0]
/** No embed renders (no `EmbedRendersContext` provider). */
const NO_EMBEDS = new Map<string, HTMLImageElement>()

/** Whether a `w`×`h` CSS px canvas fits the caps at `ratio` device px per CSS px. */
function fits(w: number, h: number, ratio: number): boolean {
	const dw = w * ratio
	const dh = h * ratio
	return dw <= MAX_SIDE && dh <= MAX_SIDE && dw * dh <= MAX_CANVAS_PX
}

const contains = (a: Rect, b: Rect) =>
	b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h

const sameRect = (a: Rect | undefined, b: Rect) =>
	!!a && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

/** `devicePixelRatio`, following changes (other monitor, browser zoom). */
function useDpr(): number {
	const [dpr, setDpr] = React.useState(() => window.devicePixelRatio || 1)
	React.useEffect(() => {
		const mq = window.matchMedia(`(resolution: ${dpr}dppx)`)
		const onChange = () => setDpr(window.devicePixelRatio || 1)
		mq.addEventListener('change', onChange)
		return () => mq.removeEventListener('change', onChange)
	}, [dpr])
	return dpr
}

type ImageItem = Extract<DLItem, { k: 'image' }>

/** Loads the variant `PageImage` would request and reports the loaded element by `fileId`. */
function ImageSlot({
	it,
	src,
	scale,
	onImage
}: {
	it: ImageItem
	src: ImageSource
	scale: number
	onImage: (fileId: string, img: HTMLImageElement) => void
}) {
	const b = it.box
	const c = it.crop
	// The source is drawn at 1/crop.w of the frame: request the matching variant.
	const zoom = c && c.w < 1 ? 1 / Math.max(0.01, c.w) : 1
	const { url } = useFileImage(
		src.ownerTag,
		it.fileId,
		pt(b.w) * scale * zoom,
		pt(b.h) * scale * zoom,
		src.token
	)
	React.useEffect(() => {
		if (!url) return
		let live = true
		const img = new Image()
		img.onload = () => {
			if (live && img.naturalHeight) onImage(it.fileId, img)
		}
		img.src = url
		return () => {
			live = false
		}
	}, [url, it.fileId, onImage])
	return null
}

export interface PageCanvasProps {
	dl: PageDL
	/** CSS px per pt. */
	scale: number
	src: ImageSource
	/** `LayoutState.glyphDefs`: glyphId → SVG path `d`, font units, y up. */
	glyphs: Map<string, string>
}

export const PageCanvas = React.memo(function PageCanvas({
	dl,
	scale,
	src,
	glyphs
}: PageCanvasProps) {
	const ref = React.useRef<HTMLCanvasElement>(null)
	const dpr = useDpr()
	const pageW = pt(dl.page.w)
	const pageH = pt(dl.page.h)
	const regionMode = !fits(pageW * scale, pageH * scale, dpr)
	const [region, setRegion] = React.useState<Rect>()
	const [images, setImages] = React.useState(() => new Map<string, HTMLImageElement>())
	const onImage = React.useCallback((id: string, img: HTMLImageElement) => {
		setImages((m) => (m.get(id) === img ? m : new Map(m).set(id, img)))
	}, [])
	// Embed renders: ask for each embed item of this page (cached by address + box).
	const renders = React.useContext(EmbedRendersContext)
	const want = renders?.want
	const embeds = renders?.images ?? NO_EMBEDS
	React.useEffect(() => {
		if (!want) return
		for (const it of dl.items) if (it.k === 'embed') want(it.frameId, it.box.w, it.box.h)
	}, [dl, want])

	// Region mode: track the page's visible part (pt) and move the drawn region when it leaves.
	React.useLayoutEffect(() => {
		const canvas = ref.current
		const page = canvas?.parentElement
		if (!regionMode || !canvas || !page) return
		const scroller = canvas.closest('.pagillo-pages')
		let cur: Rect | undefined
		const update = (force: boolean) => {
			const p = page.getBoundingClientRect()
			const v = scroller?.getBoundingClientRect() ?? {
				left: 0,
				top: 0,
				right: window.innerWidth,
				bottom: window.innerHeight
			}
			const x0 = (v.left - p.left) / scale
			const y0 = (v.top - p.top) / scale
			const x1 = (v.right - p.left) / scale
			const y1 = (v.bottom - p.top) / scale
			const vis = { x: clamp(x0, 0, pageW), y: clamp(y0, 0, pageH), w: 0, h: 0 }
			vis.w = clamp(x1, 0, pageW) - vis.x
			vis.h = clamp(y1, 0, pageH) - vis.y
			if (!force && cur && contains(cur, vis)) return
			let next = vis
			for (const m of MARGINS) {
				const mx = (x1 - x0) * m
				const my = (y1 - y0) * m
				const r = { x: clamp(x0 - mx, 0, pageW), y: clamp(y0 - my, 0, pageH), w: 0, h: 0 }
				r.w = clamp(x1 + mx, 0, pageW) - r.x
				r.h = clamp(y1 + my, 0, pageH) - r.y
				next = r
				if (fits(r.w * scale, r.h * scale, dpr)) break
			}
			cur = next
			setRegion((prev) => (sameRect(prev, next) ? prev : next))
		}
		update(true)
		const onScroll = () => update(false)
		const target: EventTarget = scroller ?? window
		target.addEventListener('scroll', onScroll, { passive: true })
		const ro = new ResizeObserver(() => update(true))
		ro.observe(scroller ?? document.documentElement)
		return () => {
			target.removeEventListener('scroll', onScroll)
			ro.disconnect()
		}
	}, [regionMode, scale, dpr, pageW, pageH])

	const r: Rect | undefined = regionMode ? region : { x: 0, y: 0, w: pageW, h: pageH }
	// A region that still misses the caps with no margin (huge viewport at high DPR) draws at a
	// lower resolution instead.
	const ratio =
		regionMode && r
			? Math.min(
					dpr,
					MAX_SIDE / (r.w * scale),
					MAX_SIDE / (r.h * scale),
					Math.sqrt(MAX_CANVAS_PX / (r.w * r.h * scale * scale))
				)
			: dpr

	// A new `glyphs` map only redraws when the last draw lacked an outline.
	const missing = React.useRef(false)
	const glyphDep = missing.current ? glyphs : undefined
	React.useLayoutEffect(() => {
		const canvas = ref.current
		const ctx = canvas?.getContext('2d')
		if (!canvas || !ctx || !r) return
		const bw = Math.round(r.w * scale * ratio)
		const bh = Math.round(r.h * scale * ratio)
		if (canvas.width !== bw) canvas.width = bw
		if (canvas.height !== bh) canvas.height = bh
		missing.current = drawPage(ctx, dl, {
			scale: scale * ratio,
			region: regionMode ? r : undefined,
			glyphs,
			images,
			embeds
		}).missingGlyphs
	}, [dl, scale, ratio, regionMode, region, images, embeds, glyphDep])

	const style: React.CSSProperties = regionMode
		? {
				position: 'absolute',
				left: (r?.x ?? 0) * scale,
				top: (r?.y ?? 0) * scale,
				width: (r?.w ?? 0) * scale,
				height: (r?.h ?? 0) * scale
			}
		: { width: pageW * scale, height: pageH * scale }

	return (
		<>
			<canvas ref={ref} className="pagillo-page-canvas" style={style} aria-hidden="true" />
			{dl.items.map((it, i) =>
				it.k === 'image' ? (
					<ImageSlot key={i} it={it} src={src} scale={scale} onImage={onImage} />
				) : null
			)}
		</>
	)
})

// vim: ts=4
