// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Page point → text position, from the worker's `LineGeom` only (no layout on main), and the
 * frame hit order (one Auto model, no tool modes).
 */

import { type GeomIndex, nearestCaret, type PlacedLine } from './caret'
import type { StoredTextFrameData, YPagilloDocument } from '../crdt/stored-types'
import { containsPoint, flowBoxes, type PageInfo, type PageItem, pageItems } from './frames'

export interface TextHit {
	story: string
	offset: number
}

/** A click target for text, Fx: a text area (lines inside it) or a text box (`story`). */
export interface TextArea {
	x: number
	y: number
	w: number
	h: number
	story?: string
}

/** Text areas of a page (`flowBoxes`) then its text boxes, so a text box wins a tie. */
export function textAreas(doc: YPagilloDocument, page: PageInfo): TextArea[] {
	const out: TextArea[] = [...flowBoxes(doc, page)]
	// A text box's rotation is ignored here (axis-aligned rect); rotate the point if needed.
	for (const it of pageItems(doc, page))
		if (it.frame?.t === 'txt')
			out.push({
				x: it.x,
				y: it.y,
				w: it.w,
				h: it.h,
				story: (it.frame.data as StoredTextFrameData).story
			})
	return out
}

/** The area containing the point, else the nearest one within `slop` (Fx). */
export function nearArea(
	areas: TextArea[],
	x: number,
	y: number,
	slop: number
): TextArea | undefined {
	let area: TextArea | undefined
	let ad = slop
	for (const a of areas) {
		const d = Math.hypot(
			Math.max(0, a.x - x, x - a.x - a.w),
			Math.max(0, a.y - y, y - a.y - a.h)
		)
		if (d <= ad) {
			ad = d
			area = a
		}
	}
	return area
}

/**
 * Text position at page point (`x`, `y` Fx) on global page `page`: the nearest line in the
 * clicked column (by y alone inside it), x clamped within that line. With `story` (drag
 * extend) only that story counts; a page without its lines clamps to the nearest story edge.
 * With `areas` (a click) the point must be in or within `slop` of one, only its lines
 * count, and below its last line (the story's last) the caret goes to the story end.
 */
export function hitText(
	index: GeomIndex,
	page: number,
	x: number,
	y: number,
	story?: string,
	areas?: TextArea[],
	slop = 0
): TextHit | undefined {
	let lines = index.pages.get(page) ?? []
	if (story) lines = lines.filter((l) => l.line.story === story)
	else if (areas) {
		const a = nearArea(areas, x, y, slop)
		if (!a) return
		const boxed = new Set(areas.map((b) => b.story))
		lines = lines.filter(({ line: l }) =>
			a.story
				? l.story === a.story
				: !boxed.has(l.story) &&
					l.x >= a.x &&
					l.x <= a.x + a.w &&
					l.y >= a.y &&
					l.y <= a.y + a.h
		)
		if (!lines.length) return
		const last = lines.reduce((m, l) => (l.line.y > m.line.y ? l : m))
		const end = index.stories.get(last.line.story)?.at(-1)?.to
		if (y > last.line.y + last.line.descent && last.to === end)
			return { story: last.line.story, offset: end }
	}
	if (!lines.length) {
		const all = story ? index.stories.get(story) : undefined
		if (!story || !all?.length) return
		const before = all.filter((l) => l.page < page)
		return before.length
			? { story, offset: before[before.length - 1].to }
			: { story, offset: all[0].from }
	}
	const right = (l: PlacedLine['line']) => l.carets[l.carets.length - 1]
	let best: PlacedLine = lines[0]
	let bd = Number.POSITIVE_INFINITY
	for (const pl of lines) {
		const l = pl.line
		// Column extent: lines of this story overlapping this one horizontally.
		// O(n²) per click over one page's lines; index columns if pages get huge.
		let cl = l.x
		let cr = right(l)
		for (const o of lines) {
			const ol = o.line
			if (ol.story !== l.story || ol.x > right(l) || right(ol) < l.x) continue
			cl = Math.min(cl, ol.x)
			cr = Math.max(cr, right(ol))
		}
		const dx = Math.max(0, cl - x, x - cr)
		const dy = Math.max(0, l.y - l.ascent - y, y - l.y - l.descent)
		const d = dx * dx + dy * dy
		if (d < bd) {
			bd = d
			best = pl
		}
	}
	return { story: best.line.story, offset: nearestCaret(best, x) }
}

/** `frame` = select it; `text` = a text box's own text (place a caret); undefined = text below. */
export type FrameHit = { kind: 'frame'; id: string } | { kind: 'text' } | undefined

export interface FrameHitOptions {
	/** Ctrl/Cmd held: any frame under the pointer, also under the text and text boxes. */
	mod: boolean
	/** Alt held: cycle the stack under the pointer, starting after `current`. */
	alt: boolean
	current?: string
	/** Edit layout: every item (text areas, master items) is selectable by a plain click. */
	layout: boolean
}

/**
 * Hit order over `pageItems` (paint order): frames above the text (`z ≥ 0`) win over it,
 * except a text box's own text; a click on an image's wrap margin is outside its box (text).
 */
export function hitFrame(items: PageItem[], x: number, y: number, o: FrameHitOptions): FrameHit {
	const stack = items.filter((it) => containsPoint(it, x, y)).reverse()
	if (!stack.length) return
	if (o.alt) {
		const i = o.current ? stack.findIndex((it) => it.id === o.current) : -1
		return { kind: 'frame', id: stack[(i + 1) % stack.length].id }
	}
	if (o.mod || o.layout) return { kind: 'frame', id: stack[0].id }
	const top = stack.find((it) => it.z >= 0)
	if (!top) return
	return top.frame?.t === 'txt' ? { kind: 'text' } : { kind: 'frame', id: top.id }
}

// vim: ts=4
