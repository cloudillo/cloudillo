// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * block-ids - stable per-line ids (`bid`, rendered as `data-bid`).
 *
 * Every line carries a block attribute `bid` that syncs through Yjs like any
 * other line format. The normaliser keeps them present and unique:
 *   - a line without a `bid` gets a fresh one (legacy documents are filled in
 *     by the first writer that opens them);
 *   - duplicates keep the id on the first NON-EMPTY occurrence in document order
 *     (the first occurrence if all are empty). A split (Enter) copies the line
 *     formats onto both halves, so the first half keeps the id — except Enter at
 *     the very start of a line, where the empty line above gives it up (a heading
 *     keeps its id, so `sec:` links survive); a merge keeps the first line's id.
 *   - pasted / imported content has its `bid`s stripped by a clipboard matcher,
 *     so the normaliser assigns fresh ones instead of cloning the source's.
 *
 * Normaliser edits use source `'api'`: y-quill syncs them, while the history
 * module (`userOnly: true`) keeps them out of the undo stack.
 */

import type Quill from 'quill'
import Delta from 'quill-delta'

/** Quill format name; registered as a Parchment block `Attributor` in quillo.ts. */
export const BID_FORMAT = 'bid'
export const BID_ATTRIBUTE = 'data-bid'

/** 8-char random base36 id. */
export function newBlockId(): string {
	let id = ''
	while (id.length < 8) id += Math.random().toString(36).slice(2)
	return id.slice(0, 8)
}

/** Embeds that sit on a line of their own, with no trailing `'\n'` */
const BLOCK_EMBEDS = new Set(['cl-image', 'cl-document', 'video'])

/**
 * Given the full document contents, return a retain/format delta that gives
 * every line a unique `bid` (empty delta when nothing needs fixing). Lines are
 * delimited by `'\n'` inserts; block embeds carry no line format and are skipped,
 * and do not count toward the length of the line after them.
 */
export function computeBlockIdFixes(contents: Delta, newId: () => string = newBlockId): Delta {
	// Pass 1: every line's bid, emptiness and '\n' offset.
	const lines: { bid?: string; empty: boolean; end: number }[] = []
	let pos = 0
	let lineLen = 0
	for (const op of contents.ops) {
		if (typeof op.insert !== 'string') {
			pos += 1
			lineLen = Object.keys(op.insert ?? {}).some((k) => BLOCK_EMBEDS.has(k))
				? 0
				: lineLen + 1
			continue
		}
		const attr = op.attributes?.[BID_FORMAT]
		const bid = typeof attr === 'string' && attr ? attr : undefined
		let i = 0
		for (;;) {
			const nl = op.insert.indexOf('\n', i)
			if (nl < 0) {
				pos += op.insert.length - i
				lineLen += op.insert.length - i
				break
			}
			pos += nl - i
			lineLen += nl - i
			lines.push({ bid, empty: lineLen === 0, end: pos })
			pos += 1
			lineLen = 0
			i = nl + 1
		}
	}

	// Pass 2: which line keeps each id — the first non-empty occurrence, else the first.
	const keeper = new Map<string, number>()
	lines.forEach((line, n) => {
		if (!line.bid) return
		const k = keeper.get(line.bid)
		if (k === undefined || (lines[k].empty && !line.empty)) keeper.set(line.bid, n)
	})

	// Pass 3: fresh ids for the rest, never colliding with an id already in use.
	const fixes = new Delta()
	const taken = new Set(keeper.keys())
	let cursor = 0
	lines.forEach((line, n) => {
		if (line.bid && keeper.get(line.bid) === n) return
		let id = newId()
		while (taken.has(id)) id = newId()
		taken.add(id)
		if (line.end > cursor) fixes.retain(line.end - cursor)
		fixes.retain(1, { [BID_FORMAT]: id })
		cursor = line.end + 1
	})
	return fixes
}

/** Clipboard matcher: drop `bid` from pasted / imported content. */
export function stripBlockIds(_node: Node, delta: Delta): Delta {
	for (const op of delta.ops) {
		if (op.attributes && BID_FORMAT in op.attributes) {
			const { [BID_FORMAT]: _bid, ...rest } = op.attributes
			if (Object.keys(rest).length) op.attributes = rest
			else delete op.attributes
		}
	}
	return delta
}

/**
 * Keep every line's `bid` present and unique. Call once after the initial Yjs
 * sync: it fixes the whole document immediately, then again after every change
 * (local or remote). `canWrite` is read on each run, so read-only viewers never
 * write and an access upgrade takes effect on the next change.
 *
 * The fix is deferred to a microtask so it never runs nested inside another
 * text-change emission (or a Yjs observer applying a remote update); changes it
 * makes itself are ignored via the `applying` flag.
 *
 * Returns a function that re-runs the fix on demand (e.g. after an access upgrade).
 *
 * Rescans the whole document per change (O(n)); scan only the changed
 * lines plus an id index if large documents feel sluggish.
 */
export function registerBlockIdNormalizer(editor: Quill, canWrite: () => boolean): () => void {
	let applying = false
	let scheduled = false

	const run = () => {
		scheduled = false
		if (!canWrite()) return
		const fixes = computeBlockIdFixes(editor.getContents())
		if (!fixes.ops.length) return
		applying = true
		try {
			editor.updateContents(fixes, 'api')
		} finally {
			applying = false
		}
	}

	editor.on('text-change', () => {
		if (applying || scheduled) return
		scheduled = true
		queueMicrotask(run)
	})
	run()
	return run
}

/** Strip `bid` from pasted / imported content (`clipboard.convert` runs matchers too). */
export function registerBlockIdPasteMatcher(editor: Quill): void {
	editor.clipboard.addMatcher(Node.ELEMENT_NODE, stripBlockIds)
}
