// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Stored (Y.Doc) → engine model converters. Worker-safe: no DOM, no `@cloudillo/core`,
 * no `@cloudillo/fonts` barrel. The layout worker's adapter builds on these.
 */

import type * as Y from 'yjs'
import { ptToFx } from '@cloudillo/typeset'
import type {
	Crop,
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
	Story
} from '@cloudillo/typeset'

import { sanitizeMarks, sanitizeOverrides } from './overrides'
import type {
	StoredFrame,
	StoredLineAttrs,
	StoredMaster,
	StoredMeta,
	StoredSection,
	StoredTextFrameData,
	YPagilloDocument
} from './stored-types'
import type { PageSize, PublicationMeta } from './runtime-types'

/** Portrait page sizes (Fx). */
export const PAGE_SIZES = {
	A4: { w: ptToFx(595.276), h: ptToFx(841.89) },
	Letter: { w: ptToFx(612), h: ptToFx(792) }
} satisfies Record<string, PageSize>

export const FULL_CROP: Crop = { x: 0, y: 0, w: 1, h: 1 }

const optStr = (v: unknown) => (typeof v === 'string' ? v : undefined)

/** `m` with defaults applied; the fields the layout worker reads are type-checked (peer data). */
export function readMeta(m: Y.Map<unknown>): PublicationMeta {
	const g = <K extends keyof StoredMeta>(k: K) => m.get(k) as StoredMeta[K]
	const lang: unknown = g('lang')
	const styleMap: unknown = g('styleMap')
	return {
		title: optStr(g('title')),
		page: g('page') ?? PAGE_SIZES.A4,
		facing: g('facing') === true,
		engine: g('engine'),
		fonts: g('fonts'),
		pdf: g('pdf'),
		lang: typeof lang === 'string' && lang ? lang : 'en',
		styleMap:
			styleMap && typeof styleMap === 'object' && !Array.isArray(styleMap)
				? (styleMap as PublicationMeta['styleMap'])
				: {},
		exportedAt: optStr(g('exportedAt')),
		spellIgnore: g('spellIgnore') ?? []
	}
}

/** A `Y.Text#toDelta()` op. */
export interface DeltaOp {
	insert?: string | object
	attributes?: Record<string, unknown>
}

/**
 * Story delta → engine paragraphs. Every `'\n'` ends a paragraph and carries its line attrs.
 * A missing or duplicate `bid` (not yet normalised — readers never normalise) gets a
 * placeholder `~<index>` so the engine's per-story bid uniqueness always holds. A paragraph
 * holding only an `img` embed becomes an `EmbedBlock` (full column width / centred).
 */
export function deltaToParagraphs(ops: DeltaOp[], defaultStyle = ''): Paragraph[] {
	const out: Paragraph[] = []
	const seen = new Set<string>()
	let runs: Run[] = []

	const push = (attrs: StoredLineAttrs) => {
		const bid = bidOf(attrs, seen, out.length)
		const overrides: Partial<ParagraphProps> = { ...sanitizeOverrides(attrs.po) }
		if (attrs.list === 'bullet' || attrs.list === 'ordered') {
			const level = Math.min(8, Math.max(0, attrs.indent ?? 0))
			overrides.list = { kind: attrs.list, format: '', level }
		}
		const p: Paragraph = { bid, style: attrs.ps || defaultStyle, overrides, runs }
		const only = runs.length === 1 ? runs[0].embed : undefined
		if (only && 'img' in only) {
			const { fileId, w, h, alt } = only.img
			p.runs = {
				k: 'emb',
				data: {},
				img: { fileId, crop: FULL_CROP, fit: 'contain', alt },
				w,
				h
			}
		}
		if (attrs.ph) p.placeholder = attrs.ph
		out.push(p)
		runs = []
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
	return out
}

/** The engine bid of paragraph `index` (shared by `deltaToParagraphs` and `paragraphStarts`). */
function bidOf(attrs: StoredLineAttrs, seen: Set<string>, index: number): string {
	let bid = typeof attrs.bid === 'string' ? attrs.bid : ''
	if (!bid || seen.has(bid)) bid = `~${index}`
	seen.add(bid)
	return bid
}

/**
 * Y.Text start offset of each paragraph, keyed by the bid `deltaToParagraphs` gives it — maps the
 * engine's paragraph-relative `LineGeom.from/to` to story offsets.
 */
export function paragraphStarts(ops: DeltaOp[]): Map<string, number> {
	const out = new Map<string, number>()
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
			out.set(bidOf((op.attributes ?? {}) as StoredLineAttrs, seen, n++), start)
			start = pos + nl + 1
			open = false
			i = nl + 1
		}
		pos += ins.length
	}
	if (open) out.set(bidOf({}, seen, n), start)
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

