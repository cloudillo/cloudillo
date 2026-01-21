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
	LuShield as IcPrivacy,
	LuHardDrive as IcFiles,
	LuMenu as IcMenu
} from 'react-icons/lu'

import { useAuth, useApi, Fcd, Button, mergeClasses } from '@cloudillo/react'

import { UsePWA } from '../pwa.js'
import { useAppConfig, parseQS, qs } from '../utils.js'
import { SecuritySettings } from './security.js'
import { NotificationSettings } from './notifications.js'
import { AppearanceSettings, setTheme } from './appearance.js'
export { setTheme }
import { PrivacySettings } from './privacy.js'
import { FilesSettings } from './files.js'
import { SettingsOverview } from './overview.js'

interface SettingsProps {
	title: string
	children?: React.ReactNode
}

export function Settings({ title, children }: SettingsProps) {
	const navigate = useNavigate()
	const location = useLocation()
	const params = useParams()
	const { t } = useTranslation()
	const [appConfig] = useAppConfig()
	const { api, setIdTag } = useApi()
	const [auth] = useAuth()
	const [showFilter, setShowFilter] = React.useState<boolean>(false)
	const contextIdTag = params.contextIdTag!
	const basePath = `/settings/${contextIdTag}`

	React.useEffect(
		function onLocationEffect() {
			setShowFilter(false)
		},
		[location]
	)

	return (
		<Fcd.Container className="g-1">
			<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
				<ul className="c-nav vertical low">
					<li>
						<NavLink className="c-nav-item" to={`${basePath}/security`}>
							<IcSecurity /> {t('Security')}
						</NavLink>
					</li>
					<li>
						<NavLink className="c-nav-item" to={`${basePath}/privacy`}>
							<IcPrivacy /> {t('Privacy')}
						</NavLink>
					</li>
					<li>
						<NavLink className="c-nav-item" to={`${basePath}/notifications`}>
							<IcNotifications /> {t('Notifications')}
						</NavLink>
					</li>
					<li>
						<NavLink className="c-nav-item" to={`${basePath}/appearance`}>
							<IcAppearance /> {t('Appearance')}
						</NavLink>
					</li>
					<li>
						<NavLink className="c-nav-item" to={`${basePath}/files`}>
							<IcFiles /> {t('Files')}
						</NavLink>
					</li>
				</ul>
			</Fcd.Filter>
			<Fcd.Content>
				<div className="c-nav c-hbox md-hide lg-hide">
					<IcMenu onClick={() => setShowFilter(true)} />
					<h3>{title}</h3>
				</div>
				{children}
			</Fcd.Content>
			{/*
		<Fcd.Details isVisible={!!selectedFile} hide={() => setSelectedFile(undefined)}>
			{ selectedFile && <div className="c-panel h-min-100">
			</div> }
		</Fcd.Details>
		*/}
		</Fcd.Container>
	)
}

export function SettingsRoutes({ pwa }: { pwa: UsePWA }) {
	const { t } = useTranslation()

	return (
		<Routes>
			<Route
				path="/settings/:contextIdTag"
				element={
					<Settings title={t('Settings')}>
						<SettingsOverview pwa={pwa} />
					</Settings>
				}
			/>
			<Route
				path="/settings/:contextIdTag/security"
				element={
					<Settings title={t('Security')}>
						<SecuritySettings />
					</Settings>
				}
			/>
			<Route
				path="/settings/:contextIdTag/privacy"
				element={
					<Settings title={t('Privacy')}>
						<PrivacySettings />
					</Settings>
				}
			/>
			<Route
				path="/settings/:contextIdTag/notifications"
				element={
					<Settings title={t('Notifications')}>
						<NotificationSettings pwa={pwa} />
					</Settings>
				}
			/>
			<Route
				path="/settings/:contextIdTag/appearance"
				element={
					<Settings title={t('Appearance')}>
						<AppearanceSettings />
					</Settings>
				}
			/>
			<Route
				path="/settings/:contextIdTag/files"
				element={
					<Settings title={t('Files')}>
						<FilesSettings />
					</Settings>
				}
			/>
			<Route path="/*" element={null} />
		</Routes>
	)
}

// vim: ts=4
