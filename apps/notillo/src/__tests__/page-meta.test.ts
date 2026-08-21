// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Two summarisers, one description.
 *
 * `derivePageMeta` walks live BlockNote blocks and feeds the property panel's
 * placeholder; `siteSummary` walks the compact stored form and is what actually
 * publishes. The panel advertises the placeholder as what will be published, so a
 * page opening with an H1 showing one string and publishing another is a lie the
 * author cannot see. Different input shapes, so no shared implementation — the
 * agreement is pinned here instead.
 */

import type { Block } from '@blocknote/core'

import { type NotilloSourceBlock, siteSummary } from '../publish/render/serializer.js'
import { derivePageMeta } from '../utils/page-meta.js'

const HEADING = 'Chapter One'
const PARA_1 =
	'Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho.'
const CODE = 'const answer = 42'
const ITEM = 'Top item'
const NESTED = 'Nested item that must not be pulled out of its parent'
const PARA_2 = 'Second paragraph carries on well past the hundred and sixty character mark.'

/** The same page in editor form: `children` is where the nested list item lives. */
const BLOCKS = [
	{ id: 'b1', type: 'heading', content: [{ type: 'text', text: HEADING }] },
	{ id: 'b2', type: 'paragraph', content: [{ type: 'text', text: PARA_1 }] },
	{ id: 'b3', type: 'codeBlock', content: [{ type: 'text', text: CODE }] },
	{
		id: 'b4',
		type: 'bulletListItem',
		content: [{ type: 'text', text: ITEM }],
		children: [{ id: 'b5', type: 'bulletListItem', content: [{ type: 'text', text: NESTED }] }]
	},
	{ id: 'b6', type: 'paragraph', content: [{ type: 'text', text: PARA_2 }] }
] as unknown as Block[]

/** The same page as stored: `pb` is where the nested list item lives, and `o` orders. */
const SOURCE: NotilloSourceBlock[] = [
	{ id: 'b1', t: 'heading', c: [HEADING], o: 0 },
	{ id: 'b2', t: 'paragraph', c: [PARA_1], o: 1 },
	{ id: 'b3', t: 'codeBlock', c: [CODE], o: 2 },
	{ id: 'b4', t: 'bulletListItem', c: [ITEM], o: 3 },
	{ id: 'b5', t: 'bulletListItem', c: [NESTED], pb: 'b4', o: 4 },
	{ id: 'b6', t: 'paragraph', c: [PARA_2], o: 5 }
]

/** A page a wiki link points at, whose title has been edited since the link was made. */
const LINKED_ID = 'p9'
const LINKED_TITLE = 'Getting started'
const STALE_TITLE = 'Getting startd'
const resolveTitle = (pageId: string) => (pageId === LINKED_ID ? LINKED_TITLE : undefined)

/** `See <wikiLink> about <tag>` in editor form. */
const CUSTOM_BLOCKS = [
	{
		id: 'c1',
		type: 'paragraph',
		content: [
			{ type: 'text', text: 'See ' },
			{ type: 'wikiLink', props: { pageId: LINKED_ID, pageTitle: STALE_TITLE } },
			{ type: 'text', text: ' about ' },
			{ type: 'tag', props: { tag: 'rust' } }
		]
	}
] as unknown as Block[]

/** The same paragraph as stored: `wl`/`wt` for the link, `tg` for the tag. */
const CUSTOM_SOURCE: NotilloSourceBlock[] = [
	{
		id: 'c1',
		t: 'paragraph',
		c: ['See ', { wl: LINKED_ID, wt: STALE_TITLE }, ' about ', { tg: 'rust' }],
		o: 0
	}
]

describe('derivePageMeta and siteSummary', () => {
	it('should derive the same description from the two forms of one page', () => {
		expect(derivePageMeta(BLOCKS).description).toBe(siteSummary(SOURCE))
	})

	it('should agree on wiki links and tags, resolving titles live on both sides', () => {
		// Neither carries its text where a plain run does — a wiki link keeps it in
		// `props.pageTitle` and a tag in `props.tag` — so both used to contribute
		// nothing to the placeholder while publishing their full text.
		const derived = derivePageMeta(CUSTOM_BLOCKS, resolveTitle).description
		expect(derived).toBe(
			siteSummary(CUSTOM_SOURCE, undefined, { resolvePageTitle: resolveTitle })
		)
		expect(derived).toBe(`See ${LINKED_TITLE} about #rust`)
	})

	it('should fall back to the stored wiki-link title when the page is gone', () => {
		expect(derivePageMeta(CUSTOM_BLOCKS).description).toBe(`See ${STALE_TITLE} about #rust`)
	})

	it('should skip the heading, the code block and the nested item', () => {
		const { description } = derivePageMeta(BLOCKS)

		expect(description?.startsWith('Alpha beta')).toBe(true)
		expect(description).not.toContain(HEADING)
		expect(description).not.toContain('const answer')
		expect(description).not.toContain('Nested item')
	})

	it('should cut on a word boundary with no punctuation left before the ellipsis', () => {
		const { description } = derivePageMeta(BLOCKS)

		expect(description?.endsWith('…')).toBe(true)
		expect(description?.slice(-2, -1)).toMatch(/[a-z0-9]/i)
	})
})

// vim: ts=4
