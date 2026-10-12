// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// Field runs (`Run.embed = { field }`). A field keeps its one U+FFFC character (story offsets are
// unchanged) but is shaped as one sentinel glyph as wide as its text; `patchFields` swaps the
// emitted sentinel for the real glyphs once the value is known. A page number in body text is not
// known before pagination: it gets a fixed box (three tabular zeros), so it never changes breaks.

import type { DLItem, FontRef } from '../display-list.js'
import { type Fx, unitsToFx } from '../fixed.js'
import type { InlineEmbed, StyleDef, Story } from '../model.js'
import { type ItemizedParagraph, type ItemizeEnv, paragraphText } from '../text/itemize.js'
import { resolveParagraphStyle } from '../text/styles.js'
import { formatDate } from './locale.js'

export type FieldEmbed = Extract<InlineEmbed, { field: string }>

/** Everything a field can print, for one page (or one flow before pagination). */
export interface FieldCtx {
	/** Publication language (date patterns). */
	lang: string
	/** Publication title. */
	title: string
	/** Title of the page's section (`sectionTitle`). */
	section: string
	/** Publication `exportedAt` (date field `src: 'export'`). */
	exportedAt?: string
	/** Formatted page number / page count; absent while unknown (body text before pagination). */
	page?: string
	pages?: string
}

/** Box of a not-yet-known page number. */
const BOX = '000'
/** Field k of a flow is shaped as glyph id `SENTINEL + k`. */
// Over 4096 fields per flow, or a real gid ≥ 0xF000 shaped alone from U+FFFC, would be
// mistaken for a field; carry a field index on ItemRun/DL items if either ever happens.
const SENTINEL = 0xf000

const numeric = (f: FieldEmbed) => f.field === 'page' || f.field === 'pages'

/** Text of a field, `undefined` while it is a page number not known yet. */
export function fieldText(f: FieldEmbed, c: FieldCtx): string | undefined {
	switch (f.field) {
		case 'page':
			return c.page
		case 'pages':
			return c.pages
		case 'section':
			return c.section
		case 'title':
			return c.title
		case 'date':
			return formatDate((f.src === 'fixed' ? f.d : c.exportedAt) ?? '', c.lang)
	}
}

/** Text of the story's first text paragraph whose style has a `tocLevel` (embeds dropped). */
export function sectionTitle(story: Story, styles: Record<string, StyleDef>): string {
	for (const p of story.paragraphs) {
		if (Array.isArray(p.runs) && resolveParagraphStyle(styles, p.style, p.overrides).tocLevel)
			return paragraphText(p).replaceAll('￼', '')
	}
	return ''
}

/** Glyph fields of a `glyphs` DL item for `text` shaped with one face (no fallback). */
export function textGlyphs(
	env: ItemizeEnv,
	font: FontRef,
	size: Fx,
	text: string,
	features: string[] = [],
	lang = ''
): {
	text: string
	glyphs: Uint16Array
	advances: Int32Array
	clusters: Uint32Array
	offsets?: Int32Array
} {
	const s = text ? env.shape(font, size, text, { features, lang }) : undefined
	const n = s?.glyphs.length ?? 0
	const advances = new Int32Array(n)
	const offsets = new Int32Array(2 * n)
	let any = false
	for (let i = 0; s && i < n; i++) {
		advances[i] = unitsToFx(s.advances[i], size, font.upem)
		// HarfBuzz offsets are y-up; the display list is y-down.
		offsets[2 * i] = unitsToFx(s.offsets[2 * i], size, font.upem)
		offsets[2 * i + 1] = -unitsToFx(s.offsets[2 * i + 1], size, font.upem)
		if (offsets[2 * i] || offsets[2 * i + 1]) any = true
	}
	return {
		text,
		glyphs: s ? Uint16Array.from(s.glyphs) : new Uint16Array(0),
		advances,
		clusters: s ? Uint32Array.from(s.clusters) : new Uint32Array(0),
		...(any ? { offsets } : {})
	}
}

/**
 * Reshape every field run of `ip` as one sentinel glyph as wide as its text (page numbers in
 * tabular figures; `BOX` while unknown), on the run's own character face. Appends the fields to
 * `fields` (the flow's list; the sentinel indexes it).
 */
export function sizeFields(
	ip: ItemizedParagraph,
	ctx: FieldCtx,
	env: ItemizeEnv,
	fields: FieldEmbed[]
): void {
	ip.runs = ip.runs.map((r) => {
		const f = r.embed
		if (!f || !('field' in f)) return r
		const font = env.registry.resolveFace(r.char.font, r.char.weight, r.char.italic)
		const text = fieldText(f, ctx) ?? BOX
		const s = text
			? env.shape(font, r.size, text, {
					features: numeric(f) ? ['tnum'] : [],
					lang: ctx.lang
				})
			: undefined
		let w = 0
		for (const a of s?.advances ?? []) w += a
		fields.push(f)
		return {
			...r,
			font,
			shaped: {
				glyphs: Uint16Array.of(SENTINEL + fields.length - 1),
				clusters: Uint32Array.of(0),
				advances: Int32Array.of(w),
				offsets: new Int32Array(2),
				unsafeToBreak: new Uint8Array(1)
			}
		}
	})
}

/** Replace the sentinel glyph items of the flow's `fields` in `items` by the field text (start-aligned in the box). */
export function patchFields(
	items: DLItem[],
	fields: FieldEmbed[],
	ctx: FieldCtx,
	env: ItemizeEnv
): void {
	if (!fields.length) return
	for (let i = 0; i < items.length; i++) {
		const it = items[i]
		if (it.k !== 'glyphs' || it.text !== '￼' || it.glyphs.length !== 1) continue
		const f = fields[it.glyphs[0] - SENTINEL]
		if (!f) continue
		const { offsets: _o, ...rest } = it
		items[i] = {
			...rest,
			...textGlyphs(
				env,
				it.font,
				it.size,
				fieldText(f, ctx) ?? '',
				numeric(f) ? ['tnum'] : [],
				ctx.lang
			)
		}
	}
}
