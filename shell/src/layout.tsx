// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { setApiToken } from '@cloudillo/core'
import {
	Button,
	DialogContainer,
	mergeClasses,
	Popper,
	ProfilePicture,
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
	LuQrCode as IcQrCode,
	LuSettings as IcSettings,
	LuUser as IcUser
} from 'react-icons/lu'
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { useGlobalMessageUnreadProbe } from './apps/messages/index.js'
import { AppRoutes } from './apps/routes.js'
import { SharedResourceView } from './apps/shared.js'
import { AuthRoutes, loginInitAtom } from './auth/auth.js'
import { isBootSettingsApplied, resetBootSettingsApplied, runBootSequence } from './auth/boot.js'
import { KeyAccessError } from './auth/KeyAccessError.js'
import { keyLossAtom } from './auth/key-loss.js'
import { LogoutDialog } from './auth/LogoutDialog.js'
import { useTokenRenewal } from './auth/useTokenRenewal.js'
import { type DirtyDocSummary, listDirtyDocs, wipeLocalData } from './auth/wipe-local-data.js'
import { BusinessCardDialog } from './components/BusinessCard/BusinessCardDialog.js'
import { CameraCaptureDialog } from './components/CameraCapture/index.js'
import { DocumentPicker } from './components/DocumentPicker/index.js'
import { GuestOwnerChip } from './components/GuestOwnerChip.js'
import { HandChip } from './components/HandChip.js'
import { MediaPicker } from './components/MediaPicker/index.js'
import { QrScannerDialog } from './components/QrScanner/index.js'
import { ShareCreate } from './components/ShareCreate/index.js'
import {
	contextIdpEnabledAtom,
	favoritesAtom,
	HOME_CONTEXT,
	Sidebar,
	useCommunitiesList,
	useContextTokenRenewal,
	useProfileTrustBootstrap,
	useSidebar,
	useUrlContextIdTag
} from './context/index.js'
import { CommunityVerifyIdpBanner } from './context/verify-idp-banner.js'
import { ErrorBoundary } from './ErrorBoundary.js'
import { IdpRoutes } from './idp'
import { Menu } from './layout/Menu.js'
import { Toasts } from './layout/Toasts.js'
import { CloudilloLogo } from './logo.js'
import { appConfig as APP_CONFIG } from './manifest-registry.js'
import { getShellBus, initShellBus } from './message-bus'
import { createShellBusConfig } from './message-bus/shell-bus-config.js'
import { NotificationPopover } from './notifications/NotificationPopover.js'
import { Notifications } from './notifications/notifications.js'
import { useNotifications } from './notifications/state'
import { useActionNotifications } from './notifications/useActionNotifications.js'
import { Breadcrumb, DocumentTitleSync, Omnibox } from './omnibox.js'
import { OnboardingRoutes } from './onboarding'
import { ProfileRoutes } from './profile/profile.js'
import usePWA, { clearAuthToken, deleteApiKey, getApiKey, setCurrentAuthToken } from './pwa.js'
import { useGlobalUnreadProbe } from './read-position.js'
import { useSearch } from './search.js'
import { SettingsRoutes } from './settings'
import { SiteAdminRoutes } from './site-admin'
import { useAppConfig } from './utils.js'
import { useWsBus, WsBusRoot } from './ws-bus.js'

