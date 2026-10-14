// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Section operations (`secs` order + `s` map).
 */

import type * as Y from 'yjs'

import { framesOf, newFrameMap, newSectionMap, patchSection, sectionOf } from './entities'
import { deleteFrame } from './frame-ops'
import { newId, type SectionId } from './ids'
import type { StoredSection, StoredTextFrameData, YPagilloDocument } from './stored-types'
import { copyStory, copyTextData, createStory, type SeedParagraph } from './story-ops'
import { readMeta } from './type-converters'

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
		const story = createStory(doc, paras ?? [{ ps: readMeta(doc.m).styleMap?.p }])
		doc.s.set(id, newSectionMap({ ...sec, story }))
		doc.secs.insert(Math.min(index, doc.secs.length), [id])
	}, yDoc.clientID)
	return id
}

/** Patch; a key set to `undefined` is removed (`pageNum`, `maxPages`). */
export function updateSection(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	id: SectionId,
	patch: Partial<Omit<StoredSection, 'story'>>
): void {
	const y = doc.s.get(id)
	if (!y) return
	yDoc.transact(() => {
		patchSection(y, patch)
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

/**
 * Delete a section, its story, and the frames anchored to it (`deleteFrame`: a thread running on
 * into another section keeps its text).
 */
export function deleteSection(yDoc: Y.Doc, doc: YPagilloDocument, id: SectionId): void {
	const sec = sectionOf(doc, id)
	yDoc.transact(() => {
		const i = doc.secs.toArray().indexOf(id)
		if (i >= 0) doc.secs.delete(i, 1)
		if (sec) doc.tx.delete(sec.story)
		for (const [fid, f] of framesOf(doc))
			if ('sec' in f.anchor && f.anchor.sec === id) deleteFrame(yDoc, doc, fid)
		doc.s.delete(id)
	}, yDoc.clientID)
}

/** Duplicate a section after itself: settings, story and anchored frames. */
export function duplicateSection(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	id: SectionId
): SectionId | undefined {
	const sec = sectionOf(doc, id)
	if (!sec) return undefined
	const copy = newId()
	yDoc.transact(() => {
		doc.s.set(copy, newSectionMap({ ...sec, story: copyStory(doc, sec.story) }))
		doc.secs.insert(doc.secs.toArray().indexOf(id) + 1, [copy])
		for (const [, f] of framesOf(doc)) {
			if (!('sec' in f.anchor) || f.anchor.sec !== id) continue
			const data = f.t === 'txt' ? copyTextData(doc, f.data as StoredTextFrameData) : f.data
			doc.f.set(newId(), newFrameMap({ ...f, anchor: { ...f.anchor, sec: copy }, data }))
		}
	}, yDoc.clientID)
	return copy
}

// vim: ts=4
