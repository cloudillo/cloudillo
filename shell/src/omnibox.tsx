// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Header omnibox: an idle `Context › App › Document` breadcrumb that turns into
 * a sigil-driven smart input on focus / Ctrl+K.
 *
 *   /…    → command mode  (filter & jump to built-in apps / menu items)
 *   @…    → profile search (live autocomplete → go to profile)
 *   id.tag.tld (bare)     → profile jump (Enter, no dropdown / no network)
 *   cl:… / http(s)://…    → reference mode (open the linked page/document)
 *   empty / other text    → no dropdown (suggestions need a `/` or `@` sigil)
 */

import type { Profile } from '@cloudillo/core'
import { Button, mergeClasses, ProfilePicture, useApi, useAuth, useToast } from '@cloudillo/react'
import debounce from 'debounce'
import { useCombobox } from 'downshift'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import {
	LuX as IcClose,
	LuCopy as IcCopy,
	LuLink as IcRef,
	LuSearch as IcSearch,
	LuChevronRight as IcSep
} from 'react-icons/lu'
import { usePopper } from 'react-popper'
import { useLocation, useNavigate } from 'react-router-dom'
import {
	activeContextAtom,
	communitiesAtom,
	HOME_CONTEXT,
	useContextPath,
	useUrlContextIdTag
} from './context/index.js'
import { buildRef, canShareRoute, isIdTag, isRefLike, resolveRef } from './refs.js'
import { useSearch } from './search.js'
import { documentTitleAtom } from './title.js'
import { type MenuItem, useAppConfig } from './utils.js'

// ============================================
// Route parsing helpers
// ============================================

interface AppRoute {
	appId?: string
	resId?: string
}

/**
 * Derive the active appId (and document resId, if any) from a route path.
 * Mirrors the addressing in `apps/index.tsx` (`ExternalApp`).
 */
function parseAppRoute(pathname: string): AppRoute {
	// Context-aware document/sub-route: /app/<ctx>/<appId>/<rest…>
	let m = pathname.match(/^\/app\/([^/]+)\/([^/]+)\/(.+)$/)
	if (m) {
		const ctx = m[1]
		const appId = m[2]
		const rest = m[3]
		const resId = rest.includes(':') ? rest : `${ctx}:${rest}`
		return { appId, resId }
	}
	// Context-aware, no rest: /app/<ctx>/<appId>  (or legacy /app/<appId>/<x>)
	m = pathname.match(/^\/app\/([^/]+)\/([^/]+)\/?$/)
	if (m) {
		const first = m[1]
		const isCtx = first === HOME_CONTEXT || first.includes('.')
		return { appId: isCtx ? m[2] : first }
	}
	// Legacy: /app/<appId>
	m = pathname.match(/^\/app\/([^/]+)\/?$/)
	if (m) return { appId: m[1] }
	return {}
}

// ============================================
// Breadcrumb composition
// ============================================

interface BreadcrumbData {
	segments: string[]
	canShare: boolean
}

/**
 * Compose the live `Context › App › Document` breadcrumb segments for the
 * current route. Empty segments are dropped.
 */
function useBreadcrumb(): BreadcrumbData {
	const location = useLocation()
	const { i18n } = useTranslation()
	const [auth] = useAuth()
	const [appConfig] = useAppConfig()
	const activeContext = useAtomValue(activeContextAtom)
	const communities = useAtomValue(communitiesAtom)
	const titleState = useAtomValue(documentTitleAtom)

	const { appId, resId } = parseAppRoute(location.pathname)

	// ContextName: only for communities (hide on the user's own home context).
	// `activeContext.name` is an idTag placeholder until the profile loads, so
	// prefer the community's human name from the communities list.
	const showContext = !!(activeContext && auth && activeContext.idTag !== auth.idTag)
	const community = activeContext
		? communities.find((c) => c.idTag === activeContext.idTag)
		: undefined
	const contextName = showContext ? community?.name || activeContext?.name : undefined

	// AppLabel: menu item matched by appId; fall back to the appId.
	const menuItem = appId ? appConfig?.menu.find((it) => it.path === `/app/${appId}`) : undefined
	const appLabel = menuItem ? menuItem.trans?.[i18n.language] || menuItem.label : appId

	// DocTitle: from the atom, but only when it belongs to the current resId.
	const docTitle =
		titleState.title && titleState.resId && titleState.resId === resId
			? titleState.title
			: undefined
	const dirty = docTitle ? !!titleState.dirty : false

	const segments = React.useMemo(() => {
		const segs: string[] = []
		if (contextName) segs.push(contextName)
		if (appLabel) segs.push(appLabel)
		if (docTitle) segs.push((dirty ? '* ' : '') + docTitle)
		return segs
	}, [contextName, appLabel, docTitle, dirty])

	return { segments, canShare: canShareRoute(location.pathname) }
}

