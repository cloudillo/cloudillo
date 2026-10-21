// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Story creation and copying (`tx` map).
 */

import * as Y from 'yjs'
import type { ParagraphProps } from '@cloudillo/typeset'

import { newBlockId } from './block-ids'
import { isObj } from './entities'
import { newId, type StoryId } from './ids'
import {
	type StoredInlineEmbed,
	type StoredLineAttrs,
	type StoredTextFrameData,
	textBox,
	type YPagilloDocument
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

/**
 * Copy a story's content, each paragraph with a fresh bid; its footnote refs point to copies of
 * their bodies. Call inside a transaction.
 */
export function copyStory(doc: YPagilloDocument, storyId: StoryId, notes = true): StoryId {
	const id = newId()
	const text = new Y.Text()
	doc.tx.set(id, text)
	const src = doc.tx.get(storyId)
	if (src)
		text.applyDelta(
			src.toDelta().map((op: { insert: unknown; attributes?: Record<string, unknown> }) => {
				const e = op.insert
				if (typeof e === 'string')
					return op.attributes?.bid
						? { ...op, attributes: { ...op.attributes, bid: newBlockId() } }
						: op
				// Bodies hold no refs: copy them flat.
				return notes && isObj(e) && typeof e.fn === 'string' && doc.tx.has(e.fn)
					? { ...op, insert: { ...e, fn: copyStory(doc, e.fn, false) } }
					: op
			})
		)
	return id
}

/** A copied head drops its chain; a copied follower becomes an empty standalone box. */
export function copyTextData(doc: YPagilloDocument, d: StoredTextFrameData): StoredTextFrameData {
	return { ...textBox(d), story: d.story ? copyStory(doc, d.story) : createStory(doc, [{}]) }
}

// vim: ts=4
