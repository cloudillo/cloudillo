// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Entity `Y.Map`s of `f`/`ms`/`s`/`st`: plain-snapshot readers, creators and patch writers.
 * Worker-safe: no DOM, no `@cloudillo/core`.
 *
 * Key layout (one key per independent field, one atomic plain value per field group):
 * - frame: `t`, `anchor`, `geo` = `{ x, y, w, h, rot }`, `z`, `wrap`; `txt`: `story`, `chain`,
 *   `inset`, `fill`, `stroke`, `strokeW`; `shp`: `kind`, `fill`, `stroke`, `strokeW`; `img`:
 *   `src` = `{ fileId, px?, crop }` (absent = empty frame), `fit`, `alt`, `deco`; `emb`: `emb`.
 * - master: one key per `StoredMaster` field (`margins`, `regions`, `left`, `right` atomic).
 * - section: one key per `StoredSection` field (`pageNum` atomic).
 * - style: `k`, `name`, `basedOn`, and `p/<prop>` per property (no nested types: two peers
 *   lazily creating the same nested map would each keep their own, losing one).
 *
 * Readers take `unknown` and return `undefined` for anything that is not a usable `Y.Map` (peer
 * garbage). Patch writers set only the keys whose value changed — call them inside a
 * `yDoc.transact`; an explicit `undefined` deletes a key, an absent one is left alone.
 */

import * as Y from 'yjs'
import type { Crop } from '@cloudillo/typeset'

import type {
	MasterAnchor,
	PageAnchor,
	StoredFrame,
	StoredImageData,
	StoredMaster,
	StoredSection,
	StoredStyle,
	YPagilloDocument
} from './stored-types'

export const FULL_CROP: Crop = { x: 0, y: 0, w: 1, h: 1 }

type Obj = Record<string, unknown>

export const isObj = (v: unknown): v is Obj =>
	typeof v === 'object' && v !== null && !Array.isArray(v)
/** Plain snapshot of an entity map; own data properties only (a `__proto__` key stays a key). */
const json = (y: unknown): Obj | undefined => {
	if (!(y instanceof Y.Map)) return undefined
	try {
		return Object.fromEntries(
			[...y.entries()].map(([k, v]) => [k, v instanceof Y.AbstractType ? v.toJSON() : v])
		)
	} catch {
		return undefined
	}
}
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

/** Set `k` to `v` only if it differs; `undefined` deletes. */
function put(y: Y.Map<unknown>, k: string, v: unknown): void {
	if (v === undefined) {
		if (y.has(k)) y.delete(k)
	} else if (!same(y.get(k), v)) y.set(k, v)
}

/** `o` without its `undefined` values. */
const defined = (o: Obj): Obj =>
	Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))

const FRAME_TYPES = new Set<unknown>(['img', 'emb', 'txt', 'shp'])
const FRAME_KEYS = new Set(['t', 'anchor', 'geo', 'z', 'wrap', 'src', 'emb'])
/** Style property key prefix. */
const PROP = 'p/'

function readAnchor(a: unknown): PageAnchor | MasterAnchor | undefined {
	if (!isObj(a)) return undefined
	if (typeof a.ms === 'string')
		return a.side === 'l' || a.side === 'r' ? { ms: a.ms, side: a.side } : { ms: a.ms }
	if (typeof a.sec === 'string') return { sec: a.sec, page: num(a.page) }
	return undefined
}

/** A frame's anchor without a full read (same validity as `readFrame`; geometry defaults). */
export const anchorOf = (y: unknown) =>
	y instanceof Y.Map && FRAME_TYPES.has(y.get('t')) ? readAnchor(y.get('anchor')) : undefined

// Readers -----------------------------------------------------------------------------------

