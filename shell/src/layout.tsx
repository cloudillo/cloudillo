// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

const APP_CONFIG: AppConfigState = {
	apps: [
		{
			id: 'quillo',
			url: '/apps/quillo/index.html',
			trust: true
		},
		{
			id: 'calcillo',
			url: '/apps/calcillo/index.html'
		},
		{
			id: 'prezillo',
			url: '/apps/prezillo/index.html',
			trust: false
		},
		{
			id: 'formillo',
			url: '/apps/formillo/index.html'
		},
		{
			id: 'taskillo',
			url: '/apps/taskillo/index.html'
		}
	],
	mime: {
		'image/jpeg': '/app/view',
		'image/png': '/app/view',
		'image/gif': '/app/view',
		'image/webp': '/app/view',
		'video/mp4': '/app/view',
		'video/webm': '/app/view',
		'application/pdf': '/app/view',
		'cloudillo/quillo': '/app/quillo',
		'cloudillo/calcillo': '/app/calcillo',
		'cloudillo/prezillo': '/app/prezillo',
		'cloudillo/formillo': '/app/formillo',
		'cloudillo/taskillo': '/app/taskillo'
	},
	menu: [
		{
			id: 'files',
			icon: IcFile,
			label: 'Files',
			trans: { hu: 'Fájlok' },
			path: '/app/files?',
			public: true
		},
		{
			id: 'feed',
			icon: IcFeed,
			label: 'Feed',
			trans: { hu: 'Hírfolyam' },
			path: '/app/feed',
			public: true
		},
		{
			id: 'communities',
			icon: IcUsers,
			label: 'Communities',
			trans: { hu: 'Közösségek' },
			path: '/communities'
		},
		{
			id: 'messages',
			icon: IcMessages,
			label: 'Messages',
			trans: { hu: 'Üzenetek' },
			path: '/app/messages'
		},
		{
			id: 'gallery',
			icon: IcGallery,
			label: 'Gallery',
			trans: { hu: 'Galéria' },
			path: '/app/gallery',
			public: true
		},
		{
			id: 'users',
			icon: IcUser,
			label: 'People',
			trans: { hu: 'Emberek' },
			path: '/users'
		},
		{
			id: 'settings',
			icon: IcSettings,
			label: 'Settings',
			trans: { hu: 'Beállítások' },
			path: '/settings'
		},
		{
			id: 'site-admin',
			icon: IcSiteAdmin,
			label: 'Site admin',
			trans: { hu: 'Webhely' },
			path: '/site-admin',
			perm: 'SADM'
		}
	],
	defaultMenu: 'files'
}

