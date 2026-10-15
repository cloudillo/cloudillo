// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Stored (Y.Doc) → engine model converters. Worker-safe: no DOM, no `@cloudillo/core`,
 * no `@cloudillo/fonts` barrel. The layout worker's adapter builds on these. Entities are read
 * through `entities.ts`.
 */

import * as Y from 'yjs'
import { ptToFx } from '@cloudillo/typeset'
import type {
	Frame,
	InlineEmbed,
	Margins,
	Master,
	Paragraph,
	ParagraphProps,
	Publication,
	Region,
	Run,
	Section,
	Story,
	TableBlock
} from '@cloudillo/typeset'

import {
	anchorOf,
	FULL_CROP,
	framesOf,
	frameOf,
	masterOf,
	mastersOf,
	sectionOf,
	stylesOf
} from './entities'
import { newBlockId } from './block-ids'
import { sanitizeBox, sanitizeMarks, sanitizeOverrides } from './overrides'
import {
	type StoredFrame,
	type StoredLineAttrs,
	TABLE_KEYS,
	type StoredMaster,
	type StoredMeta,
	type StoredSection,
	type StoredTextFrameData,
	type YPagilloDocument
} from './stored-types'
import type { PageSize, PublicationMeta } from './runtime-types'

/** Portrait page sizes (Fx). */
export const PAGE_SIZES = {
	A4: { w: ptToFx(595.276), h: ptToFx(841.89) },
	Letter: { w: ptToFx(612), h: ptToFx(792) }
} satisfies Record<string, PageSize>

const optStr = (v: unknown) => (typeof v === 'string' ? v : undefined)

/** An `m` collection (`fonts`/`styleMap`/`spellIgnore`, flat `<name>/<entry>` keys) as a record. */
function collection(m: Y.Map<unknown>, name: string): Record<string, unknown> | undefined {
	const pre = `${name}/`
	const e = [...m.entries()].filter(([k]) => k.startsWith(pre))
	return e.length ? Object.fromEntries(e.map(([k, v]) => [k.slice(pre.length), v])) : undefined
}

/** `m` with defaults applied; the fields the layout worker reads are type-checked (peer data). */
export function readMeta(m: Y.Map<unknown>): PublicationMeta {
	const g = <K extends keyof StoredMeta>(k: K) => m.get(k) as StoredMeta[K]
	const lang: unknown = g('lang')
	const fonts = collection(m, 'fonts')
	const spellIgnore = collection(m, 'spellIgnore')
	return {
		title: optStr(g('title')),
		page: g('page') ?? PAGE_SIZES.A4,
		facing: g('facing') === true,
		engine: g('engine'),
		fonts: fonts as PublicationMeta['fonts'],
		pdf: g('pdf'),
		lang: typeof lang === 'string' && lang ? lang : 'en',
		styleMap: (collection(m, 'styleMap') ?? {}) as PublicationMeta['styleMap'],
		exportedAt: optStr(g('exportedAt')),
		spellIgnore: spellIgnore ? Object.keys(spellIgnore) : []
	}
}

/** A `Y.Text#toDelta()` op. */
export interface DeltaOp {
	insert?: string | object
	attributes?: Record<string, unknown>
}

/** A line of a quill-table-better table (any `TABLE_KEYS` attr set). */
export const isTableLine = (a: StoredLineAttrs | Record<string, unknown> | undefined): boolean =>
	!!a && TABLE_KEYS.some((k) => (a as Record<string, unknown>)[k] != null)

/** Cell id of a line: its `*-block` id; `''` on a table / col line; undefined outside tables. */
export function cellOf(
	a: StoredLineAttrs | Record<string, unknown> | undefined
): string | undefined {
	if (!a) return
	const la = a as StoredLineAttrs
	const b = la['table-cell-block'] ?? la['table-th-block']
	if (b != null) return String(b)
	return isTableLine(a) ? '' : undefined
}

/** Row id of a cell line (`data-row`; quill-table-better pastes may store it bare). */
export function rowOf(
	a: StoredLineAttrs | Record<string, unknown> | undefined
): string | undefined {
	const la = a as StoredLineAttrs | undefined
	const c: unknown = la?.['table-cell'] ?? la?.['table-th']
	if (c == null) return
	return String(typeof c === 'object' ? (c as Record<string, unknown>)['data-row'] : c)
}

