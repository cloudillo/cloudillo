// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Mirror Y.Doc → `Engine` inputs. Worker-only (worker-safe crdt imports only).
 * Layout-relevant `m` keys rebuild the whole publication; `st`/`ms` changes replace styles/masters;
 * structural changes (`secs`, `s`, `f`, `tx` keys, and `ms` for the mirrored item frames)
 * re-send sections + frames; a changed story text becomes `ParagraphPatch[]` diffed by bid.
 */

import * as Y from 'yjs'
import type {
	Engine,
	Master,
	Paragraph,
	ParagraphPatch,
	Run,
	Section,
	Story,
	StyleDef,
	TextFrameData
} from '@cloudillo/typeset'

import { openPublication } from '../crdt/document'
import { mastersOf, sectionOf, stylesOf } from '../crdt/entities'
import type { YPagilloDocument } from '../crdt/stored-types'
import {
	type DeltaOp,
	deltaToParagraphs,
	framesToEngine,
	isRtlLang,
	masterItemIndex,
	masterToEngine,
	readMeta,
	sectionToEngine,
	toEnginePublication
} from '../crdt/type-converters'
import type { Composition } from './protocol'

/**
 * `m` keys that feed `Publication`, besides the `styleMap/*` entries (the rest — engine, fonts,
 * pdf, … — do not affect layout).
 */
const LAYOUT_META = new Set(['lang', 'facing', 'title', 'exportedAt'])

const json = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Shallow equality of two marks objects (all values are primitives). */
function sameMarks(a: Run['marks'], b: Run['marks']): boolean {
	const x = a as Record<string, unknown>
	const y = b as Record<string, unknown>
	const ka = Object.keys(x)
	if (ka.length !== Object.keys(y).length) return false
	return ka.every((k) => x[k] === y[k])
}

/** Content equality of two `deltaToParagraphs` paragraphs; text runs without serializing them. */
export function sameParagraph(a: Paragraph, b: Paragraph): boolean {
	if (a.bid !== b.bid || a.style !== b.style || a.placeholder !== b.placeholder) return false
	if (!json(a.overrides, b.overrides)) return false
	const x = a.runs
	const y = b.runs
	if (!Array.isArray(x) || !Array.isArray(y)) return json(x, y)
	if (x.length !== y.length) return false
	for (let i = 0; i < x.length; i++) {
		const r = x[i]
		const s = y[i]
		if (r.text !== s.text || !sameMarks(r.marks, s.marks) || !json(r.embed, s.embed))
			return false
	}
	return true
}

/**
 * `ops` with `text` inserted underlined at Y.Text `offset`, carrying the marks of the character
 * before it (line attrs on a `'\n'` are dropped by `deltaToParagraphs`' mark filter).
 */
export function spliceComposition(ops: DeltaOp[], offset: number, text: string): DeltaOp[] {
	const comp = (attrs?: Record<string, unknown>): DeltaOp => ({
		insert: text.replace(/\n/g, ' '),
		attributes: { ...attrs, underline: true }
	})
	if (offset <= 0) return [comp(), ...ops]
	const out: DeltaOp[] = []
	let pos = 0
	let done = false
	for (const op of ops) {
		const s = typeof op.insert === 'string' ? op.insert : undefined
		const len = s?.length ?? 1
		if (!done && offset <= pos + len) {
			done = true
			const k = offset - pos
			if (s !== undefined) {
				out.push({ ...op, insert: s.slice(0, k) }, comp(op.attributes))
				if (k < len) out.push({ ...op, insert: s.slice(k) })
			} else out.push(op, comp(op.attributes))
		} else out.push(op)
		pos += len
	}
	if (!done) out.push(comp())
	return out
}

export class PublicationAdapter {
	readonly doc: YPagilloDocument
	styles: Record<string, StyleDef> = {}
	/** Stories referenced by sections / text frames, exactly as the engine holds them. */
	private stories = new Map<string, Story>()
	private defaultStyle = ''
	private composing?: Composition
	/** Paragraphs handed to the engine since the last `drainFresh()`. */
	private fresh: Paragraph[] = []
	/** Section story id → its `{ fn }` ref ids, joined (to spot a ref added / removed). */
	private notes = new Map<string, string>()
	/** Story ids of sections and text frames: a `{ fn }` naming one is not a footnote. */
	private owned = new Set<string>()
	/** Footnote story ids loaded by the last `footnotes()`. */
	private fnStories = new Set<string>()

	constructor(
		yDoc: Y.Doc,
		private engine: Engine
	) {
		this.doc = openPublication(yDoc)
		this.rebuild()
		yDoc.on('afterTransaction', (tr) => this.onTransaction(tr))
	}

