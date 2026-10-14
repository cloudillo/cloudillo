// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Page point → text position, from the worker's `LineGeom` only (no layout on main), and the
 * frame hit order (one Auto model, no tool modes).
 */

import { rotatePointAroundCenter } from '@cloudillo/canvas-tools'
import type { LineGeom } from '@cloudillo/typeset'

import { type GeomIndex, nearestCaret, type PlacedLine, sameRow, xDist } from './caret'
import { chainOf } from '../crdt/frame-ops'
import type { StoredTextFrameData, YPagilloDocument } from '../crdt/stored-types'
import { textChains } from '../crdt/type-converters'
import {
	containsPoint,
	edgeDist,
	flowBoxes,
	type PageInfo,
	type PageItem,
	pageItems
} from './frames'

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
	/** A text box's rotation (degrees, about its centre). */
	rot?: number
}

/** Text areas of a page (`flowBoxes`) then its text boxes, so a text box wins a tie. */
export function textAreas(doc: YPagilloDocument, page: PageInfo): TextArea[] {
	const out: TextArea[] = [...flowBoxes(doc, page)]
	const chains = textChains(doc)
	for (const it of pageItems(doc, page)) {
		if (it.frame?.t !== 'txt') continue
		// A thread follower edits its head's story; an orphan follower has none and is skipped.
		const own = (it.frame.data as StoredTextFrameData).story
		const head = own ? undefined : chainOf(doc, it.id, chains)?.head
		const story =
			own ?? (head && (doc.f.get(head)?.data as StoredTextFrameData | undefined)?.story)
		if (story) out.push({ x: it.x, y: it.y, w: it.w, h: it.h, story, rot: it.rot })
	}
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
		const p = a.rot
			? rotatePointAroundCenter({ x, y }, { x: a.x + a.w / 2, y: a.y + a.h / 2 }, -a.rot)
			: { x, y }
		const d = Math.hypot(
			Math.max(0, a.x - p.x, p.x - a.x - a.w),
			Math.max(0, a.y - p.y, p.y - a.y - a.h)
		)
		if (d <= ad) {
			ad = d
			area = a
		}
	}
	return area
}

/** Page point → the unrotated space of line `l` (its frame's). */
const local = (l: LineGeom, x: number, y: number) =>
	l.rot ? rotatePointAroundCenter({ x, y }, { x: l.rot.cx, y: l.rot.cy }, -l.rot.deg) : { x, y }

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
		// Bottom row; on a tie within one row (a split row) the later segment, so its end can match.
		const last = lines.reduce((m, l) =>
			l.line.y > m.line.y || (sameRow(l, m) && l.to > m.to) ? l : m
		)
		const end = index.stories.get(last.line.story)?.at(-1)?.to
		if (local(last.line, x, y).y > last.line.y + last.line.descent && last.to === end)
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
	let bo = Number.POSITIVE_INFINITY
	for (const pl of lines) {
		const l = pl.line
		const p = local(l, x, y)
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
		const dx = Math.max(0, cl - p.x, p.x - cr)
		const dy = Math.max(0, l.y - l.ascent - p.y, p.y - l.y - l.descent)
		const d = dx * dx + dy * dy
		// Lines of a split row share the column extent: the one nearest x itself wins a tie.
		const own = xDist(pl, p.x)
		if (d < bd || (d === bd && own < bo)) {
			bd = d
			bo = own
			best = pl
		}
	}
	return { story: best.line.story, offset: nearestCaret(best, local(best.line, x, y).x) }
}

/** `frame` = select it; `text` = text box `id`'s own text (place a caret); undefined = text below. */
export type FrameHit = { kind: 'frame' | 'text'; id: string } | undefined

export interface FrameHitOptions {
	/** Ctrl/Cmd held: any frame under the pointer, also under the text and text boxes. */
	mod: boolean
	/** Alt held: cycle the stack under the pointer, starting after `current`. */
	alt: boolean
	current?: string
	/** Edit layout: every item (text areas, master items) is selectable by a plain click. */
	layout: boolean
	/** Grab band around a text box's outline (Fx): there it is the box, not its text. */
	edge?: number
}

/**
 * Hit order over `pageItems` (paint order): frames above the text (`z ≥ 0`) win over it,
 * except a text box's own text away from its outline (`edge`); a click on an image's wrap
 * margin is outside its box (text).
 */
export function hitFrame(items: PageItem[], x: number, y: number, o: FrameHitOptions): FrameHit {
	// The band shrinks on tiny boxes, so their middle still takes a caret.
	const onEdge = (it: PageItem) =>
		!!o.edge &&
		it.frame?.t === 'txt' &&
		Math.abs(edgeDist(it, x, y)) <= Math.min(o.edge, Math.min(it.w, it.h) / 4)
	const stack = items.filter((it) => containsPoint(it, x, y) || onEdge(it)).reverse()
	if (!stack.length) return
	if (o.alt) {
		const i = o.current ? stack.findIndex((it) => it.id === o.current) : -1
		return { kind: 'frame', id: stack[(i + 1) % stack.length].id }
	}
	if (o.mod || o.layout) return { kind: 'frame', id: stack[0].id }
	const top = stack.find((it) => it.z >= 0)
	if (!top) return
	return { kind: top.frame?.t === 'txt' && !onEdge(top) ? 'text' : 'frame', id: top.id }
}

// vim: ts=4