/** Stored `data-borders` values of a table. */
export const BORDERS = new Set(['outer', 'header', 'none'])
/** Widest table grid read (the engine's `MAX_SPAN`): a peer or paste could ask for any width. */
const MAX_COLS = 64
/** A `colspan` / `rowspan` worth keeping (2–64). */
export const cellSpan = (v: unknown): number | undefined => {
	const n = Number(v)
	return Number.isInteger(n) && n > 1 ? Math.min(n, MAX_COLS) : undefined
}
/** Grid columns a cell line spans (`colspan`, 1 when missing). */
export function colSpanOf(a: StoredLineAttrs | Record<string, unknown> | undefined): number {
	const la = a as StoredLineAttrs | undefined
	const c: unknown = la?.['table-cell'] ?? la?.['table-th']
	return (typeof c === 'object' && cellSpan((c as Record<string, unknown> | null)?.colspan)) || 1
}
export const newRowId = (): string => `row-${newBlockId()}`
export const newCellId = (): string => `cell-${newBlockId()}`

/**
 * Story delta → engine paragraphs. Every `'\n'` ends a paragraph and carries its line attrs.
 * A missing or duplicate `bid` (not yet normalised — readers never normalise) gets a
 * placeholder `~<line index>` so the engine's per-story bid uniqueness always holds. A paragraph
 * holding only an `img` embed becomes an `EmbedBlock` (full column width / centred, or its
 * `float` when set). Consecutive table lines become one `TableBlock` paragraph (bid: its
 * `table-temporary` line's, else `<first cell bid>~t`) whose cell paragraphs keep their own bids.
 */
export function deltaToParagraphs(ops: DeltaOp[], defaultStyle = ''): Paragraph[] {
	const out: Paragraph[] = []
	const seen = new Set<string>()
	let runs: Run[] = []
	/** '\n' index: the bid fallback counts lines, as `paragraphStarts` does. */
	let line = 0
	let tbl: { p: Paragraph; blk: TableBlock; row?: string; cell?: string } | undefined
	const tables: Paragraph[] = []

	const paragraph = (attrs: StoredLineAttrs): Paragraph => {
		const bid = bidOf(attrs, seen, line++)
		const overrides: Partial<ParagraphProps> = { ...sanitizeOverrides(attrs.po) }
		if (attrs.list === 'bullet' || attrs.list === 'ordered') {
			const level = Math.min(8, Math.max(0, attrs.indent ?? 0))
			overrides.list = { kind: attrs.list, format: '', level }
		}
		const p: Paragraph = { bid, style: attrs.ps || defaultStyle, overrides, runs }
		const only = runs.length === 1 ? runs[0].embed : undefined
		if (only && 'img' in only) {
			const { fileId, w, h, alt, float } = only.img
			p.runs = {
				k: 'emb',
				data: {},
				img: { fileId, crop: FULL_CROP, fit: 'contain', alt },
				w,
				h,
				...(float ? { float } : {})
			}
		}
		if (attrs.ph) p.placeholder = attrs.ph
		runs = []
		return p
	}

	const push = (attrs: StoredLineAttrs) => {
		const p = paragraph(attrs)
		if (!isTableLine(attrs)) {
			tbl = undefined
			out.push(p)
			return
		}
		const tmp = attrs['table-temporary']
		if (!tbl || (tmp && tbl.blk.rows.length)) {
			const blk: TableBlock = { k: 'table', cols: [], rows: [] }
			let bid = p.bid
			if (!tmp) {
				bid = `${p.bid}~t`
				seen.add(bid)
			}
			const tp: Paragraph = tmp
				? { bid, style: p.style, overrides: p.overrides, runs: blk }
				: { bid, style: defaultStyle, overrides: {}, runs: blk }
			const b = tmp?.['data-borders']
			if (b && BORDERS.has(b)) blk.borders = b
			tbl = { p: tp, blk }
			tables.push(tp)
			out.push(tp)
		}
		const cell = cellOf(attrs)
		if (!cell) return // the table-temporary or a table-col line
		const { blk } = tbl
		const row = rowOf(attrs) ?? ''
		let r = blk.rows[blk.rows.length - 1]
		if (!r || row !== tbl.row) {
			r = { cells: [] }
			if (attrs['table-th'] != null) r.header = true
			blk.rows.push(r)
			tbl.row = row
			tbl.cell = undefined
		}
		let c = r.cells[r.cells.length - 1]
		// A full row's further cells join its last one: the text stays, the grid stays bounded.
		if (
			!c ||
			(cell !== tbl.cell && r.cells.reduce((s, x) => s + (x.colSpan ?? 1), 0) < MAX_COLS)
		) {
			const ca: unknown = attrs['table-cell'] ?? attrs['table-th']
			const o = ca && typeof ca === 'object' ? (ca as Record<string, unknown>) : {}
			c = { paragraphs: [] }
			const cs = colSpanOf(attrs)
			const rs = cellSpan(o.rowspan)
			if (cs > 1) c.colSpan = cs
			if (rs) c.rowSpan = rs
			r.cells.push(c)
		}
		tbl.cell = cell
		c.paragraphs.push(p)
	}

	for (const op of ops) {
		const ins = op.insert
		if (typeof ins !== 'string') {
			if (ins && typeof ins === 'object') {
				runs.push({
					text: '￼',
					marks: sanitizeMarks(op.attributes),
					embed: ins as InlineEmbed
				})
			}
			continue
		}
		let i = 0
		for (;;) {
			const nl = ins.indexOf('\n', i)
			const end = nl < 0 ? ins.length : nl
			if (end > i) runs.push({ text: ins.slice(i, end), marks: sanitizeMarks(op.attributes) })
			if (nl < 0) break
			push((op.attributes ?? {}) as StoredLineAttrs)
			i = nl + 1
		}
	}
	// Unterminated tail (the normaliser appends the '\n'; until then keep it visible).
	if (runs.length) push({})
	for (const tp of tables) {
		const blk = tp.runs as TableBlock
		let n = 0
		for (const r of blk.rows)
			n = Math.max(
				n,
				r.cells.reduce((s, c) => s + (c.colSpan ?? 1), 0)
			)
		// Equal widths (quill-table-better's colgroup widths are not read).
		if (n) blk.cols = new Array<number>(Math.min(n, MAX_COLS)).fill(0)
		else tp.runs = []
	}
	return out
}

