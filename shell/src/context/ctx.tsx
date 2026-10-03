// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Which context the URL names, as one React context. `routes.ts` builds strings, this
 * module reads the route, and nothing else takes a pathname apart.
 *
 * **Two different truths, and they must not be collapsed.** `useCtx()` follows the URL and
 * never lags, so it is what URL builders and route guards read. `useCurrentContextIdTag()`
 * follows `activeContextAtom`, which trails the URL by design — `setActiveContext` has to
 * mint a proxy token first — so it is what API owner scopes and cache keys read, in step
 * with the client `useContextAwareApi()` hands out. Deriving the latter from the URL would
 * key a cache entry to the new community while the client still points at home.
 */

import { apiAtom, useAuth } from '@cloudillo/react'
import { useAtom, useAtomValue, useSetAtom, useStore } from 'jotai'
import * as React from 'react'
import { useLocation, useMatch, useNavigate } from 'react-router-dom'

import { CTX_MATCH, type CtxBase, feedPath, HOME_BASE, isContextSegment } from '../routes.js'
import { activeContextAtom, contextSwitchingAtom, pendingContextAtom } from './atoms'
import { HOME_CONTEXT } from './constants.js'
import { hatPickerAtom, pendingHatEntryAtom, useHatEntry } from './hat-entry.js'
import { HatPicker } from './HatPicker.js'
import { useApiContext } from './hooks'
import { isKnownContext } from './trust-gate.js'

export interface Ctx {
	/** URL prefix, byte-exact from the pathname: `'/~'` or `'/@comm.tld'`. */
	base: CtxBase
	/**
	 * The real tenant idTag — never `~`, so this is what may reach an API call, a token
	 * mint or the owner half of a `resId`. Undefined until `apiState.idTag` lands, which
	 * only affects `~`: an `@community` URL resolves immediately.
	 */
	idTag: string | undefined
	isHome: boolean
}

/**
 * The value outside a `<CtxProvider>`. A hook that threw here would take down every
 * component the tests render standalone for no gain.
 */
const HOME_CTX: Ctx = {
	base: HOME_BASE,
	idTag: undefined,
	isHome: true
}

const CtxContext = React.createContext<Ctx>(HOME_CTX)

export function useCtx(): Ctx {
	return React.useContext(CtxContext)
}

/**
 * Reads the context out of the URL, publishes it, and keeps `activeContextAtom` in step
 * with it. Mounted once, high enough to wrap the sidebar, the header, the route tree and
 * the dialog stack.
 */
