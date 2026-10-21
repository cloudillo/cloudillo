// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Master ("Page layout" in the UI) operations (`ms` map) and the publication page size.
 * Static items are frames anchored `{ ms, side? }` (`masterItemIndex`), not lists on the master.
 */

import { type Margins, marginRegion, type Region } from '@cloudillo/typeset'
import type * as Y from 'yjs'

import {
	frameOf,
	framesOf,
	masterOf,
	mastersOf,
	newFrameMap,
	newMasterMap,
	patchFrame,
	patchMaster,
	sectionOf,
	sectionsOf
} from './entities'
import { type MasterId, newId, type SectionId } from './ids'
import { updateSection } from './section-ops'
import type {
	StoredFrame,
	StoredMaster,
	StoredMasterVariant,
	StoredTextFrameData,
	YPagilloDocument
} from './stored-types'
import { copyTextData } from './story-ops'
import {
	byIds,
	flipRegion,
	masterItemIndex,
	mirrorFrame,
	readMeta,
	resolveSide
} from './type-converters'

export function addMaster(yDoc: Y.Doc, doc: YPagilloDocument, master: StoredMaster): MasterId {
	const id = newId()
	yDoc.transact(() => {
		doc.ms.set(id, newMasterMap(master))
	}, yDoc.clientID)
	return id
}

/** Patch; a layout key set to `undefined` is removed (e.g. `left` / `right` variants). */
export function updateMaster(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	id: MasterId,
	patch: Partial<StoredMaster>
): void {
	const y = doc.ms.get(id)
	if (!y) return
	yDoc.transact(() => {
		patchMaster(y, patch)
	}, yDoc.clientID)
}

/**
 * Materialize the implicit flow area before a layout write: base `regions: []` gets the
 * margin box, and in 'different' mode so does each `left`/`right` variant that would otherwise
 * show it (own `regions: []`, or inheriting an empty base) — with that side's margins, so no
 * page moves and a drawn area adds to the main one instead of replacing it. Joins an open
 * transaction. Every side materialized gets the same id, which is returned; undefined when
 * nothing was empty.
 */
export function ensureRegions(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	id: MasterId
): string | undefined {
	const m = masterOf(doc, id)
	if (!m) return
	const rid = newId()
	// Only the changed keys: a copy of `m` would write back reader defaults over peer edits.
	const next: Partial<StoredMaster> = {}
	if (!m.regions.length) next.regions = [{ ...marginRegion(m), id: rid }]
	if (resolveSide(m, readMeta(doc.m).facing) === 'different') {
		for (const side of ['left', 'right'] as const) {
			const v = m[side]
			if (v?.regions?.length || (!v?.regions && m.regions.length)) continue
			const g = {
				w: m.w,
				h: m.h,
				margins: v?.margins ?? m.margins,
				cols: v?.cols ?? m.cols,
				gutter: v?.gutter ?? m.gutter
			}
			next[side] = { ...v, regions: [{ ...marginRegion(g, side === 'left'), id: rid }] }
		}
	}
	if (!Object.keys(next).length) return
	yDoc.transact(() => {
		patchMaster(doc.ms.get(id), next)
	}, yDoc.clientID)
	return rid
}

/** One undoable Edit-layout write: materializes the implicit area first; `made` = its id. */
export function layoutTx<T>(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	id: MasterId | undefined,
	f: (made: string | undefined) => T
): T {
	return yDoc.transact(() => f(id ? ensureRegions(yDoc, doc, id) : undefined), yDoc.clientID)
}

/** Areas of one list in the Text areas section: base, a 'different' variant, or the mirrored left order. */
export type AreaKey = 'base' | 'left' | 'right'

export const areasOf = (m: StoredMaster, key: AreaKey) =>
	key === 'base' ? m.regions : (m[key]?.regions ?? m.regions)

export const withAreas = (
	m: StoredMaster,
	key: AreaKey,
	regions: Region[]
): Partial<StoredMaster> =>
	key === 'base'
		? { regions }
		: key === 'left'
			? { left: { ...m.left, regions } }
			: { right: { ...m.right, regions } }

