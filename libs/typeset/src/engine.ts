// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { PageDL } from './display-list.js'
import { layoutPublication, type PublicationLayout } from './layout/paginate.js'
import type {
	Frame,
	Master,
	Paragraph,
	Publication,
	Section,
	StyleDef,
	Story,
	TextFrameData
} from './model.js'
import type { ItemizeEnv } from './text/itemize.js'

/** One paragraph-level edit of a section's story or a text frame's story. */
export interface ParagraphPatch {
	/** Story id: a section's `story.id` or a text frame's `data.story.id`. */
	story: string
	/** The paragraph edited; for `insert`, the new paragraph's bid. */
	bid: string
	op: 'set' | 'insert' | 'delete' | 'move'
	/** `set`: the replacement (same bid); `insert`: the new paragraph. */
	paragraph?: Paragraph
	/** `insert`/`move`: the bid to place it after; absent = at the start of the story. */
	after?: string
}

export interface EngineLayout {
	/** Revision of this layout pass; every page in `changed` carries it as `rev`. */
	rev: number
	/**
	 * Pages that are new or differ from the previous pass, pages inside the viewport first, then
	 * the rest in publication order. A page that is gone is not listed: drop every `(sec, index)`
	 * with `index >= sections[sec].pages`, or whose section is gone.
	 */
	changed: PageDL[]
	pageCount: number
	sections: PublicationLayout['sections']
	overset: PublicationLayout['overset']
	/**
	 * The pass stopped at `limit`: pages from there on, `sections`' counts past it, `pageCount`
	 * and `overset` are the previous pass's. A later `layout()` without `limit` completes it.
	 */
	partial?: boolean
}

const keyOf = (pg: PageDL) => `${pg.page.sec}\u0000${pg.page.index}`

/** Structural equality of two pages, `rev` ignored: typed arrays element-wise, absent = undefined. */
const samePage = (a: PageDL, b: PageDL): boolean => same({ ...a, rev: 0 }, { ...b, rev: 0 })

function same(a: unknown, b: unknown): boolean {
	if (a === b) return true
	if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
	if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
		if (!ArrayBuffer.isView(a) || !ArrayBuffer.isView(b)) return false
		const x = a as unknown as ArrayLike<number>
		const y = b as unknown as ArrayLike<number>
		if (x.length !== y.length) return false
		for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false
		return true
	}
	if (Array.isArray(a) !== Array.isArray(b)) return false
	if (Array.isArray(a) && a.length !== (b as unknown[]).length) return false
	const x = a as Record<string, unknown>
	const y = b as Record<string, unknown>
	for (const k in x) if (!same(x[k], y[k])) return false
	for (const k in y) if (!Object.hasOwn(x, k) && y[k] !== undefined) return false
	return true
}

/**
 * Stateful layout of one publication: setters and paragraph patches mark it dirty, `layout()`
 * returns the pages that changed since the previous call. Inputs are never mutated (patches
 * copy on write), and are treated as immutable once handed over.
 * Synchronous like `layoutPublication`: load the faces of every new or patched paragraph
 * (`loadParagraphFaces`) before `layout()`.
 */
// Every dirty `layout()` re-runs `layoutPublication` and diffs pages by (sec, index) and
// `samePage`; the work per paragraph is memoized by identity (itemize in `paginate.ts`, `prepare` /
// `layoutParagraphAt` in `paragraph.ts`, shaping in `createShapeCache`), but every page is still
// re-emitted and compared. An editor bounds that with `limit` and defers the rest (the tail) to a
// full pass on idle. Upgrade if the full pass still shows: a page start-state cutoff in `fill.ts`.
export class Engine {
	private pub?: Publication
	private rev = 0
	private dirty = true
	private pages = new Map<string, PageDL>()
	/** `pages` in publication order. */
	private order: PageDL[] = []
	private last?: Omit<EngineLayout, 'changed'>

	constructor(private env: ItemizeEnv) {}

	setPublication(pub: Publication): void {
		this.pub = pub
		this.dirty = true
	}

	setStyles(styles: Record<string, StyleDef>): void {
		this.update({ styles })
	}

	setMasters(masters: Record<string, Master>): void {
		this.update({ masters })
	}

	setFrames(frames: Record<string, Frame>): void {
		this.update({ frames })
	}

	setSections(sections: Section[]): void {
		this.update({ sections })
	}

	/** Apply patches in order. Throws on an unknown story, bid or `after`. */
	patch(patches: ParagraphPatch[]): void {
		for (const p of patches) this.applyPatch(p)
		this.dirty = true
	}

