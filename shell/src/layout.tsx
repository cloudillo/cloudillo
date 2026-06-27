// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { createApiClient, FetchError } from '@cloudillo/core'
import {
	type AuthState,
	Button,
	DialogContainer,
	mergeClasses,
	Popper,
	ProfilePicture,
	Toast,
	ToastClose,
	ToastContainer,
	ToastContent,
	ToastIcon,
	ToastMessage,
	ToastProgress,
	ToastTitle,
	useApi,
	useAuth,
	useDialog,
	useToast,
	useToasts
} from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import { useAtomValue, useSetAtom } from 'jotai'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
	LuGrip as IcApps,
	LuTrash2 as IcClear,
	// Menu icons
	LuLogIn as IcLogin,
	LuLogOut as IcLogout,
	LuMenu as IcMenu,
	LuQrCode as IcQrCode,
	LuRefreshCw as IcRefresh,
	LuScanLine as IcScan,
	LuSettings as IcSettings,
	LuCircleX as IcToastError,
	LuInfo as IcToastInfo,
	LuCircleCheck as IcToastSuccess,
	LuTriangleAlert as IcToastWarning,
	LuUser as IcUser,
	LuCircleAlert as IcWarning
} from 'react-icons/lu'
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { version } from '../package.json'
import { AppRoutes } from './apps'
import { unreadCountAtom, useGlobalUnreadProbe } from './read-position.js'
import { getFileIcon } from './apps/files/icons.js'
import { SharedResourceView } from './apps/shared.js'
import { AuthRoutes, loginInitAtom } from './auth/auth.js'
import { LogoutDialog } from './auth/LogoutDialog.js'
import { useTokenRenewal } from './auth/useTokenRenewal.js'
import { type DirtyDocSummary, listDirtyDocs, wipeLocalData } from './auth/wipe-local-data.js'
import { BusinessCardDialog } from './components/BusinessCard/BusinessCardDialog.js'
import { CameraCaptureDialog } from './components/CameraCapture/index.js'
import { DocumentPicker } from './components/DocumentPicker/index.js'
import { GuestOwnerChip } from './components/GuestOwnerChip.js'
import { HandChip } from './components/HandChip.js'
import { MediaPicker } from './components/MediaPicker/index.js'
import { QrScannerDialog, useQrScanner } from './components/QrScanner/index.js'
import { ShareCreate } from './components/ShareCreate/index.js'
import {
	activeContextAtom,
	activeContextDisplayAtom,
	contextIdpEnabledAtom,
	favoritesAtom,
	HOME_CONTEXT,
	loadIdpEnabled,
	Sidebar,
	useCommunitiesList,
	useContextPath,
	useContextTokenRenewal,
	useCurrentContextIdTag,
	useGuestDocument,
	useProfileTrustBootstrap,
	useSidebar,
	useUrlContextIdTag
} from './context/index.js'
import { CommunityVerifyIdpBanner } from './context/verify-idp-banner.js'
import { ErrorBoundary } from './ErrorBoundary.js'
import { IdpRoutes } from './idp'
import { CloudilloLogo } from './logo.js'
import { appConfig as APP_CONFIG, applyMenuConfig } from './manifest-registry.js'
import { getShellBus, initShellBus } from './message-bus'
import { NotificationPopover } from './notifications/NotificationPopover.js'
import { Notifications } from './notifications/notifications.js'
import { useNotifications } from './notifications/state'
import { useActionNotifications } from './notifications/useActionNotifications.js'
import { Breadcrumb, DocumentTitleSync, Omnibox } from './omnibox.js'
import { OnboardingRoutes } from './onboarding'
import { ProfileRoutes } from './profile/profile.js'
import usePWA, {
	clearAuthToken,
	deleteApiKey,
	getApiKey,
	getLastKeyError,
	installToken,
	type KeyErrorReason,
	onKeyAccessError,
	refreshEncryptionKey,
	registerServiceWorker,
	resetEncryptionState,
	setCurrentAuthToken
} from './pwa.js'
import { useSearch } from './search.js'
import { applyTheme, SettingsRoutes, setTheme } from './settings'
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

