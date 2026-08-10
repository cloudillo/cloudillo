// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `/search/:contextIdTag` — the full results surface behind the omnibox dropdown.
 *
 * Query and filters live in the URL query string (`q`, `type`), the space being
 * searched lives in the path, so results are linkable and Back/Forward works:
 * reloading or sharing the link searches the space the search was run in rather than
 * resetting to the home context. `~` is home, as on every context-aware route; the
 * context segment drives `useContextFromRoute`, which `useUrlContextIdTag` /
 * `useContextAwareApi` below then follow.
 */

import {
	EmptyState,
	LoadMoreTrigger,
	SkeletonList,
	Tab,
	Tabs,
	useAuth,
	useDebouncedValue,
	useInfiniteScroll
} from '@cloudillo/react'
import type { SearchHit } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuSearch as IcSearch } from 'react-icons/lu'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import {
	HOME_CONTEXT,
	useCanonicalContextSegment,
	useContextAwareApi,
	useCurrentContextIdTag,
	useUrlContextIdTag
} from './context/index.js'
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
	const urlContext = useUrlContextIdTag()
	// Not the URL segment: `~` addresses home in a path but is not an idTag, and the
	// resId's owner half has to be one.
	const contextIdTag = useCurrentContextIdTag()
	// The path's own segment, before `useContextFromRoute` resolves it into
	// `activeContextAtom`. That resolution is async, so on a fresh load of a shared
	// `/search/<community>?q=…` link `api` still points at home for a render or two and
	// searching then would query the wrong tenant. Canonicalised to be comparable with
	// `urlContext` (home idTag and `~` name one space, and only `~` comes back from
	// `useUrlContextIdTag`); non-context segments come back undefined.
	const routeContext = useCanonicalContextSegment(useParams().contextIdTag)

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

	// A guest never gets an `activeContext` (`useContextFromRoute` returns early
	// without auth), so `urlContext` stays `'~'` and the wait below would never end on
	// a shared `/search/<community>` link. Nothing to wait for: they cannot search
	// another space at all.
	const foreignForGuest = !auth && !!routeContext && routeContext !== HOME_CONTEXT
	// True while `useContextFromRoute` is still switching to the route's context. No
	// fetch is permitted yet, so `isLoading` is false and the render chain below would
	// otherwise reach "No results found" before the first request was allowed out. Not
	// for a guest — `urlContext` never catches up for them and `forbidden` is the right
	// surface. The sibling window (fetch permitted, but `useInfiniteScroll` schedules
	// it a commit later) is what `isPending` covers.
	const contextResolving = !!routeContext && routeContext !== urlContext && !foreignForGuest
	const enabled =
		!!api &&
		!!q &&
		!typeMatchesNothing &&
		!foreignForGuest &&
		(!routeContext || routeContext === urlContext)

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

	const ctx = urlContext || HOME_CONTEXT
	// A 401 from a community the user hasn't trusted is "nothing to show here",
	// not a failure worth a red banner.
	const httpStatus = (error as { httpStatus?: number } | null)?.httpStatus
	// A guest on a foreign space is the same "nothing to show here", decided
	// locally instead of by a round trip that was never made.
	const forbidden = httpStatus === 401 || httpStatus === 403 || foreignForGuest

	return (
		<div className="c-vbox g-2 p-2 c-search-page">
			<h1 className="c-h4">{t('Search results')}</h1>
			<input
				type="search"
				className="c-input w-100"
				value={input}
				maxLength={FTS_MAX_QUERY}
				placeholder={t('Search')}
				aria-label={t('Search')}
				onChange={(e) => setInput(e.target.value)}
			/>
			<Tabs value={tabValue} onTabChange={setType}>
				<Tab value="">{t('All')}</Tab>
				<Tab value="file">{t('Files')}</Tab>
				<Tab value="doc">{t('Documents')}</Tab>
				<Tab value="action">{t('Posts')}</Tab>
				{/* No People for a guest — the server excludes profile rows. */}
				{!!auth && <Tab value="profile">{t('People')}</Tab>}
			</Tabs>

			{!q ? (
				<EmptyState
					icon={<IcSearch />}
					title={t('Search this space')}
					description={t(
						'Type a few words to search files, documents, posts and people.'
					)}
				/>
			) : isLoading || isPending || !api || contextResolving ? (
				<SkeletonList count={5} />
			) : forbidden ? (
				<EmptyState title={t('Search is not available in this space')} />
			) : !items.length && !error ? (
				<EmptyState
					title={t('No results found')}
					description={t('Try different words, or clear the filters.')}
				/>
			) : (
				<>
					{total !== undefined && (
						<div className="small text-muted">
							{t('{{count}} results', { count: total })}
						</div>
					)}
					<div className="c-vbox g-1">
						{items.map((hit) => {
							const target = searchHitTarget(hit, ctx, appConfig?.mime, contextIdTag)
							if (!target) return null
							return (
								<Link
									key={`${hit.objTp}:${hit.objId}:${hit.partId ?? ''}`}
									className="c-search-page-hit"
									to={target}
								>
									<SearchResultRow hit={hit} />
								</Link>
							)
						})}
					</div>
				</>
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
		</div>
	)
}

// vim: ts=4
