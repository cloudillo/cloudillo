// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Story normaliser: every paragraph of every `tx` story ends in `'\n'` and has a `bid`
 * unique within its story (rules in `block-ids.ts`, as quillo's).
 *
 * Writes use `NORMALIZE_ORIGIN`, so a `Y.UndoManager` tracking the local origin
 * (`yDoc.clientID`) keeps them out of the undo stack, and the observer skips them.
 */

import * as Y from 'yjs'

import { BID_FORMAT, computeBlockIdFixes } from './block-ids'
import { deltaOf } from './delta-cache'
import { framesOf, isObj } from './entities'
import type { YPagilloDocument } from './stored-types'

export const NORMALIZE_ORIGIN = 'pagillo-normalize'

/** Fix one story in place; call inside a transaction. Returns whether it wrote anything. */
export function normalizeStory(text: Y.Text): boolean {
	let ops = deltaOf(text)
	let wrote = false
	const last = ops[ops.length - 1]
	if (last && !(typeof last.insert === 'string' && last.insert.endsWith('\n'))) {
		text.insert(text.length, '\n', {})
		ops = deltaOf(text)
		wrote = true
	}
	for (const { index, bid } of computeBlockIdFixes(ops)) {
		text.format(index, 1, { [BID_FORMAT]: bid })
		wrote = true
	}
	return wrote
}

/**
 * Delete frames anchored to a missing master, then `tx` stories nothing references (no section,
 * no frame — master items included — no footnote ref). References are read raw, so the story of
 * an entity this client cannot read (a newer peer's frame type) is kept. Every local op drops a
 * story with its last reference and a master with its items, so these come from concurrent edits.
 * Call inside a transaction.
 */
export function sweepOrphanStories(doc: YPagilloDocument): void {
	for (const [id, f] of framesOf(doc))
		if ('ms' in f.anchor && !doc.ms.has(f.anchor.ms)) doc.f.delete(id)
	const used = new Set<string>()
	// A peer can put anything in an entity root.
	for (const root of [doc.s, doc.f] as Y.Map<unknown>[])
		for (const y of root.values()) {
			// A footnote root (`rootNotes`) does not keep its own body alive.
			if (y instanceof Y.Map && y.get('t') === 'fn') continue
			const story = y instanceof Y.Map ? y.get('story') : isObj(y) ? y.story : undefined
			if (typeof story === 'string') used.add(story)
		}
	// Footnote bodies are referenced only by `{ fn }` embeds in section stories' text.
	for (const y of (doc.s as Y.Map<unknown>).values()) {
		const story = y instanceof Y.Map ? y.get('story') : isObj(y) ? y.story : undefined
		const t = typeof story === 'string' ? doc.tx.get(story) : undefined
		if (t instanceof Y.Text)
			for (const op of t.toDelta()) {
				const fn = isObj(op.insert) ? op.insert.fn : undefined
				if (typeof fn === 'string') used.add(fn)
			}
	}
	for (const id of [...doc.tx.keys()]) if (!used.has(id)) doc.tx.delete(id)
	for (const [id, y] of [...doc.f.entries()])
		if (y instanceof Y.Map && y.get('t') === 'fn' && !doc.tx.has(y.get('story') as string))
			doc.f.delete(id)
}

/**
 * Give each footnote body `{ fn }`-referenced from `text` a root entry in `doc.f`
 * (`{ t: 'fn', story: <body id> }`, keyed by the body id). Older clients' orphan sweeps keep any
 * `tx` story an `s`/`f` entry names, even one they cannot read, so the root keeps the body alive
 * there; `readFrame` rejects `t: 'fn'`, so nothing draws it. Call inside a transaction.
 */
export function rootNotes(doc: YPagilloDocument, text: Y.Text): void {
	for (const op of deltaOf(text)) {
		const id = isObj(op.insert) ? op.insert.fn : undefined
		if (typeof id === 'string' && doc.tx.has(id) && !doc.f.has(id))
			doc.f.set(
				id,
				new Y.Map<unknown>([
					['t', 'fn'],
					['story', id]
				])
			)
	}
}

/**
 * Keep every story normalised. Fixes all stories now, then the stories touched by each
 * later change (local or remote), deferred to a microtask so it never runs inside another
 * observer. `canWrite` is read on each run; while it is false, touched stories stay pending.
 *
 * `run()` re-checks every story (e.g. after an access upgrade); `dispose()` stops observing.
 * The first write also sweeps orphan stories (`sweepOrphanStories`).
 *
 * Rescans a touched story whole (O(n) per change); scan only changed lines plus an id index
 * if long stories feel sluggish.
 */
export function registerNormalizer(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	canWrite: () => boolean
): { run: () => void; dispose: () => void } {
	const dirty = new Set<Y.Text>()
	let scheduled = false
	// Load-time sweep only; a peer's pending undo of a section break could reference a swept story
	let sweep = true

	const flush = () => {
		scheduled = false
		if ((!dirty.size && !sweep) || !canWrite()) return
		try {
			yDoc.transact(() => {
				if (sweep) {
					sweep = false
					sweepOrphanStories(doc)
				}
				// A peer can put anything in `tx`; only a Y.Text is a story.
				doc.tx.forEach((t) => {
					if (t instanceof Y.Text && dirty.has(t)) {
						normalizeStory(t)
						rootNotes(doc, t)
					}
				})
			}, NORMALIZE_ORIGIN)
		} finally {
			dirty.clear()
		}
	}

	const onChange = (events: Y.YEvent<Y.AbstractType<unknown>>[], tr: Y.Transaction) => {
		if (tr.origin === NORMALIZE_ORIGIN) return
		for (const e of events) {
			if (e.target === doc.tx) {
				for (const key of e.changes.keys.keys()) {
					const t = doc.tx.get(key)
					if (t) dirty.add(t)
				}
			} else {
				dirty.add(e.target as Y.Text)
			}
		}
		if (dirty.size && !scheduled) {
			scheduled = true
			queueMicrotask(flush)
		}
	}

	const run = () => {
		doc.tx.forEach((text) => {
			dirty.add(text)
		})
		flush()
	}

	doc.tx.observeDeep(onChange)
	run()
	return { run, dispose: () => doc.tx.unobserveDeep(onChange) }
}

// vim: ts=4
