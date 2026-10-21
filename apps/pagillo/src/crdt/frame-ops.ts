// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Frame operations (`f` map): page-anchored frames and master static items, and the
 * "On this page / Moves with text" conversion between an `f` frame and an inline `img` embed.
 */

import { FX } from '@cloudillo/typeset'
import type * as Y from 'yjs'

import type { EmbedRecord } from '../embeds/record'
import { newBlockId } from './block-ids'
import { deltaOf } from './delta-cache'
import { FULL_CROP, frameOf, framesOf, newFrameMap, patchFrame } from './entities'
import { type FrameId, type MasterId, newId } from './ids'
import { createStory, type SeedParagraph } from './story-ops'
import { masterItems, textChains } from './type-converters'
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
	/** Line-start float; absent = full width / centred. */
	float?: { side: 'l' | 'r'; w: number }
}

/**
 * Add a frame. For a `txt` frame pass `paras` instead of `data.story`: its story is created.
 * With `master` set (and existing), the frame becomes a shared static item of that master: its
 * `anchor` is replaced by `{ ms: master }`.
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
		const anchor = opts.master && doc.ms.has(opts.master) ? { ms: opts.master } : frame.anchor
		doc.f.set(id, newFrameMap({ ...frame, anchor, data }))
	}, yDoc.clientID)
	return id
}

/**
 * Patch a frame: only the keys that changed are written (`data` fields one by one, so spreading
 * the current data to change one field is fine; a `data` field set to `undefined` is removed).
 */
export function updateFrame(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	id: FrameId,
	patch: Partial<StoredFrame>
): void {
	const y = doc.f.get(id)
	if (!y) return
	const { t: _t, data, ...rest } = patch
	yDoc.transact(() => {
		patchFrame(y, { ...rest, data: data && { ...data } })
	}, yDoc.clientID)
}

/** Delete a frame and its text story (a threaded frame hands its text on instead). */
export function deleteFrame(yDoc: Y.Doc, doc: YPagilloDocument, id: FrameId): void {
	const cur = frameOf(doc, id)
	if (!cur) return
	yDoc.transact(() => {
		if (cur.t === 'txt') {
			// Never lose text: a follower leaves the chain, a head hands story + rest to the next.
			const c = chainOf(doc, id)
			const rest = c?.frames.slice(1).filter((x) => x !== id) ?? []
			const story = (cur.data as StoredTextFrameData).story
			if (c && c.head !== id) setData(doc, c.head, chainData(storyOf(doc, c.head), rest))
			else if (c) setData(doc, rest[0], chainData(story, rest.slice(1)))
			else if (story) doc.tx.delete(story)
		}
		doc.f.delete(id)
	}, yDoc.clientID)
}

/** Why a frame can't be linked to (`undefined` = allowed). Each maps to one UI hint. */
export type LinkRefusal = 'hasText' | 'inThread' | 'layoutItem' | 'notText'

/** Replace the story/chain linkage of `id` (writes only its `story` and `chain` keys). */
function setData(doc: YPagilloDocument, id: FrameId, data: StoredTextFrameData): void {
	patchFrame(doc.f.get(id), { data: { story: data.story, chain: data.chain } })
}

function chainData(story: string | undefined, chain: FrameId[]): StoredTextFrameData {
	return chain.length ? { story, chain } : { story }
}

function storyOf(doc: YPagilloDocument, id: FrameId): string | undefined {
	return (frameOf(doc, id)?.data as StoredTextFrameData | undefined)?.story
}

/** No text: only empty paragraphs (no characters, no embeds), or no story at all. */
function isEmptyText(doc: YPagilloDocument, id: FrameId): boolean {
	const st = storyOf(doc, id)
	const t = st ? doc.tx.get(st) : undefined
	return !t || deltaOf(t).every((op) => typeof op.insert === 'string' && /^\n*$/.test(op.insert))
}

/**
 * The valid chain holding `frameId` (`textChains`): its head and all frames, head first.
 * `undefined` for a frame that is not threaded (a standalone text box included).
 */
export function chainOf(
	doc: YPagilloDocument,
	frameId: FrameId,
	chains = textChains(doc)
): { head: FrameId; frames: FrameId[] } | undefined {
	for (const [head, chain] of chains)
		if (head === frameId || chain.includes(frameId)) return { head, frames: [head, ...chain] }
}