/** A frame `Y.Map` unflattened to the `StoredFrame` read shape (image data flat in `data`). */
export function readFrame(y: unknown): StoredFrame | undefined {
	const o = json(y)
	const anchor = readAnchor(o?.anchor)
	if (!o || !anchor || !FRAME_TYPES.has(o.t)) return undefined
	const t = o.t as StoredFrame['t']
	const g = isObj(o.geo) ? o.geo : {}
	const w = isObj(o.wrap) ? o.wrap : {}
	const rest = Object.fromEntries(Object.entries(o).filter(([k]) => !FRAME_KEYS.has(k)))
	let data: StoredFrame['data'] = rest
	if (t === 'emb') data = isObj(o.emb) ? o.emb : {}
	else if (t === 'img') {
		const src = isObj(o.src) ? o.src : undefined
		const px = src?.px
		const c = isObj(src?.crop) ? src.crop : {}
		const crop = { x: num(c.x), y: num(c.y), w: num(c.w, 1), h: num(c.h, 1) }
		data = {
			...rest,
			...(typeof src?.fileId === 'string' ? { fileId: src.fileId } : {}),
			...(Array.isArray(px) && px.length === 2 && px.every((n) => num(n) > 0) ? { px } : {}),
			crop: crop.w <= 0 || crop.h <= 0 ? FULL_CROP : crop
		} as StoredImageData
	}
	return {
		t,
		anchor,
		x: num(g.x),
		y: num(g.y),
		w: num(g.w),
		h: num(g.h),
		rot: num(g.rot),
		z: num(o.z),
		wrap: {
			mode: w.mode === 'box' || w.mode === 'tb' ? w.mode : 'none',
			off: num(w.off)
		},
		data
	}
}

const regionsOf = (v: unknown) =>
	Array.isArray(v)
		? v.filter((g) => isObj(g) && ['x', 'y', 'w', 'h'].every((k) => num(g[k], NaN) === g[k]))
		: v

/**
 * A master `Y.Map`; undefined unless it has a positive `w`/`h`, `margins` and `regions`
 * (regions without finite geometry are dropped).
 */
export function readMaster(y: unknown): StoredMaster | undefined {
	const o = json(y)
	if (!o || !(num(o.w) > 0 && num(o.h) > 0)) return undefined
	if (!isObj(o.margins) || !Array.isArray(o.regions)) return undefined
	const side = (s: unknown) =>
		isObj(s) && s.regions !== undefined ? { ...s, regions: regionsOf(s.regions) } : s
	return {
		...o,
		cols: num(o.cols, 1),
		gutter: num(o.gutter),
		regions: regionsOf(o.regions),
		...(o.left !== undefined ? { left: side(o.left) } : {}),
		...(o.right !== undefined ? { right: side(o.right) } : {}),
		name: typeof o.name === 'string' ? o.name : ''
	} as StoredMaster
}

export function readSection(y: unknown): StoredSection | undefined {
	const o = json(y)
	return o && typeof o.story === 'string' ? (o as StoredSection) : undefined
}

export function readStyle(y: unknown): StoredStyle | undefined {
	const o = json(y)
	if (!o || (o.k !== 'p' && o.k !== 'c')) return undefined
	const style: Obj = {}
	const props: Obj = {}
	for (const [k, v] of Object.entries(o)) {
		if (k.startsWith(PROP)) props[k.slice(PROP.length)] = v
		else style[k] = v
	}
	return { ...style, props } as StoredStyle
}

// Accessors and iterators -------------------------------------------------------------------

export const frameOf = (doc: YPagilloDocument, id: string) => readFrame(doc.f.get(id))
export const masterOf = (doc: YPagilloDocument, id: string) => readMaster(doc.ms.get(id))
export const sectionOf = (doc: YPagilloDocument, id: string) => readSection(doc.s.get(id))
export const styleOf = (doc: YPagilloDocument, id: string) => readStyle(doc.st.get(id))

function readAll<T>(
	root: Y.Map<Y.Map<unknown>>,
	read: (y: unknown) => T | undefined
): [string, T][] {
	const out: [string, T][] = []
	for (const [id, y] of root.entries()) {
		const v = read(y)
		if (v) out.push([id, v])
	}
	return out
}

/** Every readable frame, `[id, frame]`. */
export const framesOf = (doc: YPagilloDocument) => readAll(doc.f, readFrame)
export const mastersOf = (doc: YPagilloDocument) => readAll(doc.ms, readMaster)
export const sectionsOf = (doc: YPagilloDocument) => readAll(doc.s, readSection)
export const stylesOf = (doc: YPagilloDocument) => readAll(doc.st, readStyle)

// Creators ----------------------------------------------------------------------------------

/** Frame `data` → its stored keys. */
function dataEntries(t: StoredFrame['t'], data: Obj): [string, unknown][] {
	if (t === 'emb') return [['emb', { ...data }]]
	if (t !== 'img') return Object.entries(data)
	const { fileId, px, crop, ...rest } = data as Obj
	const out = Object.entries(rest)
	if (typeof fileId === 'string')
		out.push(['src', defined({ fileId, px, crop: isObj(crop) ? { ...crop } : FULL_CROP })])
	return out
}

