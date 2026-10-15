// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Frame geometry of one page, pure and in page Fx: the selectable items (anchored
 * frames; in Edit layout the master's items and text areas instead), the page's flow boxes, and
 * move snapping to margins, columns, frames and the page centre.
 */

import {
	calculateArcRadius,
	DEFAULT_SNAP_ANGLES,
	getAngleFromCenter,
	isInSnapZone,
	normalizeAngle,
	snapAngle
} from '@cloudillo/canvas-tools'
import { FX, marginRegion, type PageDL, type Region, trackCount } from '@cloudillo/typeset'

import { frameOf, framesOf, masterOf } from '../crdt/entities'
import type { StoredFrame, StoredMaster, YPagilloDocument } from '../crdt/stored-types'
import {
	byIds,
	flipRegion,
	flowOrder,
	isRtlLang,
	masterItemIndex,
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
	const m = masterOf(doc, page.master)
	if (!m) return
	// O(frames) anchor reads per call (marginBox/flowBoxes/flowRegions too); cache per transaction
	// if profiled.
	const idx = masterItemIndex(doc).get(page.master)
	const mode = resolveSide(m, !!page.side)
	// 'same': the left page is an exact copy of the right one, implicit area included.
	const margins = mode === 'same' && page.side === 'l' ? swapInOut(m.margins) : m.margins
	const base = { m, margins, cols: m.cols, gutter: m.gutter, items: idx?.both ?? [] }
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
		// Shared items plus this side's own (as `masterToEngine` draws them).
		items: [...(idx?.both ?? []), ...(idx?.[page.side] ?? [])],
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
	const m = masterOf(doc, page.master)
	return {
		xs: gutterEdges(b.x, b.w, b.cols, b.gutter),
		ys: gutterEdges(b.y, b.h, m?.rows ?? 1, m?.rowGutter ?? b.gutter)
	}
}

/**
 * Gutter edges in pairs (start, end) of `len` from `start` split into `n` tracks `gap` apart
 * (`n` clamped by `trackCount`).
 */
export function gutterEdges(start: number, len: number, tracks: number, gap: number): number[] {
	const n = trackCount(tracks)
	const out: number[] = []
	const cw = (len - (n - 1) * gap) / n
	for (let c = 1; c < n; c++) out.push(start + c * (cw + gap) - gap, start + c * (cw + gap))
	return out
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
			const f = frameOf(doc, id)
			// Mirrored: shown where the engine draws the copy; the id stays the stored frame's.
			if (f) out.push(frame(id, pm.mirrored ? mirrorFrame(f, page.w) : f, true))
		}
	} else {
		for (const [id, f] of framesOf(doc))
			if ('sec' in f.anchor && f.anchor.sec === page.sec && f.anchor.page === page.index)
				out.push(frame(id, f, false))
	}
	return out.sort((a, b) => a.z - b.z)
}

export const boxOf = (it: Box): Box => ({ x: it.x, y: it.y, w: it.w, h: it.h, rot: it.rot })

/** Same geometry (`x,y,w,h,rot`); a missing `b` never matches. */
export const sameBox = (a: Box, b: Box | undefined): boolean =>
	!!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.rot === b.rot

/** Axis-aligned bounds of the box rotated `rot`° about the renderer's centre `(x + ⌊w/2⌋, y + ⌊h/2⌋)`. */
export function rotatedBounds(b: Box): Box {
	if (!b.rot || !Number.isFinite(b.rot)) return b
	const a = (b.rot * Math.PI) / 180
	const c = Math.abs(Math.cos(a))
	const s = Math.abs(Math.sin(a))
	const w = b.w * c + b.h * s
	const h = b.w * s + b.h * c
	const cx = b.x + Math.floor(b.w / 2)
	const cy = b.y + Math.floor(b.h / 2)
	return { x: cx - w / 2, y: cy - h / 2, w, h, rot: 0 }
}

/**
 * Reachability shift of a group of boxes moved on a page: `0` unless some box's rotated bounds
 * would be fully off the page, else the smallest group shift (per axis) leaving at least
 * `min` × `min` of every box on the page. When no shift fits every box, that axis centres the
 * group's bounding box on the page.
 */
export function reachShift(
	boxes: Iterable<Box>,
	page: { w: number; h: number },
	min = 12 * FX
): { dx: number; dy: number } {
	const rs = [...boxes].map(rotatedBounds)
	if (!rs.length) return { dx: 0, dy: 0 }
	const off = rs.some((r) => r.x >= page.w || r.x + r.w <= 0 || r.y >= page.h || r.y + r.h <= 0)
	if (!off) return { dx: 0, dy: 0 }
	const axis = (pos: (r: Box) => number, len: (r: Box) => number, size: number) => {
		let lo = Number.NEGATIVE_INFINITY
		let hi = Number.POSITIVE_INFINITY
		let a = Number.POSITIVE_INFINITY
		let b = Number.NEGATIVE_INFINITY
		for (const r of rs) {
			// A box (or page) smaller than `min` needs only its own size in view.
			const m = Math.min(min, len(r), size)
			lo = Math.max(lo, m - pos(r) - len(r))
			hi = Math.min(hi, size - m - pos(r))
			a = Math.min(a, pos(r))
			b = Math.max(b, pos(r) + len(r))
		}
		return lo <= hi ? clamp(0, lo, hi) : size / 2 - (a + b) / 2
	}
	return {
		dx: axis(
			(r) => r.x,
			(r) => r.w,
			page.w
		),
		dy: axis(
			(r) => r.y,
			(r) => r.h,
			page.h
		)
	}
}

