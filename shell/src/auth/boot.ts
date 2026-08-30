// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The shell's boot waterfall, as one top-to-bottom async function.
 *
 * Not a hook: the phase ordering is the contract, and one readable sequence is the only form
 * in which it stays visible. Driven by `Layout`'s `onLoad` effect, which passes every
 * dependency in explicitly rather than closing over component state.
 *
 * Four orderings are load-bearing:
 *   1. `ensureServiceWorker()` → `assessKeyLoss()` → `getApiKey()`: the SW must be
 *      controlling and holding the encryption key before anything asks it for secrets.
 *   2. The key-loss halt returns WITHOUT touching `setAuth`, so `auth` stays `undefined` and
 *      the login screen never flashes before the dialog mounts. `Layout`'s splash-teardown
 *      effect special-cases this via `!keyLoss`.
 *   3. `applyUiSettings()` → `settingsAppliedFor = idTag` → `setAuth()`, so the splash covers
 *      one fade-in of a fully populated shell and the warm re-run branch does not re-apply.
 *   4. Path B (session-token adoption) must take the token into the page rather than rely on
 *      an ambient SW-injected header; see its comment.
 */

import { type ApiClient, createApiClient, FetchError, setApiToken } from '@cloudillo/core'
import type { AuthState } from '@cloudillo/react'
import type { TFunction } from 'i18next'
import type { NavigateFunction } from 'react-router-dom'

import { loadIdpEnabled } from '../context/index.js'
import { applyMenuConfig } from '../manifest-registry.js'
import { readSwKeyCookie } from '../pwa/cookie.js'
import {
	clearAuthToken,
	deleteApiKey,
	ensureServiceWorker,
	getApiKey,
	getSessionToken,
	installToken,
	setCurrentAuthToken
} from '../pwa.js'
import { feedPath, HOME_BASE, scopePath } from '../routes.js'
import { applyTheme, readStoredTheme, setTheme } from '../settings'
import { isSiteDocument, siteSeed } from '../site/detect.js'
import type { AppConfigState } from '../utils.js'
import type { LoginInitData } from './auth.js'
import { assessKeyLoss, type KeyLossState } from './key-loss.js'

export interface BootDeps {
	api: ApiClient | null
	auth: AuthState | null | undefined
	appConfig: AppConfigState
	setAppConfig: (config: AppConfigState) => void
	setAuth: (auth: AuthState | null) => void
	setIdTag: (idTag: string) => void
	setKeyLoss: (state: KeyLossState) => void
	setLoginInitData: (data: LoginInitData | null) => void
	setFavorites: (favorites: string[]) => void
	setContextIdpEnabled: (
		updater: (prev: Record<string, boolean | 'unknown'>) => Record<string, boolean | 'unknown'>
	) => void
	loadNotifications: () => void
	toastWarning: (message: string) => void
	t: TFunction
	/**
	 * The *current* path, read lazily: this waterfall makes routing decisions after several
	 * awaits and `Layout`'s boot effect deliberately does not re-run on navigation, so a
	 * captured `Location` would act on a path the user has already left.
	 */
	getPathname: () => string
	navigate: NavigateFunction
}

// Guards against duplicate effect execution (StrictMode / double fire). Module scope rather
// than a ref: there is exactly one `Layout` per page.
let booted = false

// The idTag whose UI settings are currently applied, so the warm re-run branch can skip
// redundant work. Owned here rather than by a ref in `Layout` — the logout path resets it
// through `resetBootSettingsApplied()`.
let settingsAppliedFor: string | null = null

// The idTag whose notifications have been loaded in this page life. Separate from
// `settingsAppliedFor`: the cold path sets that one BEFORE `setAuth`, so the first warm run
// already sees a match — this latch is still unset there.
let notificationsLoadedFor: string | null = null

/**
 * Clears both per-identity latches, so the next sign-in re-applies UI settings and re-loads
 * notifications. Called from the logout path.
 */
export function resetBootSettingsApplied(): void {
	settingsAppliedFor = null
	notificationsLoadedFor = null
}

