// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The `index` block: a page listing, anywhere in the block stream.
 *
 * **Archetypes frame, blocks fill.** A listing used to be the `index` *archetype* —
 * a page property, so it could only ever appear once, after the body, and only on a
 * published site. As a block it renders live here and bakes statically into the
 * container (`publish/render/serializer.ts`), as many times per page as the author
 * wants, at whatever point in the page they want it.
 *
 * One block type with props rather than four block types: "children of this page" and
 * "everything tagged X" is a knob the author flips in place, and a second block type
 * would cost a serializer case, an editor registration and its own forward-compat
 * handling to say the same thing.
 *
 * The rows come from `selectListing` (`publish/listing.ts`) — the *same* function
 * the publisher calls, over an adapter of the live page map. That is what keeps the
 * arrangement an author sees here and the one that publishes from drifting apart.
 *
 * **The query's knobs are not in the block.** They are the floating formatting
 * toolbar (`IndexToolbar.tsx`), which shows them inline — no gear, no popover — while
 * a single `index` block is selected. There is nothing to share the bar with: every
 * stock item hides itself for a `content: 'none'` block, so without these the toolbar
 * is empty over a listing and `.bn-toolbar:empty` hides it. Putting them back inline
 * would mean a control panel above every listing forever, and interactive controls
 * inside ProseMirror's `contentEditable`. All that stays here is a muted summary line
 * naming the current query, so a listing is identifiable without selecting it.
 *
 * Two deliberate differences from the published listing:
 *
 * - **Drafts are shown**, with a marker. They are what the author is working on, and
 *   the publisher selects over `tree.pages`, which is already draft-free.
 * - **Dates are `pubAt` only.** The page map is loaded with a field projection that
 *   leaves `ua`/`ca` out on purpose (see `hooks/useAllPages.ts`: selecting `ua` would
 *   make every page mutation re-deliver the whole map), where the published listing
 *   sorts by the full `listingDate`. An unpublished page therefore falls back to its
 *   sidebar order in a date sort here, and not on the site. They are also formatted in
 *   the reader's language here, where a published row prints the ISO head: `renderDate`
 *   (`publish/render/archetypes.ts`) has no i18n context and its output is frozen into a
 *   container, so the site gets `<time datetime>` plus a stylesheet and the editor gets
 *   `Intl`.
 */

import { createReactBlockSpec } from '@blocknote/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { RiListUnordered } from 'react-icons/ri'

import { selectListing, siteListingQuery } from '../publish/listing.js'
import { isoDatePart } from '../publish/render/archetypes.js'
import { pageImageUrl } from '../utils/page-meta.js'
import { listingSummary } from './index-labels.js'
import { useNotilloEditor } from './NotilloEditorContext.js'

/**
 * The ISO head as a *local* `Date`, built field by field.
 *
 * `new Date('2026-08-19')` is parsed as UTC midnight, which formats as the 18th
 * anywhere west of Greenwich — the editor would then date a row one day before the
 * page it publishes.
 */