/**
 * Render-null helper: keeps the browser-tab title in sync with the breadcrumb
 * regardless of whether the idle breadcrumb or the focused omnibox is showing.
 */
export function DocumentTitleSync() {
	const { segments } = useBreadcrumb()
	React.useEffect(() => {
		document.title = segments.length ? `${segments.join(' › ')} · Cloudillo` : 'Cloudillo'
	}, [segments])
	return null
}

/**
 * Idle breadcrumb state. Clicking it opens the omnibox input. A copy button
 * (shareable routes only) yields a portable `cl:` reference.
 */
export function Breadcrumb() {
	const { t } = useTranslation()
	const location = useLocation()
	const [, setSearch] = useSearch()
	const toast = useToast()
	const { segments, canShare } = useBreadcrumb()

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
			<button
				type="button"
				className="c-omnibox-breadcrumb"
				onClick={() => setSearch({ query: '' })}
				aria-label={t('Open search')}
				title={t('Search')}
			>
				<IcSearch className="c-omnibox-lead" size={16} />
				{segments.length ? (
					segments.map((seg, i) => (
						<React.Fragment key={i}>
							{i > 0 && <IcSep className="c-omnibox-sep" size={14} />}
							<span className="c-omnibox-seg">{seg}</span>
						</React.Fragment>
					))
				) : (
					<span className="c-omnibox-placeholder">{t('Search')}</span>
				)}
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

type OmniMode = 'command' | 'profile-search' | 'profile-jump' | 'reference' | 'none'

type OmniItem =
	| { kind: 'command'; menuItem: MenuItem }
	| { kind: 'profile'; profile: Profile }
	| { kind: 'reference'; raw: string }

function deriveMode(query: string): OmniMode {
	if (query.startsWith('/')) return 'command'
	if (query.startsWith('@')) return 'profile-search'
	if (isRefLike(query)) return 'reference'
	if (isIdTag(query)) return 'profile-jump'
	// Empty or plain text: no dropdown. Suggestions only appear behind a
	// `/` (commands) or `@` (people) sigil.
	return 'none'
}

export function Omnibox() {
	const { t, i18n } = useTranslation()
	const navigate = useNavigate()
	const toast = useToast()
	const { api } = useApi()
	const [auth] = useAuth()
	const [search, setSearch] = useSearch()
	const [appConfig] = useAppConfig()
	const urlContext = useUrlContextIdTag()
	const { getContextPath } = useContextPath()

	const query = search.query ?? ''
	const mode = deriveMode(query)

	const [popperRef, setPopperRef] = React.useState<HTMLElement | null>(null)
	const [popperEl, setPopperEl] = React.useState<HTMLUListElement | null>(null)
	const [profileItems, setProfileItems] = React.useState<Profile[]>([])
	const searchSeqRef = React.useRef(0)

	const { styles: popperStyles, attributes } = usePopper(popperRef, popperEl, {
		placement: 'bottom-start',
		strategy: 'fixed'
	})

	// Debounced profile lookup (~250 ms — snappier than Select's 500 ms).
	const fetchProfiles = React.useMemo(
		() =>
			debounce(async (q: string) => {
				if (!api) return
				const seq = ++searchSeqRef.current
				try {
					const res = await api.profiles.list({ q })
					if (seq !== searchSeqRef.current) return // a newer query superseded this one
					setProfileItems(res || [])
				} catch (err) {
					if (seq !== searchSeqRef.current) return
					console.error('[Omnibox] Profile search failed:', err)
					setProfileItems([])
				}
			}, 250),
		[api]
	)

	React.useEffect(() => {
		if (mode === 'profile-search') {
			fetchProfiles(query.slice(1))
		} else {
			fetchProfiles.clear()
			searchSeqRef.current++
			setProfileItems([])
		}
	}, [mode, query, fetchProfiles])

	React.useEffect(() => () => fetchProfiles.clear(), [fetchProfiles])

	// Build the dropdown items for the active mode.
	const items = React.useMemo<OmniItem[]>(() => {
		if (mode === 'command') {
			const filter = query.startsWith('/') ? query.slice(1).toLowerCase() : ''
			const menu = appConfig?.menu ?? []
			return menu
				.filter((item) => {
					// Same visibility rule as the desktop Menu component.
					const allowed =
						(!!auth && (!item.perm || auth.roles?.includes(item.perm))) || item.public
					if (!allowed) return false
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
		return []
	}, [mode, query, appConfig, auth, i18n.language, profileItems])

	function itemToString(item: OmniItem | null): string {
		if (!item) return ''
		if (item.kind === 'command')
			return item.menuItem.trans?.[i18n.language] || item.menuItem.label
		if (item.kind === 'profile') return item.profile.idTag
		return item.raw
	}

	const jumpToProfile = React.useCallback(
		(raw: string) => {
			const idTag = (raw.startsWith('@') ? raw.slice(1) : raw).trim().toLowerCase()
			if (!idTag) return
			navigate(`/profile/${urlContext || HOME_CONTEXT}/${idTag}`)
			setSearch({})
		},
		[navigate, urlContext, setSearch]
	)

	const performAction = React.useCallback(
		(item: OmniItem) => {
			if (item.kind === 'command') {
				navigate(getContextPath(item.menuItem.path))
				setSearch({})
			} else if (item.kind === 'profile') {
				navigate(`/profile/${urlContext || HOME_CONTEXT}/${item.profile.idTag}`)
				setSearch({})
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
		[navigate, getContextPath, urlContext, setSearch, toast, t]
	)

	const cb = useCombobox<OmniItem>({
		items,
		inputValue: query,
		defaultHighlightedIndex: 0,
		// Open on mount so a `/` or `@` prefill shows rows immediately (the input
		// is autofocused but focus alone doesn't open the menu). An empty omnibox
		// derives mode 'none' → no items → the dropdown stays hidden.
		defaultIsOpen: true,
		itemToString,
		stateReducer(_state, { type, changes }) {
			if (
				mode === 'profile-search' &&
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
				setSearch({ query: inputValue ?? '' })
			}
		},
		onSelectedItemChange({ selectedItem }) {
			if (selectedItem) performAction(selectedItem)
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
		placeholder: t('Type / for apps, @ to find people, or paste a link…'),
		'aria-label': t('Search'),
		className: 'c-input flex-fill',
		onKeyDown(e: React.KeyboardEvent) {
			if (e.key === 'Escape') {
				;(
					e.nativeEvent as unknown as { preventDownshiftDefault?: boolean }
				).preventDownshiftDefault = true
				setSearch({})
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
				// Profile modes: with no row explicitly highlighted, act on the typed
				// idTag (profile-jump never has rows; profile-search defaults to no
				// highlight).
				if (
					mode === 'profile-jump' ||
					(mode === 'profile-search' && cb.highlightedIndex < 0)
				) {
					e.preventDefault()
					jumpToProfile(query)
				}
			}
		},
		onBlur() {
			// Close on blur. Dropdown rows use mousedown-preventDefault below, so
			// selecting a row never blurs the input first.
			setSearch({})
		}
	})

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
			<div ref={setPopperRef} className="c-omnibox-field">
				<span className="c-omnibox-field-icon">
					<IcSearch />
				</span>
				<input {...inputProps} />
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
						...(items.length ? {} : { display: 'none' })
					}}
					className="c-nav c-omnibox-menu flex-column text-start c-card p-1"
					{...attributes.popper}
				>
					{items.map((item, idx) => (
						<li
							key={idx}
							className={mergeClasses(
								'c-nav-item',
								cb.highlightedIndex === idx && 'selected'
							)}
							// Select on mousedown-without-blur: keep input focused so the
							// blur-to-close handler doesn't fire before the click selects.
							onMouseDown={(e) => e.preventDefault()}
							{...cb.getItemProps({ item, index: idx })}
						>
							{renderRow(item)}
						</li>
					))}
				</ul>,
				document.getElementById('popper-container')!
			)}
		</div>
	)
}

// vim: ts=4
