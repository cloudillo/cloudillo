// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { setApiToken } from '@cloudillo/core'
import {
	Badge,
	BadgeAnchor,
	Button,
	DialogContainer,
	Logo,
	Menu,
	MenuDivider,
	MenuHeader,
	MenuItem,
	ProfilePicture,
	Heading,
	Text,
	useApi,
	useAuth,
	useDialog,
	useToast
} from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import { useAtomValue, useSetAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	// Menu icons
	LuLogIn as IcLogin,
	LuLogOut as IcLogout,
	LuMenu as IcMenu,
	LuMessagesSquare as IcMessages,
	LuQrCode as IcQrCode,
	LuSearch as IcSearch,
	LuSettings as IcSettings,
	LuUser as IcUser
} from 'react-icons/lu'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { useGlobalMessageUnreadProbe } from './apps/messages/index.js'
import { appRoutes, ContextRoot } from './apps/routes.js'
import { SharedResourceView } from './apps/shared.js'
import { authRoutes, loginInitAtom } from './auth/auth.js'
import { isBootSettingsApplied, resetBootSettingsApplied, runBootSequence } from './auth/boot.js'
import { KeyAccessError } from './auth/KeyAccessError.js'
import { keyLossAtom } from './auth/key-loss.js'
import { LogoutDialog } from './auth/LogoutDialog.js'
import { useTokenRenewal } from './auth/useTokenRenewal.js'
import { type DirtyDocSummary, listDirtyDocs, wipeLocalData } from './auth/wipe-local-data.js'
import { BusinessCardDialog } from './components/BusinessCard/BusinessCardDialog.js'
import { CameraCaptureDialog } from './components/CameraCapture/index.js'
import { DocumentPicker } from './components/DocumentPicker/index.js'
import { FeedPostHost } from './components/FeedPostHost.js'
import { MediaPicker } from './components/MediaPicker/index.js'
import { QrScannerDialog } from './components/QrScanner/index.js'
import { ShareCreate } from './components/ShareCreate/index.js'
import {
	CtxProvider,
	contextIdpEnabledAtom,
	favoritesAtom,
	Sidebar,
	useCommunitiesList,
	useContextTokenRenewal,
	useCtx,
	useProfileTrustBootstrap,
	useSidebar
} from './context/index.js'
import { UnknownContextBanner } from './context/unknown-context-banner.js'
import { CommunityVerifyIdpBanner } from './context/verify-idp-banner.js'
import { idpRoutes } from './idp/index.js'
import { CommunitySheet } from './layout/CommunitySheet.js'
import { ContextBar } from './layout/ContextBar.js'
import { Menu as AppMenu } from './layout/Menu.js'
import { Toasts } from './layout/Toasts.js'
import { appConfig as APP_CONFIG } from './manifest-registry.js'
import { getShellBus, initShellBus } from './message-bus'
import { createShellBusConfig } from './message-bus/shell-bus-config.js'
import { NotFound } from './NotFound.js'
import { NotificationPopover } from './notifications/NotificationPopover.js'
import { Notifications } from './notifications/notifications.js'
import { useNotifications } from './notifications/state'
import { useActionNotifications } from './notifications/useActionNotifications.js'
import { useDbMaintenanceNotifications } from './notifications/useDbMaintenanceNotifications.js'
import { useSearchReindexNotifications } from './notifications/useSearchReindexNotifications.js'
import { DocumentTitleSync, Omnibox } from './omnibox.js'
import { onboardingRoutes } from './onboarding/index.js'
import { authedProfileRoutes, profileRoutes } from './profile/profile.js'
import usePWA, {
	clearAuthToken,
	deleteApiKey,
	getApiKey,
	setCurrentAuthToken,
	type UsePWA
} from './pwa.js'
import { unreadCountAtom, useGlobalUnreadProbe } from './read-position.js'
import { ContextGuard, RequireAuth } from './route-guards.js'
import { ctxBase, messagesPath, profilePath, settingsPath } from './routes.js'
import { SearchPage } from './SearchPage.js'
import { openOmniboxAtom, toggleOmniboxAtom, useSearch } from './search.js'
import { settingsRoutes } from './settings/index.js'
import { isSiteDocument } from './site/detect.js'
import { SitePage } from './site/SitePage.js'
import { siteAdminRoutes } from './site-admin/index.js'
import { AppDock } from './ui/AppDock.js'
import { AppHeader, AppHeaderItem } from './ui/AppHeader.js'
import { AppShell } from './ui/AppShell.js'
import { GuestOwnerBanner } from './ui/GuestOwnerBanner.js'
import { HandChip } from './ui/HandChip.js'
import { useAppConfig } from './utils.js'
import { useWsBus, WsBusRoot } from './ws-bus.js'