function localDate(iso: string): Date | undefined {
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
	if (!m) return undefined
	return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export const PageIndex = createReactBlockSpec(
	{
		type: 'index' as const,
		content: 'none' as const,
		// **No default may be the string `'default'`**: `cleanProps`
		// (`rtdb/transform.ts`) silently drops any prop holding that literal on write,
		// so such a prop would appear to save and come back as its default.
		propSchema: {
			source: { default: 'children' },
			tag: { default: '' },
			root: { default: '' },
			depth: { default: 0 },
			sort: { default: 'date-desc' },
			layout: { default: 'list' },
			limit: { default: 0 },
			feed: { default: false }
		}
	},
	{
		render: (props) => {
			const { t, i18n } = useTranslation()
			const { pages, listingPages, pageId, ownerTag, token } = useNotilloEditor()
			const blockProps = props.block.props
			const isEditable = props.editor.isEditable

			// Decoded through the same parser the publisher uses, so an unknown or
			// malformed prop falls back to the same value on both sides.
			//
			// Depends on the *scalar* props, not on `blockProps`: BlockNote's node
			// view rebuilds the block through `nodeToBlock` on every render, so
			// `props.block.props` is a fresh object each time and a `[blockProps]`
			// dependency never matched — which invalidated `rows` below, and that
			// walks the whole page set. Renders fire on selection and decoration
			// changes (notillo adds lock, comment and presence plugins), not only on
			// a prop write.
			const query = React.useMemo(
				() => siteListingQuery({ ...blockProps }),
				[
					blockProps.source,
					blockProps.tag,
					blockProps.root,
					blockProps.depth,
					blockProps.sort,
					blockProps.layout,
					blockProps.limit,
					blockProps.feed
				]
			)

			// `listingPages` is the editor context's one adapter array, shared by
			// every `index` block — see `NotilloEditor`. `selectListing` memoizes its
			// index on that array's identity, so K blocks build it once between them.
			const rows = React.useMemo(
				() => selectListing(listingPages, query, pageId),
				[listingPages, query, pageId]
			)

			/** A listed page's social image as a thumbnail URL, for the `cards` preview. */
			const cardImage = React.useCallback(
				(image: string | null | undefined) =>
					pageImageUrl(image, ownerTag, 'vis.sd', token),
				[ownerTag, token]
			)

			/**
			 * Dates as the reader's language writes them. `i18n.language` is the language
			 * the shell handed the app (`hooks/useNotillo.ts` calls `changeLanguage` off
			 * the app-bus init state), and `|| undefined` covers the tick before that
			 * lands — `Intl` throws a `RangeError` on an empty tag.
			 */
			const dateFormat = React.useMemo(
				() => new Intl.DateTimeFormat(i18n.language || undefined, { dateStyle: 'medium' }),
				[i18n.language]
			)

			// What each layout shows, matching what it publishes: `list` is the full
			// row (title, date, description, tags), `cards` the same minus the tags
			// and with a hero image above the title, `compact` a single line of
			// title + date, and `tree` titles alone, indented by depth.
			const isList = query.layout === 'list'
			const isCompact = query.layout === 'compact'
			const isTree = query.layout === 'tree'
			const isCards = query.layout === 'cards'

			// A muted, non-interactive one-liner naming the query, so a listing is
			// identifiable as an index block without selecting it. A reader has no
			// settings to relate it to, so it is editor-only.
			const summary = isEditable ? (
				<div className="notillo-index-summary" contentEditable={false}>
					<RiListUnordered size={14} />
					<span>{listingSummary(query, t)}</span>
				</div>
			) : null

			return (
				<div
					className={`notillo-index${rows.length ? '' : ' notillo-index--empty'}`}
					data-layout={query.layout}
				>
					{summary}
					{rows.length ? (
						<ul className="notillo-index-rows" contentEditable={false}>
							{rows.map((row) => {
								const page = pages.get(row.pageId)
								const date = isoDatePart(row.date)
								const day = date ? localDate(date) : undefined
								const dateText = day ? dateFormat.format(day) : date
								const rowTags = row.tags ?? []
								return (
									<li
										key={row.pageId}
										className="notillo-index-row"
										// Only `tree` indents, and only under a `subtree`
										// source: `selectListing` annotates `depth` there
										// and nowhere else (`publish/listing.ts`
										// `collectSubtree`), which is exactly how it
										// publishes.
										style={
											isTree
												? {
														marginInlineStart: `${(row.depth ?? 0) * 1.25}rem`
													}
												: undefined
										}
									>
										{isCards && cardImage(page?.image) && (
											<img
												className="notillo-index-image"
												src={cardImage(page?.image)}
												alt=""
												loading="lazy"
											/>
										)}
										<div className="notillo-index-head">
											<span
												className="notillo-index-link"
												data-page-id={row.pageId}
											>
												{row.title || t('Untitled')}
											</span>
											{page?.draft === true && (
												<span className="notillo-index-draft">
													{t('Draft')}
												</span>
											)}
											{isCompact && date && (
												<time
													className="notillo-index-date"
													dateTime={row.date}
												>
													{dateText}
												</time>
											)}
										</div>
										{(isList || isCards) && date && (
											<time
												className="notillo-index-date"
												dateTime={row.date}
											>
												{dateText}
											</time>
										)}
										{(isList || isCards) && page?.desc && (
											<div className="notillo-index-desc">{page.desc}</div>
										)}
										{isList && rowTags.length > 0 && (
											<ul className="notillo-index-tags">
												{rowTags.map((tag) => (
													<li key={tag} className="notillo-index-tag">
														{tag}
													</li>
												))}
											</ul>
										)}
									</li>
								)
							})}
						</ul>
					) : (
						// Bordered rather than nothing at all: an empty block still has
						// to be selectable and deletable.
						<div className="notillo-index-notice" contentEditable={false}>
							{t('Nothing to list yet')}
						</div>
					)}
				</div>
			)
		}
	}
)()

// vim: ts=4
