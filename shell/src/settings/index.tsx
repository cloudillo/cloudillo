// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Fcd, useApi, useAuth } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuPalette as IcAppearance,
	LuLayoutGrid as IcApps,
	LuCalendar as IcCalendar,
	LuHardDrive as IcFiles,
	LuMenu as IcMenu,
	LuBell as IcNotifications,
	LuShield as IcPrivacy,
	LuKeyRound as IcSecurity,
	LuShieldCheck as IcTrust
} from 'react-icons/lu'
import { NavLink, Outlet, Route, useLocation, useMatch, useNavigate } from 'react-router-dom'

import { useCtx } from '../context/index.js'
import type { UsePWA } from '../pwa.js'
import { sectionMatch, settingsPath } from '../routes.js'
import { useAppConfig } from '../utils.js'
import { AppearanceSettings } from './appearance.js'
import { NotificationSettings } from './notifications.js'
import { SecuritySettings } from './security.js'

export { applyTheme, setTheme } from './appearance.js'

import { AppMenuSettings } from './apps.js'
import { CalendarSettings } from './calendar.js'
import { FilesSettings } from './files.js'
import { SettingsOverview } from './overview.js'
import { PrivacySettings } from './privacy.js'
import { TrustSettings } from './trust.js'

interface SettingsProps {
	title: string
	children?: React.ReactNode
}

export function Settings({ title, children }: SettingsProps) {
	const _navigate = useNavigate()
	const location = useLocation()
	const { t } = useTranslation()
	const [_appConfig] = useAppConfig()
	useApi()
	const [_auth] = useAuth()
	const [showFilter, setShowFilter] = React.useState<boolean>(false)
	const basePath = settingsPath(useCtx().base)

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
						<NavLink className="c-nav-item" to={`${basePath}/trust`}>
							<IcTrust /> {t('Trusted profiles')}
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
						<NavLink className="c-nav-item" to={`${basePath}/calendar`}>
							<IcCalendar /> {t('Calendar')}
						</NavLink>
					</li>
					<li>
						<NavLink className="c-nav-item" to={`${basePath}/apps`}>
							<IcApps /> {t('App menu')}
						</NavLink>
					</li>
					<li>
						<NavLink className="c-nav-item" to={`${basePath}/files`}>
							<IcFiles /> {t('Files & Storage')}
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

/**
 * The heading over the settings page currently showing. A switch rather than a lookup table
 * so every string stays a literal `t('…')` call — `pnpm run l-scan` extracts the keys by
 * reading them, and a `t(variable)` is invisible to it.
 */
function settingsTitle(t: (key: string) => string, page: string | undefined): string {
	switch (page) {
		case 'security':
			return t('Security')
		case 'privacy':
			return t('Privacy')
		case 'trust':
			return t('Trusted profiles')
		case 'notifications':
			return t('Notifications')
		case 'appearance':
			return t('Appearance')
		case 'calendar':
			return t('Calendar')
		case 'apps':
			return t('App menu')
		case 'files':
			return t('Files & Storage')
		default:
			return t('Settings')
	}
}

/** The chrome every settings page renders through, as one layout route. */
function SettingsLayout() {
	const { t } = useTranslation()
	// The route's own page segment. `useParams()` would be empty here — this IS the
	// `settings` route, so its children's params are not in scope.
	const page = useMatch(sectionMatch('settings', ':page?'))?.params.page

	return (
		<Settings title={settingsTitle(t, page)}>
			<Outlet />
		</Settings>
	)
}

/**
 * The `settings/…` branch of the context route. A plain function, not a component —
 * see `layout.tsx` for why.
 */
export function settingsRoutes(pwa: UsePWA) {
	return (
		<Route path="settings" element={<SettingsLayout />}>
			<Route index element={<SettingsOverview pwa={pwa} />} />
			<Route path="security" element={<SecuritySettings />} />
			<Route path="privacy" element={<PrivacySettings />} />
			<Route path="trust" element={<TrustSettings />} />
			<Route path="notifications" element={<NotificationSettings pwa={pwa} />} />
			<Route path="appearance" element={<AppearanceSettings />} />
			<Route path="calendar" element={<CalendarSettings />} />
			<Route path="apps" element={<AppMenuSettings />} />
			<Route path="files" element={<FilesSettings />} />
		</Route>
	)
}

// vim: ts=4
