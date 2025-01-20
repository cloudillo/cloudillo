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
			url: '/quillo/index.html'
		},
		{
			id: 'sheello',
			url: '/sheello/index.html'
		},
		{
			id: 'prello',
			url: '/prello/index.html'
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
	],
	defaultMenu: 'files'
}

import * as React from 'react'
import { Routes, Route, Navigate, Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import {
	LuUserSearch as IcSearchUser,
	LuUser as IcUser,
	LuUsers as IcUsers,
	LuGrip as IcApps,
	// App icons
	LuMenu	as IcMenu,
	LuList as IcFeed,
	LuFile as IcFile,
	LuMessagesSquare as IcMessages,
	LuBell as IcNotifications,
	LuSettings as IcSettings,
	LuImage as IcGallery
} from 'react-icons/lu'
import { CloudilloLogo } from './logo.js'

import { Profile } from '@cloudillo/types'
import { useAuth, AuthState, useApi, mergeClasses, ProfilePicture, Popper } from '@cloudillo/react'
import { AppConfigState, useAppConfig } from './utils.js'
import usePWA from './pwa.js'
import { AuthRoutes, webAuthnLogin } from './auth/auth.js'
import { WsBusRoot, useWsBus } from './ws-bus.js'
import { SearchIcon, SearchBar, useSearch } from './search.js'
import { SettingsRoutes } from './settings'
import { AppRoutes } from './apps'
import { ProfileRoutes } from './profile/profile.js'
import { Notifications } from './notifications/notifications.js'

import '@symbion/opalui'
import '@symbion/opalui/themes/opaque.css'
import '@symbion/opalui/themes/glass.css'
import './style.css'

function Header() {
	const [appConfig, setAppConfig] = useAppConfig()
	const [auth, setAuth] = useAuth()
	const [search, setSearch] = useSearch()
	const api = useApi()
	const { t, i18n } = useTranslation()
	const location = useLocation()
	const navigate = useNavigate()
	const [menuOpen, setMenuOpen] = React.useState(false)
	const [exMenuOpen, setExMenuOpen] = React.useState(false)
	//console.log('menuOpen', menuOpen)

	async function doLogout() {
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
		setAppConfig(APP_CONFIG)

		// Set theme
		document.body.classList.add('theme-glass');

		// Set dark mode
		if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
			document.body.classList.add('dark');
		} else {
			document.body.classList.add('light');
		}
		(async function () {
			if (!api.idTag && !auth) {
				// Determine idTag
				try {
					console.log('[Shell] fetching idTag')
					const res = await fetch(`https://${window.location.host}/id-tag`)
					if (res.ok) {
						const j = await res.json()
						if (typeof j.idTag == 'string') {
							api.setIdTag(j.idTag)
							console.log('[Shell] idTag', j.idTag)
						}
						// Check for login cookie
						const tokenRes = await api.get(j.idTag, '/auth/login-token')
						const authState = tokenRes as AuthState || undefined
						console.log('authState', authState)
						if (authState?.idTag) {
							setAuth(authState)
							if (location.pathname == '/') navigate(appConfig?.menu?.find(m => m.id === appConfig.defaultMenu)?.path || '/app/feed')
							return
						}
						/*
						if (localStorage.getItem('credential')) {
							const authState = await webAuthnLogin(api)
							console.log('webAuthnLogin res', authState)
							setAuth(authState)
						}
						*/
					}
					if (!location.pathname.startsWith('/register/')) navigate('/login')
				} catch (err) {
					console.log('ERROR', err)
					navigate('/login')
				}
				//} else navigate('/profile/me')
			}
		})()
	}, [api, auth])

	return <>
		<nav className="c-nav justify-content-between border-radius-0 mb-2 g-1">
			<ul className="c-nav-group g-1">
				<li className="c-nav-item">
					<Link className="c-nav-item" to="#"><CloudilloLogo style={{height: 32}}/></Link> </li>
				{ auth && <li className="c-nav-item">
					{ search.query == undefined ? <IcSearchUser onClick={() => setSearch({ query: '' })}/> : <SearchBar/> }
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
				{ auth && <Link className="c-nav-item" to="/notifications"><IcNotifications/></Link> }
				{ auth
					? <details className="c-dropdown right" open={menuOpen} onClick={evt => (evt.preventDefault(), setMenuOpen(!menuOpen))} onToggle={evt => console.log('details onChange', evt)}>
						<summary className="c-nav-item">
							<ProfilePicture profile={auth}/>
						{auth.name}</summary>
						<ul className="c-nav flex-column">
							<li className="c-nav-item"><Link to="/profile/me">{t('Profile')}</Link></li>
							<li className="c-nav-item"><Link className="c-nav-item" to="/settings">{t('Settings')}</Link></li>
							<li><hr className="w-100" /></li>
							<li className="c-nav-item"><button className="c-nav-item" onClick={doLogout}>{t('Logout')}</button></li>
							<hr/>
							<li className="c-nav-item">
								<button className="c-nav-link" onClick={evt => (evt.preventDefault(), i18n.changeLanguage('en'))}>English</button>
							</li>
							<li className="c-nav-item">
								<button className="c-nav-link" onClick={evt => setLang(evt, 'hu')}>Magyar</button>
							</li>
						</ul>
					</details>
					: <Popper icon={IcMenu} label={t('Menu')}>
						<ul className="c-nav flex-column">
							<li className="c-nav-item">
								<Link className="c-nav-link" to="/login" onClick={() => setMenuOpen(false)}><IcUser/>{t('Login')}</Link>
							</li>
							<hr/>
							<li className="c-nav-item"><Link to="/profile/me">{t('Profile')}</Link></li>
							<hr/>
							<li className="c-nav-item">
								<button className="c-nav-link" onClick={evt => (evt.preventDefault(), i18n.changeLanguage('en'))}>English</button>
							</li>
							<li className="c-nav-item">
								<button className="c-nav-link" onClick={evt => setLang(evt, 'hu')}>Magyar</button>
							</li>
						</ul>
					</Popper>
				}
			</ul>
		</nav>
		<div className="pos relative flex-order-end">
			<nav className={mergeClasses('c-nav c-menu-ex', exMenuOpen && 'open')}>
				{ appConfig && appConfig.menuEx.map(menuItem =>
					(!!auth || menuItem.public)
						&& <NavLink key={menuItem.id} className="c-nav-link h-small vertical" aria-current="page" to={menuItem.path}>
							{menuItem.icon && React.createElement(menuItem.icon)}
							<h6>{menuItem.label}</h6>
						</NavLink>
				)}
			</nav>
		</div>
		<nav className="c-nav w-100 border-radius-0 justify-content-center flex-order-end">
			{ appConfig && appConfig.menu.map(menuItem =>
				(!!auth || menuItem.public)
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

const pwaConfig = {
}

export function Layout() {
	const pwa = usePWA(pwaConfig)
	const api = useApi()

	return <>
		<WsBusRoot>
			<Header/>
			<div className="c-vbox flex-fill h-min-0">
				<ProfileRoutes/>
				<AuthRoutes/>
				<SettingsRoutes/>
				<AppRoutes/>
				<Routes>
					<Route path="/notifications" element={<Notifications/>}/>
					<Route path="*" element={null}/>
				</Routes>
			</div>
			<div className="pt-1"/>
			<div id="popper-container"/>
		</WsBusRoot>
	</>
}

// vim: ts=4
