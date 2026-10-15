// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Basic story text edits. Call inside `yDoc.transact(…, yDoc.clientID)`; the bid normaliser
 * (`crdt/normalize.ts`) follows every transaction. Attributes are always passed explicitly
 * (Yjs would otherwise copy the left neighbour's, line attrs included); `null` = absent.
 */

import type * as Y from 'yjs'

import { newBlockId } from '../crdt/block-ids'
import { deltaOf, storyTextOf } from '../crdt/delta-cache'
import { embedImgAt } from '../crdt/frame-ops'
import { LINE_KEYS as LINE, MARK_KEYS as MARKS } from '../crdt/stored-types'
import { cellOf, isTableLine } from '../crdt/type-converters'

const pick = (src: Record<string, unknown> | undefined, keys: readonly string[]) =>
	Object.fromEntries(keys.map((k) => [k, src?.[k] ?? null]))

/** Character (U+FFFC for an embed) and attributes at `offset`. */
function charAt(
	t: Y.Text,
	offset: number
): { ch: string; attrs?: Record<string, unknown> } | undefined {
	if (offset < 0) return
	let pos = 0
	for (const op of deltaOf(t)) {
		const s = typeof op.insert === 'string' ? op.insert : '￼'
		if (offset < pos + s.length) return { ch: s[offset - pos], attrs: op.attributes }
		pos += s.length
	}
}

/** The `'\n'` ending the paragraph that holds `offset`. */
export function paragraphEnd(
	t: Y.Text,
	offset: number
): { index: number; attrs?: Record<string, unknown> } | undefined {
	let pos = 0
	for (const op of deltaOf(t)) {
		if (typeof op.insert === 'string') {
			const i = op.insert.indexOf('\n', Math.max(0, offset - pos))
			if (i >= 0) return { index: pos + i, attrs: op.attributes }
			pos += op.insert.length
		} else pos++
	}
}

/** `at`, or past a fresh paragraph break when `at` is mid-paragraph (a block starts a line). */
export function breakBefore(t: Y.Text, at: number): number {
	return at > 0 && storyTextOf(t)[at - 1] !== '\n' ? insertText(t, at, '\n') : at
}

/**
 * Insert `text` at `offset` with the marks of the character before it (at a paragraph start:
 * after it). Each `'\n'` splits the paragraph: the new `'\n'` copies the paragraph's attrs
 * with a fresh `bid` and no ghost prompt; at a paragraph end it is added after the old one, so
 * the existing paragraph keeps its bid. Returns the offset after the insert.
 */
export function insertText(t: Y.Text, offset: number, text: string): number {
	// Never type into an image paragraph: the text gets a paragraph of its own beside it.
	const e = imagePara(t, offset)
	if (e === offset && !text.endsWith('\n')) return insertText(t, offset, `${text}\n`) - 1
	if (e === offset - 1 && !text.startsWith('\n')) return insertText(t, offset, `\n${text}`)
	const before = charAt(t, offset - 1)
	const src = before && before.ch !== '\n' ? before : charAt(t, offset)
	const textAttrs = {
		...pick(src?.ch === '\n' ? undefined : src?.attrs, MARKS),
		...pick(undefined, LINE)
	}
	const para = paragraphEnd(t, offset)
	const nlAttrs = { ...pick(undefined, MARKS), ...pick(para?.attrs, LINE), ph: null }
	// One delta: at a paragraph end each new '\n' follows its part (after the old '\n'),
	// elsewhere it precedes it — the existing paragraph keeps its bid either way.
	const [first, ...rest] = text.split('\n')
	const atEnd = rest.length > 0 && charAt(t, offset)?.ch === '\n'
	const ops: { insert?: string; retain?: number; attributes?: Record<string, unknown> }[] = [
		{ retain: offset }
	]
	if (first) ops.push({ insert: first, attributes: textAttrs })
	if (atEnd) ops.push({ retain: 1 })
	for (const part of rest) {
		const nl = { insert: '\n', attributes: { ...nlAttrs, bid: newBlockId() } }
		if (!atEnd) ops.push(nl)
		if (part) ops.push({ insert: part, attributes: textAttrs })
		if (atEnd) ops.push(nl)
	}
	t.applyDelta(ops)
	return offset + text.length
}

/**
 * Start `e` of the image paragraph (embed at `e`, its own `'\n'` at `e + 1`) holding `offset`
 * (`offset` is `e` or `e + 1`).
 */
function imagePara(t: Y.Text, offset: number): number | undefined {
	for (const e of [offset, offset - 1]) {
		if (
			e >= 0 &&
			embedImgAt(t, e) &&
			charAt(t, e + 1)?.ch === '\n' &&
			(e === 0 || charAt(t, e - 1)?.ch === '\n')
		)
			return e
	}
}

/**
 * Delete `[from, to)`. When paragraphs merge, the merged one keeps the first paragraph's line
 * attrs and bid (not the last one's). Image paragraphs go whole or not at all, and text never
 * merges into one (it would render as a U+FFFC run): touching one deletes all of it; Delete at
 * the end of the paragraph before it deletes the image. Table lines never merge across cells, and
 * a table goes only whole (`breaks` below); otherwise only its text is cleared.
 */
export function deleteRange(t: Y.Text, from: number, to: number): void {
	if (to <= from) return
	const ef = imagePara(t, from)
	if (ef !== undefined) from = ef
	const et = imagePara(t, to - 1)
	if (et !== undefined) to = Math.max(to, et + 2)
	// Shift+→ twice from the paragraph above: its '\n' + the image paragraph → just the image.
	if (to - from === 3 && charAt(t, from)?.ch === '\n' && imagePara(t, from + 1) === from + 1)
		from++
	if (
		charAt(t, to - 1)?.ch === '\n' &&
		imagePara(t, to - 1) === undefined &&
		imagePara(t, to) === to
	) {
		if (to - from === 1) {
			from = to
			to += 2
		} else to--
	}
	const first = paragraphEnd(t, from)
	// Whole paragraphs deleted: nothing merges, the next paragraph keeps its own attrs.
	const whole = (from === 0 || charAt(t, from - 1)?.ch === '\n') && charAt(t, to - 1)?.ch === '\n'
	// Tables keep their shape: a merge across cells (or a cell and outside text), or a cut into
	// a table that does not take it whole, clears the text and keeps every '\n'.
	const merge = !!first && first.index < to && !whole
	const txt = storyTextOf(t)
	const inTable = [...txt.slice(from, to).matchAll(/\n/g)].some((m) =>
		isTableLine(paragraphEnd(t, from + m.index)?.attrs)
	)
	// Both ends in one cell (e.g. a Tab-selected multi-paragraph cell): merge as plain text.
	const cell = cellOf(paragraphEnd(t, to)?.attrs)
	const oneCell = cell !== undefined && cellOf(first?.attrs) === cell
	if (
		!oneCell &&
		((merge && cellOf(first?.attrs) !== cell) ||
			(inTable &&
				(!whole ||
					isTableLine(from > 0 ? charAt(t, from - 1)?.attrs : undefined) ||
					isTableLine(paragraphEnd(t, to)?.attrs))))
	) {
		for (let b = to; b > from; ) {
			const nl = txt.lastIndexOf('\n', b - 1)
			const a = Math.max(from, nl + 1)
			if (b > a) t.delete(a, b - a)
			b = nl
		}
		return
	}
	t.delete(from, to - from)
	if (merge && first) {
		const merged = paragraphEnd(t, from)
		if (merged) t.format(merged.index, 1, pick(first.attrs, LINE))
	}
}

// vim: ts=4
