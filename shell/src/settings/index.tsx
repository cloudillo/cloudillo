// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Fcd, Nav, PageHeader, ProfilePicture } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuPalette as IcAppearance,
	LuLayoutGrid as IcApps,
	LuCalendar as IcCalendar,
	LuHardDrive as IcFiles,
	LuBell as IcNotifications,
	LuShield as IcPrivacy,
	LuKeyRound as IcSecurity,
	LuGlobe as IcSite,
	LuShieldCheck as IcTrust
} from 'react-icons/lu'
import { Outlet, Route, useLocation, useMatch } from 'react-router-dom'

import { useActiveCommunity, useCtx } from '../context/index.js'
import type { UsePWA } from '../pwa.js'
import { sectionMatch, settingsPath } from '../routes.js'
import { AppearanceSettings } from './appearance.js'
import { NotificationSettings } from './notifications.js'
import { SecuritySettings } from './security.js'

export { applyTheme, readStoredTheme, setTheme } from './appearance.js'

import { AppMenuSettings } from './apps.js'
import { CalendarSettings } from './calendar.js'
import { FilesSettings } from './files.js'
import { SettingsOverview } from './overview.js'
import { PrivacySettings } from './privacy.js'
import { SiteSettings } from './site.js'
import { TrustSettings } from './trust.js'

interface SettingsProps {
	title: string
	children?: React.ReactNode
}

export function Settings({ title, children }: SettingsProps) {
	const { t } = useTranslation()
	const location = useLocation()
	const basePath = settingsPath(useCtx().base)
	const community = useActiveCommunity()

	return (
		// Keyed on the path so the mobile rail drawer closes once a page is picked: the
		// built-in `filterLabel` state has no close-on-navigate of its own.
		<Fcd.Container key={location.pathname} className="g-1" filterLabel={title}>
			<Fcd.Filter>
				<Nav aria-label={t('Settings')}>
					<Nav.Item
						href={`${basePath}/security`}
						icon={<IcSecurity />}
						label={t('Security')}
					/>
					<Nav.Item
						href={`${basePath}/privacy`}
						icon={<IcPrivacy />}
						label={t('Privacy')}
					/>
					<Nav.Item
						href={`${basePath}/trust`}
						icon={<IcTrust />}
						label={t('Trusted profiles')}
					/>
					<Nav.Item
						href={`${basePath}/notifications`}
						icon={<IcNotifications />}
						label={t('Notifications')}
					/>
					<Nav.Item
						href={`${basePath}/appearance`}
						icon={<IcAppearance />}
						label={t('Appearance')}
					/>
					<Nav.Item
						href={`${basePath}/calendar`}
						icon={<IcCalendar />}
						label={t('Calendar')}
					/>
					<Nav.Item href={`${basePath}/apps`} icon={<IcApps />} label={t('App menu')} />
					<Nav.Item
						href={`${basePath}/files`}
						icon={<IcFiles />}
						label={t('Files & Storage')}
					/>
					<Nav.Item href={`${basePath}/site`} icon={<IcSite />} label={t('Site')} />
				</Nav>
			</Fcd.Filter>
			<Fcd.Content
				width="form"
				header={
					<PageHeader
						title={
							community ? `${community.name || community.idTag} · ${title}` : title
						}
						leading={
							community && (
								<ProfilePicture
									profile={{ profilePic: community.profilePic }}
									srcTag={community.idTag}
									size="sm"
								/>
							)
						}
					/>
				}
			>
				{children}
			</Fcd.Content>
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
		case 'site':
			return t('Site')
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
			<Route path="site" element={<SiteSettings />} />
		</Route>
	)
}

// vim: ts=4
