// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { NavLink, Routes, Route, useLocation, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { LuFingerprint as IcIdp, LuSettings as IcSettings, LuMenu as IcMenu } from 'react-icons/lu'

import { Fcd, mergeClasses } from '@cloudillo/react'

import { IdentitiesSettings } from './identities.js'
import { ProviderSettings } from './settings.js'

export function Idp({ title, children }: { title: string; children?: React.ReactNode }) {
	const location = useLocation()
	const params = useParams()
	const { t } = useTranslation()
	const [showFilter, setShowFilter] = React.useState<boolean>(false)
	const contextIdTag = params.contextIdTag!
	const basePath = `/idp/${contextIdTag}`

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
						<NavLink
							className={({ isActive }) =>
								mergeClasses('c-nav-item', isActive && 'active')
							}
							to={`${basePath}/settings`}
						>
							<IcSettings /> {t('Provider Settings')}
						</NavLink>
					</li>
					<li>
						<NavLink
							className={({ isActive }) =>
								mergeClasses('c-nav-item', isActive && 'active')
							}
							to={basePath}
							end
						>
							<IcIdp /> {t('Identities')}
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

export function IdpRoutes() {
	const { t } = useTranslation()

	return (
		<Routes>
			<Route
				path="/idp/:contextIdTag"
				element={
					<Idp title={t('Identities')}>
						<IdentitiesSettings />
					</Idp>
				}
			/>
			<Route
				path="/idp/:contextIdTag/settings"
				element={
					<Idp title={t('Provider Settings')}>
						<ProviderSettings />
					</Idp>
				}
			/>
			<Route path="/*" element={null} />
		</Routes>
	)
}

// vim: ts=4
