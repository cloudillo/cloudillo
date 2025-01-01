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
			//url: 'https://cloud.w9.hu/quillo/index.html'
			url: '/quillo/index.html'
		},
		{
			id: 'sheello',
			url: '/sheello/index.html'
		},
		{
			id: 'prello',
			url: 'https://cloud.w9.hu/prello/index.html'
		},
		{
			id: 'formillo',
			url: 'https://cloud.w9.hu/formillo/index.html'
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
		{ id: 'gallery', icon: IcGallery, label: 'Gallery', path: '/app/gallery' },
		{ id: 'files', icon: IcFile, label: 'Files', path: '/app/files?filter=mut' },
		{ id: 'feed', icon: IcFeed, label: 'Feed', path: '/app/feed', public: true },
		{ id: 'users', icon: IcUser, label: 'Users', path: '/users' },
		{ id: 'communities', icon: IcUsers, label: 'Communities', path: '/communities' },
		{ id: 'messages', icon: IcMessages, label: 'Messages', path: '/app/messages' },
		{ id: 'settings', icon: IcSettings, label: 'Settings', path: '/settings' },
		//{ id: 'myform', icon: IcFile, label: 'My Form', path: '/app/formillo/cloud.w9.hu/myform' },
	]
}

import * as React from 'react'
import { Routes, Route, Navigate, Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import {
	LuUser as IcUser,
	LuUsers as IcUsers,
	// App icons
	LuMenu	as IcMenu,
	LuList as IcFeed,
	LuFile as IcFile,
	LuMessagesSquare as IcMessages,
	LuSettings as IcSettings,
	LuImage as IcGallery
} from 'react-icons/lu'
import { CloudilloLogo } from './logo.js'

import { Popper } from '@cloudillo/react'
import { AppConfigState, useAppConfig, useApi, useAuth, AuthState } from './utils.js'
import usePWA from './pwa.js'
import { AuthRoutes, webAuthnLogin } from './auth.js'
import { WsBusRoot, useWsBus } from './ws-bus.js'
import { SearchIcon, SearchBar, useSearch } from './search.js'
import { SettingsRoutes } from './settings'
import { AppRoutes } from './apps'
import { ProfileRoutes } from './profile/profile.js'

import '@symbion/opalui'
import '@symbion/opalui/themes/opaque.css'
import '@symbion/opalui/themes/glass.css'
import './style.css'

function Header() {
	const [appConfig, setAppConfig] = useAppConfig()
	const [auth, setAuth] = useAuth()
	const [search] = useSearch()
	const api = useApi()
	const { t, i18n } = useTranslation()
	const navigate = useNavigate()
	const [menuOpen, setMenuOpen] = React.useState(false)
	//console.log('menuOpen', menuOpen)

	async function doLogout() {
		await api.post('', '/auth/logout', {})
		setAuth(undefined)
		setMenuOpen(false)
		navigate('/')
	}

	function setLang(evt: React.MouseEvent, lang: string) {
		evt.preventDefault()
		console.log('setLang', lang)
		i18n.changeLanguage(lang)
		setMenuOpen(false)
	}

	React.useEffect(function onLoad() {
		// Set app config
		setAppConfig(APP_CONFIG)

		// Set theme
		document.body.classList.add('theme-glass');

		// Set dark mode
		if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
			console.log('Dark mode')
			document.body.classList.add('dark');
		} else {
			console.log('Dark mode')
			document.body.classList.add('light');
		}
		(async function () {
			if (api && !auth) {
				// Try login token
				try {
					const res = await api.get('', '/auth/login-token')
					console.log({ auth: res })
					const authState = res as AuthState || undefined
					if (authState?.idTag) {
						setAuth(authState)
						return
					}
				} catch (err) {
					console.log('NO AUTH TOKEN', err)
				}
				if (localStorage.getItem('credential')) {
					const authState = await webAuthnLogin(api)
					console.log('webAuthnLogin res', authState)
					setAuth(authState)
				}
				//} else navigate('/profile/me')
			}
		})()
	}, [api])

	return <>
		<nav className="c-nav justify-content-between border-radius-0 mb-2 g-1">
			<ul className="c-nav-group g-1">
				<li className="c-nav-item">
					<Link className="c-nav-item" to="#"><CloudilloLogo style={{height: 32}}/></Link> </li>
				{ auth && <li className="c-nav-item">
					{ search.query == undefined ? <SearchIcon/> : <SearchBar/> }
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
				{ auth
					? <details className="c-dropdown right" open={menuOpen} onClick={evt => (evt.preventDefault(), setMenuOpen(!menuOpen))} onToggle={evt => console.log('details onChange', evt)}>
						<summary className="c-nav-item">
							{ auth.profilePic
								? <img className="c-avatar" src={`https://cl-o.${auth.idTag}/api/store/${auth.profilePic}`} alt="Profile picture"/>
								: <IcUser className="c-avatar"/>
							}
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
		<nav className="c-nav w-100 border-radius-0 justify-content-center flex-order-end">
			{ appConfig && appConfig.menu.map(menuItem =>
				(!!auth || menuItem.public)
					&& <NavLink key={menuItem.id} className="c-nav-link h-small vertical" aria-current="page" to={menuItem.path}>
						{menuItem.icon && React.createElement(menuItem.icon)}
						<h6>{menuItem.label}</h6>
					</NavLink>
			)}
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
			</div>
			<div className="pt-1"/>
			<div id="popper-container"/>
		</WsBusRoot>
	</>
}

// vim: ts=4