/**
 * Engine master: pagillo-only fields stripped, regions in flow order (`flow` 'auto', per side),
 * and the facing mode applied — 'mirror' synthesizes the `left` variant (flipped regions, items
 * as `mirroredItemId` copies from `mirroredItemFrames`), 'same' drops the variants; on facing
 * pages its left margins are swapped back so the implicit area is an exact copy of the right one.
 */
export function masterToEngine(
	id: string,
	m: StoredMaster,
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
	const order = (rs: Region[]) => (flow === 'manual' ? rs : flowOrder(rs, opts.rtl))
	const out: Master = { ...rest, id, regions: order(rest.regions) }
	const mode = resolveSide(m, opts.facing)
	if (mode === 'mirror') {
		const flipped = rest.regions.map((r) => flipRegion(r, m.w))
		out.left = {
			regions: flow === 'manual' ? byIds(flipped, leftOrder) : flowOrder(flipped, opts.rtl),
			items: rest.items.map(mirroredItemId)
		}
	} else if (mode === 'different') {
		for (const [k, v] of [
			['left', left],
			['right', right]
		] as const)
			if (v) out[k] = v.regions ? { ...v, regions: order(v.regions) } : v
	} else if (mode === 'same' && opts.facing) out.left = { margins: swapInOut(m.margins) }
	return out
}

/**
 * Left-page copies of the static items of mirrored masters (facing publications), keyed by
 * `mirroredItemId` — the frames `masterToEngine`'s synthesized `left.items` name.
 */
export function mirroredItemFrames(
	doc: YPagilloDocument,
	story: (id: string) => Story
): Record<string, Frame> {
	const out: Record<string, Frame> = {}
	const facing = readMeta(doc.m).facing
	doc.ms.forEach((m) => {
		if (resolveSide(m, facing) !== 'mirror') return
		for (const id of m.items) {
			const f = doc.f.get(id)
			const mid = mirroredItemId(id)
			if (f) out[mid] = frameToEngine(mid, mirrorFrame(f, m.w), story)
		}
	})
	return out
}

/**
 * Engine frames: the stored ones plus `mirroredItemFrames`. `~` is reserved for synthesized ids
 * (`newId` never makes one), so a stored id holding it is a peer's forgery and is skipped.
 */
export function framesToEngine(
	doc: YPagilloDocument,
	story: (id: string) => Story
): Record<string, Frame> {
	const out: Record<string, Frame> = {}
	doc.f.forEach((f, id) => {
		if (!id.includes('~')) out[id] = frameToEngine(id, f, story)
	})
	return Object.assign(out, mirroredItemFrames(doc, story))
}

export function sectionToEngine(id: string, s: StoredSection, story: Story): Section {
	return { ...s, id, story }
}

export function frameToEngine(id: string, f: StoredFrame, story: (id: string) => Story): Frame {
	const data: Frame['data'] =
		f.t === 'txt'
			? { story: story((f.data as StoredTextFrameData).story) }
			: (f.data as Exclude<StoredFrame['data'], StoredTextFrameData>)
	return { ...f, id, data }
}

/** The whole publication as an engine model (worker init; incremental updates use the parts). */
export function toEnginePublication(doc: YPagilloDocument): Publication {
	const meta = readMeta(doc.m)
	const story = (id: string) => storyToEngine(id, doc.tx.get(id), meta.styleMap.p)
	const pub: Publication = {
		lang: meta.lang,
		styles: Object.fromEntries(doc.st.entries()),
		masters: {},
		sections: [],
		frames: framesToEngine(doc, story),
		facing: meta.facing,
		title: meta.title,
		exportedAt: meta.exportedAt
	}
	const opts = { facing: meta.facing, rtl: isRtlLang(meta.lang) }
	doc.ms.forEach((m, id) => {
		pub.masters[id] = masterToEngine(id, m, opts)
	})
	for (const id of doc.secs.toArray()) {
		const s = doc.s.get(id)
		if (s) pub.sections.push(sectionToEngine(id, s, story(s.story)))
	}
	return pub
}

// vim: ts=4