import '@symbion/opalui'
import '@symbion/opalui/themes/opaque.css'
import '@symbion/opalui/themes/glass.css'
import '@cloudillo/fonts/fonts.css'
// The shell's own markup uses component-library classes (`.c-input-icon`,
// `.c-input-clear`, TreeView, …), so the stylesheet is a dependency of the entry point,
// not just of whichever feature module happens to pull it in.
import '@cloudillo/react/components.css'
import './style.css'

declare global {
	interface Window {
		__cloudilloBootStart?: number
	}
}

function Header({ inert }: { inert?: boolean }) {
	const [_appConfig, setAppConfig] = useAppConfig()
	const [auth, setAuth] = useAuth()
	const [search, setSearch] = useSearch()
	// Write-only: the toggle reads the last query itself, so the keydown effect's deps
	// stay stable while the user types.
	const toggleOmnibox = useSetAtom(toggleOmniboxAtom)
	const openOmnibox = useSetAtom(openOmniboxAtom)
	const { api, setIdTag } = useApi()
	const { t, i18n } = useTranslation()
	const location = useLocation()
	const navigate = useNavigate()
	// The boot effect deliberately does not re-run on navigation (that would replay
	// the warm branch and `loadNotifications()` on every route change), yet
	// `runBootSequence` still makes routing decisions after several awaits. This ref
	// is how it reads the path it is actually on rather than the one boot started on.
	const locationRef = React.useRef(location)
	locationRef.current = location
	//const [notifications, setNotifications] = React.useState<{ notifications?: number }>({})
	const { setNotifications, loadNotifications } = useNotifications()
	const { warning: toastWarning } = useToast()
	const setKeyLoss = useSetAtom(keyLossAtom)
	const [businessCardOpen, setBusinessCardOpen] = React.useState(false)
	const urlContext = useCtx().base
	const unreadCounts = useAtomValue(unreadCountAtom)
	// Conversations with anything unread — consistent across DMs (per-message counts)
	// and groups (0/1 dots). See read-position.ts.
	const unreadConversations = Object.entries(unreadCounts).filter(
		([k, v]) => k.startsWith('msg:') && v > 0
	).length

	// Ctrl+K / Cmd+K toggles the omnibox; a bare `/` or `@` (GitHub-style) opens
	// it pre-filled in command / profile-search mode.
	React.useEffect(() => {
		function isEditableTarget(el: Element | null): boolean {
			if (!el) return false
			const tag = el.tagName
			return (
				tag === 'INPUT' ||
				tag === 'TEXTAREA' ||
				tag === 'SELECT' ||
				(el as HTMLElement).isContentEditable
			)
		}
		function handleKeyDown(e: KeyboardEvent) {
			if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
				e.preventDefault()
				// Reopens prefilled with the last query, fully selected — the
				// address-bar idiom: typing replaces it, Home/End/arrows keep it.
				toggleOmnibox()
				return
			}
			if ((e.key === '/' || e.key === '@') && !e.ctrlKey && !e.metaKey && !e.altKey) {
				// Don't swallow a `/` or `@` the user is typing in a field.
				if (
					isEditableTarget(document.activeElement) ||
					isEditableTarget(e.target as Element)
				) {
					return
				}
				// A guest gets `/` (public commands) and full-text search, but not
				// `@`: profile search is `GET /api/profiles`, which is auth-only.
				if (!auth && e.key === '@') return
				e.preventDefault()
				setSearch({ query: e.key })
			}
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [setSearch, toggleOmnibox, auth])

	useWsBus({ cmds: ['ACTION'] }, function handleAction(msg) {
		// During onboarding the user handles incoming invites/connections inline
		// in the wizard; mirroring them into the notification bell is confusing
		// and can divert the flow. Skip ingestion until onboarding finishes — the
		// bell is reloaded fresh on completion (see Extras.finish).
		if (location.pathname.startsWith('/onboarding/')) return
		const action = msg.data as ActionView
		if (action.status == 'N' || action.status == 'C')
			setNotifications((n) => {
				if (n.notifications.some((a) => a.actionId === action.actionId)) return n
				return { notifications: [action, ...n.notifications] }
			})
	})

	const [logoutDialogOpen, setLogoutDialogOpen] = React.useState(false)
	const [logoutDirtyDocs, setLogoutDirtyDocs] = React.useState<DirtyDocSummary[]>([])

	async function requestLogout() {
		const dirty = await listDirtyDocs().catch((err) => {
			console.error('[Logout] failed to list dirty docs:', err)
			return [] as DirtyDocSummary[]
		})
		setLogoutDirtyDocs(dirty)
		setLogoutDialogOpen(true)
	}

	async function performLogout() {
		setLogoutDialogOpen(false)
		try {
			if (api) {
				const apiKey = await getApiKey()
				await api.auth
					.logout({ apiKey })
					.catch((err) => console.error('[Logout] server logout failed:', err))
			}
		} catch (err) {
			console.error('[Logout] server logout failed:', err)
		}
		// Wipe local state regardless of server-side outcome — the user has
		// asked to sign out, and a network failure shouldn't trap their data
		// on-device.
		setAuth(null)
		resetBootSettingsApplied()
		await clearAuthToken().catch(() => {})
		await deleteApiKey().catch(() => {})
		await wipeLocalData()
		navigate('/login')
	}

	const setLoginInitData = useSetAtom(loginInitAtom)
	const setFavorites = useSetAtom(favoritesAtom)
	const setContextIdpEnabled = useSetAtom(contextIdpEnabledAtom)

	React.useEffect(
		function onLoad() {
			const appConfig = APP_CONFIG
			// Seed the atom with the unnarrowed default only when boot is still
			// going to re-apply `ui.app_menu` on top of it. Every proactive token
			// renewal replaces `auth` and so re-runs this effect, but boot's warm
			// branch skips `applyUiSettings` — reseeding there would strand a user
			// who trimmed their app menu on the full default until they reload.
			// `runBootSequence` still gets the unnarrowed config below, as the base
			// `applyMenuConfig` narrows from.
			if (!isBootSettingsApplied(auth?.idTag)) setAppConfig(appConfig)

			void runBootSequence({
				api,
				auth,
				appConfig,
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
				getPathname: () => locationRef.current.pathname,
				navigate
			})
		},
		[api, auth]
	)

	const langItems = (
		<>
			<MenuItem label="English" onClick={() => i18n.changeLanguage('en')} />
			<MenuItem label="Magyar" onClick={() => i18n.changeLanguage('hu')} />
			<MenuHeader>Cloudillo V{process.env.CLOUDILLO_VERSION}</MenuHeader>
		</>
	)

	return (
		<>
			<AppHeader
				inert={inert}
				aria-label={t('Main navigation')}
				expanded={search.query != undefined}
				logo={<Logo size={50} />}
				start={
					<>
						{/* Renders null — it only keeps `document.title` in step with the route. */}
						<DocumentTitleSync />
						{/* Guests too: they may search the owner's public content, minus
							profiles — see `Omnibox`. */}
						{search.query != undefined && (
							<AppHeaderItem fill>
								<Omnibox />
							</AppHeaderItem>
						)}
					</>
				}
				// Context tier; hidden while the omnibox is open — the input takes the row.
				center={search.query == undefined && <ContextBar />}
				end={
					<>
						{auth && <HandChip />}
						<AppHeaderItem>
							<Button
								variant="ghost"
								icon={<IcSearch />}
								aria-label={t('Search')}
								onClick={() => openOmnibox()}
							/>
						</AppHeaderItem>
						{auth && (
							<AppHeaderItem className="sm-hide md-hide">
								{/* Always the user's own settings, never the URL's context —
									a community's own settings live on the rail. */}
								<Button
									variant="ghost"
									href={settingsPath(ctxBase(auth.idTag, auth.idTag))}
									icon={<IcSettings />}
									aria-label={t('My settings')}
								/>
							</AppHeaderItem>
						)}
						{auth && (
							<AppHeaderItem>
								<Button
									variant="ghost"
									href={messagesPath(urlContext)}
									aria-label={t('Messages')}
									icon={
										<BadgeAnchor
											badge={
												unreadConversations > 0 && (
													<Badge
														color="accent"
														role="status"
														aria-label={t('Unread messages')}
													>
														{unreadConversations}
													</Badge>
												)
											}
										>
											<IcMessages />
										</BadgeAnchor>
									}
								/>
							</AppHeaderItem>
						)}
						{auth && !location.pathname.startsWith('/onboarding/') && (
							<NotificationPopover />
						)}
						{auth ? (
							<AppHeaderItem>
								<Menu
									placement="bottom-end"
									trigger={
										<Button
											variant="ghost"
											icon={<ProfilePicture profile={auth} />}
											aria-label={t('User menu')}
										/>
									}
								>
									<MenuItem
										icon={<IcUser />}
										label={t('Profile')}
										href={profilePath(urlContext, 'me')}
									/>
									<MenuItem
										icon={<IcQrCode />}
										label={t('My Card')}
										onClick={() => setBusinessCardOpen(true)}
									/>
									{/* This is the *account* menu, so its Settings is the account's —
										a community's own settings live on the rail (ContextTools). */}
									<MenuItem
										icon={<IcSettings />}
										label={t('Settings')}
										href={settingsPath(ctxBase(auth.idTag, auth.idTag))}
									/>
									<MenuDivider />
									<MenuItem
										icon={<IcLogout />}
										label={t('Logout')}
										onClick={requestLogout}
									/>
									<MenuDivider />
									{langItems}
								</Menu>
							</AppHeaderItem>
						) : (
							<>
								<AppHeaderItem>
									<Menu
										placement="bottom-end"
										trigger={
											<Button
												variant="ghost"
												icon={<IcMenu />}
												aria-label={t('Menu')}
											/>
										}
									>
										{langItems}
									</Menu>
								</AppHeaderItem>
								<AppHeaderItem>
									<Button
										href="/login"
										color="accent"
										shape="pill"
										size="sm"
										className="c-signin-button"
										icon={<IcLogin />}
										aria-label={t('Sign in')}
									>
										<Text className="sm-hide">{t('Sign in')}</Text>
									</Button>
								</AppHeaderItem>
							</>
						)}
					</>
				}
			/>
			{!location.pathname.match('^/register/') && (
				<>
					{auth && <CommunitySheet />}
					<AppDock inert={inert} aria-label={t('Mobile navigation')}>
						<AppMenu vertical sidebarToggle inert={inert} />
					</AppDock>
				</>
			)}
			<BusinessCardDialog
				open={businessCardOpen}
				onClose={() => setBusinessCardOpen(false)}
			/>
			<LogoutDialog
				open={logoutDialogOpen}
				idTag={auth?.idTag}
				dirtyDocs={logoutDirtyDocs}
				onCancel={() => setLogoutDialogOpen(false)}
				onConfirm={performLogout}
			/>
		</>
	)
}

/**
 * The QR scanner's destination is context-scoped, so it reads `useCtx()` itself rather than
 * taking a base from `Layout` — which mounts the `<CtxProvider>` and is therefore above it.
 */
function QrScanner() {
	const navigate = useNavigate()
	const ctx = useCtx()

	return <QrScannerDialog onScan={(idTag) => navigate(profilePath(ctx.base, idTag))} />
}

function PlaceHolder({ title }: { title: string }) {
	return <Heading level={1}>{title}</Heading>
}

/**
 * The shell's one route tree — and, by being one tree, its section registry: every
 * top-level section name appears exactly **once** below, as a child of `:contextIdTag`.
 * There is deliberately no array of section names anywhere; `routes.ts` builds URLs by
 * shape, so a mistyped section just lands on the `*` fallback and renders nothing.
 *
 * **Route fragments are called, never rendered.** `createRoutesFromChildren` identity-checks
 * `element.type === React.Fragment` and recurses, while a *component* returning a fragment
 * trips its `invariant` and throws. Easiest thing to get wrong here.
 *
 * **Declaration order matters for ties.** `/s/:refId` scores 17, and so does every
 * two-segment static context branch (`/:contextIdTag/search`, `/settings`, …). React
 * Router's `compareIndexes` returns 0 for non-siblings, so a tie falls through to JSX order
 * via a stable sort: the context-free routes must stay declared *before* the context
 * subtree, or `/s/search` would render the search page.
 *
 * **The guard runs after ranking, not before.** A context branch with static deeper segments
 * can out-score a static-prefixed route — `/register/app/files` matches
 * `/:contextIdTag/app/files` (28) over `/register/:token/:providerType` (21) — and
 * `ContextGuard` then renders the 404. Unreachable in practice (registration tokens are
 * random), but it is why the guard is a guard and not just a nicety.
 *
 * **No redirect shim for the old section-first URLs** (`/app/<ctx>/…`, `/settings/<ctx>`).
 * The backend's `is_shell_route` allowlist (cloudillo-rs,
 * `crates/cloudillo/src/routes/static_files.rs`) 404s those shapes before the SPA is ever
 * served, so a client-side shim would be dead code.
 *
 * **Guest policy is the pathless `RequireAuth` layout route.** Contributing no path segments,
 * it changes no ranking; it just draws the line between the sections a share-link visitor
 * may reach (`app`, `profile`, `search`) and the ones needing a session. It must not wrap
 * `ContextGuard` or those three, or a guest following `/s/:refId` → `/@owner/app/…` would
 * bounce to `/login`.
 *
 * **Published site pages take over two routes.** A page served by the site wrapper
 * carries `#cl-site-content` (`site/detect.js`), and the shell is its runtime:
 * `SitePage` adopts that server-rendered node. It claims the terminal `*` —
 * deliberately *after* the context subtree, so it can never shadow `/@idTag/…` — and
 * the `ContextGuard` fallback, which is where a site path lands in practice: a
 * dynamic `:contextIdTag` segment outranks the splat, so `/blog/hello` matches the
 * context subtree first and the guard hands a non-context segment back.
 *
 * **Neither is gated on `isSiteDocument`.** They were, and that made a site page
 * reachable only from another site page: the flag is captured once at module load
 * (`site/detect.js`), so a `<Link>` from a *shell* document — a search hit, most of
 * all — fell through to `NotFound` for a page that exists. `SitePage` needs no server
 * node to render one; with no `#cl-site-content` to adopt its `followRoute` effect
 * fetches the fragment instead (`site/SitePage.tsx`, `loadSiteFragment`), which is the
 * same path an in-site click already takes. A path that is *not* a page still 404s,
 * as `SiteNotFound` rather than the shell's own — one fetch to tell them apart.
 *
 * `/` stays the home placeholder on a shell document: a site's root alias resolves
 * there server-side, so the flag is the only thing separating "this node's home" from
 * "this site's front page", and there it is still the right question.
 */
function ShellRoutes({ pwa }: { pwa: UsePWA }) {
	return (
		<Routes>
			{/* A site's root alias is served at `/`, so this one is site-owned too —
			    see the site note above the function. */}
			<Route
				path="/"
				element={isSiteDocument ? <SitePage /> : <PlaceHolder title="Home" />}
			/>
			{/* Before the context subtree on purpose — see the tie-break note above. */}
			{authRoutes()}
			{onboardingRoutes(pwa)}
			<Route path="/s/:refId" element={<SharedResourceView />} />
			{/* `:contextIdTag` is a dynamic segment, and React Router ranks those above
			    the terminal splat whatever the declaration order — so every site path
			    lands here first, not on the `*` route below. The guard hands a
			    non-context segment back to `SitePage` on a site document. */}
			<Route path=":contextIdTag" element={<ContextGuard fallback={<SitePage />} />}>
				{/* Load-bearing: without it `/~` renders the guard with an empty outlet
				    and goes blank instead of redirecting to the context's feed. */}
				<Route index element={<ContextRoot />} />
				{/* Guest-visible: a share link must render for an anonymous visitor. */}
				{appRoutes()}
				{profileRoutes()}
				<Route path="search" element={<SearchPage />} />
				<Route element={<RequireAuth />}>
					{settingsRoutes(pwa)}
					{siteAdminRoutes()}
					{idpRoutes()}
					{authedProfileRoutes()}
					<Route path="notifications" element={<Notifications />} />
				</Route>
				{/* An unknown section under a valid context — the guard above only
				    vets segment 1. */}
				<Route path="*" element={<NotFound />} />
			</Route>
			<Route path="*" element={<SitePage />} />
		</Routes>
	)
}

export function Layout() {
	const { i18n } = useTranslation()
	const pwa = usePWA()
	const [auth] = useAuth()
	const { api } = useApi()
	const dialog = useDialog()
	const sidebar = useSidebar()
	const { loadCommunities } = useCommunitiesList()
	const keyLoss = useAtomValue(keyLossAtom)
	useTokenRenewal() // Automatic auth token renewal
	useContextTokenRenewal() // Proactive proxy-token renewal for trusted foreign profiles
	useProfileTrustBootstrap() // Seed persisted per-profile trust from the backend
	useActionNotifications() // Sound and toast notifications for incoming actions
	useSearchReindexNotifications() // Toast when a search index rebuild finishes
	useDbMaintenanceNotifications() // Toast when a database optimization finishes
	useGlobalUnreadProbe() // App-wide feed-unread counts for nav/sidebar dots
	useGlobalMessageUnreadProbe() // App-wide message-unread counts for nav badge

	React.useEffect(
		function syncAuthTokenToSw() {
			// `undefined` is the "still booting" state, not "logged out". Clearing
			// here would wipe the sessionStorage token that boot Path B is about
			// to adopt for a no-remember-me session.
			if (auth === undefined) return
			setCurrentAuthToken(auth?.token)
		},
		[auth]
	)

	// The last idTag whose token this effect installed, so the logout branch knows
	// what to clear: `auth` is already null by then and carries no idTag of its own.
	const homeIdTagRef = React.useRef<string | undefined>(undefined)

	React.useEffect(
		function syncApiToken() {
			// `undefined` is "still booting", as above.
			if (auth === undefined) return
			if (auth?.idTag) {
				homeIdTagRef.current = auth.idTag
				// Safety net, not the primary writer: the paths that own a token
				// (boot, login, renewal) call `setApiToken` before `setAuth`, since
				// this effect only runs after every descendant effect on the commit.
				// It stays, idempotently, for the `setAuth` callers that don't
				// (onboarding/welcome, QrLoginPanel, profile).
				setApiToken(auth.idTag, auth.token)
			} else if (homeIdTagRef.current) {
				// Logout or a dead session. The registry outlives the React tree and
				// guest mode resolves to this very entry, so the bearer has to be
				// dropped here or it keeps authorising requests until its `exp`.
				setApiToken(homeIdTagRef.current, undefined)
				homeIdTagRef.current = undefined
			}
		},
		[auth]
	)

	// Tear down the inline boot splash (#initial-splash in index.html) once
	// auth has resolved (success or guest) or the key-loss UI is taking over.
	// A 250 ms minimum visible duration prevents a render-then-instant-teardown
	// flash on warm cache hits.
	React.useEffect(() => {
		if (auth === undefined && !keyLoss) return
		const el = document.getElementById('initial-splash')
		if (!el) return
		const bootStart = window.__cloudilloBootStart ?? 0
		const elapsed = performance.now() - bootStart
		const delay = Math.max(0, 250 - elapsed)
		let removeTimer: ReturnType<typeof setTimeout> | undefined
		const fadeTimer = setTimeout(() => {
			el.classList.add('fading')
			removeTimer = setTimeout(() => el.remove(), 260)
		}, delay)
		return () => {
			clearTimeout(fadeTimer)
			if (removeTimer) clearTimeout(removeTimer)
		}
	}, [auth, keyLoss])

	// Load communities list from backend when authenticated
	// (pinned communities are loaded from pre-fetched ui settings in Header)
	React.useEffect(() => {
		if (auth?.idTag) {
			loadCommunities()
		}
	}, [auth?.idTag, loadCommunities])

	// Store current api/auth in refs for shell bus callbacks
	const apiRef = React.useRef(api)
	const authRef = React.useRef(auth)
	React.useEffect(() => {
		apiRef.current = api
		authRef.current = auth
	}, [api, auth])

	// Initialize shell message bus on mount
	React.useEffect(() => {
		if (!getShellBus()) {
			initShellBus(createShellBusConfig({ apiRef, authRef, i18n }))
		}
	}, [])

	if (keyLoss) {
		return (
			<KeyAccessError
				dirtyDocs={keyLoss.dirtyDocs}
				onReload={() => window.location.reload()}
			/>
		)
	}

	// Note: while `auth === undefined`, the inline #initial-splash element in
	// index.html (position: fixed; z-index: 10000) visually covers everything
	// underneath. We intentionally do NOT return null here — Header owns the
	// boot waterfall effect that calls setAuth, so it must mount on first
	// render or the splash would stay up forever.

	return (
		<WsBusRoot>
			{/* Everything below reads the URL's context through `useCtx()`. */}
			<CtxProvider>
				<AppShell
					sidebar={<Sidebar />}
					sidebarPinned={sidebar.isPinned}
					header={<Header inert={dialog.isOpen} />}
					inert={dialog.isOpen}
				>
					<GuestOwnerBanner />
					<CommunityVerifyIdpBanner />
					<UnknownContextBanner />
					<ShellRoutes pwa={pwa} />
				</AppShell>
				<DialogContainer />
				<Toasts />
				<MediaPicker />
				<ShareCreate />
				<DocumentPicker />
				<QrScanner />
				<FeedPostHost />
				<CameraCaptureDialog />
			</CtxProvider>
		</WsBusRoot>
	)
}

// vim: ts=4