/** The engine bid of paragraph `index` (shared by `deltaToParagraphs` and `paragraphStarts`). */
function bidOf(attrs: StoredLineAttrs, seen: Set<string>, index: number): string {
	let bid = typeof attrs.bid === 'string' ? attrs.bid : ''
	if (!bid || seen.has(bid)) bid = `~${index}`
	seen.add(bid)
	return bid
}

/** Each paragraph's bid (as `deltaToParagraphs` gives it), Y.Text start and line attrs. */
function eachParagraph(
	ops: DeltaOp[],
	fn: (bid: string, start: number, attrs: StoredLineAttrs) => void
): void {
	const seen = new Set<string>()
	let n = 0
	let pos = 0
	let start = 0
	/** The current paragraph has a run (the `deltaToParagraphs` unterminated-tail rule). */
	let open = false
	for (const op of ops) {
		const ins = op.insert
		if (typeof ins !== 'string') {
			if (ins && typeof ins === 'object') open = true
			pos++
			continue
		}
		let i = 0
		for (;;) {
			const nl = ins.indexOf('\n', i)
			if (nl < 0) {
				if (ins.length > i) open = true
				break
			}
			const a = (op.attributes ?? {}) as StoredLineAttrs
			fn(bidOf(a, seen, n++), start, a)
			start = pos + nl + 1
			open = false
			i = nl + 1
		}
		pos += ins.length
	}
	if (open) fn(bidOf({}, seen, n), start, {})
}

/**
 * Y.Text start offset of each paragraph, keyed by the bid `deltaToParagraphs` gives it — maps the
 * engine's paragraph-relative `LineGeom.from/to` to story offsets.
 */
export function paragraphStarts(ops: DeltaOp[]): Map<string, number> {
	const out = new Map<string, number>()
	eachParagraph(ops, (bid, start) => out.set(bid, start))
	return out
}

/** Table cell paragraphs keyed by their `deltaToParagraphs` bid: row and cell id. */
export function tableCells(ops: DeltaOp[]): Map<string, { row: string; cell: string }> {
	const out = new Map<string, { row: string; cell: string }>()
	eachParagraph(ops, (bid, _s, a) => {
		const cell = cellOf(a)
		if (cell) out.set(bid, { row: rowOf(a) ?? '', cell })
	})
	return out
}

export function storyToEngine(id: string, text: Y.Text | undefined, defaultStyle = ''): Story {
	return { id, paragraphs: text ? deltaToParagraphs(text.toDelta(), defaultStyle) : [] }
}

