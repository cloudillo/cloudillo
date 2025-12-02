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
			url: '/quillo/index.html',
			trust: true
		},
		{
			id: 'sheello',
			url: '/sheello/index.html'
		},
		{
			id: 'prello',
			url: '/prello/index.html',
			trust: false
		},
		{
			id: 'formillo',
			url: '/formillo/index.html'
		},
		{
			id: 'todollo',
			url: '/todollo/index.html'
		}
	],
	mime: {
		'image/jpeg': '/app/gallery',
		'image/png': '/app/gallery',
		'video/mp4': '/app/gallery',
		'application/pdf': '/app/pdfviewer',
		'cloudillo/quillo': '/app/quillo',
		'cloudillo/sheello': '/app/sheello',
		'cloudillo/prello': '/app/prello',
		'cloudillo/formillo': '/app/formillo',
		'cloudillo/todollo': '/app/todollo'
	},
	menu: [
		{ id: 'files', icon: IcFile, label: 'Files', trans: { hu: 'Fájlok' }, path: '/app/files?' },
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
			trans: { hu: 'Uzenetek' },
			path: '/app/messages'
		}
		//{ id: 'myform', icon: IcFile, label: 'My Form', path: '/app/formillo/cloud.w9.hu/myform' },
	],
	menuEx: [
		{ id: 'gallery', icon: IcGallery, label: 'Gallery', path: '/app/gallery' },
		{ id: 'users', icon: IcUser, label: 'Users', path: '/users' },
		{ id: 'settings', icon: IcSettings, label: 'Settings', path: '/settings' },
		{
			id: 'site-admin',
			icon: IcSiteAdmin,
			label: 'Site admin',
			path: '/site-admin',
			perm: 'SADM'
		}
	],
	defaultMenu: 'files'
}

import { version } from '../package.json'

import * as React from 'react'
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
	DialogContainer,
	ToastContainer
} from '@cloudillo/react'
import { createApiClient } from '@cloudillo/base'
import { AppConfigState, useAppConfig } from './utils.js'
import usePWA from './pwa.js'
import { AuthRoutes } from './auth/auth.js'
import { useTokenRenewal } from './auth/useTokenRenewal.js'
import { useActionNotifications } from './notifications/useActionNotifications.js'
import { Sidebar, useSidebar, useCurrentContextIdTag, useContextPath } from './context/index.js'
import { OnboardingRoutes } from './onboarding'
import { WsBusRoot, useWsBus } from './ws-bus.js'
import { SearchIcon, SearchBar, useSearch } from './search.js'
import { SettingsRoutes, setTheme } from './settings'
import { SiteAdminRoutes } from './site-admin'
import { AppRoutes } from './apps'
import { ProfileRoutes } from './profile/profile.js'
import { Notifications } from './notifications/notifications.js'
import { useNotifications } from './notifications/state'

import '@symbion/opalui'
//import '@symbion/opalui/src/opalui.css'
import '@symbion/opalui/themes/opaque.css'
import '@symbion/opalui/themes/glass.css'
import './style.css'