import '@symbion/opalui'
//import '@symbion/opalui/src/opalui.css'
// Use Cloudillo-specific themes with local fonts (no Google Fonts CDN)
import './themes/opaque.css'
import './themes/glass.css'
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
	const [_menuOpen, setMenuOpen] = React.useState(false)
	const [businessCardOpen, setBusinessCardOpen] = React.useState(false)
	const urlContext = useUrlContextIdTag()
	const [extraMenuPortalMobile, setExtraMenuPortalMobile] = React.useState<HTMLDivElement | null>(
		null
	)
	const [extraMenuPortalDesktop, setExtraMenuPortalDesktop] =
		React.useState<HTMLDivElement | null>(null)

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
				setSearch((prev) => (prev.query == undefined ? { query: '' } : {}))
				return
			}
			if ((e.key === '/' || e.key === '@') && !e.ctrlKey && !e.metaKey && !e.altKey) {
				// Don't swallow a `/` or `@` the user is typing in a field, and only
				// open for authenticated users (the omnibox replaces the old search).
				if (
					isEditableTarget(document.activeElement) ||
					isEditableTarget(e.target as Element)
				) {
					return
				}
				if (!auth) return
				e.preventDefault()
				setSearch({ query: e.key })
			}
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [setSearch, auth])

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
		setMenuOpen(false)
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

	function setLang(evt: React.MouseEvent, lang: string) {
		evt.preventDefault()
		i18n.changeLanguage(lang)
		setMenuOpen(false)
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

	return (
		<>
			{/* Portal container for extra menu on desktop - rendered before nav-top */}
			<div
				ref={setExtraMenuPortalDesktop}
				className="c-extra-menu-portal-desktop sm-hide md-hide"
			/>
			<nav
				inert={inert}
				className="c-nav nav-top justify-content-between border-radius-0 mb-2 g-1"
				aria-label={t('Main navigation')}
			>
				<ul
					className={mergeClasses(
						'c-nav-group g-1',
						// Only the focused omnibox grows to fill the row; the idle
						// breadcrumb stays content-sized so the menu keeps clear of
						// the right-hand icons.
						search.query != undefined && 'flex-fill'
					)}
				>
					<li
						className={mergeClasses(
							'c-nav-item',
							search.query != undefined && 'sm-hide'
						)}
					>
						<CloudilloLogo style={{ height: 32 }} />
					</li>
					{!auth && api?.idTag && (
						<li className="c-nav-item">
							<GuestOwnerChip idTag={api.idTag} />
						</li>
					)}
					<DocumentTitleSync />
					{auth && (
						<li
							className={mergeClasses(
								'c-nav-item',
								search.query != undefined && 'flex-fill'
							)}
							style={{ minWidth: 0 }}
						>
							{search.query == undefined ? <Breadcrumb /> : <Omnibox />}
						</li>
					)}
				</ul>
				{search.query == undefined && (
					<ul className="c-nav-group g-3 sm-hide md-hide">
						<Menu inert={inert} extraMenuPortal={extraMenuPortalDesktop} />
					</ul>
				)}
				<ul className="c-nav-group c-hbox">
					{auth && <HandChip />}
					{auth && !location.pathname.startsWith('/onboarding/') && (
						<NotificationPopover />
					)}
					{auth ? (
						<Popper
							className="c-nav-item"
							aria-label={t('User menu')}
							icon={<ProfilePicture profile={auth} />}
						>
							<ul className="c-nav vertical emph">
								<li>
									<Link
										className="c-nav-item"
										to={`/profile/${urlContext || HOME_CONTEXT}/me`}
									>
										<IcUser />
										{t('Profile')}
									</Link>
								</li>
								<li>
									<Button
										kind="nav-item"
										onClick={() => setBusinessCardOpen(true)}
									>
										<IcQrCode />
										{t('My Card')}
									</Button>
								</li>
								<li>
									<Link
										className="c-nav-item"
										to={`/settings/${urlContext || HOME_CONTEXT}`}
									>
										<IcSettings />
										{t('Settings')}
									</Link>
								</li>
								<li>
									<hr className="w-100" />
								</li>
								<li>
									<Button kind="nav-item" onClick={requestLogout}>
										<IcLogout />
										{t('Logout')}
									</Button>
								</li>
								<li>
									<hr className="w-100" />
								</li>
								<li>
									<Button
										kind="nav-item"
										onClick={(evt) => {
											evt.preventDefault()
											i18n.changeLanguage('en')
										}}
									>
										English
									</Button>
								</li>
								<li>
									<Button kind="nav-item" onClick={(evt) => setLang(evt, 'hu')}>
										Magyar
									</Button>
								</li>
								<li className="text-disabled">
									Cloudillo V{process.env.CLOUDILLO_VERSION}
								</li>
							</ul>
						</Popper>
					) : (
						<>
							<Popper className="c-nav-item" aria-label={t('Menu')} icon={<IcMenu />}>
								<ul className="c-nav vertical emph">
									{location.pathname.startsWith('/s/') && (
										<li>
											<Link className="c-nav-item" to="/login">
												<IcLogin />
												{t('Sign in')}
											</Link>
										</li>
									)}
									{api?.idTag && (
										<li>
											<Link
												className="c-nav-item"
												to={`/profile/${HOME_CONTEXT}/me`}
											>
												<IcUser />
												{t('Owner profile')}
											</Link>
										</li>
									)}
									<li>
										<hr className="w-100" />
									</li>
									<li>
										<Button
											kind="nav-item"
											onClick={(evt) => {
												evt.preventDefault()
												i18n.changeLanguage('en')
											}}
										>
											English
										</Button>
									</li>
									<li>
										<Button
											kind="nav-item"
											onClick={(evt) => setLang(evt, 'hu')}
										>
											Magyar
										</Button>
									</li>
									<li className="text-disabled">
										Cloudillo V{process.env.CLOUDILLO_VERSION}
									</li>
								</ul>
							</Popper>
							{!location.pathname.startsWith('/s/') && (
								<li className="c-nav-item">
									<Link to="/login" className="c-button accent pill small">
										<IcLogin />
										{t('Sign in')}
									</Link>
								</li>
							)}
						</>
					)}
				</ul>
			</nav>
			{!location.pathname.match('^/register/') && (
				<>
					{/* Portal container for extra menu - rendered before nav-bottom to avoid stacking issues */}
					<div ref={setExtraMenuPortalMobile} className="c-extra-menu-portal lg-hide" />
					<nav
						inert={inert}
						className="c-nav nav-bottom w-100 border-radius-0 justify-content-center flex-order-end lg-hide"
						aria-label={t('Mobile navigation')}
					>
						<Menu vertical inert={inert} extraMenuPortal={extraMenuPortalMobile} />
					</nav>
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

export function Layout() {
	const { t, i18n } = useTranslation()
	const pwa = usePWA()
	const [auth] = useAuth()
	const { api } = useApi()
	const dialog = useDialog()
	const sidebar = useSidebar()
	const { loadCommunities } = useCommunitiesList()
	const navigate = useNavigate()
	const urlContext = useUrlContextIdTag()
	const keyLoss = useAtomValue(keyLossAtom)
	useTokenRenewal() // Automatic auth token renewal
	useContextTokenRenewal() // Proactive proxy-token renewal for trusted foreign profiles
	useProfileTrustBootstrap() // Seed persisted per-profile trust from the backend
	useActionNotifications() // Sound and toast notifications for incoming actions
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
		<>
			<a className="c-skip-link" href="#main-content">
				{t('Skip to main content')}
			</a>
			<WsBusRoot>
				{auth && <Sidebar />}
				<Header inert={dialog.isOpen} />
				<div
					className={mergeClasses('c-layout', sidebar.isPinned && auth && 'with-sidebar')}
				>
					<ErrorBoundary>
						<div
							id="main-content"
							inert={dialog.isOpen}
							className="c-vbox flex-fill h-min-0"
						>
							<CommunityVerifyIdpBanner />
							<ProfileRoutes />
							<AuthRoutes />
							<SettingsRoutes pwa={pwa} />
							<SiteAdminRoutes />
							<IdpRoutes />
							<AppRoutes />
							<OnboardingRoutes pwa={pwa} />
							<Routes>
								<Route path="/s/:refId" element={<SharedResourceView />} />
								<Route path="/notifications" element={<Notifications />} />
								<Route path="*" element={null} />
							</Routes>
						</div>
					</ErrorBoundary>
					<div className="pt-1" />
				</div>
				<div id="popper-container" />
				<DialogContainer />
				<Toasts />
				<MediaPicker />
				<ShareCreate />
				<DocumentPicker />
				<QrScannerDialog
					onScan={(idTag) => navigate(`/profile/${urlContext || HOME_CONTEXT}/${idTag}`)}
				/>
				<CameraCaptureDialog />
			</WsBusRoot>
		</>
	)
}

// vim: ts=4
