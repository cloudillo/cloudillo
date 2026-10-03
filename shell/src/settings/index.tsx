// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Fcd, LoadingSpinner, Nav, PageHeader, ProfilePicture, useAuth } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuPalette as IcAppearance,
	LuLayoutGrid as IcApps,
	LuCalendar as IcCalendar,
	LuHardDrive as IcFiles,
	LuSlidersHorizontal as IcGeneral,
	LuBell as IcNotifications,
	LuShield as IcPrivacy,
	LuUser as IcProfile,
	LuKeyRound as IcSecurity,
	LuGlobe as IcSite,
	LuShieldCheck as IcTrust,
	LuDoorOpen as IcRooms,
	LuHandshake as IcPartners
} from 'react-icons/lu'
import { Navigate, Outlet, Route, useLocation, useMatch } from 'react-router-dom'

import {
	type ActiveContext,
	canAdminContext,
	useActiveCommunity,
	useCtx,
	useCurrentContextIdTag
} from '../context/index.js'
import type { UsePWA } from '../pwa.js'
import { feedPath, sectionMatch, settingsPath } from '../routes.js'
import { AppearanceSettings } from './appearance.js'
import { NotificationSettings } from './notifications.js'
import { SecuritySettings } from './security.js'

export { applyTheme, readStoredTheme, setTheme } from './appearance.js'

import { AppMenuSettings } from './apps.js'
import { CalendarSettings } from './calendar.js'
import { CommunityGeneralSettings } from './community-general.js'
import { FilesSettings } from './files.js'
import { PartnersSettings } from './partners.js'
import { SettingsOverview } from './overview.js'
import { PrivacySettings } from './privacy.js'
import { ProfileTabSettings } from './profile-tabs.js'
import { RoomDetailSettings } from './room-detail.js'
import { RoomsSettings } from './rooms.js'
import { SiteSettings } from './site.js'
import { TrustSettings } from './trust.js'

/** The personal settings nav (`~/settings/*`), in order. */
const PERSONAL_PAGES = [
	'profile',
	'security',
	'privacy',
	'trust',
	'notifications',
	'appearance',
	'calendar',
	'apps',
	'files',
	'rooms',
	'site'
]

/**
 * The community administration nav (`/@ctx/settings/*`), in order. A new admin page is an
 * entry here, a `settingsTitle` case, a `PAGE_ICONS` entry and a route in `settingsRoutes`;
 * who may see it is `canAdminContext` in `context/hooks.ts`.
 */
const COMMUNITY_ADMIN_PAGES = ['general', 'privacy', 'files', 'rooms', 'partners', 'site']

/** The settings pages the user may open: the admin pages they hold in a community, else all. */
export function allowedPages(community: ActiveContext | undefined, authIdTag: string | undefined) {
	return community
		? COMMUNITY_ADMIN_PAGES.filter((page) => canAdminContext(community, authIdTag, page))
		: PERSONAL_PAGES
}

const PAGE_ICONS: Record<string, React.ReactNode> = {
	general: <IcGeneral />,
	profile: <IcProfile />,
	security: <IcSecurity />,
	privacy: <IcPrivacy />,
	trust: <IcTrust />,
	notifications: <IcNotifications />,
	appearance: <IcAppearance />,
	calendar: <IcCalendar />,
	apps: <IcApps />,
	files: <IcFiles />,
	site: <IcSite />,
	rooms: <IcRooms />,
	partners: <IcPartners />
}

interface SettingsProps {
	title: string
	children?: React.ReactNode
}

export function Settings({ title, children }: SettingsProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const location = useLocation()
	const basePath = settingsPath(useCtx().base)
	const community = useActiveCommunity()
	const pages = allowedPages(community, auth?.idTag)

	return (
		// Keyed on the path so the mobile rail drawer closes once a page is picked: the
		// built-in `filterLabel` state has no close-on-navigate of its own.
		<Fcd.Container key={location.pathname} className="g-1" filterLabel={title}>
			<Fcd.Filter>
				<Nav aria-label={t('Settings')}>
					{pages.map((page) => (
						<Nav.Item
							key={page}
							href={`${basePath}/${page}`}
							icon={PAGE_ICONS[page]}
							label={settingsTitle(t, page)}
						/>
					))}
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
 * The heading over the settings page currently showing, and its nav label. A switch rather
 * than a lookup table so every string stays a literal `t('…')` call — `pnpm run l-scan`
 * extracts the keys by reading them, and a `t(variable)` is invisible to it.
 */
function settingsTitle(t: (key: string) => string, page: string | undefined): string {
	switch (page) {
		case 'general':
			return t('General')
		case 'profile':
			return t('Profile')
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
		case 'rooms':
			return t('Rooms')
		case 'partners':
			return t('Partner communities')
		default:
			return t('Settings')
	}
}

/** The chrome every settings page renders through, as one layout route. */
function SettingsLayout() {
	const { t } = useTranslation()
	// The route's own page segment. `useParams()` would be empty here — this IS the
	// `settings` route, so its children's params are not in scope.
	const page = useMatch(sectionMatch('settings', ':page/*'))?.params.page
	const [auth] = useAuth()
	const community = useActiveCommunity()
	const { base, idTag } = useCtx()
	// The active context trails the URL; on a cold deep link the community is not active yet,
	// so `allowedPages` would still be judging home.
	const settled = idTag === useCurrentContextIdTag()

	// A page this context does not offer (`~/settings/partners`, a moderator on `general`)
	if (settled && page && !allowedPages(community, auth?.idTag).includes(page)) {
		return <Navigate to={settingsPath(base)} replace />
	}

	return (
		<Settings title={settingsTitle(t, page)}>
			{settled ? <Outlet /> : <LoadingSpinner />}
		</Settings>
	)
}

/**
 * `settings/` itself: the overview at home; in a community, the first admin page the user may
 * open (General for leaders, Rooms for moderators).
 */
function SettingsIndex({ pwa }: { pwa: UsePWA }) {
	const [auth] = useAuth()
	const community = useActiveCommunity()
	const base = useCtx().base
	if (!community) return <SettingsOverview pwa={pwa} />
	// No admin page at all: back to the community rather than into the guard's loop
	const first = allowedPages(community, auth?.idTag)[0]
	return <Navigate to={first ? settingsPath(base, first) : feedPath(base)} replace />
}

/**
 * The `settings/…` branch of the context route. A plain function, not a component —
 * see `layout.tsx` for why.
 */
export function settingsRoutes(pwa: UsePWA) {
	return (
		<Route path="settings" element={<SettingsLayout />}>
			<Route index element={<SettingsIndex pwa={pwa} />} />
			<Route path="general" element={<CommunityGeneralSettings />} />
			<Route path="profile" element={<ProfileTabSettings />} />
			<Route path="security" element={<SecuritySettings />} />
			<Route path="privacy" element={<PrivacySettings />} />
			<Route path="trust" element={<TrustSettings />} />
			<Route path="notifications" element={<NotificationSettings pwa={pwa} />} />
			<Route path="appearance" element={<AppearanceSettings />} />
			<Route path="calendar" element={<CalendarSettings />} />
			<Route path="apps" element={<AppMenuSettings />} />
			<Route path="files" element={<FilesSettings />} />
			<Route path="site" element={<SiteSettings />} />
			<Route path="rooms" element={<RoomsSettings />} />
			<Route path="rooms/:name" element={<RoomDetailSettings />} />
			<Route path="partners" element={<PartnersSettings />} />
		</Route>
	)
}

// vim: ts=4