	/**
	 * Lay out if dirty. `viewport` = global page indices `[from, to)` to list first.
	 * `limit`: lay out only the first `limit` pages (`partial` when there are more); the engine
	 * stays dirty until a pass without `limit`.
	 */
	layout(viewport?: [number, number], opts?: { limit?: number }): EngineLayout {
		if (!this.dirty && this.last) return { ...this.last, changed: [] }
		const pub = this.current()
		const r = layoutPublication(
			pub,
			this.env,
			opts?.limit === undefined
				? undefined
				: { stopAt: opts.limit, pageTotal: this.last?.pageCount }
		)
		const rev = ++this.rev
		const [from, to] = viewport ?? [0, 0]
		const next = new Map<string, PageDL>()
		const inView: PageDL[] = []
		const rest: PageDL[] = []
		for (let g = 0; g < r.pages.length; g++) {
			const pg = r.pages[g]
			const k = keyOf(pg)
			const old = this.pages.get(k)
			if (old && samePage(old, pg)) {
				next.set(k, old)
				r.pages[g] = old
				continue
			}
			pg.rev = rev
			next.set(k, pg)
			;(g >= from && g < to ? inView : rest).push(pg)
		}
		const changed = [...inView, ...rest]
		if (!r.partial || !this.last) {
			this.pages = next
			this.order = r.pages
			this.dirty = !!r.partial
			this.last = { rev, pageCount: r.pages.length, sections: r.sections, overset: r.overset }
			return { ...this.last, changed, ...(r.partial ? { partial: true } : {}) }
		}
		// Partial: the previous pages past the stop point, by key — the stop section's from its
		// fresh count on, every later section's — so no (sec, index) is listed twice or skipped.
		const secIdx = new Map(pub.sections.map((s, i): [string, number] => [s.id, i]))
		const stop = r.sections.length - 1
		const fresh = r.sections[stop]?.pages ?? 0
		const tail = this.order
			.filter((pg) => {
				const i = secIdx.get(pg.page.sec) ?? -1
				return i > stop || (i === stop && pg.page.index >= fresh)
			})
			.sort(
				(a, b) =>
					(secIdx.get(a.page.sec) ?? 0) - (secIdx.get(b.page.sec) ?? 0) ||
					a.page.index - b.page.index
			)
		for (const pg of tail) next.set(keyOf(pg), pg)
		const merged = [...r.pages, ...tail]
		const counts = new Map<string, number>()
		for (const pg of merged) counts.set(pg.page.sec, (counts.get(pg.page.sec) ?? 0) + 1)
		this.pages = next
		this.order = merged
		this.last = {
			rev,
			pageCount: merged.length,
			sections: pub.sections.map((s) => ({ id: s.id, pages: counts.get(s.id) ?? 0 })),
			overset: this.last.overset
		}
		return { ...this.last, changed, partial: true }
	}

	private current(): Publication {
		if (!this.pub) throw new Error('Engine: setPublication() first')
		return this.pub
	}

	private update(part: Partial<Publication>): void {
		this.pub = { ...this.current(), ...part }
		this.dirty = true
	}

	private applyPatch(p: ParagraphPatch): void {
		const edit = (story: Story): Story => {
			const ps = [...story.paragraphs]
			const at = (bid: string) => {
				const i = ps.findIndex((q) => q.bid === bid)
				if (i < 0) throw new Error(`Engine.patch: no paragraph '${bid}' in '${p.story}'`)
				return i
			}
			const given = () => {
				if (!p.paragraph) throw new Error(`Engine.patch: '${p.op}' needs a paragraph`)
				return p.paragraph
			}
			const put = (q: Paragraph) => {
				ps.splice(p.after === undefined ? 0 : at(p.after) + 1, 0, q)
			}
			if (p.op === 'insert') put(given())
			else {
				const i = at(p.bid)
				if (p.op === 'set') ps[i] = given()
				else {
					const [q] = ps.splice(i, 1)
					if (p.op === 'move') put(q)
				}
			}
			return { ...story, paragraphs: ps }
		}

		const pub = this.current()
		const si = pub.sections.findIndex((s) => s.story.id === p.story)
		if (si >= 0) {
			const sections = [...pub.sections]
			sections[si] = { ...sections[si], story: edit(sections[si].story) }
			this.pub = { ...pub, sections }
			return
		}
		const frames = { ...pub.frames }
		let found = false
		for (const f of Object.values(pub.frames)) {
			const data = f.data as TextFrameData
			if (f.t !== 'txt' || data.story.id !== p.story) continue
			frames[f.id] = { ...f, data: { ...data, story: edit(data.story) } }
			found = true
		}
		if (!found) throw new Error(`Engine.patch: unknown story '${p.story}'`)
		this.pub = { ...pub, frames }
	}
}
