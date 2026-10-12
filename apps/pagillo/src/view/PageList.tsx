// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The virtualized page column. Every page is an exact-size box (CSS flow: `PAD` padding, `GAP`
 * gap — the offsets below assume exactly that); only pages within the viewport ± 1 mount their
 * `PageCanvas` (content) and `PageSvgOverlay` (links, ghosts, empty image boxes). The visible
 * range goes to the worker as its priority viewport. Zoom changes the canvas size and redraws it;
 * the overlay's `viewBox` stays in pt.
 */

import { Skeleton } from '@cloudillo/react'
import { FX } from '@cloudillo/typeset'
import * as React from 'react'

import { type LayoutState, pageKey } from '../layout/useLayout'
import { PageCanvas } from './PageCanvas'
import { type EmptyImage, type ImageSource, PageSvgOverlay } from './PageSvg'
import { useDelayed } from './StatusBar'

/** `'width'` / `'page'` = fit, a number = percent (100 % = 1 pt is 96/72 CSS px). */
export type Zoom = 'width' | 'page' | number

export interface PageRef {
	sec: string
	index: number
	key: string
}

/** Pages in flow order (global page index = array index). */
export function flattenPages(sections: LayoutState['sections']): PageRef[] {
	const out: PageRef[] = []
	for (const s of sections)
		for (let i = 0; i < s.pages; i++) out.push({ sec: s.id, index: i, key: pageKey(s.id, i) })
	return out
}

/** A pointer position on a page: global page index, page-space Fx. */
export interface PageHit {
	index: number
	x: number
	y: number
	/** CSS px per pt when hit (screen thresholds, e.g. 4 px snapping). */
	scale?: number
}

export function pageDomId(key: string): string {
	return `pagillo-page-${key}`
}

/** Scroll to a page; with `frac` (0–1 down the page) centre that spot instead of the page top. */
export function scrollToPage(key: string, frac?: number): void {
	const el = document.getElementById(pageDomId(key))
	if (!el) return
	if (frac === undefined) {
		el.scrollIntoView({ block: 'start', behavior: 'smooth' })
		return
	}
	const box = el.closest('.pagillo-pages')
	if (!box) return
	const r = el.getBoundingClientRect()
	const b = box.getBoundingClientRect()
	const y = r.top + r.height * frac - (b.top + b.height / 2)
	box.scrollBy({ top: y, behavior: 'smooth' })
}

const PX_PER_PT = 96 / 72
const PAD = 24
const GAP = 16
const pt = (fx: number) => fx / FX

export interface PageListProps {
	layout: LayoutState
	zoom: Zoom
	/** Size (Fx) of pages not laid out yet: `m.page`, else A4. */
	defaultPage: { w: number; h: number }
	src: ImageSource
	canEdit: boolean
	emptyImages: Map<string, EmptyImage[]>
	/** Global index of the page at the top third of the view. */
	onCurrent(index: number): void
	/** Effective zoom in percent (fit modes resolved). */
	onZoomPct(pct: number): void
	/** Editor overlay of a page (global index; size Fx), drawn over its `PageSvgOverlay`. */
	overlay?(index: number, size: { w: number; h: number }, scale: number): React.ReactNode
	/** Global index of a page whose overlay is drawn even off-screen (the caret page, for reveal). */
	pinned?: number
	/** Pointer down on a page; move / up while captured (drag); uncaptured mouse moves (hover). */
	onPagePointer?(type: 'down' | 'move' | 'up', hit: PageHit, e: React.PointerEvent): void
}