/**
 * Keep the boxes `keep(id)` selects reachable on `page`: one group shift (`reachShift` of the
 * kept boxes) moves every box, so a mixed group stays rigid; then a per-box shift for any kept
 * box still fully off (group too spread out).
 */
export function reachBoxes(
	boxes: Map<string, Box>,
	page: { w: number; h: number },
	keep: (id: string) => boolean
): Map<string, Box> {
	const out = new Map<string, Box>()
	const ids = [...boxes.keys()].filter(keep)
	const g = reachShift(
		ids.map((id) => boxes.get(id) as Box),
		page
	)
	for (const [id, b0] of boxes) {
		const b = { ...b0, x: b0.x + g.dx, y: b0.y + g.dy }
		const s = keep(id) ? reachShift([b], page) : { dx: 0, dy: 0 }
		out.set(id, { ...b, x: b.x + s.dx, y: b.y + s.dy })
	}
	return out
}

/**
 * Pointer-up outcome of a move drag (`src` / `target` / `rail` are page keys, `page` the source
 * index): a rail drop onto another page, a cross-page drop, a same-page commit, an empty-image
 * pick, or nothing (a gone page, a rail drop onto the source).
 */
export function moveDrop(
	d: { src: string; target: string; rail?: string; moved: boolean; pick?: string },
	pages: { key: string }[]
):
	| { k: 'rail' | 'cross'; to: number }
	| { k: 'commit'; page: number }
	| { k: 'pick' }
	| { k: 'none' } {
	const at = (key: string) => pages.findIndex((p) => p.key === key)
	// Indexes resolve by key at drop time: a peer may have inserted or removed pages since.
	const src = at(d.src)
	if (src < 0) return { k: 'none' }
	if (d.rail !== undefined) {
		const to = at(d.rail)
		return to >= 0 && to !== src ? { k: 'rail', to } : { k: 'none' }
	}
	if (d.moved) {
		const to = at(d.target)
		if (to < 0) return { k: 'none' }
		return d.target === d.src ? { k: 'commit', page: src } : { k: 'cross', to }
	}
	return d.pick ? { k: 'pick' } : { k: 'none' }
}

/** Rotation arc radius in page units, as RotationHandle draws it in overlay units (page / FX). */
export function rotArcRadius(
	it: { x: number; y: number; w: number; h: number },
	scale: number
): number {
	return (
		calculateArcRadius({
			bounds: { x: it.x / FX, y: it.y / FX, width: it.w / FX, height: it.h / FX },
			scale
		}) * FX
	)
}

/**
 * Rotation for pointer `p` dragged from start angle `a0` (deg); snaps to 15° in the arc's
 * inner zone or on `shift`; result in (−180, 180].
 */
export function rotateTo(
	it: Box,
	a0: number,
	p: { x: number; y: number },
	arc: number,
	shift: boolean
): { rot: number; snap: boolean } {
	const c = { x: it.x + it.w / 2, y: it.y + it.h / 2 }
	const snap = shift || isInSnapZone(p, c, arc)
	const raw = it.rot + getAngleFromCenter(c, p) - a0
	// threshold 180: any angle, so it always snaps to the nearest
	const rot = snap ? snapAngle(raw, DEFAULT_SNAP_ANGLES, 180).angle : raw
	const r = normalizeAngle(rot)
	return { rot: r > 180 ? r - 360 : r, snap }
}

/** Point inside the (rotated) box. */
export function containsPoint(it: Box, x: number, y: number): boolean {
	return edgeDist(it, x, y) <= 0
}

/** Distance of the point to the (rotated) box's outline: negative inside, positive outside. */
export function edgeDist(it: Box, x: number, y: number): number {
	const a = (-it.rot * Math.PI) / 180
	const dx = x - (it.x + it.w / 2)
	const dy = y - (it.y + it.h / 2)
	const lx = dx * Math.cos(a) - dy * Math.sin(a)
	const ly = dx * Math.sin(a) + dy * Math.cos(a)
	return Math.max(Math.abs(lx) - it.w / 2, Math.abs(ly) - it.h / 2)
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
	for (const b of guideBoxes(doc, page)) {
		if (exclude.has(b.id)) continue
		xs.push(b.x, b.x + b.w)
		ys.push(b.y, b.y + b.h)
		xs.push(...gutterEdges(b.x, b.w, b.cols, b.gutter))
	}
	for (const it of items) {
		if (exclude.has(it.id)) continue
		const r = rotatedBounds(it)
		xs.push(r.x, r.x + r.w / 2, r.x + r.w)
		ys.push(r.y, r.y + r.h / 2, r.y + r.h)
	}
	return { xs, ys }
}

/** Snap guide boxes of a page: the margin box and the flow boxes, deduped by id. */
export function guideBoxes(doc: YPagilloDocument, page: PageInfo): Region[] {
	return [
		...new Map([marginBox(doc, page), ...flowBoxes(doc, page)].map((b) => [b.id, b])).values()
	]
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