/** Delete a static item frame and its story (items are never threaded). Inside a transaction. */
function dropItem(doc: YPagilloDocument, fid: string): void {
	const f = frameOf(doc, fid)
	const st = f?.t === 'txt' && (f.data as StoredTextFrameData).story
	if (st) doc.tx.delete(st)
	doc.f.delete(fid)
}

/** Delete an unused master with its static items. Returns false if a section uses it. */
export function deleteMaster(yDoc: Y.Doc, doc: YPagilloDocument, id: MasterId): boolean {
	if (!masterOf(doc, id)) return false
	for (const [, s] of sectionsOf(doc)) if (s.first === id || s.rest === id) return false
	yDoc.transact(() => {
		const e = masterItemIndex(doc).get(id)
		for (const fid of e ? [...e.both, ...e.l, ...e.r] : []) dropItem(doc, fid)
		doc.ms.delete(id)
	}, yDoc.clientID)
	return true
}

/**
 * Copy a master under `name`. Its static items (every side) are cloned to new frame ids anchored
 * to the copy with the same `side`, text items with a copied story. One transaction; undefined
 * if `id` is missing.
 */
export function duplicateMaster(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	id: MasterId,
	name: string
): MasterId | undefined {
	const m = masterOf(doc, id)
	if (!m) return
	const copy = newId()
	yDoc.transact(() => {
		doc.ms.set(copy, newMasterMap({ ...m, name }))
		const e = masterItemIndex(doc).get(id)
		for (const fid of e ? [...e.both, ...e.l, ...e.r] : [])
			cloneFrame(doc, fid, (g) => ({ ...g, anchor: { ...g.anchor, ms: copy } }))
	}, yDoc.clientID)
	return copy
}

/**
 * Copy frame `fid` (through `map`) to `nid`, a text frame with a copied story. Call inside a
 * transaction; undefined if `fid` is missing.
 */
function cloneFrame(
	doc: YPagilloDocument,
	fid: string,
	map = (f: StoredFrame) => f,
	nid = newId()
): string | undefined {
	const f = frameOf(doc, fid)
	if (!f) return
	const data = f.t === 'txt' ? copyTextData(doc, f.data as StoredTextFrameData) : f.data
	doc.f.set(nid, newFrameMap({ ...map(f), data }))
	return nid
}

/**
 * Id of item `id`'s mirrored left clone: deterministic, so peers splitting at once write one key
 * (the loser's copied story is orphaned and swept on load). No `~`, which marks synthesized ids.
 */
export const leftCloneId = (id: string) => `${id}-l`

/** Use master `masterId` for a section's first page (`'first'`) or its other pages (`'rest'`). */
export function assignMaster(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	masterId: MasterId,
	secId: SectionId,
	which: 'first' | 'rest'
): void {
	updateSection(yDoc, doc, secId, which === 'first' ? { first: masterId } : { rest: masterId })
}

/**
 * Facing-page mode, after `ensureRegions`; no-op when unchanged. → `'different'` seeds the
 * variants with what the pages showed, so nothing moves: `right` gets the base areas, `left`
 * the base areas as the old mode drew them (from 'mirror': flipped, in `leftOrder` when manual).
 * From 'mirror' the shared static items also split: each moves to `side: 'r'` and gets a
 * mirrored clone with `side: 'l'` (shared items draw on both sides in 'different'). Leaving
 * 'different', the right page's look becomes the shared one: `side: 'r'` items lose their side,
 * `side: 'l'` items are deleted. Entering it, stale side items (not drawn before) are deleted.
 */