/** Can `targetId` continue the thread of `fromId`? Targets: empty, unchained page `txt` frames. */
export function canLinkTarget(
	doc: YPagilloDocument,
	fromId: FrameId,
	targetId: FrameId,
	chains = textChains(doc),
	master = masterItems(doc)
): LinkRefusal | undefined {
	const target = frameOf(doc, targetId)
	if (target?.t !== 'txt' || frameOf(doc, fromId)?.t !== 'txt') return 'notText'
	if (master.has(targetId) || master.has(fromId)) return 'layoutItem'
	if (targetId === fromId || chainOf(doc, targetId, chains)) return 'inThread'
	if (!isEmptyText(doc, targetId)) return 'hasText'
}

/**
 * Append `targetId` to the chain of `headOrMemberId` (its head is resolved). The target's empty
 * story is deleted and it becomes a follower (no `story`/`chain`). `false` when refused
 * (`canLinkTarget`).
 */
export function linkFrame(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	headOrMemberId: FrameId,
	targetId: FrameId
): boolean {
	const c = chainOf(doc, headOrMemberId)
	const head = c?.head ?? headOrMemberId
	const story = storyOf(doc, head)
	if (!story || canLinkTarget(doc, head, targetId)) return false
	yDoc.transact(() => {
		const own = storyOf(doc, targetId)
		if (own) doc.tx.delete(own)
		setData(doc, targetId, {})
		setData(doc, head, { story, chain: [...(c?.frames.slice(1) ?? []), targetId] })
	}, yDoc.clientID)
	return true
}

/** Frames `fromId` may link to (`canLinkTarget`), in page order: `secs` order, then page. */
export function linkTargets(doc: YPagilloDocument, fromId: FrameId): FrameId[] {
	const secs = doc.secs.toArray()
	const chains = textChains(doc)
	const master = masterItems(doc)
	const out: { id: FrameId; s: number; page: number }[] = []
	for (const [id, f] of framesOf(doc)) {
		if (!('sec' in f.anchor)) continue
		const s = secs.indexOf(f.anchor.sec)
		if (s >= 0 && !canLinkTarget(doc, fromId, id, chains, master))
			out.push({ id, s, page: f.anchor.page })
	}
	return out.sort((a, b) => a.s - b.s || a.page - b.page).map((o) => o.id)
}

/**
 * "Stop text after this frame": truncate the chain after `frameId`. Each dropped frame gets a
 * fresh empty story; the text that no longer fits goes overset. One transaction.
 */
export function breakThreadAfter(yDoc: Y.Doc, doc: YPagilloDocument, frameId: FrameId): void {
	const c = chainOf(doc, frameId)
	const i = c?.frames.indexOf(frameId) ?? -1
	if (!c || i < 0 || i === c.frames.length - 1) return
	yDoc.transact(() => {
		setData(doc, c.head, chainData(storyOf(doc, c.head), c.frames.slice(1, i + 1)))
		for (const id of c.frames.slice(i + 1)) setData(doc, id, { story: createStory(doc, [{}]) })
	}, yDoc.clientID)
}

/** The chain (`chainOf`) of the text frame holding `storyId`, or just that frame when unchained. */
export function chainOfStory(
	doc: YPagilloDocument,
	storyId: string,
	chains = textChains(doc)
): { head: FrameId; frames: FrameId[] } | undefined {
	for (const [id, f] of framesOf(doc))
		if (f.t === 'txt' && (f.data as StoredTextFrameData).story === storyId)
			return chainOf(doc, id, chains) ?? { head: id, frames: [id] }
}

export interface ThreadState {
	/** Frames in the thread. */
	m: number
	/** Its text is overset. */
	over: boolean
}

/** Per story of a text box: its thread state, given the layout's overset frames. */
export function threadStates(
	doc: YPagilloDocument,
	overset: { frame?: string }[],
	chains = textChains(doc)
): Map<string, ThreadState> {
	const over = new Set(overset.map((o) => o.frame))
	const out = new Map<string, ThreadState>()
	for (const [id, f] of framesOf(doc)) {
		const story = f.t === 'txt' ? (f.data as StoredTextFrameData).story : undefined
		if (!story) continue
		const ids = chainOf(doc, id, chains)?.frames ?? [id]
		out.set(story, { m: ids.length, over: ids.some((x) => over.has(x)) })
	}
	return out
}