/** Facing-page handling of `m`: non-facing → 'same'; missing → 'different' with variants, else 'mirror'. */
export function resolveSide(m: StoredMaster, facing: boolean): 'mirror' | 'same' | 'different' {
	if (!facing) return 'same'
	return m.side ?? (m.left || m.right ? 'different' : 'mirror')
}

/** `r` mirrored across the page's vertical centre line. */
export function flipRegion<T extends { x: number; w: number }>(r: T, pageW: number): T {
	return { ...r, x: pageW - r.x - r.w }
}

/** A frame box mirrored onto the left-hand page (and back): x flipped, rotation negated. */
export function mirrorFrame<T extends { x: number; w: number; rot: number }>(
	f: T,
	pageW: number
): T {
	return { ...flipRegion(f, pageW), rot: -f.rot || 0 }
}

/** Engine frame id of the left-page (mirrored) copy of static item `id`. */
export const mirroredItemId = (id: string) => `${id}~m`

// Primary-subtag list; switch to Intl.Locale#getTextInfo once every target ships it.
const RTL_LANGS = new Set(['ar', 'ckb', 'dv', 'fa', 'he', 'ps', 'sd', 'ug', 'ur', 'yi'])

/** `lang` (BCP 47) is written right to left. */
export const isRtlLang = (lang: string) => RTL_LANGS.has(lang.toLowerCase().split(/[-_]/)[0])

/**
 * Automatic flow order: areas grouped into rows by vertical overlap, rows top to bottom,
 * areas within a row in the writing direction. Stable for equal positions.
 */
export function flowOrder<T extends { x: number; y: number; w: number; h: number }>(
	regions: T[],
	rtl: boolean
): T[] {
	const rows: { bottom: number; rs: T[] }[] = []
	for (const r of [...regions].sort((a, b) => a.y - b.y)) {
		const row = rows[rows.length - 1]
		if (row && r.y < row.bottom) {
			row.rs.push(r)
			row.bottom = Math.max(row.bottom, r.y + r.h)
		} else rows.push({ bottom: r.y + r.h, rs: [r] })
	}
	return rows.flatMap((row) => row.rs.sort((a, b) => (rtl ? b.x + b.w - (a.x + a.w) : a.x - b.x)))
}

/** `rs` in the order of `ids` (region ids); the rest keep their order after them. */
export function byIds<T extends { id: string }>(rs: T[], ids: string[] | undefined): T[] {
	if (!ids) return rs
	const rank = (r: T) => {
		const i = ids.indexOf(r.id)
		return i < 0 ? ids.length : i
	}
	return [...rs].sort((a, b) => rank(a) - rank(b))
}

/** `mg` for the other page side: inside and outside swapped. */
export const swapInOut = (mg: Margins): Margins => ({ ...mg, in: mg.out, out: mg.in })

/** Static item frame ids of one master, by anchor side: `both` = no `side`, `l`/`r` = that side. */
export interface MasterItemIds {
	both: string[]
	l: string[]
	r: string[]
}

const NO_ITEMS: MasterItemIds = { both: [], l: [], r: [] }

/**
 * Master id → its static items, derived from frame anchors (`{ ms, side? }`), ids sorted.
 * Synthesized (`~`) ids are skipped; masters without items are absent.
 */
export function masterItemIndex(doc: YPagilloDocument): Map<string, MasterItemIds> {
	const out = new Map<string, MasterItemIds>()
	for (const [id, y] of doc.f.entries()) {
		const a = anchorOf(y)
		if (!a || !('ms' in a) || id.includes('~')) continue
		let e = out.get(a.ms)
		if (!e) {
			e = { both: [], l: [], r: [] }
			out.set(a.ms, e)
		}
		e[a.side ?? 'both'].push(id)
	}
	for (const e of out.values()) for (const ids of [e.both, e.l, e.r]) ids.sort()
	return out
}

/**
 * Engine master: pagillo-only fields stripped, regions in flow order (`flow` 'auto', per side),
 * and the facing mode applied — 'mirror' synthesizes the `left` variant (flipped regions, items
 * as `mirroredItemId` copies from `mirroredItemFrames`), 'same' drops the variants; on facing
 * pages its left margins are swapped back so the implicit area is an exact copy of the right one.
 * `items` = the shared items (`items.both`); only in 'different' mode does a side add its own
 * (`items.l`/`items.r`, drawn after the shared ones) — 'mirror' and 'same' draw shared items only.
 */
