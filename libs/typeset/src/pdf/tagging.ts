// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

// PDF/UA-1 tagging: the display list's `tags` → pdfkit's structure tree, marked content around
// every item. Tag ids are per page; one block split over pages (same `bid`) is one element.
//
// Roles: H1–H6, P and Figure as named; `Artifact` (master items, decorative images, untagged
// vector items) is marked `/Artifact` and gets no element; the DL's `Document` becomes a `Div`
// (the tree has one `Document` root). Any other role (L, LI, Lbl, LBody, Table, TR, TH, TD,
// Note, TOC, TOCI, …) is written under its own name, nested by `TagNode.children`; `TH` gets
// `/A << /O /Table /Scope /Column >>`. Links get a `Link` element holding the annotation,
// inside the element of the item under them.

import type { DLItem, PageDL, TagNode } from '../display-list.js'
import type { Box } from '../model.js'
import { type PdfDoc, type PdfStruct, pdfString, setAlt } from './glyph-ops.js'

/** XMP `pdfuaid` block, for PDF/A output (pdfkit's `subset` takes PDF/A or PDF/UA, not both). */
export const PDFUA_XMP = `
        <rdf:Description xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/" rdf:about="">
            <pdfuaid:part>1</pdfuaid:part>
        </rdf:Description>
        `

const TYPE: Record<string, string> = { Document: 'Div' }

interface Elem {
	el: PdfStruct
	type: string
	/** Reading order: section (first appearance), flow by tag id, then frames by (page, y, x). */
	sec: number
	id: number
	seq: number
	/** `TagNode.frame` where the element first appeared. */
	frame?: string
}

interface At {
	page: number
	y: number
	x: number
}

/** Unrotated bounds of a painted item (glyphs: advance width × font size above the baseline). */
function itemBox(q: DLItem): Box | undefined {
	if (q.k === 'glyphs') {
		let w = 0
		for (const a of q.advances) w += a
		return { x: q.x, y: q.y - q.size, w, h: q.size }
	}
	return 'box' in q ? q.box : undefined
}

type LinkItem = Extract<DLItem, { k: 'link' }>
type LinkFn = (x: number, y: number, w: number, h: number, url: string) => PdfDoc

export class Tagger {
	/** Elements by `bid` (or page + tag id when there is none). */
	private readonly elems = new Map<string, Elem>()
	/** Top-level elements, sorted into reading order by `end()`. */
	private readonly top: Elem[] = []
	/** This page's tag ids → element; absent = Artifact. */
	private readonly byId = new Map<number, Elem>()
	private readonly secs = new Map<string, number>()
	/** Top-left of each frame on the first page it has items on. */
	private readonly frames = new Map<string, At>()
	private sec = 0
	private seq = 0

	constructor(private readonly doc: PdfDoc) {}

	/** Index the tags of page `p` (the current pdfkit page). */
	page(p: PageDL, index: number): void {
		this.byId.clear()
		if (!this.secs.has(p.page.sec)) this.secs.set(p.page.sec, this.secs.size)
		this.sec = this.secs.get(p.page.sec) ?? 0
		const frameOf = new Map<number, string>()
		// Nested tags inherit their frame.
		const walk = (ts: TagNode[], parent?: Elem, frame?: string) => {
			for (const t of ts) {
				const f = t.frame ?? frame
				if (f) frameOf.set(t.id, f)
				if (t.role === 'Artifact') continue
				const key = t.bid ? `b:${t.bid}` : `p:${index}:${t.id}`
				let e = this.elems.get(key)
				if (!e) {
					const type = TYPE[t.role] ?? t.role
					const el = this.doc.struct(type, t.lang ? { lang: t.lang } : {})
					if (type === 'Figure') {
						if (!t.alt) console.warn(`PDF: figure without alt text (page ${index + 1})`)
						setAlt(el, t.alt ?? '')
					}
					// PDF/UA: a header cell names what it heads (rows are header rows only).
					if (type === 'TH')
						(
							el as unknown as { dictionary: { data: Record<string, unknown> } }
						).dictionary.data.A = { O: 'Table', Scope: 'Column' }
					// PDF/UA: every Note carries a unique ID (one per page part of a body).
					if (type === 'Note')
						(
							el as unknown as { dictionary: { data: Record<string, unknown> } }
						).dictionary.data.ID = pdfString(`note-${index + 1}-${t.id}`)
					e = { el, type, sec: this.sec, id: t.id, seq: this.seq++, frame: f }
					this.elems.set(key, e)
					if (parent) parent.el.add(el)
					else this.top.push(e)
				}
				this.byId.set(t.id, e)
				if (t.children) walk(t.children, e, f)
			}
		}
		walk(p.tags)

		const seen = new Map<string, At>()
		for (const q of p.items) {
			const f = 'tag' in q && q.tag !== undefined ? frameOf.get(q.tag) : undefined
			const r = f && !this.frames.has(f) ? itemBox(q) : undefined
			if (!f || !r) continue
			const at = seen.get(f)
			if (!at) seen.set(f, { page: index, y: r.y, x: r.x })
			else {
				at.y = Math.min(at.y, r.y)
				at.x = Math.min(at.x, r.x)
			}
		}
		for (const [f, at] of seen) this.frames.set(f, at)
	}

