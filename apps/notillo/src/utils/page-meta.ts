// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * What a page's SEO metadata would say with nothing filled in.
 *
 * The description defaults to the opening of the page's own text and the
 * social image to its first image block, with `desc` and `image` as overrides
 * for the pages that matter. The property panel shows these as placeholders, so
 * an author can see what will be published without typing anything.
 *
 * Derived here from BlockNote blocks, which is what the open page holds; the
 * publisher derives the same description from the compact `NotilloSourceBlock` form
 * (`siteSummary` in `publish/render/serializer.ts`, called from
 * `publish/render/index.ts`). The two walk different shapes and so cannot share an
 * implementation, but they must agree to the character — a placeholder that
 * advertises what will be published is only honest if it is what gets published.
 * `__tests__/page-meta.test.ts` is what pins that.
 */

import type { Block } from '@blocknote/core'
import { getFileUrl, parseSiteFileRef, tAnyValue } from '@cloudillo/core'
import * as T from '@symbion/runtype'

/** Roughly what a search engine shows of a description before cutting it off. */
const MAX_DERIVED_DESCRIPTION = 160

/**
 * Block types the summary steps over. Mirrors `SUMMARY_SKIP` in
 * `publish/render/serializer.ts`, which is what actually publishes the description —
 * this placeholder is only honest if the two agree.
 */
const SUMMARY_SKIP = new Set(['heading', 'codeBlock'])

/**
 * A page's social image as an absolute URL.
 *
 * `image` holds a fileId, and neither consumer can use a relative one: an `og:image`
 * is resolved by a crawler against the site host, which serves no files, and the
 * editor's card preview runs in a sandboxed iframe. Anything already absolute is
 * left alone, so an author can point at an image outside Cloudillo.
 *
 * `variant` and `token` are what the two consumers differ on — the publisher bakes
 * the full-size URL with no token, the editor asks for a thumbnail with the app's.
 */
export function pageImageUrl(
	image: string | null | undefined,
	idTag: string | undefined,
	variant?: string,
	token?: string
): string | undefined {
	if (!image) return undefined
	if (/^https?:\/\//.test(image)) return image
	if (!idTag) return undefined
	return getFileUrl(idTag, image, variant, token ? { token } : undefined)
}

export interface DerivedPageMeta {
	/** The meta description with no `desc` override, or nothing if the page has no text. */
	description?: string
	/** fileId behind the first image block — the derived `og:image`. */
	image?: string
}

/**
 * The three places a BlockNote inline node may keep its text, decoded together.
 *
 * All optional and all read leniently, because this walks *live editor state*, not
 * a stored record: Notillo adds its own inline specs (`Tag`, `WikiLink`) and every
 * plugin is free to add more, so a node this does not recognise must cost nothing
 * beyond its own text.
 */
const tInlineNode = T.struct({
	type: T.optional(T.string),
	text: T.optional(T.string),
	// A link carries its label in `content`; a custom inline (a wiki link) in `props.text`.
	content: T.optional(T.array(tAnyValue)),
	props: T.optional(
		T.struct({
			text: T.optional(T.string),
			// Notillo's own inline specs: `WikiLink.tsx` and `Tag.tsx`. The publisher's
			// `inlineText` (`publish/render/serializer.ts`) reads the same two, and this
			// placeholder is only honest if both walks produce the same characters.
			pageId: T.optional(T.string),
			pageTitle: T.optional(T.string),
			tag: T.optional(T.string)
		})
	)
})
const DECODE_OPTS = { unknownFields: 'drop' } as const

/** Text of one inline run. `resolveTitle` mirrors the publisher's `resolvePageTitle`. */
function inlineText(node: unknown, resolveTitle?: (pageId: string) => string | undefined): string {
	if (typeof node === 'string') return node
	const item = T.decode(tInlineNode, node, DECODE_OPTS)
	if (!T.isOk(item)) return ''
	const props = item.ok.props
	if (item.ok.type === 'wikiLink') {
		// The live title first, exactly as the editor renders it (`WikiLink.tsx:23`) and
		// as the container resolves it — `pageTitle` is a snapshot from insertion time.
		return (props?.pageId ? resolveTitle?.(props.pageId) : undefined) || props?.pageTitle || ''
	}
	if (item.ok.type === 'tag') return props?.tag ? `#${props.tag}` : ''
	if (item.ok.text !== undefined) return item.ok.text
	if (item.ok.content) return item.ok.content.map((n) => inlineText(n, resolveTitle)).join('')
	return props?.text ?? ''
}

/**
 * Text of one block. Its **own** content only, never its children: `siteSummary`
 * takes top-level blocks only, for the reason it states — a nested list item pulled
 * out of its parent reads as a non-sequitur.
 */
function blockText(block: Block, resolveTitle?: (pageId: string) => string | undefined): string {
	// A table's `content` is an object, not an array — it contributes no prose to
	// a description, so only the array form is walked.
	if (!Array.isArray(block.content)) return ''
	return block.content
		.map((node) => inlineText(node, resolveTitle))
		.join('')
		.trim()
}

/** Cut on the last word boundary, with `siteSummary`'s tail rule. */
function truncate(text: string, max: number): string {
	if (text.length <= max) return text
	const cut = text.slice(0, max + 1)
	const space = cut.lastIndexOf(' ')
	const kept = space > 0 ? cut.slice(0, space) : text.slice(0, max)
	return `${kept.replace(/[\s,;:.!?-]+$/, '')}…`
}

export function derivePageMeta(
	blocks: Block[],
	resolveTitle?: (pageId: string) => string | undefined
): DerivedPageMeta {
	const meta: DerivedPageMeta = {}

	let text = ''
	// Enough text to fill the cut. The walk goes on anyway: the first image may
	// still be further down the page.
	let enough = false
	for (const block of blocks) {
		if (!meta.image && block.type === 'image') {
			const url = (block.props as { url?: unknown } | undefined)?.url
			meta.image = parseSiteFileRef(url)?.fileId
		}
		// The image walk covers every top-level block, including the skipped ones:
		// `siteSummary` derives no image, and the first one may sit under a heading.
		if (enough || SUMMARY_SKIP.has(block.type)) continue
		const part = blockText(block, resolveTitle)
		if (!part) continue
		text = text ? `${text} ${part}` : part
		if (text.length > MAX_DERIVED_DESCRIPTION) enough = true
	}

	const description = truncate(text, MAX_DERIVED_DESCRIPTION)
	if (description) meta.description = description
	return meta
}

// vim: ts=4