/** A filled (not yet integrated) frame `Y.Map` — `root.set(id, newFrameMap(f))`. */
export function newFrameMap(f: StoredFrame): Y.Map<unknown> {
	const { t, anchor, x, y, w, h, rot, z, wrap, data } = f
	const e: [string, unknown][] = [
		['t', t],
		['anchor', { ...anchor }],
		['geo', { x, y, w, h, rot }],
		['z', z],
		['wrap', { ...wrap }],
		...dataEntries(t, data as Obj)
	]
	return new Y.Map(e.filter(([, v]) => v !== undefined))
}

export function newMasterMap(m: StoredMaster): Y.Map<unknown> {
	return new Y.Map(Object.entries(defined(m)))
}

export function newSectionMap(s: StoredSection): Y.Map<unknown> {
	return new Y.Map(Object.entries(defined(s)))
}

export function newStyleMap(s: StoredStyle): Y.Map<unknown> {
	const { props, ...rest } = s
	return new Y.Map<unknown>([
		...Object.entries(defined(rest)),
		...Object.entries(defined(props ?? {})).map(([k, v]): [string, unknown] => [PROP + k, v])
	])
}

// Patch writers -----------------------------------------------------------------------------

/**
 * Frame patch: top-level `StoredFrame` fields and a partial `data`. Any of `x/y/w/h/rot` writes
 * one new `geo` (missing ones kept). Image `data`: a `fileId` different from the current one
 * writes a new `src` with `crop` = the patch's or full, `px` = the patch's; `px`/`crop` alone
 * update the current `src`; `fileId: undefined` deletes `src` (empty frame). `emb` data is
 * merged into a new `emb` value. Other `data` fields are their own keys.
 */
export type FramePatch = Partial<Omit<StoredFrame, 't' | 'data'>> & { data?: Obj }

/** Apply `patch` to frame `Y.Map` `y`; false when `y` is not a readable frame. */
export function patchFrame(y: unknown, patch: FramePatch): boolean {
	const cur = readFrame(y)
	if (!cur || !(y instanceof Y.Map)) return false
	const { data, x, y: py, w, h, rot, ...keys } = patch
	for (const [k, v] of Object.entries(keys)) put(y, k, isObj(v) ? { ...v } : v)
	if ([x, py, w, h, rot].some((v) => v !== undefined))
		put(y, 'geo', {
			x: x ?? cur.x,
			y: py ?? cur.y,
			w: w ?? cur.w,
			h: h ?? cur.h,
			rot: rot ?? cur.rot
		})
	if (!data) return true
	if (cur.t === 'emb') {
		put(y, 'emb', defined({ ...(cur.data as Obj), ...data }))
		return true
	}
	if (cur.t !== 'img') {
		for (const [k, v] of Object.entries(data)) put(y, k, v)
		return true
	}
	const { fileId, px, crop, ...rest } = data
	for (const [k, v] of Object.entries(rest)) put(y, k, v)
	if (!('fileId' in data || 'px' in data || 'crop' in data)) return true
	const c = cur.data as StoredImageData
	const id = 'fileId' in data ? fileId : c.fileId
	if (typeof id !== 'string') {
		put(y, 'src', undefined)
		return true
	}
	const fresh = id !== c.fileId
	put(
		y,
		'src',
		defined({
			fileId: id,
			px: 'px' in data ? px : fresh ? undefined : c.px,
			crop: isObj(crop) ? { ...crop } : fresh ? FULL_CROP : c.crop
		})
	)
	return true
}

/** One key per field (`undefined` deletes, e.g. `left` / `right` variants). */
export function patchMaster(y: unknown, patch: Partial<StoredMaster>): boolean {
	if (!(y instanceof Y.Map)) return false
	for (const [k, v] of Object.entries(patch)) put(y, k, isObj(v) ? { ...v } : v)
	return true
}

export function patchSection(y: unknown, patch: Partial<StoredSection>): boolean {
	if (!(y instanceof Y.Map)) return false
	for (const [k, v] of Object.entries(patch)) put(y, k, isObj(v) ? { ...v } : v)
	return true
}

/** Style patch: `props` is per property (set / `undefined` deletes) as `p/<prop>` keys. */
export type StylePatch = Partial<Omit<StoredStyle, 'props'>> & { props?: Obj }

export function patchStyle(y: unknown, patch: StylePatch): boolean {
	if (!(y instanceof Y.Map)) return false
	const { props, ...rest } = patch
	for (const [k, v] of Object.entries(rest)) put(y, k, v)
	for (const [k, v] of Object.entries(props ?? {})) put(y, PROP + k, v)
	return true
}

// vim: ts=4