	/** Open the marked content of a painted item; `doc.endMarkedContent()` after its `q … Q`. */
	open(it: DLItem): void {
		const e = 'tag' in it && it.tag !== undefined ? this.byId.get(it.tag) : undefined
		if (e) e.el.add(this.doc.markStructureContent(e.type))
		else this.doc.markContent('Artifact')
	}

	/**
	 * A link annotation: `write` gets a `link` to call instead of `doc.link` (if it writes one at
	 * all), which attaches it to a new `Link` element with `/Contents`. The element goes into the
	 * element of the first tagged item under the link, else into a `Div` of its own. It is ended
	 * and parented here, while its page is current: pdfkit flushes the annotation's `/Pg` from it.
	 */
	link(p: PageDL, it: LinkItem, write: (link: LinkFn) => void): void {
		let el: PdfStruct | undefined
		write((x, y, w, h, url) => {
			el = this.doc.struct('Link')
			return this.doc.link(x, y, w, h, url, { structParent: el, Contents: pdfString(url) })
		})
		if (!el) return
		el.end()
		const parent = this.under(p, it.box)
		if (parent) {
			parent.el.add(el)
			return
		}
		const div = this.doc.struct('Div')
		div.add(el)
		this.top.push({
			el: div,
			type: 'Div',
			sec: this.sec,
			id: Number.MAX_SAFE_INTEGER,
			seq: this.seq++
		})
	}

	/** Element of the first tagged item on `p` that overlaps `b` (unrotated geometry). */
	private under(p: PageDL, b: Box): Elem | undefined {
		for (const q of p.items) {
			if (!('tag' in q) || q.tag === undefined) continue
			const e = this.byId.get(q.tag)
			if (!e) continue
			const r = itemBox(q)
			if (r && r.x < b.x + b.w && b.x < r.x + r.w && r.y < b.y + b.h && b.y < r.y + r.h)
				return e
		}
	}

	/**
	 * Build the `Document` root in reading order and attach it; before `doc.end()`. Per section:
	 * the flow by tag id (story order), then page-anchored frames by (page, y, x) of their
	 * top-left, then links that sit on no tagged item.
	 */
	end(): void {
		const none: At = { page: Infinity, y: 0, x: 0 }
		const rank = (e: Elem) => (e.frame ? 1 : e.id === Number.MAX_SAFE_INTEGER ? 2 : 0)
		const at = (e: Elem) => (e.frame && this.frames.get(e.frame)) || none
		const root = this.doc.struct('Document')
		const order = [...this.top].sort((a, b) => {
			const fa = at(a)
			const fb = at(b)
			return (
				a.sec - b.sec ||
				rank(a) - rank(b) ||
				fa.page - fb.page ||
				fa.y - fb.y ||
				fa.x - fb.x ||
				a.id - b.id ||
				a.seq - b.seq
			)
		})
		for (const e of order) root.add(e.el)
		root.end()
		this.doc.addStructure(root)
	}
}

// vim: ts=4
