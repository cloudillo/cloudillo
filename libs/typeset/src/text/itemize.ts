// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import bidiFactory from 'bidi-js'
import type { FontRef } from '../display-list.js'
import type { Fx } from '../fixed.js'
import { type FetchBytes, loadFace } from '../fonts/loader.js'
import { type FontRegistry, needsCjkFallback } from '../fonts/registry.js'
import type { CharProps, InlineEmbed, Paragraph, Run, StyleDef } from '../model.js'
import type { ShapedRun, shapeRun } from '../shape/hb.js'
import { type ResolvedParagraphStyle, resolveCharStyle, resolveParagraphStyle } from './styles.js'

export interface ItemizeEnv {
	registry: FontRegistry
	/** `shapeRun` or a `createShapeCache()` instance. */
	shape: typeof shapeRun
}

/** One shaped run: a single face, size, feature set, language and bidi level. */
export interface ItemRun {
	/** UTF-16 range in the paragraph text. */
	from: number
	to: number
	font: FontRef
	size: Fx
	char: CharProps
	features: string[]
	lang: string
	/** Bidi embedding level (even = LTR). */
	level: number
	link?: string
	embed?: InlineEmbed
	/** Font units; clusters are relative to `from`. Shared with the shape cache: do not mutate. */
	shaped: ShapedRun
}

export interface ItemizedParagraph {
	text: string
	style: ResolvedParagraphStyle
	/** Face of the paragraph style itself (line metrics of an empty paragraph). */
	font: FontRef
	/** BCP 47 language used for shaping and hyphenation. */
	lang: string
	runs: ItemRun[]
	/** A table's cell paragraphs, `[row][cell][paragraph]` as in its `TableBlock`. */
	cells?: ItemizedParagraph[][][]
}

let bidi: ReturnType<typeof bidiFactory> | undefined

function textRuns(p: Paragraph): Run[] {
	return Array.isArray(p.runs) ? p.runs : []
}

export function paragraphText(p: Paragraph): string {
	return textRuns(p)
		.map((r) => r.text)
		.join('')
}

/** Features implied by character props: letter-spaced text drops ligatures. */
function featuresFor(c: CharProps): string[] {
	return c.tracking ? ['liga=0', 'clig=0'] : []
}

/**
 * Load every face `itemizeParagraph` can touch for these paragraphs (style faces plus their
 * fallback faces), so itemizing and shaping can stay synchronous. Call after `initHarfBuzz()`.
 * Embed captions count as text. If any text has CJK, every `registry.cjkFaces()` loads, since
 * the same text may be itemized in another style (TOC entries).
 */
export async function loadParagraphFaces(
	paragraphs: Paragraph[],
	styles: Record<string, StyleDef>,
	registry: FontRegistry,
	fetchBytes: FetchBytes
): Promise<void> {
	const refs = new Map<string, FontRef>()
	let cjk = false
	const add = (c: CharProps) => {
		for (const ref of [
			registry.resolveFace(c.font, c.weight, c.italic),
			...registry.fallbackFaces(c.weight, c.italic, false)
		])
			refs.set(ref.file, ref)
	}
	const visit = (ps: Paragraph[]) => {
		for (const p of ps) {
			const st = resolveParagraphStyle(styles, p.style, p.overrides)
			const b = p.runs
			const text = !Array.isArray(b) && b.k === 'emb' ? (b.caption ?? '') : paragraphText(p)
			if (needsCjkFallback(text)) cjk = true
			add(st)
			for (const r of textRuns(p)) add(resolveCharStyle(styles, st, r.marks))
			if (!Array.isArray(b) && b.k === 'table') {
				for (const row of b.rows) for (const c of row.cells) visit(c.paragraphs)
			}
		}
	}
	visit(paragraphs)
	if (cjk) for (const ref of registry.cjkFaces()) refs.set(ref.file, ref)
	await Promise.all([...refs.values()].map((ref) => loadFace(ref, fetchBytes)))
}

/**
 * Paragraph → shaped runs, split at source runs, bidi level changes and missing glyphs (gid 0
 * falls back along `registry.fallbackFaces`). Faces must be loaded (`loadParagraphFaces`).
 * Table/embed blocks itemize to no runs; a table's cell paragraphs go in `cells`.
 */
