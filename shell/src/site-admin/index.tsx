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
	LuAtSign as IcInvitations,
	LuServer as IcServer,
	LuHardDrive as IcStorage,
	LuMail as IcMail,
	LuNetwork as IcProxy,
	LuUser as IcTenant,
	LuUsers as IcTenants,
	LuShieldCheck as IcIdps,
	LuMenu as IcMenu
} from 'react-icons/lu'

import { useAuth, useApi, Fcd, mergeClasses } from '@cloudillo/react'

import { Invitations } from './invitations.js'
import { Tenants } from './tenants.js'
import { SuggestedProvidersSettings } from './idps.js'
import { ServerSettings } from './server.js'
import { StorageSettings } from './storage.js'
import { EmailSettings } from './email.js'
import { ProxySites } from './proxy-sites.js'
import { TenantSettings } from './tenant.js'
import { AdminOverview } from './overview.js'

export function SiteAdmin({ title, children }: { title: string; children?: React.ReactNode }) {
	const navigate = useNavigate()
	const location = useLocation()
	const { t } = useTranslation()
	const [auth] = useAuth()
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
							to="/site-admin/invitations"
						>
							<IcInvitations /> {t('Invitations')}
						</NavLink>
					</li>
					<li>
						<NavLink
							className={({ isActive }) =>
								mergeClasses('c-nav-item', isActive && 'active')
							}
							to="/site-admin/tenants"
						>
							<IcTenants /> {t('Users & Communities')}
						</NavLink>
					</li>
					<li className="c-divider" />
					<li className="c-nav-header">{t('Registration')}</li>
					<li>
						<NavLink
							className={({ isActive }) =>
								mergeClasses('c-nav-item', isActive && 'active')
							}
							to="/site-admin/idps"
						>
							<IcIdps /> {t('Suggested Providers')}
						</NavLink>
					</li>
					<li className="c-divider" />
					<li className="c-nav-header">{t('System')}</li>
					<li>
						<NavLink
							className={({ isActive }) =>
								mergeClasses('c-nav-item', isActive && 'active')
							}
							to="/site-admin/server"
						>
							<IcServer /> {t('Server')}
						</NavLink>
					</li>
					<li>
						<NavLink
							className={({ isActive }) =>
								mergeClasses('c-nav-item', isActive && 'active')
							}
							to="/site-admin/storage"
						>
							<IcStorage /> {t('Storage')}
						</NavLink>
					</li>
					<li>
						<NavLink
							className={({ isActive }) =>
								mergeClasses('c-nav-item', isActive && 'active')
							}
							to="/site-admin/email"
						>
							<IcMail /> {t('Email')}
						</NavLink>
					</li>
					<li>
						<NavLink
							className={({ isActive }) =>
								mergeClasses('c-nav-item', isActive && 'active')
							}
							to="/site-admin/proxy-sites"
						>
							<IcProxy /> {t('Reverse Proxy')}
						</NavLink>
					</li>
					<li>
						<NavLink
							className={({ isActive }) =>
								mergeClasses('c-nav-item', isActive && 'active')
							}
							to="/site-admin/tenant"
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

export function SiteAdminRoutes() {
	const { t } = useTranslation()

	return (
		<Routes>
			<Route
				path="/site-admin"
				element={
					<SiteAdmin title={t('Administration')}>
						<AdminOverview />
					</SiteAdmin>
				}
			/>
			<Route
				path="/site-admin/invitations"
				element={
					<SiteAdmin title={t('Invitations')}>
						<Invitations />
					</SiteAdmin>
				}
			/>
			<Route
				path="/site-admin/tenants"
				element={
					<SiteAdmin title={t('Users & Communities')}>
						<Tenants />
					</SiteAdmin>
				}
			/>
			<Route
				path="/site-admin/idps"
				element={
					<SiteAdmin title={t('Suggested Providers')}>
						<SuggestedProvidersSettings />
					</SiteAdmin>
				}
			/>
			<Route
				path="/site-admin/server"
				element={
					<SiteAdmin title={t('Server')}>
						<ServerSettings />
					</SiteAdmin>
				}
			/>
			<Route
				path="/site-admin/storage"
				element={
					<SiteAdmin title={t('Storage')}>
						<StorageSettings />
					</SiteAdmin>
				}
			/>
			<Route
				path="/site-admin/email"
				element={
					<SiteAdmin title={t('Email')}>
						<EmailSettings />
					</SiteAdmin>
				}
			/>
			<Route
				path="/site-admin/proxy-sites"
				element={
					<SiteAdmin title={t('Reverse Proxy')}>
						<ProxySites />
					</SiteAdmin>
				}
			/>
			<Route
				path="/site-admin/tenant"
				element={
					<SiteAdmin title={t('Default Policies')}>
						<TenantSettings />
					</SiteAdmin>
				}
			/>
			<Route path="/*" element={null} />
		</Routes>
	)
}

// vim: ts=4