interface MenuLinkItem {
	id: string
	icon?: React.ComponentType
	label: string
	trans?: Record<string, string>
	path: string
}

// A nav link with a generic badge slot (content dot for the feed, numeric
// unread for messages). Factored from the three duplicated NavLink render sites.
function MenuLink({
	menuItem,
	className,
	badge
}: {
	menuItem: MenuLinkItem
	className?: string
	badge?: React.ReactNode
}) {
	const { i18n } = useTranslation()
	const { getContextPath } = useContextPath()
	return (
		<NavLink className={className} to={getContextPath(menuItem.path)}>
			<span style={{ position: 'relative', display: 'inline-flex' }}>
				{menuItem.icon && React.createElement(menuItem.icon)}
				{badge}
			</span>
			<span className="c-nav-label">{menuItem.trans?.[i18n.language] || menuItem.label}</span>
		</NavLink>
	)
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
	const { t } = useTranslation()
	const location = useLocation()
	const [appConfig, _setAppConfig] = useAppConfig()
	const [auth, _setAuth] = useAuth()
	const [moreMenuOpen, setMoreMenuOpen] = React.useState(false)
	const sidebar = useSidebar()
	const [guestDocument] = useGuestDocument()
	const [, setQrScannerOpen] = useQrScanner()
	// Real idTag (own idTag for the personal context) — matches the key the feed
	// unread probe writes; useUrlContextIdTag would yield '~' for home and miss.
	const menuContextIdTag = useCurrentContextIdTag()
	const unreadCounts = useAtomValue(unreadCountAtom)

	// Content-availability badge for a menu item: a dot for the feed when the
	// active context has unread content (numeric message badges arrive in G).
	function badgeFor(menuItem: MenuLinkItem): React.ReactNode {
		if (menuItem.id === 'feed' && unreadCounts[menuContextIdTag ?? '']) {
			return (
				<span
					className="c-badge dot accent positioned tr"
					role="status"
					aria-label={t('New content')}
				/>
			)
		}
		return undefined
	}
	const activeContext = useAtomValue(activeContextAtom)
	const contextDisplay = useAtomValue(activeContextDisplayAtom)
	const contextIdpEnabled = useAtomValue(contextIdpEnabledAtom)

	React.useEffect(
		function onLocationChange() {
			setMoreMenuOpen(false)
		},
		[location]
	)

	const idpEnabledHere = !!activeContext && contextIdpEnabled[activeContext.idTag] === true

	// Filter visible menu items based on auth state
	const staticItems =
		appConfig?.menu.filter((item) => {
			if (item.id === 'idp' && !idpEnabledHere) return false
			return (!!auth && (!item.perm || auth.roles?.includes(item.perm))) || item.public
		}) || []

	// Build guest document menu item if available
	const isAppDoc = !!guestDocument?.appId // CRDT/RTDB set appId; BLOB/FLDR set ''
	const guestDocMenuItem = guestDocument
		? {
				id: 'guest-doc',
				icon: getFileIcon(guestDocument.contentType, guestDocument.fileTp),
				label: truncateFileName(guestDocument.fileName),
				trans: {} as Record<string, string>,
				path: isAppDoc
					? `/app/${guestDocument.ownerIdTag}/${guestDocument.appId}/${guestDocument.resId}${guestDocument.accessLevel !== 'write' ? `?access=${guestDocument.accessLevel}` : ''}`
					: `/s/${guestDocument.refId}`,
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
						kind="nav-link"
						className={mergeClasses('vertical', sidebar.isOpen && 'active')}
						onClick={() => sidebar.toggle()}
						aria-label={t('Toggle sidebar')}
						aria-expanded={sidebar.isOpen}
					>
						<ProfilePicture
							profile={{ profilePic: contextDisplay?.profilePic ?? auth.profilePic }}
							srcTag={contextDisplay?.idTag ?? auth.idTag}
							tiny
						/>
						<span className="c-nav-label">
							{contextDisplay?.name ?? auth.name ?? auth.idTag}
						</span>
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
								<MenuLink
									key={menuItem.id}
									menuItem={menuItem}
									className="c-nav-link h-small vertical"
									badge={badgeFor(menuItem)}
								/>
							))}
							{auth && (
								<Button
									kind="nav-link"
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
								<MenuLink
									key={menuItem.id}
									menuItem={menuItem}
									className="c-nav-link h-small vertical"
									badge={badgeFor(menuItem)}
								/>
							))}
							{auth && (
								<Button
									kind="nav-link"
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
					<MenuLink
						key={menuItem.id}
						menuItem={menuItem}
						className={mergeClasses('c-nav-link', vertical && 'vertical')}
						badge={badgeFor(menuItem)}
					/>
				))}
				{needsMoreMenu && (
					<Button
						kind="nav-link"
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
function getGuestRedirect(pathname: string): string | undefined {
	if (pathname === '/') {
		return `/app/${HOME_CONTEXT}/feed`
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
		settingsAppliedForRef.current = null
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
	const initRef = React.useRef(false)
	const settingsAppliedForRef = React.useRef<string | null>(null)

	React.useEffect(
		function onLoad() {
			// Set app config
			const appConfig = APP_CONFIG
			setAppConfig(appConfig)

			const applyUiSettings = async (
				apiClient: ReturnType<typeof createApiClient>,
				authState: AuthState
			) => {
				let activeConfig = appConfig
				try {
					const uiSettings = await apiClient.settings.list({ prefix: 'ui' })
					const theme = uiSettings.find((s) => s.key === 'ui.theme')?.value
					const colors = uiSettings.find((s) => s.key === 'ui.colors')?.value
					const onboarding = uiSettings.find((s) => s.key === 'ui.onboarding')?.value

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

					const pinnedVal = uiSettings.find(
						(s) => s.key === 'ui.pinned_communities'
					)?.value
					if (Array.isArray(pinnedVal)) {
						setFavorites(pinnedVal as string[])
					}

					setTheme(theme as string | undefined, colors as string | undefined)

					// Load idp.enabled for the home tenant so the shell menu
					// can hide the IDP item when this tenant isn't a provider.
					// Fire-and-forget so initial render is not blocked.
					if (authState.idTag) {
						void loadIdpEnabled(apiClient, authState.idTag, setContextIdpEnabled)
					}

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
					// Apply default theme without overwriting the user's persisted
					// preference — the next successful settings fetch will refresh it.
					applyTheme(undefined, undefined)
					const navTo =
						activeConfig?.menu
							?.find((m) => m.id === activeConfig.defaultMenu)
							?.path?.replace('/app/', `/app/${authState.idTag}/`) ||
						`/app/${authState.idTag}/feed`
					if (location.pathname == '/') {
						navigate(navTo)
					}
				}
			}

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
						await refreshEncryptionKey()

						// Try to get API key from SW encrypted storage
						const storedApiKey = await getApiKey()

						// If the SW already signalled that the swKey cookie is
						// missing (or mismatched) but encrypted data exists,
						// `getApiKey()` returns undefined. Falling through to
						// the unauthenticated path here would render the login
						// screen for a split second before the KeyAccessError
						// dialog mounts, looking exactly like an unexplained
						// logout. Stop early — the onKeyAccessError effect
						// renders the dialog and the user can recover from there.
						if (storedApiKey === undefined && getLastKeyError()) {
							console.warn(
								'[Layout] Halting auth flow — SW reported key error:',
								getLastKeyError()
							)
							return
						}

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
										await installToken(initResult.login.token)
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
									await installToken(initResult.login.token)
								} else {
									// Store QR + WebAuthn data for login page
									setLoginInitData({
										qrLogin: initResult.qrLogin,
										webAuthn: initResult.webAuthn ?? null,
										maskedEmail: initResult.maskedEmail
									})
								}
							} catch (err) {
								// Not authenticated - signal "no data" so login components use fallback
								console.warn('[Layout] loginInit failed:', err)
								setAuth(null)
								settingsAppliedForRef.current = null
								setLoginInitData(null)
							}
						}

						if (authState?.idTag) {
							// Apply UI settings (theme, menu, favorites, IDP enabled, initial
							// route) before flipping the auth gate open. The boot splash stays
							// up until `setAuth` runs, so the user sees a single fade-in of a
							// fully populated shell instead of a cascade of partial UIs.
							// Mark settingsAppliedForRef *before* setAuth so the `else if (api
							// && auth)` branch on the next effect run does not redundantly
							// re-apply them.
							await applyUiSettings(tempApi, authState)
							settingsAppliedForRef.current = authState.idTag
							setAuth(authState)
							return
						}

						// Guest mode: signal auth resolved as unauthenticated.
						// Apply only — preserve the previously authenticated user's
						// persisted theme so a bounce through guest mode doesn't
						// wipe their last preference from localStorage.
						applyTheme(undefined, undefined)
						setAuth(null)
						settingsAppliedForRef.current = null
						const guestRedirect = getGuestRedirect(location.pathname)
						if (guestRedirect) {
							navigate(guestRedirect)
						}
					} catch (err) {
						console.error('Failed to fetch idTag:', err)
						// Resolve the auth gate so the boot splash tears down and the
						// user lands on the login screen (or the guest fallback) instead
						// of staring at a white screen.
						setAuth(null)
						settingsAppliedForRef.current = null
						// On error fetching idTag, redirect non-guest paths to login
						if (!isGuestPath(location.pathname)) {
							navigate('/login')
						}
					}
				} else if (api && auth) {
					if (auth.idTag && settingsAppliedForRef.current !== auth.idTag) {
						settingsAppliedForRef.current = auth.idTag
						await applyUiSettings(api, auth)
					}
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

function Toasts() {
	const toasts = useToasts()
	const { dismiss } = useToast()
	return (
		<ToastContainer position="bottom-right">
			{toasts.map((t) => (
				<Toast
					key={t.id}
					toast={t}
					variant={t.variant}
					onDismiss={() => dismiss(t.id)}
					withProgress
				>
					<ToastIcon>
						{t.variant === 'success' && <IcToastSuccess />}
						{t.variant === 'error' && <IcToastError />}
						{t.variant === 'warning' && <IcToastWarning />}
						{(!t.variant || t.variant === 'info') && <IcToastInfo />}
					</ToastIcon>
					<ToastContent>
						{t.title && <ToastTitle>{t.title}</ToastTitle>}
						{t.message && <ToastMessage>{t.message}</ToastMessage>}
					</ToastContent>
					<ToastClose />
					<ToastProgress duration={t.duration} />
				</Toast>
			))}
		</ToastContainer>
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
	const navigate = useNavigate()
	const urlContext = useUrlContextIdTag()
	const [keyAccessError, setKeyAccessError] = React.useState<KeyErrorReason | null>(null)
	useTokenRenewal() // Automatic auth token renewal
	useContextTokenRenewal() // Proactive proxy-token renewal for trusted foreign profiles
	useProfileTrustBootstrap() // Seed persisted per-profile trust from the backend
	useActionNotifications() // Sound and toast notifications for incoming actions
	useGlobalUnreadProbe() // App-wide feed-unread counts for nav/sidebar dots

	React.useEffect(
		function syncAuthTokenToSw() {
			setCurrentAuthToken(auth?.token)
		},
		[auth?.token]
	)

	// Listen for key access errors from service worker
	React.useEffect(() => {
		return onKeyAccessError((reason) => {
			setKeyAccessError(reason)
		})
	}, [])

	// Tear down the inline boot splash (#initial-splash in index.html) once
	// auth has resolved (success or guest) or the key-access error UI is taking
	// over. A 250 ms minimum visible duration prevents a render-then-instant-teardown
	// flash on warm cache hits.
	React.useEffect(() => {
		if (auth === undefined && !keyAccessError) return
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
	}, [auth, keyAccessError])

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
				debug: false,
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