function Menu({
	className,
	inert,
	vertical
}: {
	className?: string
	inert?: boolean
	vertical?: boolean
}) {
	const { t, i18n } = useTranslation()
	const location = useLocation()
	const [appConfig, setAppConfig] = useAppConfig()
	const [auth, setAuth] = useAuth()
	const [exMenuOpen, setExMenuOpen] = React.useState(false)
	const { contextIdTag, getContextPath } = useContextPath()
	const sidebar = useSidebar()

	React.useEffect(
		function onLocationChange() {
			setExMenuOpen(false)
		},
		[location]
	)

	// Check if we're in an app view (where sidebar should be shown)
	const isAppView = location.pathname.startsWith('/app/')

	return (
		!location.pathname.match('^/register/') && (
			<>
				{/* Sidebar toggle button on mobile (first item) - shows current context */}
				{vertical && isAppView && auth && (
					<button
						className={mergeClasses('c-nav-link vertical', sidebar.isOpen && 'active')}
						onClick={() => sidebar.toggle()}
					>
						<div
							style={{
								width: '1.5rem',
								height: '1.5rem',
								borderRadius: '50%',
								overflow: 'hidden'
							}}
						>
							<ProfilePicture
								profile={{ profilePic: auth.profilePic }}
								srcTag={contextIdTag || auth.idTag}
							/>
						</div>
						<h6>{contextIdTag || auth.idTag}</h6>
					</button>
				)}
				<div inert={inert} className="c-menu-ex flex-order-end">
					<nav className={mergeClasses('c-nav', exMenuOpen && 'open')}>
						{appConfig &&
							appConfig.menuEx.map(
								(menuItem) =>
									((!!auth &&
										(!menuItem.perm || auth.roles?.includes(menuItem.perm))) ||
										menuItem.public) && (
										<NavLink
											key={menuItem.id}
											className="c-nav-link h-small vertical"
											aria-current="page"
											to={getContextPath(menuItem.path)}
										>
											{menuItem.icon && React.createElement(menuItem.icon)}
											<h6>
												{menuItem.trans?.[i18n.language] || menuItem.label}
											</h6>
										</NavLink>
									)
							)}
					</nav>
				</div>
				{appConfig &&
					appConfig.menu.map(
						(menuItem) =>
							((!!auth && (!menuItem.perm || auth.roles?.includes(menuItem.perm))) ||
								menuItem.public) && (
								<NavLink
									key={menuItem.id}
									className={mergeClasses('c-nav-link', vertical && 'vertical')}
									aria-current="page"
									to={getContextPath(menuItem.path)}
								>
									{menuItem.icon && React.createElement(menuItem.icon)}
									<h6>{menuItem.trans?.[i18n.language] || menuItem.label}</h6>
								</NavLink>
							)
					)}
				<button
					className={mergeClasses('c-nav-link', vertical && 'vertical')}
					onClick={() => setExMenuOpen(!exMenuOpen)}
				>
					<IcApps />
					<h6>{t('More')}</h6>
				</button>
			</>
		)
	)
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

	useWsBus({ cmds: ['ACTION'] }, function handleAction(msg) {
		const action = msg.data as ActionView
		if (action.status == 'N' || action.status == 'C')
			setNotifications((n) => ({ notifications: [...n.notifications, action] }))
	})

	async function doLogout() {
		console.log('doLogout')
		if (!api) throw new Error('Not authenticated')
		await api.auth.logout()
		setAuth(undefined)
		localStorage.removeItem('loginToken')
		setMenuOpen(false)
		console.log('NAVIGATE: /login')
		navigate('/login')
	}

	function setLang(evt: React.MouseEvent, lang: string) {
		evt.preventDefault()
		console.log('setLang', lang)
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
						console.log('[Shell] fetching idTag')
						const loginToken = localStorage.getItem('loginToken') || undefined
						const res = await fetch(
							`https://${window.location.host}/.well-known/cloudillo/id-tag`
						)
						if (res.ok) {
							const j = await res.json()
							if (typeof j.idTag == 'string') {
								// idTag determined from .well-known endpoint
								console.log('[Shell] idTag', j.idTag)
								setIdTag(j.idTag)
							}
							// Create temporary API client with the idTag to check login status
							const tempApi = createApiClient({
								idTag: j.idTag || 'unknown',
								authToken: loginToken
							})
							// Check for login cookie
							const tokenRes = await tempApi.auth.getLoginToken()
							const authState: AuthState | undefined = tokenRes
								? { ...tokenRes }
								: undefined
							console.log('authState', authState)
							if (authState?.idTag) {
								setAuth(authState)
								if (authState.token)
									localStorage.setItem('loginToken', authState.token)

								// Load and apply UI settings
								try {
									const uiSettings = await tempApi.settings.list({ prefix: 'ui' })
									const theme = uiSettings.find(
										(s) => s.key === 'ui.theme'
									)?.value
									const colors = uiSettings.find(
										(s) => s.key === 'ui.colors'
									)?.value
									const onboarding = uiSettings.find(
										(s) => s.key === 'ui.onboarding'
									)?.value
									setTheme(
										theme as string | undefined,
										colors as string | undefined
									)

									const navTo =
										(onboarding && `/onboarding/${onboarding}`) ||
										appConfig?.menu
											?.find((m) => m.id === appConfig.defaultMenu)
											?.path?.replace('/app/', `/app/${authState.idTag}/`) ||
										`/app/${authState.idTag}/feed`
									console.log('REDIRECT TO', navTo)
									if (location.pathname == '/') {
										console.log('NAVIGATE: ', navTo)
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
						}
						if (
							!location.pathname.startsWith('/register/') &&
							!location.pathname.startsWith('/onboarding/')
						) {
							console.log('NAVIGATE: /login')
							navigate('/login')
						}
					} catch (err) {
						console.log('ERROR', err)
						if (
							!location.pathname.startsWith('/register/') &&
							!location.pathname.startsWith('/onboarding/')
						) {
							console.log('NAVIGATE: /login')
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
						<Menu inert={inert} />
					</ul>
				)}
				<ul className="c-nav-group c-hbox">
					{auth && (
						<Link className="c-nav-item pos-relative" to="/notifications">
							<IcNotifications />
							{!!notifications.notifications.length && (
								<span className="c-badge br bg error">
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
									<button className="c-nav-item" onClick={doLogout}>
										<IcLogout />
										{t('Logout')}
									</button>
								</li>
								<li>
									<hr className="w-100" />
								</li>
								<li>
									<button
										className="c-nav-item"
										onClick={(evt) => (
											evt.preventDefault(), i18n.changeLanguage('en')
										)}
									>
										English
									</button>
								</li>
								<li>
									<button
										className="c-nav-item"
										onClick={(evt) => setLang(evt, 'hu')}
									>
										Magyar
									</button>
								</li>
								<li className="text-disabled">
									Cloudillo V{process.env.CLOUDILLO_VERSION}
								</li>
							</ul>
						</Popper>
					) : (
						<Popper className="c-nav-item" icon={<IcMenu />}>
							<ul className="c-nav vertical emph">
								<li>
									<Link
										className="c-nav-item"
										to="/login"
										onClick={() => setMenuOpen(false)}
									>
										<IcUser />
										{t('Login')}
									</Link>
								</li>
								<li>
									<hr className="w-100" />
								</li>
								<li>
									<button
										className="c-nav-item"
										onClick={(evt) => (
											evt.preventDefault(), i18n.changeLanguage('en')
										)}
									>
										English
									</button>
								</li>
								<li>
									<button
										className="c-nav-item"
										onClick={(evt) => setLang(evt, 'hu')}
									>
										Magyar
									</button>
								</li>
							</ul>
						</Popper>
					)}
				</ul>
			</nav>
			{!location.pathname.match('^/register/') && (
				<nav
					inert={inert}
					className="c-nav nav-bottom w-100 border-radius-0 justify-content-center flex-order-end lg-hide"
				>
					<Menu vertical inert={inert} />
				</nav>
			)}
		</>
	)
}

export function Layout() {
	const pwa = usePWA({ swPath: `/sw-${version}.js` })
	const { api, setIdTag } = useApi()
	const dialog = useDialog()
	const sidebar = useSidebar()
	const location = useLocation()
	useTokenRenewal() // Automatic token renewal
	useActionNotifications() // Sound and toast notifications for incoming actions

	// Check if we're in an app view (where sidebar should be shown)
	const isAppView = location.pathname.startsWith('/app/')

	return (
		<>
			<WsBusRoot>
				{isAppView && <Sidebar />}
				<div
					className={mergeClasses(
						'c-layout',
						sidebar.isPinned && isAppView && 'with-sidebar'
					)}
				>
					<Header inert={dialog.isOpen} />
					<div inert={dialog.isOpen} className="c-vbox flex-fill h-min-0">
						<ProfileRoutes />
						<AuthRoutes />
						<SettingsRoutes pwa={pwa} />
						<SiteAdminRoutes />
						<AppRoutes />
						<OnboardingRoutes pwa={pwa} />
						<Routes>
							<Route path="/notifications" element={<Notifications />} />
							<Route path="*" element={null} />
						</Routes>
					</div>
					<div className="pt-1" />
				</div>
				<div id="popper-container" />
				<DialogContainer />
				<ToastContainer position="bottom-right" />
			</WsBusRoot>
		</>
	)
}

// vim: ts=4