export function masterToEngine(
	id: string,
	m: StoredMaster,
	items: MasterItemIds | undefined,
	opts: { facing: boolean; rtl: boolean }
): Master {
	const {
		name: _name,
		rows: _rows,
		rowGutter: _rowGutter,
		side: _side,
		flow,
		leftOrder,
		regionNames: _regionNames,
		left,
		right,
		...rest
	} = m
	const its = items ?? NO_ITEMS
	const order = (rs: Region[]) => (flow === 'manual' ? rs : flowOrder(rs, opts.rtl))
	const out: Master = { ...rest, id, regions: order(rest.regions), items: its.both }
	const mode = resolveSide(m, opts.facing)
	if (mode === 'mirror') {
		const flipped = rest.regions.map((r) => flipRegion(r, m.w))
		out.left = {
			regions: flow === 'manual' ? byIds(flipped, leftOrder) : flowOrder(flipped, opts.rtl),
			items: its.both.map(mirroredItemId)
		}
	} else if (mode === 'different') {
		for (const [k, v, own] of [
			['left', left, its.l],
			['right', right, its.r]
		] as const) {
			if (!v && !own.length) continue
			out[k] = {
				...v,
				...(v?.regions ? { regions: order(v.regions) } : {}),
				...(own.length ? { items: [...its.both, ...own] } : {})
			}
		}
	} else if (mode === 'same' && opts.facing) out.left = { margins: swapInOut(m.margins) }
	return out
}

/**
 * Left-page copies of the shared static items of mirrored masters (facing publications), keyed
 * by `mirroredItemId` — the frames `masterToEngine`'s synthesized `left.items` name.
 */
export function mirroredItemFrames(
	doc: YPagilloDocument,
	story: (id: string) => Story,
	index: Map<string, MasterItemIds> = masterItemIndex(doc)
): Record<string, Frame> {
	const out: Record<string, Frame> = {}
	const facing = readMeta(doc.m).facing
	for (const [msId, m] of mastersOf(doc)) {
		if (resolveSide(m, facing) !== 'mirror') continue
		for (const id of index.get(msId)?.both ?? []) {
			const f = frameOf(doc, id)
			const mid = mirroredItemId(id)
			if (f) out[mid] = frameToEngine(mid, mirrorFrame(f, m.w), story)
		}
	}
	return out
}

/**
 * Engine frames: page frames, the master items some engine master draws (`masterToEngine`:
 * master present; a `side` item only in 'different' mode), plus `mirroredItemFrames`. `~` is
 * reserved for synthesized ids (`newId` never makes one), so a stored id holding it is a peer's
 * forgery and is skipped.
 */
export function framesToEngine(
	doc: YPagilloDocument,
	story: (id: string) => Story
): Record<string, Frame> {
	const out: Record<string, Frame> = {}
	const chains = textChains(doc)
	const facing = readMeta(doc.m).facing
	for (const [id, f] of framesOf(doc)) {
		if (id.includes('~')) continue
		if ('ms' in f.anchor) {
			const m = masterOf(doc, f.anchor.ms)
			if (!m || (f.anchor.side && resolveSide(m, facing) !== 'different')) continue
		}
		out[id] = frameToEngine(id, f, story, chains.get(id))
	}
	return Object.assign(out, mirroredItemFrames(doc, story))
}

/** Ids of every master static item (frames anchored `{ ms }`), side items included. */
export function masterItems(doc: YPagilloDocument): Set<string> {
	const out = new Set<string>()
	for (const [id, y] of doc.f.entries()) {
		const a = anchorOf(y)
		if (a && 'ms' in a && doc.ms.has(a.ms)) out.add(id)
	}
	return out
}

/** `changed` (a transaction's changed types) holds `roots` or a type nested in one of them. */
function touches(changed: Map<object, unknown> | undefined, roots: object[]): boolean {
	if (!changed) return false
	for (const t of changed.keys()) {
		for (let p: Y.AbstractType<unknown> | null = t as Y.AbstractType<unknown>; p; ) {
			if (roots.includes(p)) return true
			const parent: unknown = p._item?.parent
			p = parent instanceof Y.AbstractType ? parent : null
		}
	}
	return false
}