export function CtxProvider({ children }: { children: React.ReactNode }) {
	const location = useLocation()
	// Matches `/favicon.ico` and `/login` just as happily as `/~/app/feed`, so the sigil
	// test below is what makes segment 1 self-describing. Without it `/login` would yield
	// `idTag: 'ogin'` and fire `setActiveContext('ogin')`.
	const match = useMatch(CTX_MATCH)
	const matched = match?.params.contextIdTag
	const routeSegment = isContextSegment(matched) ? matched : undefined

	const [activeContext] = useAtom(activeContextAtom)
	const { setActiveContext, isLoading } = useApiContext()
	const { enter } = useHatEntry()
	const setIsSwitching = useSetAtom(contextSwitchingAtom)
	const setPendingContext = useSetAtom(pendingContextAtom)
	const [auth] = useAuth()
	const apiState = useAtomValue(apiAtom)
	const navigate = useNavigate()
	const store = useStore()
	const [isInitialized, setIsInitialized] = React.useState(false)

	// idTags whose switch already failed. Without this, a home-context failure
	// navigates to the home feed, whose routeIdTag is unchanged — and the effect
	// retries forever.
	const failedRef = React.useRef(new Set<string>())
	// The entry that is running — it may sit in the hat picker for a while, and the
	// effect must not start a second one meanwhile. An object, so a superseded entry's
	// `.finally` cannot clear its successor for the same idTag.
	const enteringRef = React.useRef<{ idTag: string } | undefined>(undefined)

	// The tenant the URL names, `undefined` on a context-free route. `~` resolves to the
	// node's own idTag, not known synchronously (`auth/boot.ts` fetches it).
	const routeIdTag = routeSegment === HOME_CONTEXT ? apiState.idTag : routeSegment?.slice(1)

	const value = React.useMemo<Ctx>(() => {
		// Byte-exact from the pathname rather than from `match.params`: react-router decodes
		// its params, so a rebuilt base would re-emit a percent-escaped idTag raw.
		// `rebase()` relies on the same byte-exactness.
		const cut = location.pathname.indexOf('/', 1)
		const base = (
			!routeSegment
				? HOME_BASE
				: cut < 0
					? location.pathname
					: location.pathname.slice(0, cut)
		) as CtxBase
		const idTag = routeIdTag ?? apiState.idTag
		return {
			base,
			idTag,
			isHome: !routeSegment || routeSegment === HOME_CONTEXT || idTag === apiState.idTag
		}
	}, [location.pathname, routeSegment, routeIdTag, apiState.idTag])

	// A fresh login gets a fresh chance at every context that failed for the last one.
	React.useEffect(() => {
		failedRef.current.clear()
	}, [auth?.idTag])

	React.useEffect(() => {
		// Skip context switching when not authenticated (loading or guest)
		if (!auth) return
		// A hat-bearing entry (`useEnterContext`) parked its hat before navigating. Consume
		// it only on its own route: a pass for the route being left must not drop it.
		const pendingHat = store.get(pendingHatEntryAtom)
		const hat = pendingHat && pendingHat.idTag === routeIdTag ? pendingHat.hat : undefined
		// A failed context is retried only by an explicit hat-bearing entry.
		if (routeIdTag && failedRef.current.has(routeIdTag)) {
			if (hat === undefined) return
			failedRef.current.delete(routeIdTag)
		}
		if (hat !== undefined) store.set(pendingHatEntryAtom, undefined)

		// If we have a contextIdTag in URL but it doesn't match active context
		if (routeIdTag && activeContext?.idTag !== routeIdTag) {
			// A parked hat supersedes the running entry rather than waiting behind it.
			if (enteringRef.current?.idTag === routeIdTag && hat === undefined) return

			// A URL is not a user action, and `setActiveContext` mints an identified
			// proxy token — so a context nobody has consented to is parked for the
			// confirm banner rather than entered. Entering under a real hat is a user
			// action; "as yourself" (`''`) still needs consent like a plain URL.
			if (!hat && !isKnownContext(store, routeIdTag, auth.idTag)) {
				setPendingContext(routeIdTag)
				setIsSwitching(false)
				return
			}
			setPendingContext(undefined)

			// Switch to the context from URL. This is the sole writer to
			// activeContextAtom for user-initiated switches — switchTo only
			// navigates, so the URL is the single source of truth. Hats apply to
			// communities only; `enter` resolves which one (or none) to wear.
			const isHomeRoute = routeIdTag === auth.idTag || routeIdTag === apiState.idTag
			// An open picker belongs to an entry this one supersedes: settle it as
			// superseded, so that entry's `enter` returns without activating.
			const picker = store.get(hatPickerAtom)
			picker?.resolve(null, picker.entries)
			const entry = { idTag: routeIdTag }
			enteringRef.current = entry
			;(isHomeRoute ? setActiveContext(routeIdTag) : enter(routeIdTag, hat))
				.catch((err) => {
					console.error(`[Route] Failed to switch to context ${routeIdTag}:`, err)
					failedRef.current.add(routeIdTag)

					// A home context that cannot resolve means the session is unusable,
					// and the home feed would land on this very routeIdTag again.
					if (routeIdTag === auth?.idTag || routeIdTag === apiState.idTag) {
						navigate('/login', { replace: true })
					} else {
						console.warn(`[Route] Redirecting to user context: ${auth?.idTag}`)
						navigate(feedPath(HOME_BASE), { replace: true })
					}
				})
				.finally(() => {
					if (enteringRef.current === entry) enteringRef.current = undefined
					setIsSwitching(false)
				})
		} else if (routeIdTag && activeContext?.idTag === routeIdTag) {
			// URL already matches active context — switchTo only navigated; clear the spinner.
			setPendingContext(undefined)
			setIsSwitching(false)
		} else if (!routeIdTag) {
			// Navigated off the context route entirely; nothing is pending any more.
			setPendingContext(undefined)
		}
	}, [
		routeIdTag,
		activeContext?.idTag,
		setActiveContext,
		enter,
		auth,
		apiState.idTag,
		navigate,
		setIsSwitching,
		setPendingContext,
		store
	])

	// Initialize active context if none is set, we have auth, and the URL has no context
	// segment — a logged-in user on `/s/:refId` or `/onboarding/*` still needs one, or
	// `useContextAwareApi` hands out a home client with `activeContext === null`.
	React.useEffect(() => {
		if (!isInitialized && auth?.idTag && !activeContext && !isLoading && !routeIdTag) {
			setActiveContext(auth.idTag)
				.then(() => {
					setIsInitialized(true)
				})
				.catch((err) => {
					console.error('[Route] Failed to initialize active context:', err)
				})
		}
	}, [auth, activeContext, isLoading, isInitialized, setActiveContext, routeIdTag])

	return (
		<CtxContext.Provider value={value}>
			{children}
			<HatPicker />
		</CtxContext.Provider>
	)
}

// vim: ts=4
