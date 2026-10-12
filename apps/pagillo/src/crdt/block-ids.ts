// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * block-ids - stable per-paragraph ids (`bid` line attribute on each `'\n'`).
 *
 * Copied from `apps/quillo/src/block-ids.ts` (apps do not import each other; move into
 * `@cloudillo/crdt` once a third user appears), ported from Quill Deltas to plain
 * `Y.Text#toDelta()` ops. Same invariants:
 *   - a paragraph without a `bid` gets a fresh one;
 *   - duplicates keep the id on the first NON-EMPTY occurrence in story order (the first
 *     occurrence if all are empty). A split copies the line attrs onto both halves, so the
 *     first half keeps the id — except a split at the very start of a paragraph, where the
 *     empty paragraph above gives it up; a merge keeps the first paragraph's id;
 *   - pasted / imported content has its `bid`s stripped (`stripBlockIds`), so fresh ids are
 *     assigned instead of cloning the source's.
 * Unlike quillo there are no block embeds: every embed (img, emb, fn, field, toc) is an
 * inline length-1 op and counts toward its paragraph's length.
 */

import type { DeltaOp } from './type-converters'

export const BID_FORMAT = 'bid'

/** 8-char random base36 id. */
export function newBlockId(): string {
	let id = ''
	while (id.length < 8) id += Math.random().toString(36).slice(2)
	return id.slice(0, 8)
}

/** A `bid` to write on the `'\n'` at `index`. */
export interface BlockIdFix {
	index: number
	bid: string
}

/**
 * Given a story's full delta, return the `bid` writes that make every paragraph's id present
 * and unique (empty when nothing needs fixing), in ascending `index` order.
 */
export function computeBlockIdFixes(
	ops: DeltaOp[],
	newId: () => string = newBlockId
): BlockIdFix[] {
	// Pass 1: every paragraph's bid, emptiness and '\n' offset.
	const lines: { bid?: string; empty: boolean; end: number }[] = []
	let pos = 0
	let lineLen = 0
	for (const op of ops) {
		if (typeof op.insert !== 'string') {
			pos += 1
			lineLen += 1
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

	// Pass 2: which paragraph keeps each id — the first non-empty occurrence, else the first.
	const keeper = new Map<string, number>()
	lines.forEach((line, n) => {
		if (!line.bid) return
		const k = keeper.get(line.bid)
		if (k === undefined || (lines[k].empty && !line.empty)) keeper.set(line.bid, n)
	})

	// Pass 3: fresh ids for the rest, never colliding with an id already in use.
	const fixes: BlockIdFix[] = []
	const taken = new Set(keeper.keys())
	lines.forEach((line, n) => {
		if (line.bid && keeper.get(line.bid) === n) return
		let id = newId()
		while (taken.has(id)) id = newId()
		taken.add(id)
		fixes.push({ index: line.end, bid: id })
	})
	return fixes
}

/** Drop `bid` from pasted / imported ops (in place), so the normaliser assigns fresh ones. */
export function stripBlockIds(ops: DeltaOp[]): DeltaOp[] {
	for (const op of ops) {
		if (op.attributes && BID_FORMAT in op.attributes) {
			const { [BID_FORMAT]: _bid, ...rest } = op.attributes
			if (Object.keys(rest).length) op.attributes = rest
			else delete op.attributes
		}
	}
	return ops
}

// vim: ts=4
