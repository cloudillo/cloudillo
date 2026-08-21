// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The sidebar's search surface: the box, its debounce, the keyboard cursor over
 * the results, and the grouped result list.
 *
 * It owns the tree's slot as well as its own — while nothing is being filtered
 * the results are replaced by the recent-pages list and then by the tree itself,
 * which arrives as `renderTree` rather than as children so the recursion does not
 * run on every keystroke of a search whose results are covering it.
 */

import { Button, LoadingSpinner } from '@cloudillo/react'
import type { RtdbClient } from '@cloudillo/rtdb'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	PiXBold as IcClose,
	PiMagnifyingGlassBold as IcSearch,
	PiHashBold as IcTag
} from 'react-icons/pi'

import { createPage } from '../rtdb/page-ops.js'
import { ROOT_PARENT } from '../rtdb/types.js'
import {
	foldDiacritics,
	foldedHasAllTerms,
	type PageWithId,
	queryTerms,
	type SearchResult
} from '../utils/search.js'
import { SearchResultRow } from './SearchResultRow.js'

const SEARCH_DEBOUNCE_MS = 200
const MAX_TAG_RESULTS = 8

type FlatItem = { kind: 'page'; result: SearchResult } | { kind: 'tag'; tag: string }

/** Identity of a row, stable across result-set rebuilds. */
function itemKey(item: FlatItem): string {
	return item.kind === 'page' ? `p:${item.result.id}` : `t:${item.tag}`
}

export interface PageSearchPanelProps {
	client: RtdbClient
	userId: string
	readOnly: boolean
	pages: Map<string, PageWithId>
	activePageId: string | undefined
	onSelectPage: (pageId: string) => void
	searchQuery: string
	onSearchChange: (query: string) => void
	filteredResults: SearchResult[]
	/** More matches exist than `filteredResults` carries — the count renders as "N+". */
	resultsTruncated: boolean
	isFiltering: boolean
	/** A page-content search is in flight, so a title-only miss is not yet final. */
	contentSearchPending: boolean
	/** The page-content search failed — content hits are missing, not absent. */
	contentSearchError?: Error
	onRetryContentSearch: () => void
	/** Bumped by the parent (Ctrl+K, `/`) to hand focus to the search box. */
	focusSearchSeq: number
	onSearchActivate: () => void
	/** Most recently visited first. */
	recentPageIds: string[]
	tags: Set<string>
	tagCounts: Map<string, number>
	activeTags: Set<string>
	onToggleTag: (tag: string) => void
	onClearTags: () => void
	/** Told when a page created from the search box could not be written. */
	onCreateFailed: () => Promise<void>
	/**
	 * The page tree, shown in the results' place when nothing is being filtered.
	 * A function and not `children`: the tree recursion must not run per keystroke
	 * while the result list is covering it.
	 */
	renderTree: () => React.ReactNode
}