	/** Paragraphs new to the engine since the last call (for `loadParagraphFaces`). */
	drainFresh(): Paragraph[] {
		const f = this.fresh
		this.fresh = []
		return f
	}

	/** Stories as the engine holds them (story id → story), for the spell checker. */
	storyMap(): ReadonlyMap<string, Story> {
		return this.stories
	}

	private all(): Paragraph[] {
		return [...this.stories.values()].flatMap((s) => s.paragraphs)
	}

	private rebuild(): void {
		const pub = toEnginePublication(this.doc)
		this.defaultStyle = readMeta(this.doc.m).styleMap.p ?? ''
		this.styles = pub.styles
		this.stories.clear()
		for (const s of pub.sections) this.stories.set(s.story.id, s.story)
		for (const f of Object.values(pub.frames)) {
			if (f.t === 'txt') {
				const st = (f.data as TextFrameData).story
				if (st) this.stories.set(st.id, st)
			}
		}
		this.owned = new Set(this.stories.keys())
		// Keep a live IME composition: `pub`'s stories are the cached ones, so patch in place.
		const c = this.composing
		const cs = c && this.stories.get(c.story)
		if (cs) cs.paragraphs = this.read(c.story)
		pub.footnotes = this.footnotes(pub.sections.map((s) => s.story.id))
		this.fresh = this.all()
		this.engine.setPublication(pub)
	}

	/** `{ fn }` ref ids in a story's top-level runs (refs in table cells are not numbered). */
	private fnIds(id: string): string {
		const ids: string[] = []
		for (const p of this.stories.get(id)?.paragraphs ?? [])
			if (Array.isArray(p.runs))
				for (const r of p.runs) if (r.embed && 'fn' in r.embed) ids.push(r.embed.fn)
		return ids.join(' ')
	}

	/** Footnote stories referenced by the section stories `ids` (loaded into `stories`). */
	private footnotes(ids: string[]): Record<string, Story> {
		this.notes = new Map(ids.map((id) => [id, this.fnIds(id)]))
		const fs: Record<string, Story> = {}
		for (const refs of this.notes.values())
			for (const f of refs.split(' '))
				if (f && !this.owned.has(f) && this.doc.tx.get(f) instanceof Y.Text)
					fs[f] = this.story(f)
		// Drop bodies no longer referenced (their text edits must not reach `patch`).
		for (const f of this.fnStories)
			if (!Object.hasOwn(fs, f) && !this.owned.has(f)) this.stories.delete(f)
		this.fnStories = new Set(Object.keys(fs))
		return fs
	}

	private story(id: string): Story {
		let st = this.stories.get(id)
		if (!st) {
			st = { id, paragraphs: this.read(id) }
			this.stories.set(id, st)
			this.fresh.push(...st.paragraphs)
		}
		return st
	}

	private read(id: string): Paragraph[] {
		const t = this.doc.tx.get(id)
		// A peer can put anything in `tx`; only a Y.Text is a story.
		let ops: DeltaOp[] = t instanceof Y.Text ? t.toDelta() : []
		const c = this.composing
		if (c?.story === id) ops = spliceComposition(ops, c.offset, c.text)
		return deltaToParagraphs(ops, this.defaultStyle)
	}

	/**
	 * Lay out an IME composition (local only) until cleared with `text: ''`. `read()` splices it
	 * in, so the regular bid diff patches the paragraph and later real edits keep it.
	 */
	compose(c: Composition): void {
		const prev = this.composing
		this.composing = c.text ? c : undefined
		const ids = new Set([prev?.story, c.story])
		this.patch(
			[...ids]
				.filter((id): id is string => !!id && this.stories.has(id))
				.flatMap((id) => this.diff(id))
		)
	}

