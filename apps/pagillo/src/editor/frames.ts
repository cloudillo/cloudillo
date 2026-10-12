// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Frame geometry of one page, pure and in page Fx: the selectable items (anchored
 * frames; in Edit layout the master's items and text areas instead), the page's flow boxes, and
 * move snapping to margins, columns, frames and the page centre.
 */

import { FX, marginRegion, type PageDL, type Region } from '@cloudillo/typeset'

import type { StoredFrame, StoredMaster, YPagilloDocument } from '../crdt/stored-types'
import {
	byIds,
	flipRegion,
	flowOrder,
	isRtlLang,
	mirrorFrame,
	resolveSide,
	swapInOut
} from '../crdt/type-converters'

export type PageInfo = PageDL['page']

export interface Box {
	x: number
	y: number
	w: number
	h: number
	rot: number
}

export interface PageItem extends Box {
	/** Frame id, or the region id for `kind: 'region'`. */
	id: string
	kind: 'frame' | 'region'
	/** Paint order (regions sit below everything). */
	z: number
	/** Master static item or text area (editable only in Edit layout). */
	master: boolean
	frame?: StoredFrame
}

export interface ResolvedMaster {
	m: StoredMaster
	margins: StoredMaster['margins']
	cols: number
	gutter: number
	regions: Region[]
	items: string[]
	/** The page side of a 'different' layout: region writes go to that variant. */
	side?: 'left' | 'right'
	/**
	 * Left-hand page of a 'mirror' layout: `regions` (and the item boxes `pageItems` yields) are
	 * the base geometry flipped with `flipRegion`; writes flip back to base coordinates.
	 */
	mirrored?: boolean
}

const SIDE = { l: 'left', r: 'right' } as const