/** What to announce per story between two `threadStates`: a link grew it, an unlink overset it. */
export function threadAnnouncements(
	prev: Map<string, ThreadState>,
	now: Map<string, ThreadState>
): Array<{ kind: 'linked'; m: number } | { kind: 'overset' }> {
	const out: Array<{ kind: 'linked'; m: number } | { kind: 'overset' }> = []
	for (const [story, a] of now) {
		const b = prev.get(story)
		if (!b) continue
		if (a.m > b.m) out.push({ kind: 'linked', m: a.m })
		else if (a.m < b.m && a.over && !b.over) out.push({ kind: 'overset' })
	}
	return out
}

/**
 * Insert an image-only paragraph (embed + `'\n'` with a fresh bid) at paragraph start `at`.
 * Inside the caller's transaction.
 */
export function insertImageParagraph(t: Y.Text, at: number, img: InlineImage): void {
	t.insertEmbed(at, { img })
	t.insert(at + 1, '\n', { bid: newBlockId() })
}

/** Insert an embed-only paragraph (`{ emb }` + `'\n'` with a fresh bid) at paragraph start `at`. */
export function insertEmbedParagraph(t: Y.Text, at: number, emb: EmbedRecord): void {
	t.insertEmbed(at, { emb })
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

/** The inline embed record (`{ emb }`) at `offset`, if there is one. */
export function embedRecordAt(t: Y.Text, offset: number): EmbedRecord | undefined {
	return (opAt(t, offset).embed as { emb?: EmbedRecord } | undefined)?.emb
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

/** Story and offset of the inline image (`kind` `'emb'`: embed) in paragraph `bid`. */
export function findInlineImage(
	doc: YPagilloDocument,
	bid: string,
	kind: 'img' | 'emb' = 'img'
): { story: string; offset: number } | undefined {
	for (const [story, t] of doc.tx.entries()) {
		let pos = 0
		for (const op of deltaOf(t)) {
			const len = typeof op.insert === 'string' ? op.insert.length : 1
			if (op.attributes?.bid === bid && typeof op.insert === 'string') {
				const nl = op.insert.indexOf('\n')
				const offset = pos + nl - 1
				const found = kind === 'img' ? embedImgAt(t, offset) : embedRecordAt(t, offset)
				if (nl >= 0 && found) return { story, offset }
			}
			pos += len
		}
	}
}

/**
 * Offset of the only inline image embed in `from..to` (a click selects the embed, Shift+→ the
 * `'\n'` before it too). Selections over 64 chars never count as an image selection.
 * `kind` `'emb'`: the same for an inline embed.
 */
export function soleInlineImage(
	t: Y.Text,
	from: number,
	to: number,
	kind: 'img' | 'emb' = 'img'
): number | undefined {
	if (to - from > 64) return
	let pos = 0
	let found: number | undefined
	for (const op of deltaOf(t)) {
		if (pos >= to) break
		if (typeof op.insert === 'string') pos += op.insert.length
		else {
			if (pos >= from && (op.insert as Record<string, unknown>)[kind]) {
				if (found !== undefined) return
				found = pos
			}
			pos++
		}
	}
	return found
}

/** The sole inline image, else the sole inline embed, the selection covers. */
export function soleInlineObject(
	t: Y.Text,
	from: number,
	to: number
): { offset: number; kind: 'img' | 'emb'; bid?: string } | undefined {
	for (const kind of ['img', 'emb'] as const) {
		const offset = soleInlineImage(t, from, to, kind)
		if (offset !== undefined) return { offset, kind, bid: inlineImageBid(t, offset) }
	}
}

/** Replace the inline image embed at `offset` (alt text edits). Inside the caller's transaction. */
export function setInlineImage(t: Y.Text, offset: number, img: InlineImage): void {
	t.delete(offset, 1)
	t.insertEmbed(offset, { img })
}

/** Replace the inline embed record at `offset` (alt text edits). Inside the caller's transaction. */
export function setInlineEmbed(t: Y.Text, offset: number, emb: EmbedRecord): void {
	t.delete(offset, 1)
	t.insertEmbed(offset, { emb })
}

/** "Moves with text": the `img` frame becomes an image paragraph at paragraph start `at`. */
export function frameToInline(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	id: FrameId,
	story: string,
	at: number
): boolean {
	const f = frameOf(doc, id)
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
