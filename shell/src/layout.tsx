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
		'cloudillo/formillo': '/app/formillo'
	},
	menu: [
		{ id: 'files', icon: IcFile, label: 'Files', path: '/app/files?filter=mut' },
		{ id: 'feed', icon: IcFeed, label: 'Feed', path: '/app/feed', public: true },
		{ id: 'communities', icon: IcUsers, label: 'Communities', path: '/communities' },
		{ id: 'messages', icon: IcMessages, label: 'Messages', path: '/app/messages' },
		//{ id: 'myform', icon: IcFile, label: 'My Form', path: '/app/formillo/cloud.w9.hu/myform' },
	],
	menuEx: [
		{ id: 'gallery', icon: IcGallery, label: 'Gallery', path: '/app/gallery' },
		{ id: 'users', icon: IcUser, label: 'Users', path: '/users' },
		{ id: 'settings', icon: IcSettings, label: 'Settings', path: '/settings' },
		{ id: 'site-admin', icon: IcSiteAdmin, label: 'Site admin', path: '/site-admin', perm: 'SADM' },
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
	// Menu icons
	LuLogIn as IcLogin,
	LuLogOut as IcLogout,
	// App icons
	LuMenu	as IcMenu,
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
import { useAuth, AuthState, useApi, useDialog, mergeClasses, ProfilePicture, Popper, DialogContainer } from '@cloudillo/react'
import { AppConfigState, useAppConfig } from './utils.js'
import usePWA from './pwa.js'
import { AuthRoutes, webAuthnLogin } from './auth/auth.js'
import { OnboardingRoutes } from './onboarding'
import { WsBusRoot, useWsBus } from './ws-bus.js'
import { SearchIcon, SearchBar, useSearch } from './search.js'
import { SettingsRoutes } from './settings'
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

function Header({ inert }: { inert?: boolean }) {
	const [appConfig, setAppConfig] = useAppConfig()
	const [auth, setAuth] = useAuth()
	const [search, setSearch] = useSearch()
	const api = useApi()
	const { t, i18n } = useTranslation()
	const location = useLocation()
	const navigate = useNavigate()
	//const [notifications, setNotifications] = React.useState<{ notifications?: number }>({})
	const { notifications, setNotifications, loadNotifications } = useNotifications()
	const [menuOpen, setMenuOpen] = React.useState(false)
	const [exMenuOpen, setExMenuOpen] = React.useState(false)
	//console.log('menuOpen', menuOpen)

	useWsBus({ cmds: ['ACTION'] }, function handleAction(msg) {
		const action = msg.data as ActionView
		if (action.status == 'N' || action.status == 'C') setNotifications(n => ({ notifications: [...n?.notifications, action] }))
	})

	async function doLogout() {
		console.log('doLogout')
		await api.post('', '/auth/logout', {})
		setAuth(undefined)
		setMenuOpen(false)
		navigate('/login')
	}

	function setLang(evt: React.MouseEvent, lang: string) {
		evt.preventDefault()
		console.log('setLang', lang)
		i18n.changeLanguage(lang)
		setMenuOpen(false)
	}

	React.useEffect(function onLocationChange() {
		setExMenuOpen(false)
	}, [location])

	React.useEffect(function onLoad() {
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
		(async function () {
			if (!api.idTag && !auth) {
				// Determine idTag
				try {
					console.log('[Shell] fetching idTag')
					const loginToken = localStorage.getItem('loginToken') || undefined
					const res = await fetch(`https://${window.location.host}/.well-known/cloudillo/id-tag`)
					if (res.ok) {
						const j = await res.json()
						if (typeof j.idTag == 'string') {
							api.setIdTag(j.idTag)
							console.log('[Shell] idTag', j.idTag)
						}
						// Check for login cookie
						const tokenRes = await api.get(j.idTag, '/auth/login-token', { authToken: loginToken })
						const authState = tokenRes as AuthState || undefined
						console.log('authState', authState)
						if (authState?.idTag) {
							setAuth(authState)
							if (authState.token) localStorage.setItem('loginToken', authState.token)

							const navTo =
								authState.settings?.['ui.onboarding'] && `/onboarding/${authState.settings['ui.onboarding']}`
								|| appConfig?.menu?.find(m => m.id === appConfig.defaultMenu)?.path
								|| '/app/feed'
							console.log('REDIRECT TO', navTo)
							if (location.pathname == '/') {
								navigate(navTo)
							}
							return
						}
					}
					if (!location.pathname.startsWith('/register/')) navigate('/login')
				} catch (err) {
					console.log('ERROR', err)
					navigate('/login')
				}
			} else if (api.idTag && auth) {
				// Load notification count
				loadNotifications()
			}
		})()
	}, [api, auth])

	return <>
		<nav inert={inert} className="c-nav justify-content-between border-radius-0 mb-2 g-1">
			<ul className={mergeClasses('c-nav-group g-1', search.query != undefined && 'flex-fill')}>
				<li className={mergeClasses('c-nav-item', search.query != undefined && 'sm-hide')}>
					<CloudilloLogo style={{height: 32}}/></li>
				{ auth && <li className="c-nav-item flex-fill">
					{ search.query == undefined
						? <IcSearchUser onClick={() => setSearch({ query: '' })}/>
						: <SearchBar/>
					}
					</li>
				}
			</ul>
			<ul className="c-nav-group g-1">
				{/*
				{ appConfig && appConfig.menu.map(menuItem =>
					(!!auth || menuItem.public) && <li key={menuItem.id}>
						<NavLink className="c-nav-link" aria-current="page" to={menuItem.path}>{menuItem.icon && React.createElement(menuItem.icon)} {menuItem.label}</NavLink>
					</li>
				)}
				*/}
			</ul>
			<ul className="c-nav-group c-hbox">
				{ auth && <Link className="c-nav-item pos relative" to="/notifications">
					<IcNotifications/>
					{ !!notifications.notifications.length && <span className="c-badge br bg error">{notifications.notifications.length}</span> }
				</Link> }
				{ auth
					? <Popper icon={<ProfilePicture profile={auth}/>}>
						<ul className="c-nav vertical emph">
							<li><Link className="c-nav-item" to="/profile/me"><IcUser/>{t('Profile')}</Link></li>
							<li><Link className="c-nav-item" to="/settings"><IcSettings/>{t('Settings')}</Link></li>
							<li><hr className="w-100" /></li>
							<li><button className="c-nav-item" onClick={doLogout}><IcLogout/>{t('Logout')}</button></li>
							<li><hr className="w-100" /></li>
							<li>
								<button className="c-nav-item" onClick={evt => (evt.preventDefault(), i18n.changeLanguage('en'))}>English</button>
							</li>
							<li>
								<button className="c-nav-item" onClick={evt => setLang(evt, 'hu')}>Magyar</button>
							</li>
							<li className="text-disabled">Cloudillo V{process.env.CLOUDILLO_VERSION}</li>
						</ul>
					</Popper>
					: <Popper className="c-nav-item" icon={<IcMenu/>}>
						<ul className="c-nav vertical emph">
							<li><Link className="c-nav-item" to="/login" onClick={() => setMenuOpen(false)}><IcUser/>{t('Login')}</Link></li>
							<li><hr className="w-100"/></li>
							<li><Link className="c-nav-item" to="/profile/me">{t('Profile')}</Link></li>
							<hr className="w-100"/>
							<li><button className="c-nav-item" onClick={evt => (evt.preventDefault(), i18n.changeLanguage('en'))}>English</button></li>
							<li><button className="c-nav-item" onClick={evt => setLang(evt, 'hu')}>Magyar</button></li>
						</ul>
					</Popper>
				}
			</ul>
		</nav>
		<div inert={inert} className="c-menu-ex flex-order-end">
			<nav className={mergeClasses('c-nav', exMenuOpen && 'open')}>
				{ appConfig && appConfig.menuEx.map(menuItem =>
					(!!auth && (!menuItem.perm || auth.roles?.includes(menuItem.perm)) || menuItem.public)
						&& <NavLink key={menuItem.id} className="c-nav-link h-small vertical" aria-current="page" to={menuItem.path}>
							{menuItem.icon && React.createElement(menuItem.icon)}
							<h6>{menuItem.label}</h6>
						</NavLink>
				)}
			</nav>
		</div>
		<nav inert={inert} className="c-nav w-100 border-radius-0 justify-content-center flex-order-end">
			{ appConfig && appConfig.menu.map(menuItem =>
				(!!auth && (!menuItem.perm || auth.roles?.includes(menuItem.perm)) || menuItem.public)
					&& <NavLink key={menuItem.id} className="c-nav-link h-small vertical" aria-current="page" to={menuItem.path}>
						{menuItem.icon && React.createElement(menuItem.icon)}
						<h6>{menuItem.label}</h6>
					</NavLink>
			)}
			<button className={'c-nav-link h-small vertical'} onClick={() => setExMenuOpen(!exMenuOpen)}>
				<IcApps/>
				<h6>{t('More')}</h6>
			</button>
		</nav>
	</>
}

export function Layout() {
	const pwa = usePWA({ swPath: `/sw-${version}.js` })
	const api = useApi()
	const dialog = useDialog()

	return <>
		<WsBusRoot>
			<Header inert={dialog.isOpen}/>
			<div inert={dialog.isOpen} className="c-vbox flex-fill h-min-0">
				<ProfileRoutes/>
				<AuthRoutes/>
				<SettingsRoutes pwa={pwa}/>
				<SiteAdminRoutes/>
				<AppRoutes/>
				<OnboardingRoutes pwa={pwa}/>
				<Routes>
					<Route path="/notifications" element={<Notifications/>}/>
					<Route path="*" element={null}/>
				</Routes>
			</div>
			<div className="pt-1"/>
			<div id="popper-container"/>
			<DialogContainer/>
		</WsBusRoot>
	</>
}

// vim: ts=4
