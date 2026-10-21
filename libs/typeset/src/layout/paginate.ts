// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { DLItem, PageDL, TagNode } from '../display-list.js'
import type { Fx } from '../fixed.js'
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
import { embedAlt, type FlowSlot, fillFlow, type NextSlot } from './fill.js'
import { collectRefs, type FnNote, type FnRef, numberRefs } from './footnotes.js'
import { placeMarkers, withListIndent } from './lists.js'
import { formatNumber } from './locale.js'
import { storyTagCount } from './table.js'
import {
	fillToc,
	type TocBlock,
	type TocEntry,
	type TocSlot,
	tocBlock,
	tocEntries,
	tocLevels
} from './toc.js'

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
	return masterRegions(m, side).flatMap(regionColumns)
}

/** The flow regions of a master on a page side, in flow order (see `masterColumns`). */
export function masterRegions(m: Master, side?: 'l' | 'r'): Region[] {
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
	return regions
}

/** A region's columns, left to right. */
function regionColumns(r: Region): Box[] {
	const n = trackCount(r.cols)
	const cw = Math.floor((r.w - (n - 1) * r.gutter) / n)
	return Array.from({ length: n }, (_, k) => ({
		x: r.x + k * (cw + r.gutter),
		y: r.y,
		w: cw,
		h: r.h
	}))
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
 * Text chains (a head's `chain`): one flow through the head's box, then each follower's box on
 * its own page (any section); followers whose page does not exist are skipped. The overset is
 * reported once, against the last frame laid out; the story's fields use the first laid-out
 * frame's page, and every frame of the chain shares the head's tag range.
 * Lists: markers per `listMarkers` (counters per section). Fields: page number per
 * `Section.pageNum` (restart → 1 at the section's first page, else continuing; its `format`),
 * page count = all pages (decimal); in body text page numbers take a fixed 3-digit box.
 * Span bands: `next('band' | 'cols', top)` re-cuts a region's columns per set (`fill.ts` `NextSlot`).
 * TOC (`layout/toc.ts`): section flows only; two passes in this one call — the flows lay out with
 * fixed number boxes, then `fillToc` writes the numbers once `pageNo` is known (`Engine.layout`
 * calls this once, unchanged).
 * Footnotes (`pub.footnotes`, `layout/footnotes.ts`): section flows only, numbered per section;
 * refs in text frames stay unnumbered and place no body. Each ref takes a tag range (Note + its
 * body paragraphs) after its section story's range.
 * Tags: a section's frames take ids after its story's (and footnotes') range,
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
	// Text chains: head id → its valid followers, follower id → its head. A `chain` id is dropped
	// when it is not an anchored `txt` frame, has its own story (the head itself included) or is
	// already claimed; heads go in id order, so the lowest head id wins a doubly claimed follower.
	const chains = new Map<string, string[]>()
	const headOf = new Map<string, string>()
	for (const f of [...frames].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
		const { story, chain } = f.data as TextFrameData
		if (f.t !== 'txt' || !story || !Array.isArray(chain)) continue
		const ok = chain.filter((id) => {
			const fr = pub.frames[id]
			if (fr?.t !== 'txt' || (fr.data as TextFrameData).story) return false
			if (masterIds.has(id) || headOf.has(id)) return false
			headOf.set(id, f.id)
			return true
		})
		if (ok.length) chains.set(f.id, ok)
	}
	const byPage = new Map<string, Frame[]>()
	const lastPage = new Map<string, number>()
	const tagBase = new Map<string, number>()
	// Footnote refs per section; their tag ranges follow the story's.
	const refsOf = new Map(pub.sections.map((s) => [s.id, collectRefs(s.story, pub.footnotes)]))
	// TOC: headings collected once a TOC paragraph needs them; its entries' placeholders.
	let tocAll: TocEntry[] | undefined
	const tocOut: TocSlot[] = []
	/** Per section: first TOCI tag id (after the story's and footnotes' ranges), TOCI count. */
	const tociOf = new Map(
		pub.sections.map((s): [string, { tag: number; n: number }] => {
			let n = 0
			for (const q of s.story.paragraphs) {
				const lv = tocLevels(q)
				if (lv === undefined) continue
				tocAll ??= tocEntries(pub)
				n += tocAll.filter((e) => e.level <= lv).length
			}
			return [s.id, { tag: storyTagCount(s.story) + (refsOf.get(s.id)?.tags ?? 0) + 1, n }]
		})
	)
	const nextTag = new Map(
		pub.sections.map((s): [string, number] => {
			const t = tociOf.get(s.id)
			return [s.id, (t?.tag ?? 1) + (t?.n ?? 0)]
		})
	)
	for (const f of frames) {
		const { sec, page } = f.anchor
		const k = pageKey(sec, page)
		const list = byPage.get(k)
		if (list) list.push(f)
		else byPage.set(k, [f])
		lastPage.set(sec, Math.max(lastPage.get(sec) ?? -1, page))
		// A follower reserves its head story's range in its own section: tag ids are per page,
		// and its page may belong to another section than the head's.
		const head = headOf.get(f.id)
		const story = (pub.frames[head ?? f.id]?.data as TextFrameData | undefined)?.story
		const t = nextTag.get(sec) ?? 1
		tagBase.set(f.id, t)
		nextTag.set(sec, t + (f.t === 'txt' ? (story ? storyTagCount(story) : 0) : 1))
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
			regions: masterRegions(m, side),
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
		let regs: Region[] = []
		/** The page's flow columns with their region index, in flow order. */
		let cols: { box: Box; reg: number }[] = []
		let ex: Exclusion[] = []
		/** Per region: the box its current column set spans (from where the last band ended). */
		let sets = new Map<number, Box>()
		let ci = 0
		/** Region of the last slot handed out. */
		let cur = 0
		const slotOf = (col: Box, region?: Box): FlowSlot => {
			// Only frames that can hit this column: every band top is at or below col.y, so
			// hits() rejects the rest anyway.
			// Many frames stacked on one column still cost O(frames) per row; index
			// them by y if that shows up. wrapExclusions caps a page at WRAP_FRAMES_MAX frames.
			const colEx = ex.filter((e) => e.x0 < col.x + col.w && e.x1 > col.x && e.y1 > col.y)
			return { pg, col, ex: colEx, ...(region ? { region } : {}) }
		}
		/** Index of the first column after region `reg`. */
		const regionEnd = (reg: number) => {
			let k = 0
			while (k < cols.length && cols[k].reg <= reg) k++
			return k
		}
		const below = (r: Region, top: Fx): Box => ({
			x: r.x,
			y: top,
			w: r.w,
			h: Math.max(0, r.y + r.h - top)
		})
		const next: NextSlot = (kind, top = 0) => {
			if (kind === 'band' || kind === 'cols') {
				const r = regs[cur]
				const fits = top < r.y + r.h
				ci = regionEnd(fits && kind === 'cols' ? cur - 1 : cur)
				if (kind === 'cols') sets.set(cur, below(r, top))
				else if (fits) {
					const b = below(r, top)
					return slotOf(b, b)
				}
			}
			if (kind === 'page') ci = cols.length
			if (ci >= cols.length) {
				if (text >= max) return undefined
				if (pages.length >= stopAt) {
					stopped = true
					return undefined
				}
				const added = addPage(sec.id, count++, text++ ? sec.rest : sec.first)
				pg = added.pg
				regs = added.regions
				cols = regs.flatMap((r, reg) => regionColumns(r).map((box) => ({ box, reg })))
				sets = new Map()
				ex = added.ex
				ci = 0
			}
			cur = cols[ci].reg
			const r = regs[cur]
			let set = sets.get(cur)
			if (!set) {
				set = below(r, r.y)
				sets.set(cur, set)
			}
			const multi = trackCount(r.cols) > 1
			if (kind === 'band' && multi) {
				// No room for the band where it was asked for: it opens this region's set instead.
				ci = regionEnd(cur)
				const b = { ...set }
				return slotOf(b, b)
			}
			const { box } = cols[ci++]
			const col = set.y === box.y ? box : { ...box, y: set.y, h: set.h }
			return slotOf(col, multi ? set : undefined)
		}
		const { paras, fields } = itemizeStory(sec.story, pub, env, baseCtx(sec.id))
		secFields.set(sec.id, fields)
		const refs = refsOf.get(sec.id)?.refs ?? []
		const byPara = new Map<number, FnRef[]>()
		for (const r of refs) byPara.set(r.pi, [...(byPara.get(r.pi) ?? []), r])
		for (const [pi, rs] of byPara) paras[pi] = numberRefs(paras[pi], rs, env)
		const notes: FnNote[] = refs.map((r) => ({
			...r,
			paras: r.story.paragraphs.map((q) => itemizeCached(q, pub, env))
		}))
		const blocks = new Map<number, TocBlock>()
		sec.story.paragraphs.forEach((q, pi) => {
			const lv = tocLevels(q)
			if (lv === undefined) return
			tocAll ??= tocEntries(pub)
			blocks.set(pi, tocBlock(q, paras[pi], lv, tocAll, pub, env))
		})
		const toc = blocks.size
			? { blocks, out: tocOut, tag: tociOf.get(sec.id)?.tag ?? 0 }
			: undefined
		const chars = fillFlow(sec.story, paras, next, env, notes, toc)
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
	// TOC pass 2: each entry's number is the page of its heading's first line.
	if (tocOut.length) {
		const at = new Map<string, PageDL>()
		for (const pg of pages) {
			for (const l of pg.lines) {
				const k = `${l.story}\u0000${l.bid}`
				if (!at.has(k)) at.set(k, pg)
			}
		}
		fillToc(
			tocOut,
			(e) => {
				const pg = at.get(`${e.story}\u0000${e.bid}`)
				return pg && pageNo.get(pg)
			},
			env,
			pub.lang
		)
	}
	// Body-text fields (before any frame item joins the page).
	for (const pg of pages) patchFields(pg.items, secFields.get(pg.page.sec) ?? [], ctxFor(pg), env)

	/**
	 * Lay out a text story through `slots` in order, each `box` on a scratch copy of its `pg`
	 * (fields resolved). One result per slot; the overset `chars` are on the last one only.
	 */
	const flowBox = (story: Story, slots: { box: Box; pg: PageDL }[]) => {
		const out = slots.map(({ pg }): { tmp: PageDL; chars: number } => ({
			tmp: { page: pg.page, items: [], lines: [], tags: [], rev: 0 },
			chars: 0
		}))
		// A chained story resolves its fields (page number…) with its first slot's (the head's)
		// page; per-slot fields would need itemizing per frame.
		const ctx = ctxFor(slots[0].pg)
		const { paras, fields } = itemizeStory(story, pub, env, ctx)
		let i = 0
		const next = (): FlowSlot | undefined => {
			if (i >= slots.length) return undefined
			const s = i++
			return { pg: out[s].tmp, col: slots[s].box }
		}
		out[out.length - 1].chars = fillFlow(story, paras, next, env)
		const tmps = out.map((r) => r.tmp)
		placeMarkers(story, paras, tmps, env)
		for (const tmp of tmps) patchFields(tmp.items, fields, ctx, env)
		return out
	}

	/** Where a text frame's text flows: its box shrunk by its inset. */
	const textBox = (f: Frame): Box => {
		const i = (f.data as TextFrameData).inset ?? 0
		return { x: f.x + i, y: f.y + i, w: Math.max(0, f.w - 2 * i), h: Math.max(0, f.h - 2 * i) }
	}

	// Each chain as one flow through its frames' boxes (followers on missing pages are skipped).
	const pageAt = new Map(pages.map((pg) => [pageKey(pg.page.sec, pg.page.index), pg]))
	const chainOut = new Map<string, { tmp: PageDL; chars: number }>()
	const chained = new Set<string>() // heads with at least one frame laid out
	for (const f of frames) {
		const { story } = f.data as TextFrameData
		const chain = chains.get(f.id)
		if (!story || !chain) continue
		const slots = [f.id, ...chain].flatMap((id) => {
			const fr = pub.frames[id]
			const pg = fr && pageAt.get(pageKey(fr.anchor.sec, fr.anchor.page))
			return pg ? [{ id, box: textBox(fr), pg }] : []
		})
		if (!slots.length) continue
		chained.add(f.id)
		flowBox(story, slots).forEach((r, s) => {
			chainOut.set(slots[s].id, r)
		})
	}

	/**
	 * Items of frame `f` on `pg` into `out`, its tags and lines into `pg` — or, for a master item
	 * (`art`), every item tagged `tag` and no tags/lines. Returns a text frame's overset chars.
	 */
	const emitFrame = (f: Frame, pg: PageDL, out: DLItem[], tag: number, art: boolean): number => {
		const from = out.length
		const box: Box = { x: f.x, y: f.y, w: f.w, h: f.h }
		const rot =
			f.rot % 360
				? { deg: f.rot, cx: f.x + Math.floor(f.w / 2), cy: f.y + Math.floor(f.h / 2) }
				: undefined
		let chars = 0
		if (f.t === 'img') {
			const d = f.data as ImageFrameData
			if (d.fileId) {
				out.push({ k: 'image', fileId: d.fileId, box, crop: d.crop, fit: d.fit, tag })
				if (!art)
					pg.tags.push(
						d.deco
							? { id: tag, role: 'Artifact', frame: f.id }
							: { id: tag, role: 'Figure', alt: d.alt, frame: f.id }
					)
			}
		} else if (f.t === 'emb') {
			out.push({ k: 'embed', frameId: f.id, box, tag })
			if (!art) {
				const alt = embedAlt(f.data as Record<string, unknown>)
				pg.tags.push({ id: tag, role: 'Figure', ...(alt ? { alt } : {}), frame: f.id })
			}
		} else if (f.t === 'shp') {
			const { kind, fill, stroke, strokeW } = f.data as ShapeFrameData
			const t = art ? { tag } : {}
			out.push(
				kind === 'ellipse'
					? { k: 'path', d: ellipsePath(box), fill, stroke, strokeW, ...t }
					: { k: 'rect', box, fill, stroke, strokeW, ...t }
			)
		} else {
			// Background and border (inside the box), even on a frame without text.
			const { story, fill, stroke, strokeW } = f.data as TextFrameData
			if (fill || (stroke && strokeW)) {
				const h = stroke && strokeW ? strokeW / 2 : 0
				out.push({
					k: 'rect',
					box: {
						x: f.x + h,
						y: f.y + h,
						w: Math.max(0, f.w - 2 * h),
						h: Math.max(0, f.h - 2 * h)
					},
					fill,
					stroke,
					strokeW,
					...(art ? { tag } : {})
				})
			}
			// A chain frame's share of its story, else its own story; a follower outside any
			// laid-out chain has none.
			const r = chainOut.get(f.id) ?? (story && flowBox(story, [{ box: textBox(f), pg }])[0])
			if (r) {
				chars = r.chars
				// The box's own tag ids (`1..storyTagCount`, nested ones too) move to the frame's range.
				const d = tag - 1
				const shift = (t: TagNode): TagNode => ({
					...t,
					id: t.id + d,
					...(t.children ? { children: t.children.map(shift) } : {})
				})
				for (const it of r.tmp.items) {
					if ('tag' in it && it.tag !== undefined) it.tag = art ? tag : it.tag + d
					out.push(it)
				}
				if (!art) {
					for (const t of r.tmp.tags) pg.tags.push({ ...shift(t), frame: f.id })
					pg.lines.push(...(rot ? r.tmp.lines.map((l) => ({ ...l, rot })) : r.tmp.lines))
				}
			}
		}
		if (rot) for (let q = from; q < out.length; q++) out[q].rot = rot
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
	// Text frames anchored past their section's last page (or to no section): all overset —
	// unless a later frame of their chain was laid out (it carries the overset), or a follower.
	for (const f of frames) {
		const story = (f.data as TextFrameData).story
		if (f.t !== 'txt' || !story || chained.has(f.id)) continue
		if (placed.has(pageKey(f.anchor.sec, f.anchor.page))) continue
		const { paras } = itemizeStory(story, pub, env, baseCtx(f.anchor.sec))
		const chars = fillFlow(story, paras, () => undefined, env)
		if (chars) overset.push({ sec: f.anchor.sec, chars, frame: f.id })
	}
	return { pages, sections, overset }
}
