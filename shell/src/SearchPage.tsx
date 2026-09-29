// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `/:contextIdTag/search` — the full results surface behind the omnibox dropdown.
 *
 * Query and filters live in the URL query string (`q`, `type`), the space being
 * searched lives in the path, so results are linkable and Back/Forward works:
 * reloading or sharing the link searches the space the search was run in rather than
 * resetting to the home context. `~` is home, as on every context-aware route; the
 * context segment drives `CtxProvider`, which `useContextAwareApi` below then follows.
 */

import {
	Button,
	EmptyState,
	HBox,
	List,
	LoadMoreTrigger,
	PageHeader,
	SearchInput,
	SkeletonList,
	Tab,
	Tabs,
	Text,
	useAuth,
	useDebouncedValue,
	useInfiniteScroll,
	VBox
} from '@cloudillo/react'
import type { SearchHit } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuSearch as IcSearch } from 'react-icons/lu'
import { useSearchParams } from 'react-router-dom'

import { useContextAwareApi, useCtx, useCurrentContextIdTag } from './context/index.js'
import { getPartAddressing } from './manifest-registry.js'
import { SearchResultRow } from './SearchResultRow.js'
import {
	FTS_DEBOUNCE_MS,
	FTS_GUEST_TYPES,
	FTS_MAX_LIMIT,
	FTS_MAX_OFFSET,
	FTS_MAX_QUERY,
	FTS_PAGE_SIZE,
	FTS_TYPES
} from './search-constants.js'
import { searchHitTarget } from './search-target.js'
import { useAppConfig } from './utils.js'