/**
 * Whether `applyUiSettings` has already run for this idTag in this page life.
 *
 * Read by `Layout`'s boot effect, which re-runs on every proactive token renewal (a renewal
 * replaces the `auth` object). Seeding the app-config atom with the unnarrowed default is
 * only safe while boot is still going to re-apply `ui.app_menu` on top of it — the warm
 * branch does not.
 */
export function isBootSettingsApplied(idTag: string | undefined): boolean {
	return !!idTag && settingsAppliedFor === idTag
}

/**
 * Where a freshly authenticated user lands: an unfinished onboarding step, else the
 * configured default menu entry rewritten into the user's context, else the feed.
 */
function resolveInitialRoute(config: AppConfigState, onboarding?: string): string {
	// A fresh login always lands at home; `~` is the canonical URL spelling for it.
	const menuPath = config?.menu?.find((m) => m.id === config.defaultMenu)?.path
	return (
		(onboarding && `/onboarding/${onboarding}`) ||
		// `scopePath`, not a `/app/` string replace: a default menu entry of `settings` or
		// `communities` must get a context too.
		(menuPath && scopePath(HOME_BASE, menuPath)) ||
		feedPath(HOME_BASE)
	)
}

export async function runBootSequence(deps: BootDeps): Promise<void> {
	const {
		api,
		auth,
		setAppConfig,
		setAuth,
		setIdTag,
		setKeyLoss,
		setLoginInitData,
		setFavorites,
		setContextIdpEnabled,
		loadNotifications,
		toastWarning,
		t,
		getPathname,
		navigate
	} = deps
	const appConfig = deps.appConfig

	const applyUiSettings = async (
		apiClient: ReturnType<typeof createApiClient>,
		authState: AuthState
	) => {
		let activeConfig = appConfig
		let onboarding: string | undefined
		try {
			const uiSettings = await apiClient.settings.list({ prefix: 'ui' })
			const theme = uiSettings.find((s) => s.key === 'ui.theme')?.value
			const colors = uiSettings.find((s) => s.key === 'ui.colors')?.value
			const onboardingVal = uiSettings.find((s) => s.key === 'ui.onboarding')?.value
			if (typeof onboardingVal === 'string') onboarding = onboardingVal

			let appMenuVal: unknown = uiSettings.find((s) => s.key === 'ui.app_menu')?.value
			if (typeof appMenuVal === 'string') {
				try {
					appMenuVal = JSON.parse(appMenuVal)
				} catch {
					// ignore
				}
			}
			if (
				appMenuVal &&
				typeof appMenuVal === 'object' &&
				'main' in (appMenuVal as Record<string, unknown>)
			) {
				activeConfig = applyMenuConfig(
					activeConfig,
					appMenuVal as { main: string[]; extra?: string[] }
				)
				setAppConfig(activeConfig)
			}

			const pinnedVal = uiSettings.find((s) => s.key === 'ui.pinned_communities')?.value
			if (Array.isArray(pinnedVal)) {
				setFavorites(pinnedVal as string[])
			}

			setTheme(theme as string | undefined, colors as string | undefined)

			// Lets the shell menu hide the IDP item when this tenant isn't a provider.
			// Fire-and-forget so initial render is not blocked.
			if (authState.idTag) {
				void loadIdpEnabled(apiClient, authState.idTag, setContextIdpEnabled)
			}
		} catch (err) {
			console.error('Failed to load UI settings:', err)
			// The stored preference, without overwriting it — the next successful
			// settings fetch will refresh it. Reading it back is what keeps this from
			// repainting the page out of the scheme the pre-paint script chose.
			const stored = readStoredTheme()
			applyTheme(stored.theme, stored.colors)
		}

		// One landing decision for both paths: on failure `activeConfig` is still the
		// caller's config and `onboarding` is unset — already the fallback.
		// Not on a published page: there `/` is the site's root alias, a page the
		// reader asked for, and not the shell's home placeholder waiting for a
		// destination (§5.1).
		if (!isSiteDocument && getPathname() === '/') {
			navigate(resolveInitialRoute(activeConfig, onboarding))
		}
	}

	if (!api?.idTag || auth === undefined) {
		if (booted) return
		booted = true

		// A drive-by reader of a published page, short-circuited (§5.7). The
		// waterfall below registers a ServiceWorker and probes SW-encrypted storage
		// *before* it can conclude "guest" — on a site route that installs a worker
		// in every anonymous reader's browser, on the site owner's origin, to learn
		// they have no session. Both signals are sound: only login ever writes the
		// `swKey` cookie (`pwa/registration.ts:55`), and a session token is this
		// tab's own. The trade is that anonymous readers lose SW asset caching.
		// Gated on the seed as well: `readSiteSeed` returns `null` on any decode
		// failure — a missing field, unparseable JSON, a wrapper generation older
		// than the seed — and short-circuiting there sets no idTag and skips the
		// fetch that would have found one, leaving `api` null for the session. So a
		// seedless site page falls through to the waterfall instead, which does
		// register a ServiceWorker in that reader's browser. That is the
		// pre-existing behaviour and strictly better than no API client at all: no
		// embed island mounts, no owner banner renders, and any client-side
		// navigation into a shell route runs with nothing to call.
		if (isSiteDocument && siteSeed && !readSwKeyCookie() && !getSessionToken()) {
			// What the `/.well-known/cloudillo/id-tag` fetch below would have
			// answered: a site host is served by its owner's own tenant, so the boot
			// seed already carries it. Without it there is no API client at all, and
			// a document embed (`site/island-components.tsx`) has no owner to resolve
			// its iframe against.
			setIdTag(siteSeed.owner.idTag)
			// `applyTheme`, not `setTheme`, as in the guest branch below: a reader
			// with no session must not overwrite a persisted preference. It is read
			// back rather than defaulted because this is the one boot path with no
			// `#initial-splash` over it — passing `undefined` here means "follow the
			// system", and a reader whose stored choice disagrees with their system
			// setting would watch the published page repaint into the other scheme.
			const stored = readStoredTheme()
			applyTheme(stored.theme, stored.colors)
			setAuth(null)
			settingsAppliedFor = null
			return
		}

		try {
			// Must be controlling (hard-reload scenarios) and holding the encryption key
			// before anything asks it for secrets. Memoized — shares one promise with
			// usePWA's mount effect.
			await ensureServiceWorker()

			// Stopping *before* setAuth matters: with unsynced CRDT documents at risk,
			// falling through would flash the login screen before the dialog mounts,
			// looking like an unexplained logout.
			const keyLoss = await assessKeyLoss()
			if (keyLoss) {
				console.warn('[Layout] Halting auth flow — unsynced work at risk')
				setKeyLoss(keyLoss)
				return
			}

			const storedApiKey = await getApiKey()

			const res = await fetch(`https://${window.location.host}/.well-known/cloudillo/id-tag`)
			if (!res.ok) {
				throw new Error('Failed to fetch idTag')
			}
			const j = await res.json()
			const ownerIdTag = typeof j.idTag === 'string' ? j.idTag : 'unknown'
			setIdTag(ownerIdTag)

			// No token — the SW injects one for own-tenant requests.
			const tempApi = createApiClient({
				idTag: ownerIdTag
			})

			// Silent exchange, if a remember-me key is stored.
			let authState: AuthState | undefined
			if (storedApiKey) {
				try {
					const tokenResult = await tempApi.auth.getAccessTokenByApiKey(storedApiKey)
					if (tokenResult?.token) {
						const authApi = createApiClient({
							idTag: ownerIdTag,
							authToken: tokenResult.token
						})
						const initResult = await authApi.auth.loginInit()
						if (initResult.status === 'authenticated') {
							authState = { ...initResult.login }
							await installToken(initResult.login.token)
						}
					}
				} catch (err) {
					console.error('API key auth failed:', err)
					if (err instanceof FetchError && err.httpStatus === 401) {
						console.warn('[Layout] API key rejected (401), clearing stale key')
						await deleteApiKey()
						toastWarning(t('Session expired. Please sign in again.'))
					}
				}
			}

			// Path B: no stored API key, but this tab may still hold a live token from a
			// no-remember-me session that survived a reload. Take it into the page
			// explicitly — an ambient SW-injected header would authenticate the probe
			// below without giving the shell a usable credential, so it would render
			// logged in while every file open failed.
			if (!authState) {
				const sessionToken = getSessionToken()
				if (sessionToken) {
					try {
						const authApi = createApiClient({
							idTag: ownerIdTag,
							authToken: sessionToken
						})
						const initResult = await authApi.auth.loginInit()
						if (initResult.status === 'authenticated') {
							authState = { ...initResult.login }
							await installToken(initResult.login.token)
						} else {
							// The server no longer honours it — drop it so it can't
							// authorise anything else this session.
							setCurrentAuthToken(undefined)
							await clearAuthToken().catch(() => {})
						}
					} catch (err) {
						console.warn('[Layout] session token rejected:', err)
						setCurrentAuthToken(undefined)
						await clearAuthToken().catch(() => {})
					}
				}
			}

			// Neither path produced a session — probe unauthenticated.
			if (!authState) {
				try {
					const initResult = await tempApi.auth.loginInit()
					if (initResult.status === 'authenticated') {
						authState = { ...initResult.login }
						await installToken(initResult.login.token)
					} else {
						setLoginInitData({
							qrLogin: initResult.qrLogin,
							webAuthn: initResult.webAuthn,
							maskedEmail: initResult.maskedEmail
						})
					}
				} catch (err) {
					// Null (not undefined) so the login components use their fallback.
					console.warn('[Layout] loginInit failed:', err)
					setAuth(null)
					settingsAppliedFor = null
					setLoginInitData(null)
				}
			}

			if (authState?.idTag) {
				// The registry must carry the home token before `setAuth` opens the auth
				// gate: `useContextAwareApi` reads it during the very render `setAuth`
				// triggers, and Layout's `syncApiToken` effect only runs after every
				// descendant effect on that commit.
				setApiToken(authState.idTag, authState.token)
				// UI settings before the auth gate opens: the boot splash stays up until
				// `setAuth`, so the user sees one fade-in of a fully populated shell
				// instead of a cascade of partial UIs. `settingsAppliedFor` is set before
				// `setAuth` so the warm branch doesn't re-apply them.
				await applyUiSettings(tempApi, authState)
				settingsAppliedFor = authState.idTag
				setAuth(authState)
				return
			}

			// Guest mode. `applyTheme`, not `setTheme` — a bounce through guest mode must
			// not wipe the previous user's persisted preference, and reading it back is
			// what keeps the repaint identical to what the pre-paint script chose.
			const storedTheme = readStoredTheme()
			applyTheme(storedTheme.theme, storedTheme.colors)
			setAuth(null)
			settingsAppliedFor = null
			// Only `/` needs a decision here: every other path is either guest-visible or
			// wrapped in the route tree's `RequireAuth`, which redirects on render. And
			// not on a published page, where `/` is the site's root alias — see the
			// same guard in `applyUiSettings`.
			if (!isSiteDocument && getPathname() === '/') navigate(feedPath(HOME_BASE))
		} catch (err) {
			console.error('Failed to fetch idTag:', err)
			// Resolve the auth gate anyway, or the boot splash never tears down and the
			// user stares at a white screen.
			setAuth(null)
			settingsAppliedFor = null
		}
	} else if (api && auth) {
		if (auth.idTag && settingsAppliedFor !== auth.idTag) {
			settingsAppliedFor = auth.idTag
			await applyUiSettings(api, auth)
		}
		// Once per identity, not once per token renewal — a renewal replaces the `auth`
		// object and so re-runs Layout's boot effect.
		if (auth.idTag && notificationsLoadedFor !== auth.idTag) {
			notificationsLoadedFor = auth.idTag
			loadNotifications()
		}
	}
}

// vim: ts=4
