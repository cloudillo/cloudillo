// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Main-thread `Y.Text#toDelta()` cache: one delta per text until a transaction changes it
 * (per-doc `beforeObserverCalls` hook). Inside an open transaction that already changed the text
 * the cache is bypassed (fresh `toDelta()`, not stored). Returned arrays and strings are shared
 * and read-only: callers that mutate copy first.
 */

import type * as Y from 'yjs'

import type { DeltaOp } from './type-converters'

// Keyed by `object`: `Transaction#changed` keys are `AbstractType<YEvent>`, which `Y.Text` is not assignable to.
const deltas = new WeakMap<object, DeltaOp[]>()
const texts = new WeakMap<DeltaOp[], string>()
const hooked = new WeakSet<Y.Doc>()

/** `t.toDelta()`, cached. Shared, read-only. */
export function deltaOf(t: Y.Text): DeltaOp[] {
	const doc = t.doc
	const changed: Map<object, unknown> | undefined = doc?._transaction?.changed
	if (!doc || changed?.has(t)) return t.toDelta() as DeltaOp[]
	if (!hooked.has(doc)) {
		hooked.add(doc)
		// Not `afterTransaction`: observers run before it, with `_transaction` already null.
		doc.on('beforeObserverCalls', (tr: Y.Transaction) => {
			tr.changed.forEach((_, type) => {
				deltas.delete(type)
			})
		})
	}
	let ops = deltas.get(t)
	if (!ops) {
		ops = t.toDelta() as DeltaOp[]
		deltas.set(t, ops)
	}
	return ops
}

/** Story text with U+FFFC per embed (`Y.Text#toString` drops embeds), cached per delta. */
export function storyTextOf(t: Y.Text): string {
	const ops = deltaOf(t)
	let s = texts.get(ops)
	if (s === undefined) {
		s = ''
		for (const op of ops) s += typeof op.insert === 'string' ? op.insert : '￼'
		texts.set(ops, s)
	}
	return s
}

// vim: ts=4
