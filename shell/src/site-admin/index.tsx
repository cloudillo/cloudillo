// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Fcd, mergeClasses, useAuth } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuShieldCheck as IcIdps,
	LuAtSign as IcInvitations,
	LuMail as IcMail,
	LuMenu as IcMenu,
	LuNetwork as IcProxy,
	LuServer as IcServer,
	LuHardDrive as IcStorage,
	LuUser as IcTenant,
	LuUsers as IcTenants
} from 'react-icons/lu'
import {
	Navigate,
	NavLink,
	Outlet,
	Route,
	useLocation,
	useMatch,
	useNavigate
} from 'react-router-dom'

import { useCtx } from '../context/index.js'
import { HOME_BASE, rebase, sectionMatch, siteAdminPath } from '../routes.js'
import { EmailSettings } from './email.js'
import { SuggestedProvidersSettings } from './idps.js'
import { Invitations } from './invitations.js'
import { AdminOverview } from './overview.js'
import { ProxySites } from './proxy-sites.js'
import { ServerSettings } from './server.js'
import { StorageSettings } from './storage.js'
import { TenantSettings } from './tenant.js'
import { TenantDetail } from './tenant-detail.js'
import { Tenants } from './tenants.js'

export function SiteAdmin({ title, children }: { title: string; children?: React.ReactNode }) {
	const _navigate = useNavigate()
	const location = useLocation()
	const { t } = useTranslation()
	const [_auth] = useAuth()
	const [showFilter, setShowFilter] = React.useState<boolean>(false)

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
					<li className="c-nav-header">{t('User Management')}</li>
					<li>
						<NavLink
							className={({ isActive }) =>
								mergeClasses('c-nav-item', isActive && 'active')
							}
							to={siteAdminPath('invitations')}
						>
							<IcInvitations /> {t('Invitations')}
						</NavLink>
					</li>
					<li>
						<NavLink
							className={({ isActive }) =>
								mergeClasses('c-nav-item', isActive && 'active')
							}
							to={siteAdminPath('tenants')}
						>
							<IcTenants /> {t('Users & Communities')}
						</NavLink>
					</li>
					<li className="c-menu-divider" />
					<li className="c-nav-header">{t('Registration')}</li>
					<li>
						<NavLink
							className={({ isActive }) =>
								mergeClasses('c-nav-item', isActive && 'active')
							}
							to={siteAdminPath('idps')}
						>
							<IcIdps /> {t('Suggested Providers')}
						</NavLink>
					</li>
					<li className="c-menu-divider" />
					<li className="c-nav-header">{t('System')}</li>
					<li>
						<NavLink
							className={({ isActive }) =>
								mergeClasses('c-nav-item', isActive && 'active')
							}
							to={siteAdminPath('server')}
						>
							<IcServer /> {t('Server')}
						</NavLink>
					</li>
					<li>
						<NavLink
							className={({ isActive }) =>
								mergeClasses('c-nav-item', isActive && 'active')
							}
							to={siteAdminPath('storage')}
						>
							<IcStorage /> {t('Storage')}
						</NavLink>
					</li>
					<li>
						<NavLink
							className={({ isActive }) =>
								mergeClasses('c-nav-item', isActive && 'active')
							}
							to={siteAdminPath('email')}
						>
							<IcMail /> {t('Email')}
						</NavLink>
					</li>
					<li>
						<NavLink
							className={({ isActive }) =>
								mergeClasses('c-nav-item', isActive && 'active')
							}
							to={siteAdminPath('proxy-sites')}
						>
							<IcProxy /> {t('Reverse Proxy')}
						</NavLink>
					</li>
					<li>
						<NavLink
							className={({ isActive }) =>
								mergeClasses('c-nav-item', isActive && 'active')
							}
							to={siteAdminPath('tenant')}
						>
							<IcTenant /> {t('Default Policies')}
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
		</Fcd.Container>
	)
}

/**
 * The heading over the admin page currently showing. A switch rather than a lookup table so
 * every string stays a literal `t('…')` call — `pnpm run l-scan` extracts the keys by
 * reading them, and a `t(variable)` is invisible to it. It also lets `tenants` and
 * `tenants/<idTag>` differ.
 */
function siteAdminTitle(
	t: (key: string) => string,
	page: string | undefined,
	id: string | undefined
): string {
	switch (page) {
		case 'invitations':
			return t('Invitations')
		case 'tenants':
			return id ? t('Tenant Settings') : t('Users & Communities')
		case 'idps':
			return t('Suggested Providers')
		case 'server':
			return t('Server')
		case 'storage':
			return t('Storage')
		case 'email':
			return t('Email')
		case 'proxy-sites':
			return t('Reverse Proxy')
		case 'tenant':
			return t('Default Policies')
		default:
			return t('Administration')
	}
}

/**
 * The chrome every admin page renders through, plus the home pin.
 *
 * Grammar, not authorisation. `/site-admin` administers the node itself, so `~` is the only
 * context it means anything under; a hand-typed community is re-pinned rather than refused
 * (`SADM` is enforced by the menu filter and by the server). The tail rides along, and the
 * redirect terminates on the next render, so it cannot loop.
 */
function SiteAdminLayout() {
	const { t } = useTranslation()
	const location = useLocation()
	const ctx = useCtx()
	// The two tail segments, straight from the route. `useParams()` would be empty here —
	// this IS the `site-admin` route, so its children's params are not in scope.
	const params = useMatch(sectionMatch('site-admin', ':page?/:id?'))?.params

	if (!ctx.isHome) {
		// `rebase` on the raw pathname carries the tail byte-for-byte; the match's
		// params are decoded and could not rebuild an escaped one.
		return <Navigate to={rebase(location.pathname, HOME_BASE) + location.search} replace />
	}

	return (
		<SiteAdmin title={siteAdminTitle(t, params?.page, params?.id)}>
			<Outlet />
		</SiteAdmin>
	)
}

/**
 * The `site-admin/…` branch of the context route. A plain function, not a component —
 * see `layout.tsx` for why.
 */
export function siteAdminRoutes() {
	return (
		<Route path="site-admin" element={<SiteAdminLayout />}>
			<Route index element={<AdminOverview />} />
			<Route path="invitations" element={<Invitations />} />
			<Route path="tenants" element={<Tenants />} />
			<Route path="tenants/:idTag" element={<TenantDetail />} />
			<Route path="idps" element={<SuggestedProvidersSettings />} />
			<Route path="server" element={<ServerSettings />} />
			<Route path="storage" element={<StorageSettings />} />
			<Route path="email" element={<EmailSettings />} />
			<Route path="proxy-sites" element={<ProxySites />} />
			<Route path="tenant" element={<TenantSettings />} />
		</Route>
	)
}

// vim: ts=4
