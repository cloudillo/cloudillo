// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Section operations (`secs` order + `s` map) and story creation (`tx` map).
 */

import * as Y from 'yjs'
import type { ParagraphProps } from '@cloudillo/typeset'

import { newBlockId } from './block-ids'
import { newId, type SectionId, type StoryId } from './ids'
import type {
	StoredInlineEmbed,
	StoredLineAttrs,
	StoredSection,
	StoredTextFrameData,
	StyleMap,
	YPagilloDocument
} from './stored-types'

/** One seeded paragraph: empty (or a single embed) with its line attrs. */
export interface SeedParagraph {
	ps?: string
	ph?: string
	po?: Partial<ParagraphProps>
	embed?: StoredInlineEmbed
}

/** Create a `tx` story from seed paragraphs (each gets a fresh `bid`). Call inside a transaction. */
export function createStory(doc: YPagilloDocument, paras: SeedParagraph[]): StoryId {
	const id = newId()
	const text = new Y.Text()
	doc.tx.set(id, text)
	const taken = new Set<string>()
	let pos = 0
	for (const p of paras) {
		if (p.embed) text.insertEmbed(pos++, p.embed, {})
		let bid = newBlockId()
		while (taken.has(bid)) bid = newBlockId()
		taken.add(bid)
		const attrs: StoredLineAttrs = { bid }
		if (p.ps) attrs.ps = p.ps
		if (p.ph) attrs.ph = p.ph
		if (p.po) attrs.po = p.po
		text.insert(pos++, '\n', attrs as Record<string, unknown>)
	}
	return id
}

/** Copy a story (content and bids — bids are unique per story). Call inside a transaction. */
export function copyStory(doc: YPagilloDocument, storyId: StoryId): StoryId {
	const id = newId()
	const text = new Y.Text()
	doc.tx.set(id, text)
	const src = doc.tx.get(storyId)
	if (src) text.applyDelta(src.toDelta())
	return id
}

/**
 * Add a section with a new story at `index` (default: last). The story starts with one
 * empty paragraph in the `m.styleMap.p` style unless `paras` is given.
 */
export function addSection(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	sec: Omit<StoredSection, 'story'>,
	paras?: SeedParagraph[],
	index: number = doc.secs.length
): SectionId {
	const id = newId()
	yDoc.transact(() => {
		const map = doc.m.get('styleMap') as StyleMap | undefined
		const story = createStory(doc, paras ?? [{ ps: map?.p }])
		doc.s.set(id, { ...sec, story })
		doc.secs.insert(Math.min(index, doc.secs.length), [id])
	}, yDoc.clientID)
	return id
}

/** Shallow patch; a key set to `undefined` is removed (`pageNum`, `maxPages`). */
export function updateSection(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	id: SectionId,
	patch: Partial<Omit<StoredSection, 'story'>>
): void {
	const cur = doc.s.get(id)
	if (!cur) return
	const next: Record<string, unknown> = { ...cur, ...patch }
	for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k]
	yDoc.transact(() => {
		doc.s.set(id, next as StoredSection)
	}, yDoc.clientID)
}

/** Move a section to position `toIndex` in the flow order. */
export function moveSection(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	id: SectionId,
	toIndex: number
): void {
	const from = doc.secs.toArray().indexOf(id)
	if (from < 0) return
	yDoc.transact(() => {
		doc.secs.delete(from, 1)
		doc.secs.insert(Math.max(0, Math.min(toIndex, doc.secs.length)), [id])
	}, yDoc.clientID)
}

/** Delete a section, its story, and the frames anchored to it (with their text stories). */
export function deleteSection(yDoc: Y.Doc, doc: YPagilloDocument, id: SectionId): void {
	const sec = doc.s.get(id)
	yDoc.transact(() => {
		const i = doc.secs.toArray().indexOf(id)
		if (i >= 0) doc.secs.delete(i, 1)
		if (sec) doc.tx.delete(sec.story)
		doc.f.forEach((f, fid) => {
			if (f.anchor.sec !== id) return
			if (f.t === 'txt') doc.tx.delete((f.data as StoredTextFrameData).story)
			doc.f.delete(fid)
		})
		doc.s.delete(id)
	}, yDoc.clientID)
}

/** Duplicate a section after itself: settings, story and anchored frames. */
export function duplicateSection(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	id: SectionId
): SectionId | undefined {
	const sec = doc.s.get(id)
	if (!sec) return undefined
	const copy = newId()
	yDoc.transact(() => {
		doc.s.set(copy, { ...sec, story: copyStory(doc, sec.story) })
		doc.secs.insert(doc.secs.toArray().indexOf(id) + 1, [copy])
		for (const f of [...doc.f.values()]) {
			if (f.anchor.sec !== id) continue
			const data =
				f.t === 'txt'
					? { story: copyStory(doc, (f.data as StoredTextFrameData).story) }
					: f.data
			doc.f.set(newId(), { ...f, anchor: { ...f.anchor, sec: copy }, data })
		}
	}, yDoc.clientID)
	return copy
}

// vim: ts=4
