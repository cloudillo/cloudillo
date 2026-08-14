// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Header omnibox: an idle `Context › App › Document` breadcrumb that turns into
 * a sigil-driven smart input on focus / Ctrl+K.
 *
 *   /…    → command mode  (filter & jump to built-in apps / menu items)
 *   @…    → profile search (live autocomplete → go to profile)
 *   cl:… / http(s)://…    → reference mode (open the linked page/document)
 *   plain text (2+ chars) → full-text search of the active context, inline
 *   empty / 1 char        → this session's recent searches, no network
 *
 * Ctrl+K reopens it prefilled with the last query, fully selected, and sends nothing
 * until the first keystroke — those results have already been seen. Requests are
 * debounced, cancelled when superseded, and cached per context for 30 s.
 */

import type { Profile } from '@cloudillo/core'
import {
	Button,
	LoadingSpinner,
	mergeClasses,
	ProfilePicture,
	useApi,
	useAuth,
	useDebouncedValue,
	useToast
} from '@cloudillo/react'
import type { SearchHit } from '@cloudillo/types'
import { type UseComboboxState, useCombobox } from 'downshift'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import QuickLRU from 'quick-lru'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
	LuX as IcClose,
	LuCopy as IcCopy,
	LuHistory as IcHistory,
	LuLink as IcRef,
	LuSearch as IcSearch
} from 'react-icons/lu'
import { usePopper } from 'react-popper'
import { useLocation, useMatch, useNavigate } from 'react-router-dom'

import {
	activeContextAtom,
	communitiesAtom,
	isContextLeader,
	LEADER_ONLY_APPS,
	useContextAwareApi,
	useCtx,
	useCurrentContextIdTag
} from './context/index.js'
import { deriveMode } from './omnibox-mode.js'
import { buildRef, canShareRoute, resolveRef } from './refs.js'
import { contextPath, profilePath, scopePath, sectionMatch } from './routes.js'
import { SearchResultRow } from './SearchResultRow.js'
import {
	lastQueryAtom,
	openOmniboxAtom,
	pushRecentAtom,
	recentSearchesAtom,
	useSearch
} from './search.js'
import {
	FTS_CACHE_LIMIT,
	FTS_CACHE_TTL_MS,
	FTS_DEBOUNCE_MS,
	FTS_DROPDOWN_LIMIT,
	FTS_GUEST_TYPES,
	FTS_MAX_QUERY,
	FTS_SPINNER_DELAY_MS
} from './search-constants.js'
import { searchHitTarget } from './search-target.js'
import { documentTitleAtom } from './title.js'
import { type MenuItem, useAppConfig } from './utils.js'

// ============================================
// Breadcrumb composition
// ============================================

interface BreadcrumbSegment {
	label: string
}

/**
 * Compose the live `Context › App › Document` breadcrumb segments for the
 * current route. Empty segments are dropped.
 *
 * Nothing renders these as a trail — the apps' DocBar does that. They feed the
 * browser-tab title alone (see {@link DocumentTitleSync}), which is why a segment
 * is a label and nothing else: there is no link to follow.
 */
