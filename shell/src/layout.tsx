// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { appConfig as APP_CONFIG, applyMenuConfig } from './manifest-registry.js'

import { version } from '../package.json'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { Routes, Route, Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import {
	LuUserSearch as IcSearchUser,
	LuUser as IcUser,
	LuGrip as IcApps,
	// Menu icons
	LuLogIn as IcLogin,
	LuLogOut as IcLogout,
	LuMenu as IcMenu,
	LuFileText as IcFileText,
	LuSettings as IcSettings,
	LuCircleAlert as IcWarning,
	LuRefreshCw as IcRefresh,
	LuTrash2 as IcClear,
	LuQrCode as IcQrCode,
	LuScanLine as IcScan
} from 'react-icons/lu'
import { CloudilloLogo } from './logo.js'

import type { ActionView } from '@cloudillo/types'
import {
	useAuth,
	type AuthState,
	useApi,
	useDialog,
	useToast,
	mergeClasses,
	ProfilePicture,
	Popper,
	Button,
	DialogContainer,
	ToastContainer
} from '@cloudillo/react'
import { createApiClient, FetchError } from '@cloudillo/core'
import { useSetAtom } from 'jotai'
import { useAppConfig } from './utils.js'
import usePWA, {
	registerServiceWorker,
	ensureEncryptionKey,
	getApiKey,
	deleteApiKey,
	clearAuthToken,
	cleanupEncryptionCookie,
	onKeyAccessError,
	resetEncryptionState,
	type KeyErrorReason
} from './pwa.js'
import { AuthRoutes, loginInitAtom } from './auth/auth.js'
import { useTokenRenewal } from './auth/useTokenRenewal.js'
import { useContextTokenRenewal, useProfileTrustBootstrap } from './context/index.js'
import { useActionNotifications } from './notifications/useActionNotifications.js'
import {
	Sidebar,
	useSidebar,
	useCommunitiesList,
	useCurrentContextIdTag,
	useContextPath,
	useGuestDocument,
	favoritesAtom
} from './context/index.js'
import { OnboardingRoutes } from './onboarding'
import { WsBusRoot, useWsBus } from './ws-bus.js'
import { SearchBar, useSearch } from './search.js'
import { SettingsRoutes, setTheme } from './settings'
import { SiteAdminRoutes } from './site-admin'
import { IdpRoutes } from './idp'
import { AppRoutes } from './apps'
import { initShellBus, getShellBus } from './message-bus'
import { ErrorBoundary } from './ErrorBoundary.js'
import { SharedResourceView } from './apps/shared.js'
import { ProfileRoutes } from './profile/profile.js'
import { Notifications } from './notifications/notifications.js'
import { useNotifications } from './notifications/state'
import { NotificationPopover } from './notifications/NotificationPopover.js'
import { MediaPicker } from './components/MediaPicker/index.js'
import { ShareCreate } from './components/ShareCreate/index.js'
import { DocumentPicker } from './components/DocumentPicker/index.js'
import { BusinessCardDialog } from './components/BusinessCard/BusinessCardDialog.js'
import { QrScannerDialog, useQrScanner } from './components/QrScanner/index.js'
import { CameraCaptureDialog } from './components/CameraCapture/index.js'

import '@symbion/opalui'
//import '@symbion/opalui/src/opalui.css'
// Use Cloudillo-specific themes with local fonts (no Google Fonts CDN)
import './themes/opaque.css'
import './themes/glass.css'
import './style.css'

// Truncate filename while preserving extension
function truncateFileName(name: string, maxLen: number = 12): string {
	if (name.length <= maxLen) return name
	const extIdx = name.lastIndexOf('.')
	if (extIdx > 0 && name.length - extIdx <= 6) {
		// Keep extension visible
		const baseName = name.substring(0, extIdx)
		const extension = name.substring(extIdx)
		const available = maxLen - extension.length - 1 // -1 for "…"
		if (available > 0) {
			return baseName.substring(0, available) + '…' + extension
		}
	}
	return name.substring(0, maxLen - 1) + '…'
}

function Menu({
	inert,
	vertical,
	extraMenuPortal
}: {
	inert?: boolean
	vertical?: boolean
	extraMenuPortal?: HTMLElement | null
}) {
	const { t, i18n } = useTranslation()
	const location = useLocation()
	const [appConfig, _setAppConfig] = useAppConfig()
	const [auth, _setAuth] = useAuth()
	const [moreMenuOpen, setMoreMenuOpen] = React.useState(false)
	const { contextIdTag, getContextPath } = useContextPath()
	const sidebar = useSidebar()
	const [guestDocument] = useGuestDocument()
	const [, setQrScannerOpen] = useQrScanner()

	React.useEffect(
		function onLocationChange() {
			setMoreMenuOpen(false)
		},
		[location]
	)

	// Filter visible menu items based on auth state
	const staticItems =
		appConfig?.menu.filter(
			(item) => (!!auth && (!item.perm || auth.roles?.includes(item.perm))) || item.public
		) || []

	// Build guest document menu item if available
	const guestDocMenuItem = guestDocument
		? {
				id: 'guest-doc',
				icon: IcFileText,
				label: truncateFileName(guestDocument.fileName),
				trans: {} as Record<string, string>,
				path: `/app/${guestDocument.ownerIdTag}/${guestDocument.appId}/${guestDocument.resId}${guestDocument.accessLevel !== 'write' ? `?access=${guestDocument.accessLevel}` : ''}`,
				public: true
			}
		: null

	// Prepend guest doc item to visible items
	const visibleItems = guestDocMenuItem ? [guestDocMenuItem, ...staticItems] : staticItems

	// Threshold for showing all items inline vs using "More" menu
	const MAX_INLINE_ITEMS = 4
	const needsMoreMenu = visibleItems.length > MAX_INLINE_ITEMS

	// Split items: first N inline, rest in "More" menu
	const inlineItems = needsMoreMenu ? visibleItems.slice(0, MAX_INLINE_ITEMS) : visibleItems
	const moreItems = needsMoreMenu ? visibleItems.slice(MAX_INLINE_ITEMS) : []

	return (
		!location.pathname.match('^/register/') && (
			<>
				{/* Sidebar toggle button on mobile (first item) - shows current context */}
				{vertical && auth && (
					<Button
						navLink
						className={mergeClasses('vertical', sidebar.isOpen && 'active')}
						onClick={() => sidebar.toggle()}
						aria-label={t('Toggle sidebar')}
						aria-expanded={sidebar.isOpen}
					>
						<ProfilePicture
							profile={{ profilePic: auth.profilePic }}
							srcTag={contextIdTag || auth.idTag}
							tiny
						/>
						<span className="c-nav-label">{contextIdTag || auth.idTag}</span>
					</Button>
				)}
				{/* Extra menu: use portal on mobile (when extraMenuPortal is provided), inline otherwise */}
				{needsMoreMenu &&
					extraMenuPortal &&
					createPortal(
						<nav
							inert={inert}
							className={mergeClasses('c-nav c-extra-menu', moreMenuOpen && 'open')}
						>
							{moreItems.map((menuItem) => (
								<NavLink
									key={menuItem.id}
									className="c-nav-link h-small vertical"
									to={getContextPath(menuItem.path)}
								>
									{menuItem.icon && React.createElement(menuItem.icon)}
									<span className="c-nav-label">
										{menuItem.trans?.[i18n.language] || menuItem.label}
									</span>
								</NavLink>
							))}
							{auth && (
								<Button
									navLink
									className="h-small vertical"
									onClick={() => setQrScannerOpen(true)}
								>
									<IcScan />
									<span className="c-nav-label">{t('Scan QR')}</span>
								</Button>
							)}
						</nav>,
						extraMenuPortal
					)}
				{needsMoreMenu && !extraMenuPortal && (
					<div inert={inert} className="c-menu-ex flex-order-end">
						<nav className={mergeClasses('c-nav', moreMenuOpen && 'open')}>
							{moreItems.map((menuItem) => (
								<NavLink
									key={menuItem.id}
									className="c-nav-link h-small vertical"
									to={getContextPath(menuItem.path)}
								>
									{menuItem.icon && React.createElement(menuItem.icon)}
									<span className="c-nav-label">
										{menuItem.trans?.[i18n.language] || menuItem.label}
									</span>
								</NavLink>
							))}
							{auth && (
								<Button
									navLink
									className="h-small vertical"
									onClick={() => setQrScannerOpen(true)}
								>
									<IcScan />
									<span className="c-nav-label">{t('Scan QR')}</span>
								</Button>
							)}
						</nav>
					</div>
				)}
				{inlineItems.map((menuItem) => (
					<NavLink
						key={menuItem.id}
						className={mergeClasses('c-nav-link', vertical && 'vertical')}
						to={getContextPath(menuItem.path)}
					>
						{menuItem.icon && React.createElement(menuItem.icon)}
						<span className="c-nav-label">
							{menuItem.trans?.[i18n.language] || menuItem.label}
						</span>
					</NavLink>
				))}
				{needsMoreMenu && (
					<Button
						navLink
						className={mergeClasses(vertical && 'vertical')}
						onClick={() => setMoreMenuOpen(!moreMenuOpen)}
						aria-label={t('More menu items')}
						aria-expanded={moreMenuOpen}
					>
						<IcApps />
						<span className="c-nav-label">{t('More')}</span>
					</Button>
				)}
			</>
		)
	)
}

/**
 * Built-in app IDs that are rendered directly as React components (not microfrontends)
 */
const BUILTIN_APPS = ['files', 'feed', 'gallery', 'messages', 'contacts', 'view']

/**
 * Check if a path is an external app (microfrontend loaded in iframe)
 */
function _isExternalAppPath(pathname: string): boolean {
	// Match /app/:contextIdTag/:appId/* or /app/:appId/*
	const match = pathname.match(/^\/app\/(?:([^/]+)\/)?([^/]+)/)
	if (!match) return false

	// Check if it's a context-aware route or legacy route
	const [, contextIdTag, segment] = match

	// If we have a contextIdTag-like segment followed by an appId
	if (contextIdTag && segment) {
		// segment is the appId
		return !BUILTIN_APPS.includes(segment)
	}

	// Legacy route: /app/:appId/*
	// contextIdTag is actually the appId here
	return !BUILTIN_APPS.includes(contextIdTag)
}

/**
 * Check if a path is accessible to guests (unauthenticated users)
 */
function isGuestPath(pathname: string): boolean {
	return (
		pathname === '/' ||
		pathname.startsWith('/app/') ||
		pathname.startsWith('/profile/') ||
		pathname.startsWith('/s/') || // Shared resource links
		pathname.startsWith('/login') ||
		pathname.startsWith('/register/') ||
		pathname.startsWith('/onboarding/') ||
		pathname.startsWith('/reset-password/') || // Password reset links
		pathname.startsWith('/idp/activate/') // IDP activation links
	)
}

/**
 * Handle guest/auth redirect based on current path
 * Returns the path to navigate to, or undefined if no redirect needed
 */
function getGuestRedirect(pathname: string, ownerIdTag: string): string | undefined {
	if (pathname === '/') {
		// Redirect root to public feed
		return `/app/${ownerIdTag}/feed`
	}
	if (!isGuestPath(pathname)) {
		// Non-guest path requires login
		return '/login'
	}
	return undefined
}

function Header({ inert }: { inert?: boolean }) {
	const [_appConfig, setAppConfig] = useAppConfig()
	const [auth, setAuth] = useAuth()
	const [search, setSearch] = useSearch()
	const { api, setIdTag } = useApi()
	const { t, i18n } = useTranslation()
	const location = useLocation()
	const navigate = useNavigate()
	//const [notifications, setNotifications] = React.useState<{ notifications?: number }>({})
	const { setNotifications, loadNotifications } = useNotifications()
	const { warning: toastWarning } = useToast()
	const [_menuOpen, setMenuOpen] = React.useState(false)
	const [businessCardOpen, setBusinessCardOpen] = React.useState(false)
	const contextIdTag = useCurrentContextIdTag()
	const [extraMenuPortalMobile, setExtraMenuPortalMobile] = React.useState<HTMLDivElement | null>(
		null
	)
	const [extraMenuPortalDesktop, setExtraMenuPortalDesktop] =
		React.useState<HTMLDivElement | null>(null)

	// Ctrl+K / Cmd+K keyboard shortcut for search
	React.useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
				e.preventDefault()
				setSearch((prev) => (prev.query == undefined ? { query: '' } : {}))
			}
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [setSearch])

	useWsBus({ cmds: ['ACTION'] }, function handleAction(msg) {
		const action = msg.data as ActionView
		if (action.status == 'N' || action.status == 'C')
			setNotifications((n) => {
				if (n.notifications.some((a) => a.actionId === action.actionId)) return n
				return { notifications: [action, ...n.notifications] }
			})
	})

	async function doLogout() {
		if (!api) throw new Error('Not authenticated')
		const apiKey = await getApiKey()
		await api.auth.logout({ apiKey })
		setAuth(null)
		await clearAuthToken()
		await deleteApiKey()
		// Clean up encryption cookie if this was a temporary session (no API key)
		if (!apiKey) {
			cleanupEncryptionCookie()
		}
		setMenuOpen(false)
		navigate('/login')
	}

	function setLang(evt: React.MouseEvent, lang: string) {
		evt.preventDefault()
		i18n.changeLanguage(lang)
		setMenuOpen(false)
	}

	const setLoginInitData = useSetAtom(loginInitAtom)
	const setFavorites = useSetAtom(favoritesAtom)
	const initRef = React.useRef(false)

	React.useEffect(
		function onLoad() {
			// Set app config
			const appConfig = APP_CONFIG
			setAppConfig(appConfig)

			;(async function () {
				if (!api?.idTag || auth === undefined) {
					// Guard against duplicate effect execution (StrictMode / double fire)
					if (initRef.current) return
					initRef.current = true

					// Determine idTag or authenticate
					try {
						// Ensure SW is registered and controlling (for hard reload scenarios)
						await registerServiceWorker()
						// Relay encryption key to SW before accessing secrets (Firefox/Safari)
						await ensureEncryptionKey()

						// Try to get API key from SW encrypted storage
						const storedApiKey = await getApiKey()
						const res = await fetch(
							`https://${window.location.host}/.well-known/cloudillo/id-tag`
						)
						if (!res.ok) {
							throw new Error('Failed to fetch idTag')
						}
						const j = await res.json()
						const ownerIdTag = typeof j.idTag === 'string' ? j.idTag : 'unknown'
						setIdTag(ownerIdTag)

						// Create temporary API client - SW handles authentication
						const tempApi = createApiClient({
							idTag: ownerIdTag
						})

						// Try API key auth if available (silent exchange)
						let authState: AuthState | undefined
						if (storedApiKey) {
							try {
								// Exchange API key for access token
								const tokenResult =
									await tempApi.auth.getAccessTokenByApiKey(storedApiKey)
								if (tokenResult?.token) {
									// Create new API client with the fresh token
									const authApi = createApiClient({
										idTag: ownerIdTag,
										authToken: tokenResult.token
									})
									// Use loginInit to get full login info (authenticated path)
									const initResult = await authApi.auth.loginInit()
									if (initResult.status === 'authenticated') {
										authState = { ...initResult.login }
										await registerServiceWorker(initResult.login.token)
										await ensureEncryptionKey()
									}
								}
							} catch (err) {
								console.error('API key auth failed:', err)
								if (err instanceof FetchError && err.httpStatus === 401) {
									console.warn(
										'[Layout] API key rejected (401), clearing stale key'
									)
									await deleteApiKey()
									toastWarning(t('Session expired. Please sign in again.'))
								}
								// Fall through to normal login flow
							}
						}

						// If API key auth failed, use loginInit (unauthenticated path)
						if (!authState) {
							try {
								const initResult = await tempApi.auth.loginInit()
								if (initResult.status === 'authenticated') {
									authState = { ...initResult.login }
									await registerServiceWorker(initResult.login.token)
									await ensureEncryptionKey()
								} else {
									// Store QR + WebAuthn data for login page
									setLoginInitData({
										qrLogin: initResult.qrLogin,
										webAuthn: initResult.webAuthn ?? null
									})
								}
							} catch (err) {
								// Not authenticated - signal "no data" so login components use fallback
								console.log('[Layout] loginInit failed:', err)
								setAuth(null)
								setLoginInitData(null)
							}
						}

						if (authState?.idTag) {
							// Load UI settings BEFORE setAuth to batch all state
							// updates into a single React render cycle
							try {
								const uiSettings = await tempApi.settings.list({ prefix: 'ui' })
								const theme = uiSettings.find((s) => s.key === 'ui.theme')?.value
								const colors = uiSettings.find((s) => s.key === 'ui.colors')?.value
								const onboarding = uiSettings.find(
									(s) => s.key === 'ui.onboarding'
								)?.value

								// Apply custom app menu config if available
								let appMenuVal: unknown = uiSettings.find(
									(s) => s.key === 'ui.app_menu'
								)?.value
								if (typeof appMenuVal === 'string') {
									try {
										appMenuVal = JSON.parse(appMenuVal)
									} catch {
										// ignore
									}
								}
								let activeConfig = appConfig
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

								// Apply pinned communities from pre-fetched settings
								const pinnedVal = uiSettings.find(
									(s) => s.key === 'ui.pinned_communities'
								)?.value
								if (Array.isArray(pinnedVal)) {
									setFavorites(pinnedVal as string[])
								}

								// Batch: setAuth + setTheme in same synchronous block
								setAuth(authState)
								setTheme(theme as string | undefined, colors as string | undefined)

								const navTo =
									(onboarding && `/onboarding/${onboarding}`) ||
									activeConfig?.menu
										?.find((m) => m.id === activeConfig.defaultMenu)
										?.path?.replace('/app/', `/app/${authState.idTag}/`) ||
									`/app/${authState.idTag}/feed`
								if (location.pathname == '/') {
									navigate(navTo)
								}
							} catch (err) {
								console.error('Failed to load UI settings:', err)
								// Settings failed — still authenticate with default theme
								setAuth(authState)
								setTheme(undefined, undefined)
								const navTo =
									appConfig?.menu
										?.find((m) => m.id === appConfig.defaultMenu)
										?.path?.replace('/app/', `/app/${authState.idTag}/`) ||
									`/app/${authState.idTag}/feed`
								if (location.pathname == '/') {
									navigate(navTo)
								}
							}
							return
						}

						// Guest mode: signal auth resolved as unauthenticated
						setTheme(undefined, undefined)
						setAuth(null)
						const guestRedirect = getGuestRedirect(location.pathname, ownerIdTag)
						if (guestRedirect) {
							navigate(guestRedirect)
						}
					} catch (err) {
						console.error('Failed to fetch idTag:', err)
						// On error fetching idTag, redirect non-guest paths to login
						if (!isGuestPath(location.pathname)) {
							navigate('/login')
						}
					}
				} else if (api && auth) {
					// UI settings already loaded and applied by the first auth path above
					loadNotifications()
				}
			})()
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
					{auth && (
						<li className="c-nav-item flex-fill">
							{search.query == undefined ? (
								<button
									className="c-button icon"
									onClick={() => setSearch({ query: '' })}
									aria-label={t('Search for users')}
								>
									<IcSearchUser />
								</button>
							) : (
								<SearchBar />
							)}
						</li>
					)}
				</ul>
				{search.query == undefined && (
					<ul className="c-nav-group g-3 sm-hide md-hide">
						<Menu inert={inert} extraMenuPortal={extraMenuPortalDesktop} />
					</ul>
				)}
				<ul className="c-nav-group c-hbox">
					{auth && <NotificationPopover />}
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
										to={`/profile/${contextIdTag || auth.idTag}/me`}
									>
										<IcUser />
										{t('Profile')}
									</Link>
								</li>
								<li>
									<Button navItem onClick={() => setBusinessCardOpen(true)}>
										<IcQrCode />
										{t('My Card')}
									</Button>
								</li>
								<li>
									<Link
										className="c-nav-item"
										to={`/settings/${contextIdTag || auth.idTag}`}
									>
										<IcSettings />
										{t('Settings')}
									</Link>
								</li>
								<li>
									<hr className="w-100" />
								</li>
								<li>
									<Button navItem onClick={doLogout}>
										<IcLogout />
										{t('Logout')}
									</Button>
								</li>
								<li>
									<hr className="w-100" />
								</li>
								<li>
									<Button
										navItem
										onClick={(evt) => {
											evt.preventDefault()
											i18n.changeLanguage('en')
										}}
									>
										English
									</Button>
								</li>
								<li>
									<Button navItem onClick={(evt) => setLang(evt, 'hu')}>
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
									{api?.idTag && (
										<li>
											<Link
												className="c-nav-item"
												to={`/profile/${api.idTag}/${api.idTag}`}
												onClick={() => setMenuOpen(false)}
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
											navItem
											onClick={(evt) => {
												evt.preventDefault()
												i18n.changeLanguage('en')
											}}
										>
											English
										</Button>
									</li>
									<li>
										<Button navItem onClick={(evt) => setLang(evt, 'hu')}>
											Magyar
										</Button>
									</li>
									<li className="text-disabled">
										Cloudillo V{process.env.CLOUDILLO_VERSION}
									</li>
								</ul>
							</Popper>
							<li className="c-nav-item">
								<Link to="/login" className="c-button accent pill small">
									<IcLogin />
									{t('Sign in')}
								</Link>
							</li>
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
		</>
	)
}

/**
 * Blocking error overlay shown when encryption key is inaccessible or incorrect
 * but encrypted data exists (prevents data loss from key regeneration)
 */
function KeyAccessError({
	reason,
	onRetry,
	onReset
}: {
	reason: KeyErrorReason
	onRetry: () => void
	onReset: () => void
}) {
	const { t } = useTranslation()
	const [resetting, setResetting] = React.useState(false)
	const [confirmReset, setConfirmReset] = React.useState(false)
	const dialogRef = React.useRef<HTMLDialogElement>(null)

	// Use native dialog with showModal() for built-in focus trapping
	React.useEffect(() => {
		dialogRef.current?.showModal()
	}, [])

	async function handleReset() {
		if (!confirmReset) {
			setConfirmReset(true)
			return
		}
		setResetting(true)
		await resetEncryptionState()
		onReset()
	}

	const isMissing = reason === 'key_missing'

	return (
		<dialog
			ref={dialogRef}
			className="c-error-dialog"
			aria-labelledby="key-error-title"
			onCancel={(e) => e.preventDefault()}
		>
			<div className="c-card p-4" style={{ maxWidth: 480 }}>
				<div className="c-hbox align-items-center g-2 mb-3">
					<IcWarning size={32} className="text-error" />
					<h2 id="key-error-title" className="m-0">
						{t('Encryption Key Error')}
					</h2>
				</div>
				{isMissing ? (
					<>
						<p className="mb-3">
							{t(
								'Your encryption key cookie is missing, but encrypted data still exists. This can happen if your browser cookie storage was temporarily inaccessible (e.g., when Chrome cannot access its encrypted database).'
							)}
						</p>
						<p className="mb-4 text-muted">
							{t(
								'Generating a new key would make your existing data unrecoverable. Please try reloading the page first.'
							)}
						</p>
					</>
				) : (
					<>
						<p className="mb-3">
							{t(
								'Your encryption key does not match your stored data. This can happen if the key cookie was corrupted, or if you are accessing data from a different browser or device.'
							)}
						</p>
						<p className="mb-4 text-muted">
							{t(
								'Your stored data cannot be decrypted with the current key. If you recently had browser issues, try reloading. Otherwise, you may need to start fresh and log in again.'
							)}
						</p>
					</>
				)}
				{confirmReset && (
					<p className="mb-3 text-error">
						{t(
							'This will clear all locally stored data and require you to log in again. Click again to confirm.'
						)}
					</p>
				)}
				<div className="c-hbox g-2 justify-content-end">
					<Button onClick={handleReset} disabled={resetting}>
						<IcClear />
						{confirmReset ? t('Confirm Reset') : t('Start Fresh')}
					</Button>
					<Button className="primary" onClick={onRetry}>
						<IcRefresh />
						{t('Retry')}
					</Button>
				</div>
			</div>
		</dialog>
	)
}

export function Layout() {
	const { t, i18n } = useTranslation()
	const pwa = usePWA({ swPath: `/sw-${version}.js` })
	const [auth] = useAuth()
	const { api } = useApi()
	const dialog = useDialog()
	const sidebar = useSidebar()
	const { loadCommunities } = useCommunitiesList()
	const location = useLocation()
	const navigate = useNavigate()
	const contextIdTag = useCurrentContextIdTag()
	const [keyAccessError, setKeyAccessError] = React.useState<KeyErrorReason | null>(null)
	useTokenRenewal() // Automatic auth token renewal
	useContextTokenRenewal() // Proactive proxy-token renewal for trusted foreign profiles
	useProfileTrustBootstrap() // Seed persisted per-profile trust from the backend
	useActionNotifications() // Sound and toast notifications for incoming actions

	// Listen for key access errors from service worker
	React.useEffect(() => {
		return onKeyAccessError((reason) => {
			setKeyAccessError(reason)
		})
	}, [])

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
			initShellBus({
				debug: process.env.NODE_ENV !== 'production',
				getAccessToken: async (resId, _access) => {
					const currentApi = apiRef.current
					const currentAuth = authRef.current
					if (!currentApi || !currentAuth) return undefined
					if (!navigator.onLine) return undefined
					try {
						const [targetTag] = resId.split(':')
						const res = await currentApi.auth.getProxyToken(targetTag)
						return res ? { token: res.token } : undefined
					} catch {
						return undefined
					}
				},
				refreshTokenByRef: async (refId) => {
					const currentApi = apiRef.current
					if (!currentApi) return undefined
					try {
						const res = await currentApi.auth.getAccessTokenByRef(refId, {
							refresh: true
						})
						return res ? { token: res.token } : undefined
					} catch {
						return undefined
					}
				},
				getAuthState: () => {
					const currentAuth = authRef.current
					if (!currentAuth) return null
					return {
						idTag: currentAuth.idTag,
						tnId: currentAuth.tnId,
						roles: currentAuth.roles
					}
				},
				getThemeState: () => ({
					darkMode: document.body.classList.contains('dark')
				}),
				getLanguage: () => i18n.language,
				getApi: () => apiRef.current ?? null
			})
		}
	}, [])

	// Check if we're in an app view (for Menu component)
	const _isAppView = location.pathname.startsWith('/app/')

	// Show key access error overlay if encryption key is inaccessible or incorrect
	if (keyAccessError) {
		return (
			<KeyAccessError
				reason={keyAccessError}
				onRetry={() => window.location.reload()}
				onReset={() => window.location.reload()}
			/>
		)
	}

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
				<ToastContainer position="bottom-right" />
				<MediaPicker />
				<ShareCreate />
				<DocumentPicker />
				<QrScannerDialog
					onScan={(idTag) => navigate(`/profile/${contextIdTag || auth?.idTag}/${idTag}`)}
				/>
				<CameraCaptureDialog />
			</WsBusRoot>
		</>
	)
}

// vim: ts=4