export function PageSearchPanel({
	client,
	userId,
	readOnly,
	pages,
	activePageId,
	onSelectPage,
	searchQuery,
	onSearchChange,
	filteredResults,
	resultsTruncated,
	isFiltering,
	contentSearchPending,
	contentSearchError,
	onRetryContentSearch,
	focusSearchSeq,
	onSearchActivate,
	recentPageIds,
	tags,
	tagCounts,
	activeTags,
	onToggleTag,
	onClearTags,
	onCreateFailed,
	renderTree
}: PageSearchPanelProps) {
	const { t } = useTranslation()

	// ── Search input: debounced so a long wiki isn't re-filtered per keystroke ──

	const [searchInput, setSearchInput] = React.useState(searchQuery)
	const [searchFocused, setSearchFocused] = React.useState(false)
	const searchInputRef = React.useRef<HTMLInputElement>(null)

	// Keep the box in sync when the committed query changes from outside, but never
	// while the input has focus: a keystroke landing between the debounce timer
	// firing and this effect would be overwritten by the older committed query.
	// Every in-app path that changes `searchQuery` with the box focused
	// (`clearSearch`, `selectResult`) sets `searchInput` itself.
	React.useEffect(() => {
		if (searchInputRef.current === document.activeElement) return
		setSearchInput((current) => (current.trim() === searchQuery.trim() ? current : searchQuery))
	}, [searchQuery])

	React.useEffect(() => {
		if (searchInput.trim() === searchQuery.trim()) return
		const timer = setTimeout(() => onSearchChange(searchInput), SEARCH_DEBOUNCE_MS)
		return () => clearTimeout(timer)
	}, [searchInput, searchQuery, onSearchChange])

	React.useEffect(() => {
		if (!focusSearchSeq) return // seq 0 is the initial mount — don't steal focus on load
		// The mobile drawer mounts in the same commit; focus once it is in the DOM.
		const raf = requestAnimationFrame(() => {
			searchInputRef.current?.focus()
			searchInputRef.current?.select()
		})
		return () => cancelAnimationFrame(raf)
	}, [focusSearchSeq])

	const clearSearch = React.useCallback(() => {
		setSearchInput('')
		onSearchChange('')
	}, [onSearchChange])

	// Committing a result returns the sidebar to the tree — `onSelectPage` expands
	// the page's ancestors, which is invisible while the result list is up. Tag
	// filters are a separate, deliberate filter and are left alone.
	const selectResult = React.useCallback(
		(pageId: string) => {
			clearSearch()
			onSelectPage(pageId)
		},
		[clearSearch, onSelectPage]
	)

	// ── Result groups, over one flat index space so the cursor stays meaningful ──

	const titleHits = React.useMemo(
		() => filteredResults.filter((r) => r.kind !== 'content'),
		[filteredResults]
	)
	const contentHits = React.useMemo(
		() => filteredResults.filter((r) => r.kind === 'content'),
		[filteredResults]
	)

	const tagHits = React.useMemo(() => {
		// Terms, not one substring: page search AND-combines whitespace-separated
		// terms, so a tag matching only that way (`proj man` against
		// `project-management`) has to surface here too, or the two halves of the
		// same result list disagree about what the query means.
		const terms = queryTerms(searchQuery)
		if (!terms.length) return []
		// Ranked like `searchPages`: prefix matches first, then alphabetical. Tags
		// arrive in arbitrary order, so without this the few that surface would
		// change from one snapshot to the next.
		const hits: Array<{ tag: string; prefix: boolean }> = []
		for (const tag of tags) {
			const folded = foldDiacritics(tag)
			if (!foldedHasAllTerms(folded, terms)) continue
			hits.push({ tag, prefix: terms.some((term) => folded.startsWith(term)) })
		}
		hits.sort((a, b) => Number(b.prefix) - Number(a.prefix) || a.tag.localeCompare(b.tag))
		return hits.slice(0, MAX_TAG_RESULTS).map((h) => h.tag)
	}, [searchQuery, tags])

	// Recent pages stand in for the tree while the search box is focused and there
	// is nothing to filter by yet. The open page is skipped: it is always its own
	// most recent entry, and already highlighted in the tree.
	const recentPages = React.useMemo(() => {
		if (searchQuery.trim() || activeTags.size > 0) return []
		const list: PageWithId[] = []
		for (const id of recentPageIds) {
			if (id === activePageId) continue
			const page = pages.get(id)
			if (page) list.push(page)
		}
		return list
	}, [recentPageIds, pages, searchQuery, activeTags, activePageId])

	const recentItems = React.useMemo<Array<Extract<FlatItem, { kind: 'page' }>>>(
		() =>
			recentPages.map((page) => ({
				kind: 'page' as const,
				result: {
					id: page.id,
					title: page.title,
					icon: page.icon,
					tags: page.tags,
					kind: 'title' as const,
					path: []
				}
			})),
		[recentPages]
	)

	/** Pages first, then content hits, then tags — the order they are rendered in.
	 *  With no filter, the recent list takes the same index space so the arrow keys
	 *  work there too. */
	const flatItems = React.useMemo<FlatItem[]>(
		() =>
			isFiltering
				? [
						...titleHits.map((result) => ({ kind: 'page' as const, result })),
						...contentHits.map((result) => ({ kind: 'page' as const, result })),
						...tagHits.map((tag) => ({ kind: 'tag' as const, tag }))
					]
				: recentItems,
		[isFiltering, titleHits, contentHits, tagHits, recentItems]
	)

	// Everything the list renders — page hits *and* tag hits. Counting only
	// `filteredResults` would report "1 result" over a list of nine. The tag list's
	// own `MAX_TAG_RESULTS` cap is a separate, minor truncation, not worth widening
	// `resultsTruncated` for.
	const resultCount = filteredResults.length + tagHits.length

	// The listbox `aria-controls` names only exists in these two states.
	const listboxRendered = isFiltering
		? flatItems.length > 0
		: searchFocused && recentItems.length > 0

	// The keyboard cursor is stored as a row key, not an index: the result arrays
	// are rebuilt whenever a page doc changes or a content search lands, and an
	// index-based cursor would be reset out from under an arrow-key navigation
	// every time. A key no longer in the list resolves to -1.
	const [cursorKey, setCursorKey] = React.useState<string | null>(null)
	// Hovering must not scroll the list — only the keyboard moves the viewport.
	const [cursorSource, setCursorSource] = React.useState<'keyboard' | 'pointer'>('keyboard')

	const resultCursor = React.useMemo(
		() =>
			cursorKey === null ? -1 : flatItems.findIndex((item) => itemKey(item) === cursorKey),
		[cursorKey, flatItems]
	)

	// Reset only when the user changes what they are looking for.
	React.useEffect(() => {
		setCursorKey(null)
		setCursorSource('keyboard')
	}, [searchQuery, activeTags])

	const runItem = React.useCallback(
		(item: FlatItem) => {
			if (item.kind === 'page') selectResult(item.result.id)
			else onToggleTag(item.tag)
		},
		[selectResult, onToggleTag]
	)

	const handleSearchKeyDown = React.useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === 'Escape') {
				clearSearch()
				e.currentTarget.blur()
			} else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				if (!flatItems.length) return
				e.preventDefault()
				const delta = e.key === 'ArrowDown' ? 1 : -1
				const next = resultCursor + delta
				const wrapped = next < 0 ? flatItems.length - 1 : next % flatItems.length
				setCursorSource('keyboard')
				setCursorKey(itemKey(flatItems[wrapped]))
			} else if (e.key === 'Enter') {
				// Falling back to the first row is only right while filtering, where
				// it is the best match for what was typed. With nothing typed the
				// list is *recent pages*, and a bare Enter would teleport the user
				// to whichever page they last visited.
				const item = flatItems[resultCursor] ?? (isFiltering ? flatItems[0] : undefined)
				if (item) {
					e.preventDefault()
					runItem(item)
				}
			}
		},
		[clearSearch, flatItems, isFiltering, resultCursor, runItem]
	)

	const activeTagList = React.useMemo(() => Array.from(activeTags), [activeTags])

	/** `idx` is the position in the flat index space shared by every result group. */
	function renderResult(item: Extract<FlatItem, { kind: 'page' }>, idx: number, key: string) {
		const { result } = item
		return (
			<SearchResultRow
				key={key}
				id={`notillo-sidebar-result-${idx}`}
				result={result}
				active={idx === resultCursor}
				scrollIntoView={idx === resultCursor && cursorSource === 'keyboard'}
				selected={result.id === activePageId}
				onSelect={() => selectResult(result.id)}
				onPointerEnter={() => {
					setCursorSource('pointer')
					setCursorKey(itemKey(item))
				}}
			/>
		)
	}

	return (
		<div className="c-vbox fill">
			<div className="px-3 py-1" role="search">
				<div className="c-input-group">
					<IcSearch className="c-input-icon" />
					<input
						ref={searchInputRef}
						className="c-input notillo-search-input"
						type="search"
						role="combobox"
						aria-autocomplete="list"
						aria-expanded={listboxRendered}
						aria-controls={listboxRendered ? 'notillo-sidebar-results' : undefined}
						// Gated on the listbox: the recent-pages list only renders while
						// the box has focus, so arrowing through it and then blurring
						// would leave this pointing at an id no longer in the DOM.
						aria-activedescendant={
							listboxRendered && resultCursor >= 0
								? `notillo-sidebar-result-${resultCursor}`
								: undefined
						}
						aria-label={t('Search pages')}
						placeholder={t('Search pages...')}
						value={searchInput}
						onChange={(e) => setSearchInput(e.target.value)}
						onFocus={() => {
							setSearchFocused(true)
							onSearchActivate()
						}}
						onBlur={() => setSearchFocused(false)}
						onKeyDown={handleSearchKeyDown}
					/>
					{searchInput && (
						<button
							className="c-input-clear"
							type="button"
							onClick={clearSearch}
							title={t('Clear search')}
						>
							<IcClose />
						</button>
					)}
				</div>
			</div>
			<div className="fill overflow-y-auto py-2">
				{isFiltering ? (
					<div className="px-3">
						<div className="c-hbox align-items-center g-2 mb-2 flex-wrap">
							{activeTagList.map((tag) => (
								<button
									key={tag}
									type="button"
									className="c-tag accent notillo-tag-chip"
									onClick={() => onToggleTag(tag)}
									title={t('Remove tag filter')}
								>
									# {tag}
									<IcClose />
								</button>
							))}
							{activeTagList.length > 1 && (
								<button
									className="tag-clear-btn"
									type="button"
									onClick={onClearTags}
									title={t('Clear all tag filters')}
								>
									{t('Clear all')}
								</button>
							)}
							<span className="text-muted text-xs flex-fill text-right">
								{resultsTruncated
									? t('{{count}}+ results', { count: resultCount })
									: resultCount === 1
										? t('{{count}} result', { count: resultCount })
										: t('{{count}} results', { count: resultCount })}
							</span>
						</div>
						{/* Outside the empty branch on purpose: with two title
						    matches on screen the result set looks complete, and
						    nothing would say that page content matched nothing
						    because the request failed. Sole retry control. */}
						{contentSearchError && (
							<div className="c-vbox g-1">
								<div className="text-muted text-sm">
									{t('Page content search is unavailable.')}
								</div>
								<Button kind="link" size="small" onClick={onRetryContentSearch}>
									{t('Try again')}
								</Button>
							</div>
						)}
						{/* Outside the empty branch for the same reason: a title match
						    makes the list look final for ~450ms (input debounce +
						    QUERY_DEBOUNCE_MS + RTT) before it silently grows an
						    "In page content" group. */}
						{!contentSearchError && contentSearchPending && (
							<div
								className="c-hbox align-items-center g-2 text-muted text-sm"
								data-testid="content-search-pending"
							>
								<LoadingSpinner size="sm" />
								{t('Searching page content…')}
							</div>
						)}
						{flatItems.length === 0 ? (
							<div className="c-vbox g-1">
								{/* Empty *and still searching* is not "no results" — the
								    spinner above already says so. */}
								{!contentSearchPending && !contentSearchError && (
									<div className="text-muted text-sm" data-testid="no-results">
										{t(
											'No matching pages. Check the spelling or try fewer words.'
										)}
									</div>
								)}
								{activeTags.size > 0 && (
									<Button kind="link" size="small" onClick={onClearTags}>
										{t('Clear tag filter')}
									</Button>
								)}
								{!readOnly && searchQuery.trim() && (
									<Button
										kind="link"
										size="small"
										onClick={async () => {
											try {
												const id = await createPage(
													client,
													userId,
													searchQuery.trim(),
													ROOT_PARENT
												)
												clearSearch()
												onSelectPage(id)
											} catch (err) {
												console.error('[Notillo] Create page failed:', err)
												await onCreateFailed()
											}
										}}
									>
										{t('Create page "{{search}}"', {
											search: searchQuery.trim()
										})}
									</Button>
								)}
							</div>
						) : (
							/* Swallowing mousedown keeps focus in the search box, so
							   clicking a row never races the input's blur (and works in
							   Safari, where clicking a button doesn't focus it). Never
							   put this on the input — it needs mousedown for the caret. */
							<div
								id="notillo-sidebar-results"
								role="listbox"
								onMouseDown={(e) => e.preventDefault()}
							>
								{titleHits.length > 0 && (
									<div className="notillo-search-group">
										<div
											className="notillo-search-group-title"
											id="notillo-search-group-pages"
										>
											{t('Pages')}
										</div>
										{/* A `group` inside a listbox may only hold
										    options, so the heading stays outside it. */}
										<div
											role="group"
											aria-labelledby="notillo-search-group-pages"
										>
											{titleHits.map((result, i) =>
												renderResult(
													{ kind: 'page', result },
													i,
													`title:${result.id}`
												)
											)}
										</div>
									</div>
								)}
								{contentHits.length > 0 && (
									<div className="notillo-search-group">
										<div
											className="notillo-search-group-title"
											id="notillo-search-group-content"
										>
											{t('In page content')}
										</div>
										<div
											role="group"
											aria-labelledby="notillo-search-group-content"
										>
											{contentHits.map((result, i) =>
												renderResult(
													{ kind: 'page', result },
													titleHits.length + i,
													`content:${result.id}`
												)
											)}
										</div>
									</div>
								)}
								{tagHits.length > 0 && (
									<div className="notillo-search-group">
										<div
											className="notillo-search-group-title"
											id="notillo-search-group-tags"
										>
											{t('Tags')}
										</div>
										<div
											role="group"
											aria-labelledby="notillo-search-group-tags"
										>
											{tagHits.map((tag, i) => {
												const idx =
													titleHits.length + contentHits.length + i
												// Tags share the flat cursor index space
												// with the page hits, so they reuse
												// `SearchResultRow`: without its
												// scroll-into-view the keyboard cursor
												// vanishes off the bottom of a long list.
												return (
													<SearchResultRow
														key={`tag:${tag}`}
														id={`notillo-sidebar-result-${idx}`}
														result={{
															id: tag,
															title: `#${tag}`,
															kind: 'title',
															path: []
														}}
														active={idx === resultCursor}
														scrollIntoView={
															idx === resultCursor &&
															cursorSource === 'keyboard'
														}
														iconNode={<IcTag />}
														trailing={
															<>
																<span className="c-badge xs">
																	{tagCounts.get(tag) ?? 0}
																</span>
																{activeTags.has(tag) && (
																	<span className="c-badge dot primary" />
																)}
															</>
														}
														onSelect={() => onToggleTag(tag)}
														onPointerEnter={() => {
															setCursorSource('pointer')
															setCursorKey(`t:${tag}`)
														}}
													/>
												)
											})}
										</div>
									</div>
								)}
							</div>
						)}
					</div>
				) : (
					<>
						{searchFocused && recentItems.length > 0 && (
							<div className="px-3 pb-2 mb-1">
								<div className="notillo-search-group-title">
									{t('Recent pages')}
								</div>
								<div
									id="notillo-sidebar-results"
									role="listbox"
									aria-label={t('Recent pages')}
									onMouseDown={(e) => e.preventDefault()}
								>
									{recentItems.map((item, i) =>
										renderResult(item, i, `recent:${item.result.id}`)
									)}
								</div>
							</div>
						)}
						{renderTree()}
					</>
				)}
			</div>
		</div>
	)
}

// vim: ts=4