function useBreadcrumb(): BreadcrumbSegment[] {
	const { i18n } = useTranslation()
	const [auth] = useAuth()
	const [appConfig] = useAppConfig()
	const activeContext = useAtomValue(activeContextAtom)
	const communities = useAtomValue(communitiesAtom)
	const titleState = useAtomValue(documentTitleAtom)
	const ctx = useCtx()

	// The active appId, and the document resId the tail names. The splat is decoded, which
	// is what `ExternalApp` also receives from `useParams`, so the two agree on the resId.
	const appMatch = useMatch(sectionMatch('app', ':appId/*'))
	const appId = appMatch?.params.appId
	const splat = appMatch?.params['*'] ?? ''
	// The same synthesis `ExternalApp` makes, so the two agree on the resId
	// `documentTitleAtom` is keyed to. A tail that names no document (`feed/<actionId>`)
	// just yields a resId nothing ever wrote, which is exactly the old `undefined`.
	const resId = !splat
		? undefined
		: splat.includes(':')
			? splat
			: ctx.idTag
				? `${ctx.idTag}:${splat}`
				: undefined

	// ContextName: only for communities (hide on the user's own home context).
	// `activeContext.name` is an idTag placeholder until the profile loads, so
	// prefer the community's human name from the communities list.
	const showContext = !!(activeContext && auth && activeContext.idTag !== auth.idTag)
	const community = activeContext
		? communities.find((c) => c.idTag === activeContext.idTag)
		: undefined
	const contextName = showContext ? community?.name || activeContext?.name : undefined

	// AppLabel: menu item matched by appId; fall back to the appId. Matched on `id`, not on
	// `path` — menu paths are context-relative templates, not routes.
	const menuItem = appId ? appConfig?.menu.find((it) => it.id === appId) : undefined
	const appLabel = menuItem ? menuItem.trans?.[i18n.language] || menuItem.label : appId

	// DocTitle: from the atom, but only when it belongs to the current resId.
	const docTitle =
		titleState.title && titleState.resId && titleState.resId === resId
			? titleState.title
			: undefined
	const dirty = docTitle ? !!titleState.dirty : false

	return React.useMemo(() => {
		const segs: BreadcrumbSegment[] = []
		if (contextName) segs.push({ label: contextName })
		if (appLabel) segs.push({ label: appLabel })
		if (docTitle) segs.push({ label: (dirty ? '* ' : '') + docTitle })
		return segs
	}, [contextName, appLabel, docTitle, dirty])
}

/**
 * Render-null helper: keeps the browser-tab title in sync with the breadcrumb
 * regardless of whether the idle header or the focused omnibox is showing.
 */
export function DocumentTitleSync() {
	const segments = useBreadcrumb()
	React.useEffect(() => {
		document.title = segments.length
			? `${segments.map((s) => s.label).join(' › ')} · Cloudillo`
			: 'Cloudillo'
	}, [segments])
	return null
}

/**
 * Idle header state: a magnifier and a placeholder that both open the omnibox
 * input, plus a copy button (shareable routes only) yielding a portable `cl:`
 * reference.
 *
 * No `Context › App › Document` crumb trail here: that lives in each app's
 * DocBar, which can also rename the document and show who else is in it.
 * `useBreadcrumb` stays because the browser-tab title still carries the full
 * trail via {@link DocumentTitleSync}.
 */
export function OmniboxIdle() {
	const { t } = useTranslation()
	const location = useLocation()
	const openOmnibox = useSetAtom(openOmniboxAtom)
	const toast = useToast()
	const canShare = canShareRoute(location.pathname)

	async function copyRef() {
		const ref = buildRef(location.pathname, location.search)
		try {
			await navigator.clipboard.writeText(ref)
			toast.success(t('Reference copied'))
		} catch (err) {
			console.error('[Omnibox] Failed to copy reference:', err)
			toast.error(t('Failed to copy reference'))
		}
	}

	return (
		<div className="c-hbox align-items-center g-1" style={{ minWidth: 0 }}>
			<Button
				className="icon c-omnibox-search flex-shrink-0"
				onClick={() => openOmnibox()}
				aria-label={t('Open search')}
				title={t('Search')}
			>
				<IcSearch size={16} />
			</Button>
			<button type="button" className="c-omnibox-placeholder" onClick={() => openOmnibox()}>
				{t('Search')}
			</button>
			{canShare && (
				<Button
					className="icon c-omnibox-copy flex-shrink-0"
					onClick={copyRef}
					aria-label={t('Copy reference')}
				>
					<IcCopy />
				</Button>
			)}
		</div>
	)
}

// ============================================
// Omnibox smart input
// ============================================

type OmniItem =
	| { kind: 'command'; menuItem: MenuItem }
	| { kind: 'profile'; profile: Profile }
	| { kind: 'reference'; raw: string }
	| { kind: 'hit'; hit: SearchHit }
	| { kind: 'see-all'; query: string; total?: number }
	| { kind: 'recent'; query: string }
	| { kind: 'recent-clear' }
	// Not selectable: status rows so the dropdown says what it is doing instead of
	// collapsing to nothing while a request is in flight or came back empty.
	| { kind: 'fts-loading' }
	| { kind: 'fts-empty' }

interface CachedHits {
	hits: SearchHit[]
	total?: number
}

