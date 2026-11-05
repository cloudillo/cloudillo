// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Markdown import: `marked` → `htmlToDelta` → `pasteDelta`. Main thread only (`DOMParser`); the
 * HTML never reaches the live DOM.
 */

import { stripFrontMatter } from '@cloudillo/core'
import { marked } from 'marked'
import type * as Y from 'yjs'

import { setMeta } from '../crdt/document'
import { sectionOf, styleOf } from '../crdt/entities'
import { addSection } from '../crdt/section-ops'
import type { StyleMapKey, YPagilloDocument } from '../crdt/stored-types'
import { addStyle } from '../crdt/style-ops'
import { cellOf, type DeltaOp, readMeta } from '../crdt/type-converters'
import { TEMPLATE_ORIGIN } from '../templates'
import { htmlToDelta, pasteDelta } from './clipboard'

export const CODE_FONT = 'JetBrains Mono'

export interface ParsedMarkdown {
	html: string
	/** Images replaced by `imageLabel` text. */
	images: number
	/** Has a code block, so it needs the Code style. */
	code: boolean
}

/**
 * Markdown → HTML for `markdownOps`. Every `<img>` (raw HTML too) becomes `imageLabel(alt)` text,
 * and H4–H6 become H3 unless `m.styleMap` has that level.
 */
export function parseMarkdown(
	doc: YPagilloDocument,
	md: string,
	imageLabel: (alt: string) => string
): ParsedMarkdown {
	const html = marked.parse(stripFrontMatter(md), { async: false }) as string
	const dom = new DOMParser().parseFromString(html, 'text/html')
	const images = dom.querySelectorAll('img')
	for (const img of images) img.replaceWith(imageLabel(img.getAttribute('alt') ?? ''))
	// `marked` writes `<li>b<ul>\n<li>`: that newline would become a trailing space on `b`.
	for (const list of dom.querySelectorAll('li > ul, li > ol')) {
		if (list.firstChild?.nodeValue?.trim() === '') list.firstChild.remove()
	}
	const map = readMeta(doc.m).styleMap
	for (const h of dom.querySelectorAll('h4, h5, h6')) {
		if (map[h.tagName.toLowerCase() as StyleMapKey]) continue
		const h3 = dom.createElement('h3')
		h3.append(...h.childNodes)
		h.replaceWith(h3)
	}
	return { html: dom.body.innerHTML, images: images.length, code: !!dom.querySelector('pre') }
}

/**
 * The story ops of `parsed`, creating the Code style first if it needs one (`m` is outside the
 * undo scope, so an undo can leave `styleMap.code` naming a removed style). Call inside a
 * transaction.
 */
export function markdownOps(yDoc: Y.Doc, doc: YPagilloDocument, parsed: ParsedMarkdown): DeltaOp[] {
	const map = readMeta(doc.m).styleMap
	if (parsed.code && !(map.code && styleOf(doc, map.code))) {
		const code = addStyle(yDoc, doc, {
			k: 'p',
			name: 'Code',
			basedOn: map.p,
			props: {
				font: CODE_FONT,
				align: 'left',
				hyphenate: false,
				spaceAfter: 0,
				keepTogether: false
			}
		})
		setMeta(yDoc, doc, { styleMap: { code } })
	}
	return htmlToDelta(doc, parsed.html, { codeFont: CODE_FONT, lineBreak: true })
}

/** Replace all of `t` with `ops`; a story must end in a paragraph end. Call inside a transaction. */
export function fillStory(doc: YPagilloDocument, t: Y.Text, ops: DeltaOp[]): void {
	t.delete(0, t.length)
	pasteDelta(doc, t, 0, ops)
	// A table's last cell line ends in `\n` too, but a story cannot end inside a table.
	const end = t.toDelta().at(-1)
	if (!t.toString().endsWith('\n') || cellOf(end?.attributes) !== undefined) {
		const ps = readMeta(doc.m).styleMap.p
		pasteDelta(doc, t, t.length, [{ insert: '\n', attributes: { ps } }])
	}
}

/** New section at `index` holding `parsed`, with `like`'s page setup. One undo step. */
export function addMarkdownSection(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	parsed: ParsedMarkdown,
	like: string,
	index: number
) {
	const s = sectionOf(doc, like)
	if (!s) return
	return yDoc.transact(() => {
		const ops = markdownOps(yDoc, doc, parsed)
		const sec = { first: s.first, rest: s.rest, start: s.start }
		const id = addSection(yDoc, doc, sec, undefined, index)
		const story = sectionOf(doc, id)?.story
		const t = story ? doc.tx.get(story) : undefined
		if (!story || !t) return
		fillStory(doc, t, ops)
		return { id, story }
	}, yDoc.clientID)
}

/**
 * Replace the first section's story with `parsed`, not undoable (like applying a template, which
 * this follows). Empty Markdown keeps the story. False only if there is no such story.
 */
export function fillFirstSection(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	parsed: ParsedMarkdown
): boolean {
	const story = sectionOf(doc, doc.secs.get(0))?.story
	const t = story ? doc.tx.get(story) : undefined
	if (!t) return false
	yDoc.transact(() => {
		const ops = markdownOps(yDoc, doc, parsed)
		if (ops.length) fillStory(doc, t, ops)
	}, TEMPLATE_ORIGIN)
	return true
}
