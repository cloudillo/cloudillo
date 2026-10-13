// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { DLItem, PageDL } from '../display-list.js'
import type {
	Box,
	Frame,
	ImageFrameData,
	Master,
	Paragraph,
	Publication,
	Region,
	ShapeFrameData,
	Story,
	TextFrameData
} from '../model.js'
import { type ItemizedParagraph, type ItemizeEnv, itemizeParagraph } from '../text/itemize.js'
import { type Exclusion, wrapExclusions } from './exclusions.js'
import { type FieldCtx, type FieldEmbed, patchFields, sectionTitle, sizeFields } from './fields.js'
import { type FlowSlot, fillFlow } from './fill.js'
import { placeMarkers, withListIndent } from './lists.js'
import { formatNumber } from './locale.js'

export interface PublicationLayout {
	/** Every page of the publication, in order. */
	pages: PageDL[]
	/** Page count per section, in section order. */
	sections: { id: string; pages: number }[]
	/**
	 * Unplaced story characters: a section's story that did not fit under `maxPages`, or (with
	 * `frame` = its id) a text frame's story that overflows its box or whose page does not exist.
	 */
	overset: { sec: string; chars: number; frame?: string }[]
	/**
	 * Set when the pass stopped at `stopAt`: `pages` is only a prefix, `sections` ends with the
	 * section it stopped in (its count = pages laid out so far) and `overset` is incomplete.
	 */
	partial?: boolean
}

export interface LayoutOptions {
	/** Stop once this many pages exist: no further page, section, overset or trailing frame. */
	stopAt?: number
	/** Page count for `pages` fields when the pass stops early (default: pages laid out). */
	pageTotal?: number
}

/**
 * The flow columns of a master on a page side, in flow order (page space). The side's variant
 * overrides apply field by field. With no regions, the one region is the margin box (`in` on the
 * left unless `side` is 'l'), split into the master's `cols`.
 */
/** The area inside the margins, as a region (the implicit flow area); `left` puts `out` on the left. */
export function marginRegion(
	m: Pick<Master, 'w' | 'h' | 'margins' | 'cols' | 'gutter'>,
	left = false
): Region {
	const mg = m.margins
	return {
		id: '',
		x: left ? mg.out : mg.in,
		y: mg.t,
		w: m.w - mg.in - mg.out,
		h: m.h - mg.t - mg.b,
		cols: m.cols,
		gutter: m.gutter
	}
}

/** Cap on column/row counts: they come from peers unvalidated. */
export const MAX_COLS = 64

/** A column/row count made safe: an integer in [1, `MAX_COLS`], 1 when not finite. */
export function trackCount(n: number | undefined): number {
	return Number.isFinite(n) ? Math.min(MAX_COLS, Math.max(1, Math.floor(n as number))) : 1
}

export function masterColumns(m: Master, side?: 'l' | 'r'): Box[] {
	const v = side === 'l' ? m.left : side === 'r' ? m.right : undefined
	let regions = v?.regions ?? m.regions
	if (!regions.length) {
		regions = [
			marginRegion(
				{
					w: m.w,
					h: m.h,
					margins: v?.margins ?? m.margins,
					cols: v?.cols ?? m.cols,
					gutter: v?.gutter ?? m.gutter
				},
				side === 'l'
			)
		]
	}
	const cols: Box[] = []
	for (const r of regions) {
		const n = trackCount(r.cols)
		const cw = Math.floor((r.w - (n - 1) * r.gutter) / n)
		for (let k = 0; k < n; k++)
			cols.push({ x: r.x + k * (cw + r.gutter), y: r.y, w: cw, h: r.h })
	}
	return cols
}

/**
 * Itemize a story: list paragraphs get their list indent, an inline image/embed block itemizes
 * its caption as its text, and field runs are sized from `ctx` (`fields` = the flow's fields).
 */
