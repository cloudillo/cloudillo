// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Spell checking in the layout worker: Hunspell (WASM, `hunspell-wasm`) with the en/hu/de
 * dictionaries copied beside this bundle (`spell/<lang>.aff|.dic`), each fetched the first time a
 * paragraph of that language is checked. A paragraph is re-checked when the adapter hands the
 * engine a new `Paragraph` object for it; misspellings go out as `spell { story, bid, ranges }`,
 * offsets paragraph-relative like `LineGeom.from/to`.
 */

import {
	type Paragraph,
	resolveParagraphStyle,
	type StyleDef,
	type Story
} from '@cloudillo/typeset'
import { createHunspellFromStrings, type Hunspell } from 'hunspell-wasm'

import type { SpellRange, WorkerToMain } from './protocol'

export interface SpellSource {
	stories: ReadonlyMap<string, Story>
	styles: Record<string, StyleDef>
	/** Publication language (`m.lang`): paragraphs without a style `lang`. */
	lang: string
	/** `m.spellIgnore`. */
	ignore: string[]
}

/** Bundled dictionaries (primary language subtag). */
const DICTS = ['en', 'hu', 'de']
/** Longer words get no suggestions (Hunspell suggest is superlinear). */
const MAX_SUGGEST = 64

let on = false
/** The user's own words (IndexedDB `pagillo-spell`, sent by main). */
let words = new Set<string>()
const dicts = new Map<string, Promise<Hunspell | undefined>>()
/** Story → bid → the `Paragraph` last checked. */
const seen = new Map<string, Map<string, Paragraph>>()
/** `story\nbid` of paragraphs main currently shows ranges for. */
const flagged = new Set<string>()
let ignored = ''
let busy = false
let again = false
/** Bumped whenever `seen` is cleared: a pass started before must not write it back. */
let gen = 0
const seg = new Intl.Segmenter(undefined, { granularity: 'word' })

function dict(lang: string): Promise<Hunspell | undefined> {
	const base = lang.toLowerCase().split(/[-_]/)[0]
	if (!DICTS.includes(base)) return Promise.resolve(undefined)
	let d = dicts.get(base)
	if (!d) {
		const get = async (ext: string) => {
			const res = await fetch(new URL(`spell/${base}.${ext}`, import.meta.url))
			if (!res.ok) throw new Error(`spell/${base}.${ext}: HTTP ${res.status}`)
			return res.text()
		}
		d = (async () => {
			const [aff, dic] = await Promise.all([get('aff'), get('dic')])
			const h = await createHunspellFromStrings(aff, dic)
			for (const w of words) h.addWord(w)
			return h
		})().catch((err) => {
			// No dictionary = no squiggles for that language; not an engine failure. Forgotten, so
			// the next pass retries (paragraphs checked meanwhile wait for their next edit).
			console.warn('pagillo spell:', err)
			if (dicts.get(base) === d) dicts.delete(base)
			return undefined
		})
		dicts.set(base, d)
	}
	return d
}

/** Text paragraphs, a table's cell paragraphs included (they carry their own `LineGeom` bids). */
export function* leaves(ps: Paragraph[]): Generator<Paragraph> {
	for (const p of ps) {
		const b = p.runs
		if (Array.isArray(b)) yield p
		else if (b.k === 'table')
			for (const r of b.rows) for (const c of r.cells) yield* leaves(c.paragraphs)
	}
}

export function check(h: Hunspell, text: string, lang: string, ignore: Set<string>): SpellRange[] {
	const out: SpellRange[] = []
	for (const s of seg.segment(text)) {
		const w = s.segment
		if (!s.isWordLike || /\d/.test(w) || ignore.has(w) || words.has(w)) continue
		if (!h.testSpelling(w)) out.push({ from: s.index, to: s.index + w.length, lang, word: w })
	}
	return out
}

async function pass(src: SpellSource, post: (m: WorkerToMain) => void): Promise<void> {
	let t0 = performance.now()
	const ign = src.ignore.join('\n')
	if (ign !== ignored) {
		ignored = ign
		seen.clear()
		gen++
	}
	const g = gen
	const ignore = new Set(src.ignore)
	/** Bids this pass saw, per story: flagged paragraphs gone since get their squiggles cleared. */
	const live = new Map<string, Map<string, Paragraph>>()
	for (const [story, st] of src.stories) {
		const prev = seen.get(story) ?? new Map<string, Paragraph>()
		const next = new Map<string, Paragraph>()
		for (const p of leaves(st.paragraphs)) {
			next.set(p.bid, p)
			if (prev.get(p.bid) === p) continue
			const lang = resolveParagraphStyle(src.styles, p.style, p.overrides).lang || src.lang
			const h = await dict(lang)
			if (!on) return
			// Yield now and then: a first pass over a book would block the worker's layout.
			if (performance.now() - t0 > 8) {
				await new Promise((r) => setTimeout(r, 0))
				if (!on) return
				t0 = performance.now()
			}
			const text = (p.runs as { text: string }[]).map((r) => r.text).join('')
			const ranges = h ? check(h, text, lang, ignore) : []
			const key = `${story}\n${p.bid}`
			if (!ranges.length && !flagged.has(key)) continue
			if (ranges.length) flagged.add(key)
			else flagged.delete(key)
			post({ type: 'spell', story, bid: p.bid, ranges })
		}
		live.set(story, next)
		if (g === gen) seen.set(story, next)
	}
	for (const key of [...flagged]) {
		const i = key.indexOf('\n')
		const story = key.slice(0, i)
		const bid = key.slice(i + 1)
		if (live.get(story)?.has(bid)) continue
		flagged.delete(key)
		post({ type: 'spell', story, bid, ranges: [] })
	}
}

/** Check the paragraphs that changed since the last call (after each layout pass). */
export function spellCheck(src: () => SpellSource | undefined, post: (m: WorkerToMain) => void) {
	if (!on) return
	if (busy) {
		again = true
		return
	}
	const s = src()
	if (!s) return
	busy = true
	void pass(s, post).finally(() => {
		busy = false
		if (again) {
			again = false
			spellCheck(src, post)
		}
	})
}

/** On/off (View › Check spelling) and the user's word list; either re-checks everything. */
export function spellConfig(o: boolean | undefined, w: string[] | undefined): void {
	if (o !== undefined) on = o
	if (w) {
		words = new Set(w)
		for (const d of dicts.values())
			void d.then((h) => {
				for (const x of w) h?.addWord(x)
			})
	}
	seen.clear()
	gen++
	if (busy) again = true
}

/** Never rejects: main awaits the reply. */
export async function spellSuggest(word: string, lang: string): Promise<string[]> {
	if (word.length > MAX_SUGGEST) return []
	const h = await dict(lang)
	try {
		return h ? h.getSpellingSuggestions(word).slice(0, 6) : []
	} catch (err) {
		console.warn('pagillo spell:', err)
		return []
	}
}

// vim: ts=4
