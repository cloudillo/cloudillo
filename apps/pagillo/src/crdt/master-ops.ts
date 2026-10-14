// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Master ("Page layout" in the UI) operations (`ms` map) and the publication page size.
 */

import { type Margins, type MasterVariant, marginRegion, type Region } from '@cloudillo/typeset'
import type * as Y from 'yjs'

import { type MasterId, newId, type SectionId } from './ids'
import { updateSection } from './section-ops'
import type {
	StoredFrame,
	StoredMaster,
	StoredTextFrameData,
	YPagilloDocument
} from './stored-types'
import { copyTextData } from './story-ops'
import { byIds, flipRegion, mirrorFrame, readMeta, resolveSide } from './type-converters'

export function addMaster(yDoc: Y.Doc, doc: YPagilloDocument, master: StoredMaster): MasterId {
	const id = newId()
	yDoc.transact(() => {
		doc.ms.set(id, master)
	}, yDoc.clientID)
	return id
}

/** Shallow patch; a key set to `undefined` is removed (e.g. `left` / `right` variants). */
export function updateMaster(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	id: MasterId,
	patch: Partial<StoredMaster>
): void {
	const cur = doc.ms.get(id)
	if (!cur) return
	const next: Record<string, unknown> = { ...cur, ...patch }
	for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k]
	yDoc.transact(() => {
		doc.ms.set(id, next as StoredMaster)
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
	const m = doc.ms.get(id)
	if (!m) return
	const rid = newId()
	const next: StoredMaster = { ...m }
	let changed = false
	if (!m.regions.length) {
		next.regions = [{ ...marginRegion(m), id: rid }]
		changed = true
	}
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
			changed = true
		}
	}
	if (!changed) return
	yDoc.transact(() => {
		doc.ms.set(id, next)
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

/** Delete an unused master with its static items. Returns false if a section uses it. */
export function deleteMaster(yDoc: Y.Doc, doc: YPagilloDocument, id: MasterId): boolean {
	const m = doc.ms.get(id)
	if (!m) return false
	for (const s of doc.s.values()) if (s.first === id || s.rest === id) return false
	yDoc.transact(() => {
		for (const fid of [...m.items, ...(m.left?.items ?? []), ...(m.right?.items ?? [])]) {
			const f = doc.f.get(fid)
			const st = f?.t === 'txt' && (f.data as StoredTextFrameData).story
			if (st) doc.tx.delete(st)
			doc.f.delete(fid)
		}
		doc.ms.delete(id)
	}, yDoc.clientID)
	return true
}

/**
 * Copy a master under `name`. Static items (base and variant) are cloned to new frame ids,
 * text items with a copied story. One transaction; undefined if `id` is missing.
 */
export function duplicateMaster(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	id: MasterId,
	name: string
): MasterId | undefined {
	const m = doc.ms.get(id)
	if (!m) return
	const copy = newId()
	yDoc.transact(() => {
		const ids = new Map<string, string>()
		const clone = (fid: string) => {
			let nid = ids.get(fid)
			if (nid) return nid
			nid = cloneFrame(doc, fid) ?? newId()
			ids.set(fid, nid)
			return nid
		}
		const side = (v: MasterVariant) => (v.items ? { ...v, items: v.items.map(clone) } : v)
		const next: StoredMaster = { ...m, name, items: m.items.map(clone) }
		if (m.left) next.left = side(m.left)
		if (m.right) next.right = side(m.right)
		doc.ms.set(copy, next)
	}, yDoc.clientID)
	return copy
}

/**
 * Copy frame `fid` (through `map`) to a new id, a text frame with a copied story. Call inside a
 * transaction; undefined if `fid` is missing.
 */
function cloneFrame(
	doc: YPagilloDocument,
	fid: string,
	map = (f: StoredFrame) => f
): string | undefined {
	const f = doc.f.get(fid)
	if (!f) return
	const nid = newId()
	const data = f.t === 'txt' ? copyTextData(doc, f.data as StoredTextFrameData) : f.data
	doc.f.set(nid, { ...map(f), data })
	return nid
}

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
 * the base areas as the old mode drew them (from 'mirror': flipped, in `leftOrder` when manual,
 * with mirrored clones of the static items). Any other mode drops both variants.
 * Variant-only static items are deleted either way.
 */
export function setMasterSide(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	id: MasterId,
	side: 'mirror' | 'same' | 'different'
): void {
	yDoc.transact(() => {
		const m0 = doc.ms.get(id)
		if (!m0) return
		const prev = resolveSide(m0, readMeta(doc.m).facing)
		if (prev === side) return
		ensureRegions(yDoc, doc, id)
		const m = doc.ms.get(id)
		if (!m) return
		const own = new Set(m.items)
		for (const fid of [...(m.left?.items ?? []), ...(m.right?.items ?? [])]) {
			const f = doc.f.get(fid)
			if (!f || own.has(fid)) continue
			const st = f.t === 'txt' && (f.data as StoredTextFrameData).story
			if (st) doc.tx.delete(st)
			doc.f.delete(fid)
		}
		if (side !== 'different') {
			updateMaster(yDoc, doc, id, { side, left: undefined, right: undefined })
			return
		}
		// Clones get random ids, so items with equal z may swap paint order; carry the source
		// order into z if that shows.
		const left: MasterVariant =
			prev === 'mirror'
				? {
						regions: byIds(
							m.regions.map((g) => flipRegion(g, m.w)),
							m.flow === 'manual' ? m.leftOrder : undefined
						),
						items: m.items
							.map((fid) => cloneFrame(doc, fid, (f) => mirrorFrame(f, m.w)))
							.filter((x): x is string => !!x)
					}
				: { regions: m.regions }
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

function scaleVariant(v: MasterVariant, sx: number, sy: number): MasterVariant {
	const out: MasterVariant = { ...v }
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
		const frameRatio = new Map<string, [number, number]>()
		doc.ms.forEach((m, id) => {
			const sx = w / m.w
			const sy = h / m.h
			ratio.set(id, [sx, sy])
			for (const fid of [...m.items, ...(m.left?.items ?? []), ...(m.right?.items ?? [])]) {
				frameRatio.set(fid, [sx, sy])
			}
			if (sx === 1 && sy === 1) return
			const next: StoredMaster = {
				...m,
				w,
				h,
				margins: scaleMargins(m.margins, sx, sy),
				gutter: r(m.gutter * sx),
				regions: m.regions.map((g) => scaleRegion(g, sx, sy))
			}
			if (m.left) next.left = scaleVariant(m.left, sx, sy)
			if (m.right) next.right = scaleVariant(m.right, sx, sy)
			doc.ms.set(id, next)
		})
		doc.f.forEach((f, fid) => {
			let k = frameRatio.get(fid)
			if (!k) {
				const sec = doc.s.get(f.anchor.sec)
				k = sec && ratio.get(f.anchor.page === 0 ? sec.first : sec.rest)
			}
			if (!k || (k[0] === 1 && k[1] === 1)) return
			const [sx, sy] = k
			const next: StoredFrame = {
				...f,
				x: r(f.x * sx),
				y: r(f.y * sy),
				w: r(f.w * sx),
				h: r(f.h * sy)
			}
			doc.f.set(fid, next)
		})
		doc.m.set('page', { w, h })
	}, yDoc.clientID)
}

// vim: ts=4