	private onTransaction(tr: Y.Transaction): void {
		const d = this.doc
		// Y.Transaction.changed is keyed by AbstractType<YEvent<any>>, which typed Y.Map/Y.Text do not satisfy.
		const changed = tr.changed as Map<unknown, Set<string | null>>
		// Entities are nested `Y.Map`s: an edit inside one marks only its root's parent types.
		const deep = tr.changedParentTypes as Map<unknown, unknown>
		const mKeys = changed.get(d.m)
		if (
			mKeys &&
			[...mKeys].some((k) => k !== null && (LAYOUT_META.has(k) || k.startsWith('styleMap/')))
		) {
			this.rebuild()
			return
		}
		if (deep.has(d.st)) {
			this.styles = Object.fromEntries(stylesOf(d))
			this.engine.setStyles(this.styles)
			// New styles may name new faces for any paragraph.
			this.fresh = this.all()
		}
		// Master items are frames anchored to their master; `masterToEngine` uses only their ids,
		// so only a frame added / removed (`f` keys) or re-anchored changes the masters.
		const fKeys = changed.get(d.f)
		const anchorsMoved =
			!!fKeys?.size ||
			[...changed].some(
				([t, keys]) => t instanceof Y.Map && t.parent === d.f && keys.has('anchor')
			)
		if (deep.has(d.ms) || anchorsMoved) {
			const meta = readMeta(d.m)
			const opts = { facing: meta.facing, rtl: isRtlLang(meta.lang) }
			const index = masterItemIndex(d)
			const masters: Record<string, Master> = {}
			for (const [id, m] of mastersOf(d))
				masters[id] = masterToEngine(id, m, index.get(id), opts)
			this.engine.setMasters(masters)
		}

		const texts: string[] = []
		d.tx.forEach((t, id) => {
			if (changed.has(t)) texts.push(id)
		})
		// `ms` too: a side mode or items change re-derives the mirrored item frames.
		const structural =
			changed.has(d.secs) || changed.has(d.tx) || [d.s, d.f, d.ms].some((t) => deep.has(t))
		if (structural) {
			const old = this.stories
			this.stories = new Map()
			for (const [id, st] of old) if (!texts.includes(id)) this.stories.set(id, st)
			const sections: Section[] = []
			for (const id of d.secs.toArray()) {
				const s = sectionOf(d, id)
				if (s) sections.push(sectionToEngine(id, s, this.story(s.story)))
			}
			const used = new Set(sections.map((s) => s.story.id))
			const story = (sid: string) => {
				used.add(sid)
				return this.story(sid)
			}
			const frames = framesToEngine(d, story)
			this.owned = new Set(used)
			const fs = this.footnotes(sections.map((s) => s.story.id))
			for (const id of Object.keys(fs)) used.add(id)
			// Drop stories nothing references any more (their text edits must not reach `patch`).
			for (const id of [...this.stories.keys()]) if (!used.has(id)) this.stories.delete(id)
			this.engine.setSections(sections)
			this.engine.setFrames(frames)
			this.engine.setFootnotes(fs)
			return
		}

		this.patch(texts.filter((id) => this.stories.has(id)).flatMap((id) => this.diff(id)))
		// A section edit added or removed a footnote ref (paste, delete, undo of a delete).
		if (texts.some((id) => this.notes.has(id) && this.notes.get(id) !== this.fnIds(id)))
			this.engine.setFootnotes(this.footnotes([...this.notes.keys()]))
	}

	private patch(patches: ParagraphPatch[]): void {
		if (!patches.length) return
		try {
			this.engine.patch(patches)
		} catch (err) {
			// Cache and engine drifted (should not happen): resync from the mirror.
			console.warn('pagillo: patch failed, rebuilding', err)
			this.rebuild()
		}
	}

	/**
	 * Old → new paragraphs of one story as engine patches: deletes first, then walking the new
	 * order (`after` = previous new bid) insert / move / set. `~<index>` placeholder bids may
	 * pair unrelated paragraphs; the `set` content compare keeps the result correct regardless.
	 * An unchanged paragraph keeps its old object, so adapter and engine share identities (the
	 * engine's caches are keyed by them).
	 */
	private diff(id: string): ParagraphPatch[] {
		const old = this.stories.get(id)?.paragraphs ?? []
		const next = this.read(id)
		this.stories.set(id, { id, paragraphs: next })
		const keep = new Set(next.map((p) => p.bid))
		const out: ParagraphPatch[] = []
		const cur: Paragraph[] = []
		for (const p of old) {
			if (keep.has(p.bid)) cur.push(p)
			else out.push({ story: id, bid: p.bid, op: 'delete' })
		}
		next.forEach((p, i) => {
			const after = i ? next[i - 1].bid : undefined
			const j = cur[i]?.bid === p.bid ? i : cur.findIndex((q) => q.bid === p.bid)
			if (j < 0) {
				cur.splice(i, 0, p)
				out.push({ story: id, bid: p.bid, op: 'insert', paragraph: p, after })
				this.fresh.push(p)
				return
			}
			if (j !== i) {
				cur.splice(i, 0, cur.splice(j, 1)[0])
				out.push({ story: id, bid: p.bid, op: 'move', after })
			}
			if (sameParagraph(cur[i], p)) next[i] = cur[i]
			else {
				cur[i] = p
				out.push({ story: id, bid: p.bid, op: 'set', paragraph: p })
				this.fresh.push(p)
			}
		})
		return out
	}
}

// vim: ts=4