export function PageList({
	layout,
	zoom,
	defaultPage,
	src,
	canEdit,
	emptyImages,
	onCurrent,
	onZoomPct,
	overlay,
	pinned,
	onPagePointer
}: PageListProps) {
	const ref = React.useRef<HTMLDivElement>(null)
	const [view, setView] = React.useState({ top: 0, w: 0, h: 0 })

	React.useLayoutEffect(() => {
		const el = ref.current
		if (!el) return
		const update = () => setView({ top: el.scrollTop, w: el.clientWidth, h: el.clientHeight })
		update()
		const ro = new ResizeObserver(update)
		ro.observe(el)
		el.addEventListener('scroll', update, { passive: true })
		return () => {
			ro.disconnect()
			el.removeEventListener('scroll', update)
		}
	}, [])

	const list = React.useMemo(() => flattenPages(layout.sections), [layout.sections])
	const sizes = list.map((p) => layout.pages.get(p.key)?.page ?? defaultPage)
	const maxW = Math.max(defaultPage.w, ...sizes.map((s) => s.w))
	const maxH = Math.max(defaultPage.h, ...sizes.map((s) => s.h))
	const fitW = (view.w - 2 * PAD) / pt(maxW)
	const fitH = (view.h - 2 * PAD) / pt(maxH)
	const scale = Math.max(
		0.05,
		zoom === 'width' ? fitW : zoom === 'page' ? Math.min(fitW, fitH) : (zoom / 100) * PX_PER_PT
	)

	// Keep the same spot in view across a zoom change (gaps do not scale: close enough).
	const prevScale = React.useRef(scale)
	React.useLayoutEffect(() => {
		const el = ref.current
		if (el && prevScale.current !== scale) {
			el.scrollTop = Math.max(0, (el.scrollTop - PAD) * (scale / prevScale.current) + PAD)
		}
		prevScale.current = scale
	}, [scale])

	const tops: number[] = []
	let y = PAD
	for (const s of sizes) {
		tops.push(y)
		y += pt(s.h) * scale + GAP
	}
	const bottom = (i: number) => tops[i] + pt(sizes[i].h) * scale
	let first = 0
	while (first < list.length - 1 && bottom(first) < view.top) first++
	let last = first
	while (last < list.length - 1 && tops[last + 1] < view.top + view.h) last++
	let current = first
	while (current < last && tops[current + 1] <= view.top + view.h / 3) current++

	const { setViewport } = layout
	React.useEffect(() => {
		if (list.length) setViewport([first, last + 1])
	}, [first, last, list.length, setViewport])
	React.useEffect(() => onCurrent(current), [current, onCurrent])
	const pct = Math.round((scale / PX_PER_PT) * 100)
	React.useEffect(() => onZoomPct(pct), [pct, onZoomPct])

	const skeleton = useDelayed(list.length === 0 && layout.pending, 300)

	/** The mounted page nearest the client point (a drag may leave the page it started on). */
	const hitAt = (cx: number, cy: number): PageHit | undefined => {
		let best: PageHit | undefined
		let bd = Number.POSITIVE_INFINITY
		for (let i = Math.max(0, first - 1); i <= Math.min(list.length - 1, last + 1); i++) {
			const r = document.getElementById(pageDomId(list[i].key))?.getBoundingClientRect()
			if (!r) continue
			const d = Math.max(0, r.top - cy, cy - r.bottom)
			if (d < bd) {
				bd = d
				best = {
					index: i,
					x: ((cx - r.left) / scale) * FX,
					y: ((cy - r.top) / scale) * FX,
					scale
				}
			}
		}
		return best
	}
	const pointer = (type: 'down' | 'move' | 'up') => (e: React.PointerEvent<HTMLDivElement>) => {
		if (!onPagePointer) return
		if (type === 'down') {
			// Pages, or the pasteboard itself (a click there deselects).
			if (e.target !== e.currentTarget && !(e.target as Element).closest('.pagillo-page'))
				return
			// Keep focus in the input adapter; touch keeps panning (no drag-select).
			if (e.pointerType !== 'touch') {
				e.preventDefault()
				e.currentTarget.setPointerCapture(e.pointerId)
			}
		} else if (
			!e.currentTarget.hasPointerCapture(e.pointerId) &&
			(type === 'up' || e.pointerType !== 'mouse')
		)
			return
		const hit = hitAt(e.clientX, e.clientY)
		if (hit) onPagePointer(type, hit, e)
	}

	return (
		<div
			ref={ref}
			className="pagillo-pages flex-fill"
			onPointerDown={pointer('down')}
			onPointerMove={pointer('move')}
			onPointerUp={pointer('up')}
		>
			{list.length === 0 && skeleton && (
				<Skeleton
					variant="rect"
					className="pagillo-page"
					style={{ width: pt(defaultPage.w) * scale, height: pt(defaultPage.h) * scale }}
				/>
			)}
			{list.map((p, i) => {
				const dl = layout.pages.get(p.key)
				const near = i >= first - 1 && i <= last + 1
				return (
					<div
						key={p.key}
						id={pageDomId(p.key)}
						className="pagillo-page"
						aria-hidden="true"
						style={{
							position: 'relative',
							width: pt(sizes[i].w) * scale,
							height: pt(sizes[i].h) * scale
						}}
					>
						{dl && near && (
							<>
								<PageCanvas
									dl={dl}
									scale={scale}
									src={src}
									glyphs={layout.glyphDefs}
								/>
								<PageSvgOverlay
									dl={dl}
									emptyImages={emptyImages.get(p.key)}
									canEdit={canEdit}
								/>
							</>
						)}
						{(near || i === pinned) && overlay?.(i, sizes[i], scale)}
					</div>
				)
			})}
		</div>
	)
}

// vim: ts=4