/** Item id of the virtual implicit text area in Edit layout (side with `regions: []`). */
export const IMPLICIT_REGION = '~implicit'

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** The master of `page` as the engine sees it on that page side (`masterToEngine`'s modes). */
export function pageMaster(doc: YPagilloDocument, page: PageInfo): ResolvedMaster | undefined {
	const m = doc.ms.get(page.master)
	if (!m) return
	const mode = resolveSide(m, !!page.side)
	// 'same': the left page is an exact copy of the right one, implicit area included.
	const margins = mode === 'same' && page.side === 'l' ? swapInOut(m.margins) : m.margins
	const base = { m, margins, cols: m.cols, gutter: m.gutter, items: m.items }
	if (mode === 'mirror' && page.side === 'l')
		return { ...base, regions: m.regions.map((r) => flipRegion(r, page.w)), mirrored: true }
	if (mode !== 'different' || !page.side) return { ...base, regions: m.regions }
	const side = SIDE[page.side]
	const v = m[side]
	return {
		m,
		margins: v?.margins ?? m.margins,
		cols: v?.cols ?? m.cols,
		gutter: v?.gutter ?? m.gutter,
		regions: v?.regions ?? m.regions,
		items: v?.items ?? m.items,
		side
	}
}

/** The box inside the page margins (binding side mirrored on left-hand pages). */
export function marginBox(doc: YPagilloDocument, page: PageInfo): Region {
	const pm = pageMaster(doc, page)
	return marginRegion(
		{
			w: page.w,
			h: page.h,
			margins: pm?.margins ?? { t: 0, b: 0, in: 0, out: 0 },
			cols: pm?.cols ?? 1,
			gutter: pm?.gutter ?? 0
		},
		page.side === 'l'
	)
}

/**
 * Layout grid guides inside the margin box: gutter edges in pairs (start, end) — column
 * gutters in `xs` (master `cols`/`gutter`), row gutters in `ys` (`rows`/`rowGutter`, per layout).
 */
export function gridLines(doc: YPagilloDocument, page: PageInfo): { xs: number[]; ys: number[] } {
	const b = marginBox(doc, page)
	const m = doc.ms.get(page.master)
	const edges = (start: number, len: number, n: number, gap: number) => {
		const out: number[] = []
		const cw = (len - (n - 1) * gap) / n
		for (let c = 1; c < n; c++) out.push(start + c * (cw + gap) - gap, start + c * (cw + gap))
		return out
	}
	return {
		xs: edges(b.x, b.w, Math.max(1, b.cols), b.gutter),
		ys: edges(b.y, b.h, Math.max(1, m?.rows ?? 1), m?.rowGutter ?? b.gutter)
	}
}

/**
 * Text areas of a page side in flow order, as `masterToEngine` hands them to the engine:
 * auto → `flowOrder`; manual → stored order, by `leftOrder` on a mirrored left page.
 */
export function flowRegions(doc: YPagilloDocument, page: PageInfo): Region[] {
	const pm = pageMaster(doc, page)
	if (!pm) return []
	if (pm.m.flow !== 'manual')
		return flowOrder(pm.regions, isRtlLang(String(doc.m.get('lang') || 'en')))
	return byIds(pm.regions, pm.mirrored ? pm.m.leftOrder : undefined)
}

/** Flow boxes of a page: its text areas, else the margin box. */
export function flowBoxes(doc: YPagilloDocument, page: PageInfo): Region[] {
	const pm = pageMaster(doc, page)
	return pm?.regions.length ? pm.regions : [marginBox(doc, page)]
}

/** Ids of every master's items, `left`/`right` variants included. */
export function masterItemIds(doc: YPagilloDocument): Set<string> {
	const out = new Set<string>()
	doc.ms.forEach((m) => {
		for (const id of [...m.items, ...(m.left?.items ?? []), ...(m.right?.items ?? [])])
			out.add(id)
	})
	return out
}

/**
 * Selectable items of a page in paint order. Normal mode: the page's anchored frames. With
 * `layoutMaster` (Edit layout): that master's text areas and items, on pages using it only.
 */
export function pageItems(
	doc: YPagilloDocument,
	page: PageInfo,
	layoutMaster?: string
): PageItem[] {
	const out: PageItem[] = []
	const frame = (id: string, f: StoredFrame, master: boolean): PageItem => ({
		id,
		kind: 'frame',
		x: f.x,
		y: f.y,
		w: f.w,
		h: f.h,
		rot: f.rot,
		z: f.z,
		master,
		frame: f
	})
	if (layoutMaster) {
		const pm = page.master === layoutMaster ? pageMaster(doc, page) : undefined
		if (!pm) return out
		// No areas: the implicit one ("Main text area"); its first write materializes it.
		for (const r of pm.regions.length
			? pm.regions
			: [{ ...marginBox(doc, page), id: IMPLICIT_REGION }])
			out.push({
				id: r.id,
				kind: 'region',
				x: r.x,
				y: r.y,
				w: r.w,
				h: r.h,
				rot: 0,
				z: -1e9,
				master: true
			})
		for (const id of pm.items) {
			const f = doc.f.get(id)
			// Mirrored: shown where the engine draws the copy; the id stays the stored frame's.
			if (f) out.push(frame(id, pm.mirrored ? mirrorFrame(f, page.w) : f, true))
		}
	} else {
		const masters = masterItemIds(doc)
		doc.f.forEach((f, id) => {
			if (!masters.has(id) && f.anchor.sec === page.sec && f.anchor.page === page.index)
				out.push(frame(id, f, false))
		})
	}
	return out.sort((a, b) => a.z - b.z)
}

export const boxOf = (it: Box): Box => ({ x: it.x, y: it.y, w: it.w, h: it.h, rot: it.rot })

/** Point inside the (rotated) box. */
export function containsPoint(it: Box, x: number, y: number): boolean {
	const a = (-it.rot * Math.PI) / 180
	const dx = x - (it.x + it.w / 2)
	const dy = y - (it.y + it.h / 2)
	const lx = dx * Math.cos(a) - dy * Math.sin(a)
	const ly = dx * Math.sin(a) + dy * Math.cos(a)
	return Math.abs(lx) <= it.w / 2 && Math.abs(ly) <= it.h / 2
}

type Rect = Pick<Box, 'x' | 'y' | 'w' | 'h'>

/** Unrotated boxes overlap (marquee). */
export function intersects(a: Rect, b: Rect): boolean {
	return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** Reading order on the page (Tab cycling): top to bottom, then left to right. */
export function readingOrder<T extends Box>(items: T[]): T[] {
	return [...items].sort((a, b) => a.y - b.y || a.x - b.x)
}

export interface SnapTargets {
	xs: number[]
	ys: number[]
}

export interface SnapLine {
	x?: number
	y?: number
}

/**
 * Snap lines of a page: margins, flow boxes and their columns, other items, page centre; with
 * `grid` (Edit layout) also the `gridLines` column and row gutter edges.
 */
export function snapTargets(
	doc: YPagilloDocument,
	page: PageInfo,
	items: PageItem[],
	exclude: Set<string>,
	grid = false
): SnapTargets {
	const g = grid ? gridLines(doc, page) : { xs: [], ys: [] }
	const xs = [page.w / 2, ...g.xs]
	const ys = [page.h / 2, ...g.ys]
	for (const b of [marginBox(doc, page), ...flowBoxes(doc, page)]) {
		if (exclude.has(b.id)) continue
		xs.push(b.x, b.x + b.w)
		ys.push(b.y, b.y + b.h)
		const cols = Math.max(1, b.cols)
		const cw = (b.w - (cols - 1) * b.gutter) / cols
		for (let c = 1; c < cols; c++)
			xs.push(b.x + c * (cw + b.gutter) - b.gutter, b.x + c * (cw + b.gutter))
	}
	for (const it of items) {
		if (exclude.has(it.id)) continue
		xs.push(it.x, it.x + it.w / 2, it.x + it.w)
		ys.push(it.y, it.y + it.h / 2, it.y + it.h)
	}
	return { xs, ys }
}

/** The target in `ts` nearest to `v` within `thr`, if any. */
export function snapAt(v: number, ts: number[], thr: number): number | undefined {
	let at: number | undefined
	let d = thr
	for (const t of ts)
		if (Math.abs(t - v) <= d) {
			d = Math.abs(t - v)
			at = t
		}
	return at
}

/** Offset that snaps a box's edges/centre to the nearest targets within `thr` (Fx). */
export function snapBox(
	b: Box,
	t: SnapTargets,
	thr: number
): { dx: number; dy: number; lines: SnapLine[] } {
	const best = (vals: number[], targets: number[]) => {
		let d = thr
		let hit: { off: number; at: number } | undefined
		for (const v of vals)
			for (const tg of targets) {
				const dd = Math.abs(tg - v)
				if (dd <= d) {
					d = dd
					hit = { off: tg - v, at: tg }
				}
			}
		return hit
	}
	const bx = best([b.x, b.x + b.w / 2, b.x + b.w], t.xs)
	const by = best([b.y, b.y + b.h / 2, b.y + b.h], t.ys)
	const lines: SnapLine[] = []
	if (bx) lines.push({ x: bx.at })
	if (by) lines.push({ y: by.at })
	return { dx: bx?.off ?? 0, dy: by?.off ?? 0, lines }
}

/** Effective resolution of an image `px` wide shown `w` (Fx) wide. */
export const effectiveDpi = (px: number, w: number) => px / (w / FX / 72)

// vim: ts=4