import { version } from '../package.json'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { Routes, Route, Navigate, Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import {
	LuUserSearch as IcSearchUser,
	LuUser as IcUser,
	LuUsers as IcUsers,
	LuGrip as IcApps,
	LuPanelLeft as IcSidebar,
	// Menu icons
	LuLogIn as IcLogin,
	LuLogOut as IcLogout,
	// App icons
	LuMenu as IcMenu,
	LuList as IcFeed,
	LuFile as IcFile,
	LuFileText as IcFileText,
	LuImage as IcGallery,
	LuMessagesSquare as IcMessages,
	LuBell as IcNotifications,
	LuSettings as IcSettings,
	LuServerCog as IcSiteAdmin
} from 'react-icons/lu'
import { CloudilloLogo } from './logo.js'

import { Profile, ActionView } from '@cloudillo/types'
import {
	useAuth,
	AuthState,
	useApi,
	useDialog,
	mergeClasses,
	ProfilePicture,
	Popper,
	Button,
	DialogContainer,
	ToastContainer
} from '@cloudillo/react'
import { createApiClient } from '@cloudillo/base'
import { AppConfigState, useAppConfig } from './utils.js'
import usePWA, { registerServiceWorker, getApiKey, deleteApiKey, clearAuthToken } from './pwa.js'
import { AuthRoutes } from './auth/auth.js'
import { useTokenRenewal } from './auth/useTokenRenewal.js'
import { useActionNotifications } from './notifications/useActionNotifications.js'
import {
	Sidebar,
	useSidebar,
	useCurrentContextIdTag,
	useContextPath,
	useGuestDocument
} from './context/index.js'
import { OnboardingRoutes } from './onboarding'
import { WsBusRoot, useWsBus } from './ws-bus.js'
import { SearchIcon, SearchBar, useSearch } from './search.js'
import { SettingsRoutes, setTheme } from './settings'
import { SiteAdminRoutes } from './site-admin'
import { AppRoutes } from './apps'
import { initShellBus, getShellBus } from './message-bus'
import { SharedResourceView } from './apps/shared.js'
import { ProfileRoutes } from './profile/profile.js'
import { Notifications } from './notifications/notifications.js'
import { useNotifications } from './notifications/state'

import '@symbion/opalui'
//import '@symbion/opalui/src/opalui.css'
import '@symbion/opalui/themes/opaque.css'
import '@symbion/opalui/themes/glass.css'
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
	className,
	inert,
	vertical,
	extraMenuPortal
}: {
	className?: string
	inert?: boolean
	vertical?: boolean
	extraMenuPortal?: HTMLElement | null
}) {
	const { t, i18n } = useTranslation()
	const location = useLocation()
	const [appConfig, setAppConfig] = useAppConfig()
	const [auth, setAuth] = useAuth()
	const [moreMenuOpen, setMoreMenuOpen] = React.useState(false)
	const { contextIdTag, getContextPath } = useContextPath()
	const sidebar = useSidebar()
	const [guestDocument] = useGuestDocument()

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
				path: `/app/${guestDocument.ownerIdTag}/${guestDocument.appId}/${guestDocument.resId}${guestDocument.accessLevel === 'read' ? '?access=read' : ''}`,
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
					>
						<ProfilePicture
							profile={{ profilePic: auth.profilePic }}
							srcTag={contextIdTag || auth.idTag}
							tiny
						/>
						<h6>{contextIdTag || auth.idTag}</h6>
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
									aria-current="page"
									to={getContextPath(menuItem.path)}
								>
									{menuItem.icon && React.createElement(menuItem.icon)}
									<h6>{menuItem.trans?.[i18n.language] || menuItem.label}</h6>
								</NavLink>
							))}
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
									aria-current="page"
									to={getContextPath(menuItem.path)}
								>
									{menuItem.icon && React.createElement(menuItem.icon)}
									<h6>{menuItem.trans?.[i18n.language] || menuItem.label}</h6>
								</NavLink>
							))}
						</nav>
					</div>
				)}
				{inlineItems.map((menuItem) => (
					<NavLink
						key={menuItem.id}
						className={mergeClasses('c-nav-link', vertical && 'vertical')}
						aria-current="page"
						to={getContextPath(menuItem.path)}
					>
						{menuItem.icon && React.createElement(menuItem.icon)}
						<h6>{menuItem.trans?.[i18n.language] || menuItem.label}</h6>
					</NavLink>
				))}
				{needsMoreMenu && (
					<Button
						navLink
						className={mergeClasses(vertical && 'vertical')}
						onClick={() => setMoreMenuOpen(!moreMenuOpen)}
					>
						<IcApps />
						<h6>{t('More')}</h6>
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
	const [appConfig, setAppConfig] = useAppConfig()
	const [auth, setAuth] = useAuth()
	const [search, setSearch] = useSearch()
	const { api, setIdTag } = useApi()
	const { t, i18n } = useTranslation()
	const location = useLocation()
	const navigate = useNavigate()
	//const [notifications, setNotifications] = React.useState<{ notifications?: number }>({})
	const { notifications, setNotifications, loadNotifications } = useNotifications()
	const [menuOpen, setMenuOpen] = React.useState(false)
	const contextIdTag = useCurrentContextIdTag()
	const [extraMenuPortalMobile, setExtraMenuPortalMobile] = React.useState<HTMLDivElement | null>(
		null
	)
	const [extraMenuPortalDesktop, setExtraMenuPortalDesktop] =
		React.useState<HTMLDivElement | null>(null)

	useWsBus({ cmds: ['ACTION'] }, function handleAction(msg) {
		const action = msg.data as ActionView
		if (action.status == 'N' || action.status == 'C')
			setNotifications((n) => ({ notifications: [...n.notifications, action] }))
	})

	async function doLogout() {
		if (!api) throw new Error('Not authenticated')
		const apiKey = await getApiKey()
		await api.auth.logout({ apiKey })
		setAuth(undefined)
		await clearAuthToken()
		await deleteApiKey()
		setMenuOpen(false)
		navigate('/login')
	}

	function setLang(evt: React.MouseEvent, lang: string) {
		evt.preventDefault()
		i18n.changeLanguage(lang)
		setMenuOpen(false)
	}

	React.useEffect(
		function onLoad() {
			// Set app config
			const appConfig = APP_CONFIG
			setAppConfig(appConfig)

			// Set theme
			document.body.classList.add('theme-glass')

			// Set dark mode
			if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
				document.body.classList.add('dark')
			} else {
				document.body.classList.add('light')
			}
			;(async function () {
				if (!api?.idTag || !auth) {
					// Determine idTag or authenticate
					try {
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
									// Get full login info
									const loginInfo = await authApi.auth.getLoginToken()
									if (loginInfo?.token) {
										authState = { ...loginInfo }
										// Register SW with encryption key and token
										await registerServiceWorker(
											loginInfo.swEncryptionKey,
											loginInfo.token
										)
									}
								}
							} catch (err) {
								console.error('API key auth failed:', err)
								// Fall through to normal login flow
							}
						}

						// If API key auth failed, try normal login token
						if (!authState) {
							try {
								const tokenRes = await tempApi.auth.getLoginToken()
								console.log('[Layout] getLoginToken result:', {
									hasToken: !!tokenRes?.token,
									hasKey: !!tokenRes?.swEncryptionKey,
									keyPreview: tokenRes?.swEncryptionKey?.slice(0, 8)
								})
								authState = tokenRes ? { ...tokenRes } : undefined
								// Register SW with encryption key and token
								if (tokenRes?.swEncryptionKey && tokenRes?.token) {
									console.log('[Layout] Calling registerServiceWorker...')
									await registerServiceWorker(
										tokenRes.swEncryptionKey,
										tokenRes.token
									)
								} else {
									console.log(
										'[Layout] Missing key or token, skipping SW registration'
									)
								}
							} catch (err) {
								// Not authenticated - continue as guest
								console.log('[Layout] getLoginToken failed:', err)
							}
						}

						if (authState?.idTag) {
							setAuth(authState)
							// Token is already stored in SW encrypted storage via registerServiceWorker()

							// Load and apply UI settings
							try {
								const uiSettings = await tempApi.settings.list({ prefix: 'ui' })
								const theme = uiSettings.find((s) => s.key === 'ui.theme')?.value
								const colors = uiSettings.find((s) => s.key === 'ui.colors')?.value
								const onboarding = uiSettings.find(
									(s) => s.key === 'ui.onboarding'
								)?.value
								setTheme(theme as string | undefined, colors as string | undefined)

								const navTo =
									(onboarding && `/onboarding/${onboarding}`) ||
									appConfig?.menu
										?.find((m) => m.id === appConfig.defaultMenu)
										?.path?.replace('/app/', `/app/${authState.idTag}/`) ||
									`/app/${authState.idTag}/feed`
								if (location.pathname == '/') {
									navigate(navTo)
								}
							} catch (err) {
								console.error('Failed to load UI settings:', err)
								// Navigate to default even if settings fail
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

						// Guest mode: handle redirect
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
					// Load notification count
					loadNotifications()
					// Load and apply UI settings
					try {
						const uiSettings = await api.settings.list({ prefix: 'ui' })
						const theme = uiSettings.find((s) => s.key === 'ui.theme')?.value
						const colors = uiSettings.find((s) => s.key === 'ui.colors')?.value
						setTheme(theme as string | undefined, colors as string | undefined)
					} catch (err) {
						console.error('Failed to load UI settings:', err)
					}
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
								<IcSearchUser onClick={() => setSearch({ query: '' })} />
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
					{auth && (
						<Link className="c-nav-item pos-relative" to="/notifications">
							<IcNotifications />
							{!!notifications.notifications.length && (
								<span className="c-badge br bg bg-error">
									{notifications.notifications.length}
								</span>
							)}
						</Link>
					)}
					{auth ? (
						<Popper className="c-nav-item" icon={<ProfilePicture profile={auth} />}>
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
										onClick={(evt) => (
											evt.preventDefault(), i18n.changeLanguage('en')
										)}
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
						<Popper className="c-nav-item" icon={<IcMenu />}>
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
										onClick={(evt) => (
											evt.preventDefault(), i18n.changeLanguage('en')
										)}
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
					>
						<Menu vertical inert={inert} extraMenuPortal={extraMenuPortalMobile} />
					</nav>
				</>
			)}
		</>
	)
}

export function Layout() {
	const pwa = usePWA({ swPath: `/sw-${version}.js` })
	const [auth] = useAuth()
	const { api, setIdTag } = useApi()
	const dialog = useDialog()
	const sidebar = useSidebar()
	const location = useLocation()
	useTokenRenewal() // Automatic token renewal
	useActionNotifications() // Sound and toast notifications for incoming actions

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
				getAccessToken: async (resId, access) => {
					const currentApi = apiRef.current
					if (!currentApi) return undefined
					try {
						const res = await currentApi.auth.getAccessToken({
							scope: `${resId}:${access === 'read' ? 'R' : 'W'}`
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
				})
			})
		}
	}, [])

	// Check if we're in an app view (for Menu component)
	const isAppView = location.pathname.startsWith('/app/')

	return (
		<>
			<WsBusRoot>
				{auth && <Sidebar />}
				<Header inert={dialog.isOpen} />
				<div
					className={mergeClasses('c-layout', sidebar.isPinned && auth && 'with-sidebar')}
				>
					<div inert={dialog.isOpen} className="c-vbox flex-fill h-min-0">
						<ProfileRoutes />
						<AuthRoutes />
						<SettingsRoutes pwa={pwa} />
						<SiteAdminRoutes />
						<AppRoutes />
						<OnboardingRoutes pwa={pwa} />
						<Routes>
							<Route path="/s/:refId" element={<SharedResourceView />} />
							<Route path="/notifications" element={<Notifications />} />
							<Route path="*" element={null} />
						</Routes>
					</div>
					<div className="pt-1" />
				</div>
				{!auth && (
					<Link to="/login" className="c-fab accent">
						<IcLogin />
					</Link>
				)}
				<div id="popper-container" />
				<DialogContainer />
				<ToastContainer position="bottom-right" />
			</WsBusRoot>
		</>
	)
}

// vim: ts=4