export function SearchPage() {
	const { t } = useTranslation()
	const [params, setParams] = useSearchParams()
	const [auth] = useAuth()
	const { api } = useContextAwareApi()
	const [appConfig] = useAppConfig()
	// The space the search runs against. `activeContextAtom` catches up to it
	// asynchronously, so on a fresh load of a shared `/@<community>/search?q=…` link `api`
	// still points at home for a render or two and searching then would hit the wrong
	// tenant — hence the `contextReady` gate below.
	const ctx = useCtx()
	// The *active* context, deliberately not `ctx.idTag`: it is the key `api` above is
	// bound to, and the resId's owner half has to match the client that will be asked.
	const contextIdTag = useCurrentContextIdTag()

	const q = (params.get('q') ?? '').slice(0, FTS_MAX_QUERY)
	// Only names the caller may actually search — a guest gets no `'profile'`.
	const allowed: readonly string[] = auth ? FTS_TYPES : FTS_GUEST_TYPES
	const requested = (params.get('type') ?? '').split(',').filter(Boolean)
	const selected = requested.filter((x) => allowed.includes(x))
	// What the tabs highlight; `''` is "All".
	const tabValue = selected.join(',')
	// What goes on the wire: "All" for a guest still names the three guest types,
	// because an absent `type` means every type including profiles.
	const type = tabValue || (auth ? '' : FTS_GUEST_TYPES.join(','))
	// An explicit filter naming nothing the caller may see is "match nothing", not
	// "match everything" — the rule the server applies to `?type=quantum`. Without it
	// a guest's `?type=profile` would fall back to the whole guest set.
	const typeMatchesNothing = requested.length > 0 && selected.length === 0

	// The input is local and pushed to the URL on a debounce, so typing doesn't spam
	// history entries or requests.
	const [input, setInput] = React.useState(q)
	const debouncedInput = useDebouncedValue(input, FTS_DEBOUNCE_MS)

	// Adopt an externally-changed `q` (Back/Forward, or arriving from the omnibox).
	const lastUrlQ = React.useRef(q)
	React.useEffect(() => {
		if (q !== lastUrlQ.current) {
			lastUrlQ.current = q
			setInput(q)
		}
	}, [q])

	React.useEffect(() => {
		if (debouncedInput === q) return
		lastUrlQ.current = debouncedInput
		const next = new URLSearchParams(params)
		if (debouncedInput) next.set('q', debouncedInput)
		else next.delete('q')
		setParams(next, { replace: true })
		// Deliberately keyed on the debounced value alone: `params`/`setParams` are
		// recreated on every render, and including them would loop.
	}, [debouncedInput])

	const [total, setTotal] = React.useState<number | undefined>(undefined)
	// Bumped whenever the result set is replaced, so a first page landing after the
	// query moved on cannot write its count. `useInfiniteScroll` clears its in-flight
	// flag synchronously on a deps change, so two fetches really can overlap.
	const totalEpoch = React.useRef(0)
	React.useEffect(() => {
		totalEpoch.current++
		// Without this a failed search renders the *previous* query's count over an
		// empty list — the error branch below is not the "no results" branch.
		setTotal(undefined)
		// `contextIdTag` too: switching context with the query unchanged replaces the
		// result set, so the old tenant's count must not stay on screen.
	}, [q, type, contextIdTag])

	// A guest never gets an `activeContext` (`CtxProvider`'s switch effect returns early
	// without auth), so the wait below would never end on a shared `/@<community>/search`
	// link. Nothing to wait for: they cannot search another space at all.
	const foreignForGuest = !auth && !ctx.isHome
	// True while the active context is still catching up to the route's. No fetch is
	// permitted yet, so `isLoading` is false and the render chain below would otherwise
	// reach "No results found" before the first request was allowed out. Not for a guest —
	// the active context never lands for them and `forbidden` is the right surface. The
	// sibling window (fetch permitted, but `useInfiniteScroll` schedules it a commit later)
	// is what `isPending` covers.
	const contextReady = !ctx.idTag || contextIdTag === ctx.idTag
	const contextResolving = !contextReady && !foreignForGuest
	const enabled = !!api && !!q && !typeMatchesNothing && !foreignForGuest && contextReady

	const fetchPage = React.useCallback(
		async (cursor: string | null, limit: number, signal?: AbortSignal) => {
			const epoch = totalEpoch.current
			if (!api || !q) return { items: [] as SearchHit[], nextCursor: null, hasMore: false }
			const offset = cursor ? Number(cursor) : 0
			if (offset > FTS_MAX_OFFSET) {
				return { items: [] as SearchHit[], nextCursor: null, hasMore: false }
			}
			const res = await api.search.queryPaginated(
				{
					q,
					// Never `''` — the query serialiser keeps empty strings, and an
					// empty `type` means "match nothing" to the server.
					type: type || undefined,
					limit: Math.min(limit, FTS_MAX_LIMIT),
					offset
				},
				{ signal }
			)
			const next = offset + res.data.length
			if (offset === 0 && epoch === totalEpoch.current) setTotal(res.pagination?.total)
			return {
				items: res.data,
				nextCursor: String(next),
				hasMore:
					res.data.length > 0 &&
					next < (res.pagination?.total ?? next) &&
					next <= FTS_MAX_OFFSET
			}
		},
		[api, q, type]
	)

	const {
		items,
		isLoading,
		isPending,
		isLoadingMore,
		error,
		hasMore,
		loadMore,
		reset,
		sentinelRef
	} = useInfiniteScroll<SearchHit>({
		fetchPage,
		pageSize: FTS_PAGE_SIZE,
		// `contextIdTag` is in the reset key, not just in `fetchPage`'s closure:
		// `useInfiniteScroll` only resets on a deps change and its initial-load effect
		// is guarded by `items.length === 0`, so a context switch with `q` unchanged
		// would leave the previous tenant's results on screen for good.
		deps: [q, type, contextIdTag],
		enabled
	})

	function setType(value: string) {
		const next = new URLSearchParams(params)
		if (value) next.set('type', value)
		else next.delete('type')
		setParams(next, { replace: true })
	}

	// A 401 from a community the user hasn't trusted is "nothing to show here",
	// not a failure worth a red banner.
	const httpStatus = (error as { httpStatus?: number } | null)?.httpStatus
	// A guest on a foreign space is the same "nothing to show here", decided
	// locally instead of by a round trip that was never made.
	const forbidden = httpStatus === 401 || httpStatus === 403 || foreignForGuest

	// A fixed header band over an inner scroller, the shape `Fcd.Content` gives every
	// other top-level page: the shell's route outlet has no overflow of its own, so a
	// page without one simply overflows the fixed-height layout box and only its first
	// screenful is reachable.
	return (
		// `flex-fill`, not a percentage height: the route outlet may put a banner
		// above this page, and `h-100` would claim the whole column on top of it.
		<VBox fill className="h-min-0 c-search-page" autoBg>
			<VBox gap={2} className="c-search-page-header">
				<PageHeader
					title={t('Search results')}
					subtitle={
						/* Mounted unconditionally: a live region that appears together with
						   its first content is usually not announced at all. */
						<Text aria-live="polite">
							{total !== undefined ? t('{{count}} results', { count: total }) : ''}
						</Text>
					}
				/>
				<HBox role="search" aria-label={t('Search results')}>
					<SearchInput
						className="flex-fill"
						value={input}
						maxLength={FTS_MAX_QUERY}
						placeholder={t('Search')}
						aria-label={t('Search')}
						onChange={(e) => setInput(e.target.value)}
					/>
				</HBox>
				<Tabs value={tabValue} onTabChange={setType}>
					<Tab value="">{t('All')}</Tab>
					<Tab value="file">{t('Files')}</Tab>
					<Tab value="doc">{t('Documents')}</Tab>
					<Tab value="action">{t('Posts')}</Tab>
					{/* No People for a guest — the server excludes profile rows. */}
					{!!auth && <Tab value="profile">{t('People')}</Tab>}
				</Tabs>
			</VBox>

			{/* The sentinel below must live *inside* this scroller: outside it, the
			    IntersectionObserver would see it permanently visible and auto-page. */}
			<VBox gap={1} fill scroll className="h-min-0 c-search-page-results">
				{!q ? (
					<EmptyState
						fill
						icon={<IcSearch />}
						title={t('Search this space')}
						description={t(
							'Type a few words to search files, documents, posts and people.'
						)}
					/>
				) : isLoading || isPending || !api || contextResolving ? (
					<SkeletonList count={5} />
				) : forbidden ? (
					<EmptyState fill title={t('Search is not available in this space')} />
				) : !items.length && !error ? (
					<EmptyState
						fill
						title={t('No results found')}
						description={t('Try different words, or clear the filters.')}
						actions={
							tabValue ? (
								<Button onClick={() => setType('')}>{t('Clear filters')}</Button>
							) : undefined
						}
					/>
				) : (
					<List variant="divided" className="c-search-page-hits">
						{items.map((hit) => {
							const target = searchHitTarget(
								hit,
								ctx.base,
								appConfig?.mime,
								contextIdTag,
								getPartAddressing(hit.contentType)
							)
							if (!target) return null
							return (
								<SearchResultRow
									key={`${hit.objTp}:${hit.objId}:${hit.partId ?? ''}`}
									hit={hit}
									contextIdTag={contextIdTag}
									href={target}
								/>
							)
						})}
					</List>
				)}

				<LoadMoreTrigger
					ref={sentinelRef}
					isLoading={isLoadingMore}
					hasMore={hasMore}
					error={forbidden ? null : error}
					// `loadMore` needs a cursor and a failed first page never produced
					// one — it would be a dead button. Mid-list, resuming from the
					// cursor is what is wanted.
					onRetry={items.length ? loadMore : reset}
					loadingLabel={t('Loading more results...')}
					retryLabel={t('Retry')}
					errorPrefix={t('Failed to load:')}
				/>
			</VBox>
		</VBox>
	)
}

// vim: ts=4
