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

import * as React from 'react'
import { Link, NavLink, Routes, Route, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import {
	LuKeyRound as IcSecurity,
	LuBell as IcNotifications,
	LuPalette as IcAppearance,
	LuMenu as IcMenu
} from 'react-icons/lu'

import { useAuth, useApi, Fcb, Button, mergeClasses } from '@cloudillo/react'

import { useAppConfig, parseQS, qs } from '../utils.js'
import { SecuritySettings } from './security.js'
import { NotificationSettings } from './notifications.js'
import { AppearanceSettings } from './appearance.js'

interface SettingsProps {
	title: string
	children?: React.ReactNode
}

export function Settings({ title, children }: SettingsProps) {
	const navigate = useNavigate()
	const location = useLocation()
	const { t } = useTranslation()
	const [appConfig] = useAppConfig()
	const api = useApi()
	const [auth] = useAuth()
	const [showFilter, setShowFilter] = React.useState<boolean>(false)

	React.useEffect(function onLocationEffect() {
		setShowFilter(false)
	}, [location])

	return <Fcb.Container className="g-1">
		<Fcb.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
			<ul className="c-nav vertical">
				<li className="c-nav-item"><NavLink className="c-nav-link" to="/settings/security"><IcSecurity/> {t('Security')}</NavLink></li>
				<li className="c-nav-item"><NavLink className="c-nav-link" to="/settings/notifications"><IcNotifications/> {t('Notifications')}</NavLink></li>
				<li className="c-nav-item"><NavLink className="c-nav-link" to="/settings/appearance"><IcAppearance/> {t('Appearance')}</NavLink></li>
			</ul>
		</Fcb.Filter>
		<Fcb.Content>
			<div className="c-nav c-hbox md-hide lg-hide">
				<IcMenu onClick={() => setShowFilter(true)}/>
				<h3>{title}</h3>
			</div>
			{children}
		</Fcb.Content>
		{/*
		<Fcb.Details isVisible={!!selectedFile} hide={() => setSelectedFile(undefined)}>
			{ selectedFile && <div className="c-panel h-min-100">
			</div> }
		</Fcb.Details>
		*/}
	</Fcb.Container>
}

export function SettingsRoutes() {
	const { t } = useTranslation()

	return <Routes>
		<Route path="/settings" element={<Settings title={t('Main')}/>}/>
		<Route path="/settings/security" element={
			<Settings title={t('Security')}>
				<SecuritySettings/>
			</Settings>
		}/>
		<Route path="/settings/notifications" element={
			<Settings title={t('Notifications')}>
				<NotificationSettings/>
			</Settings>
		}/>
		<Route path="/settings/appearance" element={
			<Settings title={t('Appearance')}>
				<AppearanceSettings/>
			</Settings>
		}/>
		<Route path="/*" element={null}/>
	</Routes>
}

// vim: ts=4