/**
 * Valid text chains: head id → follower ids, in flow order (non-empty). A head is a page-anchored
 * `txt` frame with a `story`. A `chain` id is dropped when it is missing, not `txt`, has its own
 * `story`, is a master item or synthesized (`~`), or already sits in an earlier chain. Heads go
 * in id order, so every peer gives a doubly claimed follower to the same head.
 * Cached per document until a transaction changes `f` or `ms`, nested entity maps included
 * (bypassed inside one that already did); the returned map is shared and read-only.
 */
export function textChains(doc: YPagilloDocument): Map<string, string[]> {
	const yDoc = doc.f.doc
	const roots = [doc.f, doc.ms]
	if (!yDoc || touches(yDoc._transaction?.changed, roots)) return buildTextChains(doc)
	if (!chainsHooked.has(yDoc)) {
		chainsHooked.add(yDoc)
		yDoc.on('beforeObserverCalls', (tr: Y.Transaction) => {
			if (touches(tr.changed, roots)) chainsCache.delete(doc.f)
		})
	}
	let out = chainsCache.get(doc.f)
	if (!out) {
		out = buildTextChains(doc)
		chainsCache.set(doc.f, out)
	}
	return out
}

const chainsCache = new WeakMap<object, Map<string, string[]>>()
const chainsHooked = new WeakSet<Y.Doc>()

function buildTextChains(doc: YPagilloDocument): Map<string, string[]> {
	const frames = new Map(framesOf(doc))
	const bad = (id: string) => id.includes('~') || 'ms' in (frames.get(id)?.anchor ?? {})
	const claimed = new Set<string>()
	const out = new Map<string, string[]>()
	const heads = [...frames].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
	for (const [id, f] of heads) {
		const d = f.t === 'txt' ? (f.data as StoredTextFrameData) : undefined
		if (typeof d?.story !== 'string' || !Array.isArray(d.chain) || bad(id)) continue
		const ok = d.chain.filter((c) => {
			if (typeof c !== 'string') return false
			const cf = frames.get(c)
			if (cf?.t !== 'txt' || (cf.data as StoredTextFrameData).story) return false
			if (claimed.has(c) || bad(c)) return false
			claimed.add(c)
			return true
		})
		if (ok.length) out.set(id, ok)
	}
	return out
}

export function sectionToEngine(id: string, s: StoredSection, story: Story): Section {
	return { ...s, id, story }
}

/** Engine anchor of a master item (the engine ignores it: `Master.items` names the frame). */
const MASTER_ANCHOR: Frame['anchor'] = { sec: '', page: 0 }

/**
 * `chain`: the head's validated followers (`textChains`); a story-less `txt` frame keeps only its
 * box styling. A master item gets a placeholder engine anchor.
 */
export function frameToEngine(
	id: string,
	f: StoredFrame,
	story: (id: string) => Story,
	chain?: string[]
): Frame {
	const anchor = 'ms' in f.anchor ? MASTER_ANCHOR : f.anchor
	if (f.t !== 'txt')
		return {
			...f,
			id,
			anchor,
			data: f.data as Exclude<StoredFrame['data'], StoredTextFrameData>
		}
	const { story: st, chain: _, ...rest } = f.data as StoredTextFrameData
	const box = sanitizeBox(rest)
	const data: Frame['data'] =
		typeof st === 'string'
			? { ...box, story: story(st), ...(chain?.length ? { chain } : {}) }
			: box
	return { ...f, id, anchor, data }
}

/** The whole publication as an engine model (worker init; incremental updates use the parts). */
export function toEnginePublication(doc: YPagilloDocument): Publication {
	const meta = readMeta(doc.m)
	const story = (id: string) => storyToEngine(id, doc.tx.get(id), meta.styleMap.p)
	const pub: Publication = {
		lang: meta.lang,
		styles: Object.fromEntries(stylesOf(doc)),
		masters: {},
		sections: [],
		frames: framesToEngine(doc, story),
		facing: meta.facing,
		title: meta.title,
		exportedAt: meta.exportedAt
	}
	const opts = { facing: meta.facing, rtl: isRtlLang(meta.lang) }
	const index = masterItemIndex(doc)
	for (const [id, m] of mastersOf(doc))
		pub.masters[id] = masterToEngine(id, m, index.get(id), opts)
	for (const id of doc.secs.toArray()) {
		const s = sectionOf(doc, id)
		if (s) pub.sections.push(sectionToEngine(id, s, story(s.story)))
	}
	return pub
}

// vim: ts=4