function itemizeStory(
	story: Story,
	pub: Publication,
	env: ItemizeEnv,
	ctx: FieldCtx
): { paras: ItemizedParagraph[]; fields: FieldEmbed[] } {
	const fields: FieldEmbed[] = []
	const paras = story.paragraphs.map((p0) => {
		const ip = itemizeCached(p0, pub, env)
		if (!ip.runs.some((r) => r.embed && 'field' in r.embed)) return ip
		// Fields depend on the page: size a copy, never the cached one (`sizeFields` sets `runs`).
		const sized = { ...ip }
		sizeFields(sized, ctx, env, fields)
		return sized
	})
	return { paras, fields }
}

/**
 * Itemized paragraphs by story paragraph identity (paragraphs are immutable); a hit needs the same
 * `styles`, `lang` and `registry` objects. Cached values are shared: never mutate them.
 */
const itemized = new WeakMap<
	Paragraph,
	{
		styles: Publication['styles']
		lang: string
		registry: ItemizeEnv['registry']
		ip: ItemizedParagraph
	}
>()

function itemizeCached(p0: Paragraph, pub: Publication, env: ItemizeEnv): ItemizedParagraph {
	const hit = itemized.get(p0)
	if (hit && hit.styles === pub.styles && hit.lang === pub.lang && hit.registry === env.registry)
		return hit.ip
	const p = withListIndent(p0, pub.styles)
	const b = p.runs
	const q: Paragraph =
		!Array.isArray(b) && b.k === 'emb' && b.caption
			? { ...p, runs: [{ text: b.caption, marks: {} }] }
			: p
	const ip = itemizeParagraph(q, pub.styles, env, pub.lang)
	itemized.set(p0, { styles: pub.styles, lang: pub.lang, registry: env.registry, ip })
	return ip
}

const pageKey = (sec: string, page: number) => `${sec}\u0000${page}`

/** Paint order: z, then id. */
const byPaint = (a: Frame, b: Frame) => a.z - b.z || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Bézier circle constant: 4/3·(√2 − 1). */
const KAPPA = 0.5522847498

/** Ellipse inscribed in `b` as SVG path data (Fx). */
function ellipsePath(b: Box): string {
	const rx = Math.floor(b.w / 2)
	const ry = Math.floor(b.h / 2)
	const cx = b.x + rx
	const cy = b.y + ry
	const kx = Math.round(rx * KAPPA)
	const ky = Math.round(ry * KAPPA)
	return (
		`M${cx - rx} ${cy}` +
		`C${cx - rx} ${cy - ky} ${cx - kx} ${cy - ry} ${cx} ${cy - ry}` +
		`C${cx + kx} ${cy - ry} ${cx + rx} ${cy - ky} ${cx + rx} ${cy}` +
		`C${cx + rx} ${cy + ky} ${cx + kx} ${cy + ry} ${cx} ${cy + ry}` +
		`C${cx - kx} ${cy + ry} ${cx - rx} ${cy + ky} ${cx - rx} ${cy}Z`
	)
}

/**
 * Lay out a whole publication: each section flows its story through its `first` master's
 * columns, then page after page of its `rest` master, until the story is placed or the section
 * has `maxPages` pages (the rest is overset). Every section has at least one page.
 * Start parity counts global pages from 1; when the next page has the wrong parity, one blank
 * page is appended to the previous section (its `rest` master), or, for the first section,
 * prepended to that section. Parity pages are not counted against `maxPages`.
 * With `pub.facing`, odd global pages are right-hand (`side` 'r'), even ones left-hand ('l').
 * Page-anchored frames (`pub.frames`): their wrap outlines (box, rotated box or ellipse) exclude
 * story text on their page, the section has at least `anchor.page + 1` pages (up to `maxPages`),
 * and their items paint in z order — `z < 0` below the story text, the rest above it — rotated
 * by `rot`, which wrap follows too.
 * Master items (frames listed in the page side's `items`; never anchored frames) paint on every
 * page using the master, below everything else in z order, all under one `Artifact` tag; they
 * add no `LineGeom`. A text item that overflows is reported once.
 * Lists: markers per `listMarkers` (counters per section). Fields: page number per
 * `Section.pageNum` (restart → 1 at the section's first page, else continuing; its `format`),
 * page count = all pages (decimal); in body text page numbers take a fixed 3-digit box.
 * Tags: a section's frames take ids after its story's paragraphs (story paragraph count + 1 on),
 * in (page, z, id) order: one per image/embed frame, one per paragraph of a text frame; the
 * master items' Artifact tag takes the next id.
 * Synchronous: call `initHarfBuzz()` and `loadParagraphFaces(…)` for every section's story and
 * every text frame's story (master items included) first.
 * `opts.stopAt`: a partial pass for an editor — pages from `stopAt` on are not laid out (the page
 * before may differ from a full pass where keep/widow rules reach across), see `partial`.
 */