export function Omnibox() {
	const { t, i18n } = useTranslation()
	const navigate = useNavigate()
	const toast = useToast()
	const { api } = useApi()
	// Full-text search follows the active context (inside a community you search that
	// community's index); the `@` profile lookup stays on the home client.
	const { api: ctxApi } = useContextAwareApi()
	const [auth] = useAuth()
	const [search, setSearch] = useSearch()
	const setLastQuery = useSetAtom(lastQueryAtom)
	const pushRecent = useSetAtom(pushRecentAtom)
	const [recent, setRecentSearches] = useAtom(recentSearchesAtom)
	const [appConfig] = useAppConfig()
	const ctx = useCtx()
	// Not the URL context: `~` addresses home in a path but is not an idTag, and the
	// resId's owner half has to be one. Deliberately the *active* context, in step with
	// `ctxApi` above.
	const contextIdTag = useCurrentContextIdTag()
	const activeContext = useAtomValue(activeContextAtom)

	const query = search.query ?? ''
	// A guest has no profile surface: the `@` hotkey is disabled in `layout.tsx` and
	// both profile modes are switched off here.
	const profilesEnabled = !!auth
	const mode = deriveMode(query, profilesEnabled)
	// A recalled query is showing but untouched: the dropdown lists recent searches
	// and no request goes out, since those results have already been seen. The first
	// keystroke ends it.
	const [pristine, setPristine] = React.useState(!!search.selectAll)

	const [popperRef, setPopperRef] = React.useState<HTMLElement | null>(null)
	const [popperEl, setPopperEl] = React.useState<HTMLUListElement | null>(null)
	const fieldRef = React.useRef<HTMLDivElement | null>(null)
	const inputRef = React.useRef<HTMLInputElement | null>(null)
	// Per-mount, not module-level: closing the omnibox unmounts it and drops the
	// cache, so reopening always re-asks. Within one open box the TTL bounds staleness.
	const cacheRef = React.useRef<QuickLRU<string, CachedHits> | null>(null)
	if (!cacheRef.current) {
		cacheRef.current = new QuickLRU<string, CachedHits>({
			maxSize: FTS_CACHE_LIMIT,
			maxAge: FTS_CACHE_TTL_MS
		})
	}
	// Set once the user has moved the highlight, so a pristine recall can tell "Enter
	// searches what I recalled" from "Enter opens the row I arrowed to".
	const arrowedRef = React.useRef(false)
	const [profileItems, setProfileItems] = React.useState<Profile[]>([])
	const [hits, setHits] = React.useState<SearchHit[]>([])
	const [hitTotal, setHitTotal] = React.useState<number | undefined>(undefined)
	const [ftsLoading, setFtsLoading] = React.useState(false)
	// Not `ftsLoading`: the row only appears once the wait is long enough to be worth
	// reporting (see the effect below).
	const [showSpinner, setShowSpinner] = React.useState(false)

	const { styles: popperStyles, attributes } = usePopper(popperRef, popperEl, {
		placement: 'bottom-start',
		strategy: 'fixed'
	})

	const debouncedQuery = useDebouncedValue(query, FTS_DEBOUNCE_MS)
	// The network effects gate on *both* modes: `mode` alone would fire for a stale
	// `debouncedQuery` on the keystroke that crosses into a searching mode (typing
	// "ab" while the debounce still holds ""), `debouncedMode` alone would keep
	// querying text the user has already replaced with a sigil.
	const debouncedMode = deriveMode(debouncedQuery, profilesEnabled)

	// What Ctrl+K recalls. Skips the empty string, so clearing with Escape does not
	// erase the recall target.
	React.useEffect(() => {
		if (query) setLastQuery(query)
	}, [query, setLastQuery])

	// Keyed on the raw query: drop the previous query's rows on the keystroke, not when
	// the answer lands. For the debounce plus a round trip they describe text no longer
	// in the box, and Enter on one would open a result for an abandoned query.
	React.useEffect(() => {
		if (pristine) return
		setHits([])
		setHitTotal(undefined)
		setFtsLoading(mode === 'full-text')
		setProfileItems((prev) => (mode === 'profile-search' ? prev : []))
	}, [mode, query, pristine])

	// `@` autocomplete, debounced and cancelled the moment it is superseded.
	React.useEffect(() => {
		if (pristine) return
		if (mode !== 'profile-search' || debouncedMode !== 'profile-search' || !api) return
		// A bare `@` would list every contact — the most expensive query of the lot,
		// with nothing useful to preview.
		const q = debouncedQuery.slice(1)
		if (!q.length) {
			setProfileItems([])
			return
		}
		const ctrl = new AbortController()
		let cancelled = false
		;(async () => {
			try {
				const res = await api.profiles.list({ q }, { signal: ctrl.signal })
				if (cancelled) return
				setProfileItems(res || [])
			} catch (err) {
				if (cancelled || (err as Error)?.name === 'AbortError') return
				console.error('[Omnibox] Profile search failed:', err)
				setProfileItems([])
			}
		})()
		return () => {
			cancelled = true
			ctrl.abort()
		}
	}, [mode, debouncedMode, debouncedQuery, api, pristine])

	// Full-text lookup: exactly one live request, aborted the moment it is superseded.
	// The `cancelled` flag stays alongside the abort — an already-resolved promise
	// cannot be aborted and its `.then` can still land after cleanup.
	React.useEffect(() => {
		if (pristine) return
		if (mode !== 'full-text' || debouncedMode !== 'full-text') return
		// The keystroke ending a Ctrl+K recall flips `pristine` while the debounce still
		// holds the recalled text, which would send the query whose results were already
		// seen. Any other mismatch is a keystroke the debounce has yet to catch up with.
		if (debouncedQuery !== query) return
		if (!ctxApi) {
			setFtsLoading(false)
			return
		}
		const q = debouncedQuery.trim().slice(0, FTS_MAX_QUERY)
		const key = `${contextIdTag}|${profilesEnabled ? '' : FTS_GUEST_TYPES.join(',')}|${q}`
		const cached = cacheRef.current?.get(key)
		if (cached) {
			setHits(cached.hits)
			setHitTotal(cached.total)
			setFtsLoading(false)
			return
		}
		const ctrl = new AbortController()
		let cancelled = false
		;(async () => {
			try {
				const res = await ctxApi.search.queryPaginated(
					{
						q,
						// The server strips `'P'` for a guest anyway; asking for the
						// narrower set keeps the count and the page consistent.
						type: profilesEnabled ? undefined : FTS_GUEST_TYPES.join(','),
						limit: FTS_DROPDOWN_LIMIT
					},
					{ signal: ctrl.signal }
				)
				if (cancelled) return
				cacheRef.current?.set(key, {
					hits: res.data || [],
					total: res.pagination?.total
				})
				setFtsLoading(false)
				setHits(res.data || [])
				setHitTotal(res.pagination?.total)
			} catch (err) {
				if (cancelled || (err as Error)?.name === 'AbortError') return
				// Silent: an untrusted foreign community answers 401 and a toast per
				// keystroke would be unusable. The empty row is what a 401 means here.
				console.warn('[Omnibox] Full-text search failed:', err)
				setFtsLoading(false)
				setHits([])
				setHitTotal(undefined)
			}
		})()
		return () => {
			cancelled = true
			ctrl.abort()
		}
	}, [
		mode,
		debouncedMode,
		debouncedQuery,
		query,
		ctxApi,
		profilesEnabled,
		contextIdTag,
		pristine
	])

	// The "Searching…" row waits before appearing so it never flashes once per
	// keystroke; with `isOpen` keyed on the row count the menu just stays shut.
	React.useEffect(() => {
		if (!ftsLoading) {
			setShowSpinner(false)
			return
		}
		const timer = setTimeout(() => setShowSpinner(true), FTS_SPINNER_DELAY_MS)
		return () => clearTimeout(timer)
	}, [ftsLoading])

	// Build the dropdown items for the active mode.
	const items = React.useMemo<OmniItem[]>(() => {
		if (pristine || mode === 'none') {
			// Pristine recall or an empty/1-char box: show recent searches, prefix
			// filtered by whatever single character was typed.
			const needle = query.trim().toLowerCase()
			const rows: OmniItem[] = recent
				.filter((r) => !needle || r.toLowerCase().startsWith(needle))
				.map((q) => ({ kind: 'recent', query: q }) as OmniItem)
			return rows.length ? [...rows, { kind: 'recent-clear' }] : []
		}
		if (mode === 'command') {
			const filter = query.startsWith('/') ? query.slice(1).toLowerCase() : ''
			const menu = appConfig?.menu ?? []
			const leaderHere = isContextLeader(activeContext, auth?.idTag)
			return menu
				.filter((item) => {
					// Same visibility rule as the desktop Menu component.
					const allowed =
						(!!auth && (!item.perm || auth.roles?.includes(item.perm))) || item.public
					if (!allowed) return false
					if (LEADER_ONLY_APPS.has(item.id) && !leaderHere) return false
					if (!filter) return true
					const label = (item.trans?.[i18n.language] || item.label).toLowerCase()
					return label.includes(filter) || item.id.toLowerCase().includes(filter)
				})
				.map((menuItem) => ({ kind: 'command', menuItem }) as OmniItem)
		}
		if (mode === 'profile-search') {
			return profileItems.map((profile) => ({ kind: 'profile', profile }) as OmniItem)
		}
		if (mode === 'reference') {
			return [{ kind: 'reference', raw: query }]
		}
		if (mode === 'full-text') {
			// Gated on `showSpinner`: for the first moments of a request the menu stays
			// empty and therefore shut, rather than flashing a spinner row.
			if (ftsLoading) return showSpinner ? [{ kind: 'fts-loading' }] : []
			const rows: OmniItem[] = hits.map((hit) => ({ kind: 'hit', hit }) as OmniItem)
			if (hitTotal !== undefined && hitTotal > rows.length) {
				rows.push({ kind: 'see-all', query: query.trim(), total: hitTotal })
			}
			// An empty list hides the whole menu, which reads as "still working".
			return rows.length ? rows : [{ kind: 'fts-empty' }]
		}
		return []
	}, [
		mode,
		query,
		pristine,
		recent,
		appConfig,
		auth,
		activeContext,
		i18n.language,
		profileItems,
		hits,
		hitTotal,
		ftsLoading,
		showSpinner
	])

	function itemToString(item: OmniItem | null): string {
		if (!item) return ''
		if (item.kind === 'command')
			return item.menuItem.trans?.[i18n.language] || item.menuItem.label
		if (item.kind === 'profile') return item.profile.idTag
		if (item.kind === 'hit') return item.hit.title ?? ''
		if (item.kind === 'see-all' || item.kind === 'recent') return item.query
		if (
			item.kind === 'fts-loading' ||
			item.kind === 'fts-empty' ||
			item.kind === 'recent-clear'
		)
			return ''
		return item.raw
	}

	const jumpToProfile = React.useCallback(
		(raw: string) => {
			const idTag = (raw.startsWith('@') ? raw.slice(1) : raw).trim().toLowerCase()
			if (!idTag) return
			// `idTag` is user-typed; the builder encodes it, so a stray `/` or `?` cannot
			// break out of its segment.
			navigate(profilePath(ctx.base, idTag))
			setSearch({})
		},
		[navigate, ctx.base, setSearch]
	)

	const openResults = React.useCallback(
		(raw: string) => {
			const q = raw.trim().slice(0, FTS_MAX_QUERY)
			if (!q) return
			// Only committed searches are recalled; recording per keystroke would fill
			// the list with `te`, `tex`, `text`.
			pushRecent(q)
			// The context lives in the path, so reloading or sharing the link keeps
			// searching the space the search was run in.
			navigate(contextPath(ctx.base, 'search', '', { q }))
			setSearch({})
		},
		[navigate, ctx.base, setSearch, pushRecent]
	)

	const performAction = React.useCallback(
		(item: OmniItem) => {
			// Status rows, not results: Enter on one does nothing.
			if (item.kind === 'fts-loading' || item.kind === 'fts-empty') return
			if (item.kind === 'recent') {
				// Access *and* edit: the term lands in the still-open box and the normal
				// full-text path takes over.
				setSearch({ query: item.query })
				setPristine(false)
				return
			}
			if (item.kind === 'recent-clear') {
				setRecentSearches([])
				return
			}
			if (item.kind === 'command') {
				navigate(scopePath(ctx.base, item.menuItem.path))
				setSearch({})
			} else if (item.kind === 'profile') {
				navigate(profilePath(ctx.base, item.profile.idTag))
				setSearch({})
			} else if (item.kind === 'hit') {
				// Opening a hit settles the query as much as Enter does.
				pushRecent(query)
				const target = searchHitTarget(item.hit, ctx.base, appConfig?.mime, contextIdTag)
				if (target) {
					navigate(target)
				} else {
					toast.error(t('That result cannot be opened'))
				}
				setSearch({})
			} else if (item.kind === 'see-all') {
				openResults(item.query)
			} else {
				const target = resolveRef(item.raw)
				if (target) {
					navigate(target)
				} else {
					toast.error(t("That doesn't look like a Cloudillo link"))
				}
				setSearch({})
			}
		},
		[
			navigate,
			ctx.base,
			contextIdTag,
			setSearch,
			setRecentSearches,
			pushRecent,
			query,
			toast,
			t,
			appConfig,
			openResults
		]
	)

	const cb = useCombobox<OmniItem>({
		items,
		inputValue: query,
		defaultHighlightedIndex: 0,
		// Controlled so the ARIA state can never disagree with what is painted: open is
		// exactly "there are rows". Also makes a `/` or `@` prefill show rows without
		// focus opening the menu. Left to downshift, `aria-expanded="true"` would be
		// reported over a `display: none` list.
		isOpen: items.length > 0,
		// downshift 9 dropped the per-call `disabled` argument to `getItemProps`; the
		// status rows ("Searching…", "No results found") must still be skipped by the
		// arrow keys and Enter, so they are declared here instead.
		isItemDisabled: (item: OmniItem) =>
			item.kind === 'fts-loading' || item.kind === 'fts-empty',
		itemToString,
		stateReducer(state, { type, changes }) {
			// Recomputed rather than read from the closure: the render-derived `mode`
			// still describes the *previous* input here. On the keystroke that crosses
			// into a searching mode it would let downshift's default through, and
			// downshift sets `highlightedIndex = defaultHighlightedIndex` even with zero
			// items — swallowing Enter until the hits land.
			const nextMode = deriveMode(
				changes.inputValue ?? state.inputValue ?? '',
				profilesEnabled
			)
			// No default highlight: Enter then means "search for what I typed"
			// (profile jump / see all results) rather than "open the first row".
			if (
				(nextMode === 'profile-search' || nextMode === 'full-text') &&
				(type === useCombobox.stateChangeTypes.InputChange ||
					type === useCombobox.stateChangeTypes.FunctionOpenMenu ||
					type === useCombobox.stateChangeTypes.ToggleButtonClick)
			) {
				return { ...changes, highlightedIndex: -1 }
			}
			return changes
		},
		onInputValueChange({ inputValue, type }) {
			if (type === useCombobox.stateChangeTypes.InputChange) {
				// The first keystroke ends the recall: from here the box searches.
				setPristine(false)
				setSearch({ query: inputValue ?? '' })
			}
		},
		onSelectedItemChange({ selectedItem }) {
			if (selectedItem) performAction(selectedItem)
		},
		// downshift 9 owns the `aria-live` status node; this only supplies its text.
		// `items` comes from the closure — the callback is handed combobox state alone.
		getA11yStatusMessage(state: UseComboboxState<OmniItem>) {
			if (ftsLoading) return t('Searching...')
			if (!state.isOpen || !items.length) return t('No results found')
			return t('{{count}} results, use up and down arrows to review', {
				count: items.length
			})
		}
	})

	function getMenuProps() {
		const props = cb.getMenuProps()
		return {
			...props,
			ref: (el: HTMLUListElement) => {
				setPopperEl(el)
				if (props.ref) {
					if (typeof props.ref === 'function') {
						;(props.ref as React.RefCallback<HTMLUListElement>)(el)
					} else {
						;(props.ref as React.MutableRefObject<HTMLUListElement>).current = el
					}
				}
			}
		}
	}

	const inputProps = cb.getInputProps({
		autoFocus: true,
		type: 'search',
		// Otherwise the browser's own history dropdown overlaps the combobox menu.
		autoComplete: 'off',
		placeholder: t('Search this space'),
		'aria-label': t('Search'),
		className: 'c-input flex-fill',
		// downshift composes a passed ref via `handleRefs`; this is how the
		// select-on-recall effect reaches the field.
		ref: (el: HTMLInputElement) => {
			inputRef.current = el
		},
		onKeyDown(e: React.KeyboardEvent) {
			// downshift preventDefaults Home/End while the menu is open to jump the
			// highlight. In a text field the caret has to win — Home/End (and
			// Shift+Home/End) are how you edit. Arrow keys still navigate the dropdown.
			if (e.key === 'Home' || e.key === 'End') {
				;(
					e.nativeEvent as unknown as { preventDownshiftDefault?: boolean }
				).preventDownshiftDefault = true
				return
			}
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				arrowedRef.current = true
				return
			}
			if (e.key === 'Escape') {
				;(
					e.nativeEvent as unknown as { preventDownshiftDefault?: boolean }
				).preventDownshiftDefault = true
				// Two-stage: the first Escape clears a non-empty query and keeps the box
				// open and focused (the text survives in `lastQueryAtom`), the second
				// closes it. Closing on the first would discard a query meant to be fixed.
				if (query) {
					setPristine(false)
					setSearch({ query: '' })
				} else {
					setSearch({})
				}
				return
			}
			if (e.key === 'Enter') {
				// Empty discovery: don't auto-navigate on a bare Enter.
				if (!query.trim()) {
					;(
						e.nativeEvent as unknown as { preventDownshiftDefault?: boolean }
					).preventDownshiftDefault = true
					e.preventDefault()
					return
				}
				// An untouched recall: Enter searches the recalled term, not the recents
				// row the default highlight happens to sit on.
				if (pristine && mode === 'full-text' && !arrowedRef.current) {
					;(
						e.nativeEvent as unknown as { preventDownshiftDefault?: boolean }
					).preventDownshiftDefault = true
					e.preventDefault()
					openResults(query)
					return
				}
				// Profile search: with no row explicitly highlighted, act on the typed
				// idTag rather than on the autocomplete rows.
				if (mode === 'profile-search' && cb.highlightedIndex < 0) {
					e.preventDefault()
					jumpToProfile(query)
					return
				}
				// Full-text: with no row arrowed to, open the full results page.
				if (mode === 'full-text' && cb.highlightedIndex < 0) {
					e.preventDefault()
					openResults(query)
				}
			}
		},
		onBlur(e: React.FocusEvent<HTMLInputElement>) {
			// A tab/window switch, browser chrome or devtools all blur the input;
			// closing there would wipe a half-typed query. Only a real in-page focus
			// move counts as dismissal.
			if (!document.hasFocus()) return
			const next = e.relatedTarget as Node | null
			// Dropdown rows use mousedown-preventDefault so selecting one never blurs
			// the input; the close button and row ✕ buttons live in these containers.
			if (next && (fieldRef.current?.contains(next) || popperEl?.contains(next))) return
			setSearch({})
		}
	})

	// Select-all on recall (address-bar behaviour): the next keystroke replaces the
	// term, Home/End/arrows keep it. Mount only — a later `selectAll` would fight the
	// caret mid-typing — and cleared at once so it cannot fire twice.
	React.useEffect(() => {
		if (!search.selectAll) return
		inputRef.current?.select()
		setSearch((prev) => ({ ...prev, selectAll: undefined }))
	}, [])

	const removeRecent = React.useCallback(
		(term: string) => {
			setRecentSearches((prev) => prev.filter((r) => r !== term))
		},
		[setRecentSearches]
	)

	// The sigil legend sits under the recents, while the box is still pristine or too
	// short to search.
	const showLegend = pristine || mode === 'none'
	const shortcutHint =
		typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || '') ? '⌘K' : 'Ctrl K'

	function renderRow(item: OmniItem) {
		if (item.kind === 'command') {
			const { menuItem } = item
			return (
				<span className="c-hbox align-items-center g-2">
					{menuItem.icon && React.createElement(menuItem.icon)}
					<span>{menuItem.trans?.[i18n.language] || menuItem.label}</span>
				</span>
			)
		}
		if (item.kind === 'profile') {
			const { profile } = item
			return (
				<span className="c-hbox align-items-center g-2">
					<ProfilePicture profile={profile} srcTag={profile.idTag} tiny />
					<span className="c-vbox">
						<span>{profile.name || profile.idTag}</span>
						<span className="small text-muted">@{profile.idTag}</span>
					</span>
				</span>
			)
		}
		if (item.kind === 'hit') {
			return <SearchResultRow hit={item.hit} compact />
		}
		if (item.kind === 'see-all') {
			return (
				<span className="c-hbox align-items-center g-2">
					<IcSearch />
					<span>{t('See all {{count}} results', { count: item.total ?? 0 })}</span>
				</span>
			)
		}
		if (item.kind === 'recent') {
			return (
				<span className="c-hbox align-items-center g-2 w-100">
					<IcHistory />
					<span className="flex-fill c-omnibox-recent-term">{item.query}</span>
					<Button
						className="icon flat c-omnibox-recent-remove"
						// Same blur guard as the close button: keep the input focused
						// so the dropdown is still there when the click lands.
						onMouseDown={(e) => e.preventDefault()}
						onClick={(e) => {
							// Otherwise the row underneath selects the term the
							// click was meant to delete.
							e.stopPropagation()
							removeRecent(item.query)
						}}
						aria-label={t('Remove from search history')}
						title={t('Remove from search history')}
					>
						<IcClose size={14} />
					</Button>
				</span>
			)
		}
		if (item.kind === 'recent-clear') {
			return (
				<span className="c-hbox align-items-center g-2 text-muted small">
					<IcClose size={14} />
					<span>{t('Clear search history')}</span>
				</span>
			)
		}
		if (item.kind === 'fts-loading') {
			return (
				<span className="c-hbox align-items-center g-2 text-muted">
					<LoadingSpinner size="sm" />
					<span>{t('Searching...')}</span>
				</span>
			)
		}
		if (item.kind === 'fts-empty') {
			return (
				<span className="c-hbox align-items-center g-2 text-muted">
					<IcSearch />
					<span>{t('No results found')}</span>
				</span>
			)
		}
		const target = resolveRef(item.raw)
		return (
			<span className="c-hbox align-items-center g-2">
				<IcRef />
				<span className="c-vbox">
					<span>{t('Open reference')}</span>
					{target && <span className="small text-muted">{target}</span>}
				</span>
			</span>
		)
	}

	return (
		<div
			className="c-hbox align-items-center g-1 flex-fill"
			role="search"
			style={{ minWidth: 0 }}
		>
			<div
				ref={(el) => {
					// Two owners: popper positions against it, and the blur guard asks
					// whether focus merely moved inside the field.
					fieldRef.current = el
					setPopperRef(el)
				}}
				className="c-omnibox-field"
			>
				<span className="c-omnibox-field-icon">
					<IcSearch />
				</span>
				<input {...inputProps} />
				{!query && (
					<kbd className="c-omnibox-kbd" aria-hidden="true">
						{shortcutHint}
					</kbd>
				)}
				<Button
					className="icon flat"
					onMouseDown={(e) => e.preventDefault()}
					onClick={() => setSearch({})}
					aria-label={t('Close search')}
				>
					<IcClose />
				</Button>
			</div>
			{createPortal(
				<ul
					{...getMenuProps()}
					style={{
						...popperStyles.popper,
						// Decoupled from the ARIA open state: with zero rows there is
						// nothing to expand to, but the legend must stay paintable or a
						// cold start never discovers the sigils.
						...(cb.isOpen || showLegend ? {} : { display: 'none' })
					}}
					className="c-nav c-omnibox-menu flex-column text-start c-card p-1"
					{...attributes.popper}
				>
					{items.map((item, idx) => (
						<li
							key={idx}
							// `isItemDisabled` keeps the highlight off the status rows,
							// so the index comparison alone suffices.
							className={mergeClasses(
								'c-nav-item',
								cb.highlightedIndex === idx && 'selected'
							)}
							// Select on mousedown-without-blur: keep input focused so
							// the blur-to-close handler doesn't fire before the click
							// selects.
							onMouseDown={(e) => e.preventDefault()}
							{...cb.getItemProps({ item, index: idx })}
						>
							{renderRow(item)}
						</li>
					))}
					{showLegend && (
						// Not selectable, and a listbox child without `role="option"`
						// must say so.
						<li className="c-omnibox-legend small text-muted" role="presentation">
							{/* Sigils stay outside the translated strings: i18next uses
							    keySeparator '@' and nsSeparator '$', so a literal `@` in
							    a key would never resolve. */}
							<span>
								<code>/</code> {t('apps')}
							</span>
							<span aria-hidden="true">·</span>
							<span>
								<code>@</code> {t('people')}
							</span>
							<span aria-hidden="true">·</span>
							<span>
								<code>cl:</code> {t('links')}
							</span>
						</li>
					)}
				</ul>,
				document.getElementById('popper-container')!
			)}
		</div>
	)
}

// vim: ts=4