export function setMasterSide(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	id: MasterId,
	side: 'mirror' | 'same' | 'different'
): void {
	yDoc.transact(() => {
		const m0 = masterOf(doc, id)
		if (!m0) return
		const prev = resolveSide(m0, readMeta(doc.m).facing)
		if (prev === side) return
		ensureRegions(yDoc, doc, id)
		const m = masterOf(doc, id)
		if (!m) return
		const items = masterItemIndex(doc).get(id) ?? { both: [], l: [], r: [] }
		for (const fid of items.l) dropItem(doc, fid)
		if (side !== 'different') {
			for (const fid of items.r) patchFrame(doc.f.get(fid), { anchor: { ms: id } })
			updateMaster(yDoc, doc, id, { side, left: undefined, right: undefined })
			return
		}
		for (const fid of items.r) dropItem(doc, fid)
		let left: StoredMasterVariant = { regions: m.regions }
		if (prev === 'mirror') {
			left = {
				regions: byIds(
					m.regions.map((g) => flipRegion(g, m.w)),
					m.flow === 'manual' ? m.leftOrder : undefined
				)
			}
			// Clone ids sort differently from their sources, so items with equal z may swap paint
			// order; carry the source order into z if that shows.
			for (const fid of items.both) {
				patchFrame(doc.f.get(fid), { anchor: { ms: id, side: 'r' } })
				cloneFrame(
					doc,
					fid,
					(f) => ({ ...mirrorFrame(f, m.w), anchor: { ms: id, side: 'l' } }),
					leftCloneId(fid)
				)
			}
		}
		updateMaster(yDoc, doc, id, { side, left, right: { regions: m.regions } })
	}, yDoc.clientID)
}

const r = Math.round

function scaleMargins(m: Margins, sx: number, sy: number): Margins {
	return { t: r(m.t * sy), b: r(m.b * sy), in: r(m.in * sx), out: r(m.out * sx) }
}

function scaleRegion(g: Region, sx: number, sy: number): Region {
	return {
		...g,
		x: r(g.x * sx),
		y: r(g.y * sy),
		w: r(g.w * sx),
		h: r(g.h * sy),
		gutter: r(g.gutter * sx)
	}
}

function scaleVariant(v: StoredMasterVariant, sx: number, sy: number): StoredMasterVariant {
	const out: StoredMasterVariant = { ...v }
	if (v.margins) out.margins = scaleMargins(v.margins, sx, sy)
	if (v.gutter !== undefined) out.gutter = r(v.gutter * sx)
	if (v.regions) out.regions = v.regions.map((g) => scaleRegion(g, sx, sy))
	return out
}

/**
 * Change the publication page size: every master gets `w`×`h`, and its margins,
 * gutters and text areas scale proportionally; static items and page-anchored frames scale
 * with the master of their page, so nothing ends up off the page. One transaction (undoable).
 */
export function setPageSize(yDoc: Y.Doc, doc: YPagilloDocument, w: number, h: number): void {
	yDoc.transact(() => {
		const ratio = new Map<string, [number, number]>()
		for (const [id, m] of mastersOf(doc)) {
			const sx = w / m.w
			const sy = h / m.h
			ratio.set(id, [sx, sy])
			if (sx === 1 && sy === 1) continue
			patchMaster(doc.ms.get(id), {
				w,
				h,
				margins: scaleMargins(m.margins, sx, sy),
				gutter: r(m.gutter * sx),
				regions: m.regions.map((g) => scaleRegion(g, sx, sy)),
				...(m.left ? { left: scaleVariant(m.left, sx, sy) } : {}),
				...(m.right ? { right: scaleVariant(m.right, sx, sy) } : {})
			})
		}
		for (const [fid, f] of framesOf(doc)) {
			const a = f.anchor
			let k: [number, number] | undefined
			if ('ms' in a) k = ratio.get(a.ms)
			else {
				const sec = sectionOf(doc, a.sec)
				k = sec && ratio.get(a.page === 0 ? sec.first : sec.rest)
			}
			if (!k || (k[0] === 1 && k[1] === 1)) continue
			const [sx, sy] = k
			patchFrame(doc.f.get(fid), {
				x: r(f.x * sx),
				y: r(f.y * sy),
				w: r(f.w * sx),
				h: r(f.h * sy)
			})
		}
		doc.m.set('page', { w, h })
	}, yDoc.clientID)
}

// vim: ts=4
