// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Frame operations (`f` map): page-anchored frames and master static items, and the
 * "On this page / Moves with text" conversion between an `f` frame and an inline `img` embed.
 */

import { FX } from '@cloudillo/typeset'
import type * as Y from 'yjs'

import { newBlockId } from './block-ids'
import { deltaOf } from './delta-cache'
import { type FrameId, type MasterId, newId } from './ids'
import { createStory, type SeedParagraph } from './section-ops'
import type {
	StoredFrame,
	StoredImageData,
	StoredTextFrameData,
	YPagilloDocument
} from './stored-types'

/** Inline image embed payload (`{ img }`). */
export interface InlineImage {
	fileId: string
	w: number
	h: number
	alt: string
}

export const FULL_CROP = { x: 0, y: 0, w: 1, h: 1 }

/**
 * Add a frame. For a `txt` frame pass `paras` instead of `data.story`: its story is created.
 * With `master` set, the frame becomes a static item of that master (its `anchor` is ignored).
 */
export function addFrame(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	frame: StoredFrame,
	opts: { paras?: SeedParagraph[]; master?: MasterId } = {}
): FrameId {
	const id = newId()
	yDoc.transact(() => {
		const data: StoredFrame['data'] =
			frame.t === 'txt' && opts.paras ? { story: createStory(doc, opts.paras) } : frame.data
		doc.f.set(id, { ...frame, data })
		const m = opts.master ? doc.ms.get(opts.master) : undefined
		if (opts.master && m) doc.ms.set(opts.master, { ...m, items: [...m.items, id] })
	}, yDoc.clientID)
	return id
}

/** Shallow patch (`data` is replaced whole — spread the current data to change one field). */
export function updateFrame(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	id: FrameId,
	patch: Partial<StoredFrame>
): void {
	const cur = doc.f.get(id)
	if (!cur) return
	yDoc.transact(() => {
		doc.f.set(id, { ...cur, ...patch })
	}, yDoc.clientID)
}

/** Delete a frame, its text story, and its entries in master item lists. */
export function deleteFrame(yDoc: Y.Doc, doc: YPagilloDocument, id: FrameId): void {
	const cur = doc.f.get(id)
	if (!cur) return
	const drop = (items: string[] | undefined) => items?.filter((x) => x !== id)
	yDoc.transact(() => {
		doc.ms.forEach((m, mid) => {
			const all = [...m.items, ...(m.left?.items ?? []), ...(m.right?.items ?? [])]
			if (!all.includes(id)) return
			const next = { ...m, items: drop(m.items) ?? [] }
			if (m.left?.items) next.left = { ...m.left, items: drop(m.left.items) }
			if (m.right?.items) next.right = { ...m.right, items: drop(m.right.items) }
			doc.ms.set(mid, next)
		})
		if (cur.t === 'txt') doc.tx.delete((cur.data as StoredTextFrameData).story)
		doc.f.delete(id)
	}, yDoc.clientID)
}

/**
 * Insert an image-only paragraph (embed + `'\n'` with a fresh bid) at paragraph start `at`.
 * Inside the caller's transaction.
 */
export function insertImageParagraph(t: Y.Text, at: number, img: InlineImage): void {
	t.insertEmbed(at, { img })
	t.insert(at + 1, '\n', { bid: newBlockId() })
}

/** The character at `offset` (`undefined` for an embed or past the end) and the embed there. */
function opAt(t: Y.Text, offset: number): { ch?: string; embed?: unknown } {
	let pos = 0
	for (const op of deltaOf(t)) {
		const len = typeof op.insert === 'string' ? op.insert.length : 1
		if (offset < pos + len)
			return typeof op.insert === 'string'
				? { ch: op.insert[offset - pos] }
				: { embed: op.insert }
		pos += len
	}
	return {}
}

/** The inline image embed at `offset`, if there is one. */
export function embedImgAt(t: Y.Text, offset: number): InlineImage | undefined {
	const e = opAt(t, offset).embed as { img?: InlineImage } | undefined
	return e?.img
}