export function layoutPublication(
	pub: Publication,
	env: ItemizeEnv,
	opts: LayoutOptions = {}
): PublicationLayout {
	const stopAt = opts.stopAt ?? Number.POSITIVE_INFINITY
	let stopped = false
	// No masters, no pages (a transient doc state): don't throw, the worker dies on errors.
	if (!Object.keys(pub.masters).length)
		return {
			pages: [],
			sections: pub.sections.map((s) => ({ id: s.id, pages: 0 })),
			overset: []
		}
	const pages: PageDL[] = []
	const sections: PublicationLayout['sections'] = []
	const overset: PublicationLayout['overset'] = []

	const masterIds = new Set<string>()
	for (const m of Object.values(pub.masters)) {
		for (const id of [...m.items, ...(m.left?.items ?? []), ...(m.right?.items ?? [])])
			masterIds.add(id)
	}
	// Anchored frames by page in paint order, last anchored page and first tag id per frame.
	const frames = Object.values(pub.frames)
		.filter((f) => !masterIds.has(f.id))
		.sort((a, b) => a.anchor.page - b.anchor.page || byPaint(a, b))
	const byPage = new Map<string, Frame[]>()
	const lastPage = new Map<string, number>()
	const tagBase = new Map<string, number>()
	const nextTag = new Map(
		pub.sections.map((s): [string, number] => [s.id, s.story.paragraphs.length + 1])
	)
	for (const f of frames) {
		const { sec, page } = f.anchor
		const k = pageKey(sec, page)
		const list = byPage.get(k)
		if (list) list.push(f)
		else byPage.set(k, [f])
		lastPage.set(sec, Math.max(lastPage.get(sec) ?? -1, page))
		const t = nextTag.get(sec) ?? 1
		tagBase.set(f.id, t)
		nextTag.set(
			sec,
			t + (f.t === 'txt' ? (f.data as TextFrameData).story.paragraphs.length : 1)
		)
	}

	const titles = new Map(pub.sections.map((s) => [s.id, sectionTitle(s.story, pub.styles)]))
	const baseCtx = (sec: string): FieldCtx => ({
		lang: pub.lang,
		title: pub.title ?? '',
		section: titles.get(sec) ?? '',
		exportedAt: pub.exportedAt
	})

	const addPage = (sec: string, index: number, masterId: string) => {
		// A dangling master id falls back to any master rather than failing the layout.
		const m = pub.masters[masterId] ?? Object.values(pub.masters)[0]
		if (!m) throw new Error('layoutPublication: publication has no masters')
		const side = pub.facing ? (pages.length % 2 ? 'l' : 'r') : undefined
		const pg: PageDL = {
			page: { sec, index, w: m.w, h: m.h, master: m.id, ...(side ? { side } : {}) },
			items: [],
			lines: [],
			tags: [],
			rev: 0
		}
		pages.push(pg)
		return {
			pg,
			cols: masterColumns(m, side),
			ex: wrapExclusions(byPage.get(pageKey(sec, index)) ?? [])
		}
	}

	const secFields = new Map<string, FieldEmbed[]>()
	for (let s = 0; s < pub.sections.length; s++) {
		const sec = pub.sections[s]
		if (pages.length >= stopAt) {
			// Stopped at a section start: report it with no pages so far.
			stopped = true
			sections.push({ id: sec.id, pages: 0 })
			break
		}
		let count = 0
		const odd = pages.length % 2 === 0 // the next global page number is odd
		if ((sec.start === 'odd' && !odd) || (sec.start === 'even' && odd)) {
			const prev = sections[s - 1]
			if (prev) addPage(prev.id, prev.pages++, pub.sections[s - 1].rest)
			else addPage(sec.id, count++, sec.rest)
		}
		const firstPage = pages.length
		const max = Math.max(1, sec.maxPages ?? Number.POSITIVE_INFINITY)
		let text = 0
		let pg: PageDL
		let cols: Box[] = []
		let ex: Exclusion[] = []
		let ci = 0
		const next = (kind?: 'page'): FlowSlot | undefined => {
			if (kind === 'page') ci = cols.length
			if (ci >= cols.length) {
				if (text >= max) return undefined
				if (pages.length >= stopAt) {
					stopped = true
					return undefined
				}
				const added = addPage(sec.id, count++, text++ ? sec.rest : sec.first)
				pg = added.pg
				cols = added.cols
				ex = added.ex
				ci = 0
			}
			const col = cols[ci++]
			// Only frames that can hit this column: every band top is at or below col.y, so
			// hits() rejects the rest anyway.
			// ponytail: many frames stacked on one column still cost O(frames) per row; index
			// them by y if that shows up. wrapExclusions caps a page at WRAP_FRAMES_MAX frames.
			const colEx = ex.filter((e) => e.x0 < col.x + col.w && e.x1 > col.x && e.y1 > col.y)
			return { pg, col, ex: colEx }
		}
		const { paras, fields } = itemizeStory(sec.story, pub, env, baseCtx(sec.id))
		secFields.set(sec.id, fields)
		const chars = fillFlow(sec.story, paras, next, env)
		if (chars && !stopped) overset.push({ sec: sec.id, chars })
		placeMarkers(sec.story, paras, pages.slice(firstPage), env)
		// Anchored frames keep their pages alive, still capped by `maxPages`.
		const last = stopped ? -1 : (lastPage.get(sec.id) ?? -1)
		while (count <= last && text < max) addPage(sec.id, count++, text++ ? sec.rest : sec.first)
		sections.push({ id: sec.id, pages: count })
		if (stopped) break
	}

	// Page numbers, now that every page exists.
	const secById = new Map(pub.sections.map((s) => [s.id, s]))
	const pageNo = new Map<PageDL, string>()
	let n = 0
	for (let g = 0; g < pages.length; g++) {
		const pg = pages[g]
		const pn = secById.get(pg.page.sec)?.pageNum
		const fresh = g === 0 || pages[g - 1].page.sec !== pg.page.sec
		n = fresh && pn?.restart ? 1 : n + 1
		pageNo.set(pg, formatNumber(n, pn?.format || '1'))
	}
	const ctxFor = (pg: PageDL): FieldCtx => ({
		...baseCtx(pg.page.sec),
		page: pageNo.get(pg),
		pages: String(stopped ? (opts.pageTotal ?? pages.length) : pages.length)
	})
	// Body-text fields (before any frame item joins the page).
	for (const pg of pages) patchFields(pg.items, secFields.get(pg.page.sec) ?? [], ctxFor(pg), env)

	/** Lay out a text frame's story inside `box` on a scratch copy of `pg` (fields resolved). */
	const flowBox = (story: Story, box: Box, pg: PageDL) => {
		const tmp: PageDL = { page: pg.page, items: [], lines: [], tags: [], rev: 0 }
		const ctx = ctxFor(pg)
		const { paras, fields } = itemizeStory(story, pub, env, ctx)
		let open = true
		const chars = fillFlow(
			story,
			paras,
			() => {
				if (!open) return undefined
				open = false
				return { pg: tmp, col: box }
			},
			env
		)
		placeMarkers(story, paras, [tmp], env)
		patchFields(tmp.items, fields, ctx, env)
		return { tmp, chars }
	}

	/**
	 * Items of frame `f` on `pg` into `out`, its tags and lines into `pg` — or, for a master item
	 * (`art`), every item tagged `tag` and no tags/lines. Returns a text frame's overset chars.
	 */
	const emitFrame = (f: Frame, pg: PageDL, out: DLItem[], tag: number, art: boolean): number => {
		const from = out.length
		const box: Box = { x: f.x, y: f.y, w: f.w, h: f.h }
		let chars = 0
		if (f.t === 'img') {
			const d = f.data as ImageFrameData
			if (d.fileId) {
				out.push({ k: 'image', fileId: d.fileId, box, crop: d.crop, fit: d.fit, tag })
				if (!art)
					pg.tags.push(
						d.deco
							? { id: tag, role: 'Artifact' }
							: { id: tag, role: 'Figure', alt: d.alt }
					)
			}
		} else if (f.t === 'emb') {
			out.push({ k: 'embed', frameId: f.id, box, tag })
			if (!art) pg.tags.push({ id: tag, role: 'Figure' })
		} else if (f.t === 'shp') {
			const { kind, fill, stroke, strokeW } = f.data as ShapeFrameData
			const t = art ? { tag } : {}
			out.push(
				kind === 'ellipse'
					? { k: 'path', d: ellipsePath(box), fill, stroke, strokeW, ...t }
					: { k: 'rect', box, fill, stroke, strokeW, ...t }
			)
		} else {
			const r = flowBox((f.data as TextFrameData).story, box, pg)
			chars = r.chars
			// The box's own tag ids (paragraph index + 1) move to the frame's range.
			const d = tag - 1
			for (const it of r.tmp.items) {
				if ('tag' in it && it.tag !== undefined) it.tag = art ? tag : it.tag + d
				out.push(it)
			}
			if (!art) {
				for (const t of r.tmp.tags) pg.tags.push({ ...t, id: t.id + d })
				pg.lines.push(...r.tmp.lines)
			}
		}
		if (f.rot % 360) {
			const rot = { deg: f.rot, cx: f.x + Math.floor(f.w / 2), cy: f.y + Math.floor(f.h / 2) }
			for (let q = from; q < out.length; q++) out[q].rot = rot
		}
		return chars
	}

	// Master and frame items, now that every page exists (story rollback never sees them).
	const placed = new Set<string>()
	const masterOverset = new Set<string>()
	for (const pg of pages) {
		const { sec, index, master, side } = pg.page
		const m = pub.masters[master]
		const ids =
			(side === 'l' ? m?.left?.items : side === 'r' ? m?.right?.items : undefined) ??
			m?.items ??
			[]
		const art: DLItem[] = []
		if (ids.length) {
			const tag = nextTag.get(sec) ?? 1
			const items = ids
				.map((id) => pub.frames[id])
				.filter((f): f is Frame => !!f)
				.sort(byPaint)
			for (const f of items) {
				const chars = emitFrame(f, pg, art, tag, true)
				if (chars && !masterOverset.has(f.id)) {
					masterOverset.add(f.id)
					overset.push({ sec, chars, frame: f.id })
				}
			}
			if (art.length) pg.tags.push({ id: tag, role: 'Artifact' })
		}
		const below: DLItem[] = []
		const above: DLItem[] = []
		const k = pageKey(sec, index)
		const fr = byPage.get(k)
		if (fr) {
			placed.add(k)
			for (const f of fr) {
				const chars = emitFrame(
					f,
					pg,
					f.z < 0 ? below : above,
					tagBase.get(f.id) ?? 0,
					false
				)
				if (chars) overset.push({ sec: f.anchor.sec, chars, frame: f.id })
			}
		}
		pg.items = [...art, ...below, ...pg.items, ...above]
	}
	if (stopped) return { pages, sections, overset, partial: true }
	// Text frames anchored past their section's last page (or to no section): all overset.
	for (const f of frames) {
		if (f.t !== 'txt' || placed.has(pageKey(f.anchor.sec, f.anchor.page))) continue
		const story = (f.data as TextFrameData).story
		const { paras } = itemizeStory(story, pub, env, baseCtx(f.anchor.sec))
		const chars = fillFlow(story, paras, () => undefined, env)
		if (chars) overset.push({ sec: f.anchor.sec, chars, frame: f.id })
	}
	return { pages, sections, overset }
}