export function itemizeParagraph(
	p: Paragraph,
	styles: Record<string, StyleDef>,
	env: ItemizeEnv,
	pubLang: string
): ItemizedParagraph {
	const style = resolveParagraphStyle(styles, p.style, p.overrides)
	const lang = style.lang || pubLang
	const text = paragraphText(p)
	const out: ItemizedParagraph = {
		text,
		style,
		font: env.registry.resolveFace(style.font, style.weight, style.italic),
		lang,
		runs: []
	}
	const b = p.runs
	if (!Array.isArray(b) && b.k === 'table') {
		// Cells skip list indents and field sizing (`itemizeStory`); add them when
		// tables hold lists or fields.
		out.cells = b.rows.map((r) =>
			r.cells.map((c) => c.paragraphs.map((q) => itemizeParagraph(q, styles, env, pubLang)))
		)
	}
	if (!text) return out

	bidi ??= bidiFactory()
	const { levels } = bidi.getEmbeddingLevels(text, 'ltr')
	const cjk = needsCjkFallback(text)

	let pos = 0
	// Source runs are never merged, so kerning across a colour/link change is lost;
	// merge same-face neighbours if that shows up in output.
	for (const run of textRuns(p)) {
		const end = pos + run.text.length
		const char = resolveCharStyle(styles, style, run.marks)
		const font = env.registry.resolveFace(char.font, char.weight, char.italic)
		const chain = env.registry
			.fallbackFaces(char.weight, char.italic, cjk)
			.filter((f) => f.file !== font.file)
		const features = featuresFor(char)
		for (let from = pos; from < end; ) {
			let to = from + 1
			while (to < end && levels[to] === levels[from]) to++
			const base = {
				size: char.size,
				char,
				features,
				lang,
				level: levels[from],
				link: run.marks.link,
				embed: run.embed
			}
			// A `{ frame }` anchor marker takes no width: no glyphs, only its offset.
			if (run.embed && 'frame' in run.embed) {
				out.runs.push({ ...base, from, to, font, shaped: noGlyphs })
			} else pushWithFallback(out.runs, text, from, to, font, chain, base, env)
			from = to
		}
		pos = end
	}
	return out
}

type RunBase = Omit<ItemRun, 'from' | 'to' | 'font' | 'shaped'>

/** A run with no glyphs (zero width). Shared: do not mutate. */
export const noGlyphs: ShapedRun = {
	glyphs: new Uint16Array(0),
	clusters: new Uint32Array(0),
	advances: new Int32Array(0),
	offsets: new Int32Array(0),
	unsafeToBreak: new Uint8Array(0)
}

function shapeSeg(
	env: ItemizeEnv,
	font: FontRef,
	text: string,
	from: number,
	to: number,
	b: RunBase
) {
	return env.shape(font, b.size, text.slice(from, to), {
		features: b.features,
		lang: b.lang,
		direction: b.level & 1 ? 'rtl' : 'ltr'
	})
}

/**
 * Shape `[from,to)` with `font`; reshape the character spans it has no glyph for on the next face
 * of `chain`, recursively. `chain`: remaining fallback faces after `font`.
 */
function pushWithFallback(
	out: ItemRun[],
	text: string,
	from: number,
	to: number,
	font: FontRef,
	chain: FontRef[],
	b: RunBase,
	env: ItemizeEnv
): void {
	const shaped = shapeSeg(env, font, text, from, to, b)
	// End of the chain → the last face's .notdef box is drawn.
	if (!shaped.glyphs.includes(0) || !chain.length) {
		out.push({ ...b, from, to, font, shaped })
		return
	}
	// Mark every character covered by a .notdef cluster.
	const len = to - from
	const starts = [...new Set(shaped.clusters)].sort((x, y) => x - y)
	const missing = new Uint8Array(len)
	for (let i = 0; i < shaped.glyphs.length; i++) {
		if (shaped.glyphs[i] !== 0) continue
		const c = shaped.clusters[i]
		const end = starts.find((s) => s > c) ?? len
		missing.fill(1, c, end)
	}
	for (let s = 0; s < len; ) {
		let e = s + 1
		while (e < len && missing[e] === missing[s]) e++
		if (missing[s]) {
			pushWithFallback(out, text, from + s, from + e, chain[0], chain.slice(1), b, env)
		} else {
			const seg = shapeSeg(env, font, text, from + s, from + e, b)
			out.push({ ...b, from: from + s, to: from + e, font, shaped: seg })
		}
		s = e
	}
}