/** The `bid` of the image paragraph whose embed sits at `offset` (its `'\n'` follows). */
export function inlineImageBid(t: Y.Text, offset: number): string | undefined {
	let pos = 0
	for (const op of deltaOf(t)) {
		const len = typeof op.insert === 'string' ? op.insert.length : 1
		if (offset + 1 < pos + len)
			return typeof op.insert === 'string' && op.insert[offset + 1 - pos] === '\n'
				? (op.attributes?.bid as string | undefined)
				: undefined
		pos += len
	}
}

/** Story and offset of the inline image embed in paragraph `bid`. */
export function findInlineImage(
	doc: YPagilloDocument,
	bid: string
): { story: string; offset: number } | undefined {
	for (const [story, t] of doc.tx.entries()) {
		let pos = 0
		for (const op of deltaOf(t)) {
			const len = typeof op.insert === 'string' ? op.insert.length : 1
			if (op.attributes?.bid === bid && typeof op.insert === 'string') {
				const nl = op.insert.indexOf('\n')
				const offset = pos + nl - 1
				if (nl >= 0 && embedImgAt(t, offset)) return { story, offset }
			}
			pos += len
		}
	}
}

/**
 * Offset of the only inline image embed in `from..to` (a click selects the embed, Shift+→ the
 * `'\n'` before it too). Selections over 64 chars never count as an image selection.
 */
export function soleInlineImage(t: Y.Text, from: number, to: number): number | undefined {
	if (to - from > 64) return
	let pos = 0
	let found: number | undefined
	for (const op of deltaOf(t)) {
		if (pos >= to) break
		if (typeof op.insert === 'string') pos += op.insert.length
		else {
			if (pos >= from && (op.insert as { img?: unknown }).img) {
				if (found !== undefined) return
				found = pos
			}
			pos++
		}
	}
	return found
}

/** Replace the inline image embed at `offset` (alt text edits). Inside the caller's transaction. */
export function setInlineImage(t: Y.Text, offset: number, img: InlineImage): void {
	t.delete(offset, 1)
	t.insertEmbed(offset, { img })
}

/** "Moves with text": the `img` frame becomes an image paragraph at paragraph start `at`. */
export function frameToInline(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	id: FrameId,
	story: string,
	at: number
): boolean {
	const f = doc.f.get(id)
	const t = doc.tx.get(story)
	const d = f?.data as StoredImageData | undefined
	if (f?.t !== 'img' || !d?.fileId || !t) return false
	const fileId = d.fileId
	yDoc.transact(() => {
		insertImageParagraph(t, at, { fileId, w: f.w, h: f.h, alt: d.alt })
		deleteFrame(yDoc, doc, id)
	}, yDoc.clientID)
	return true
}

/**
 * "On this page": the `img` embed at `offset` (with its paragraph's `'\n'` when the paragraph
 * holds only the image) becomes a page-anchored frame at `box`. One transaction.
 */
export function inlineToFrame(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	story: string,
	offset: number,
	box: Pick<StoredFrame, 'anchor' | 'x' | 'y' | 'w' | 'h'>
): FrameId | undefined {
	const t = doc.tx.get(story)
	const img = t && embedImgAt(t, offset)
	if (!t || !img) return
	const solo =
		(offset === 0 || opAt(t, offset - 1).ch === '\n') && opAt(t, offset + 1).ch === '\n'
	let id: FrameId | undefined
	yDoc.transact(() => {
		t.delete(offset, solo ? 2 : 1)
		id = addFrame(yDoc, doc, {
			t: 'img',
			...box,
			rot: 0,
			z: 1,
			wrap: { mode: 'box', off: 6 * FX },
			data: { fileId: img.fileId, crop: FULL_CROP, fit: 'contain', alt: img.alt }
		})
	}, yDoc.clientID)
	return id
}

// vim: ts=4
