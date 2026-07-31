// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { apiAtom, Fcd, LoadingSpinner, mergeClasses } from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuFingerprint as IcIdp, LuMenu as IcMenu, LuSettings as IcSettings } from 'react-icons/lu'
import { Navigate, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom'

import { contextIdpEnabledAtom, HOME_CONTEXT } from '../context/index.js'
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

/**
 * Route guard for the IdP pages.
 *
 * `idp.enabled` is a per-tenant capability loaded on context switch, so a hard reload straight onto
 * `/idp/<community>` renders before the answer is known. Without this the page mounts and its API
 * calls come back 404 (the backend hides the endpoints entirely when IdP is off), which reads as a
 * broken page rather than a disabled feature.
 *
 * Only a real `false` redirects. `'unknown'` — a transient lookup failure — renders the page
 * instead, so its own API calls surface the actual error rather than ejecting a legitimate provider.
 */
function IdpGuard({ children }: { children: React.ReactElement }) {
	const { contextIdTag } = useParams()
	const apiState = useAtomValue(apiAtom)
	const contextIdpEnabled = useAtomValue(contextIdpEnabledAtom)

	const idTag = contextIdTag === HOME_CONTEXT ? apiState.idTag : contextIdTag
	const enabled = idTag ? contextIdpEnabled[idTag] : undefined

	// Not asked yet - the answer is coming
	if (enabled === undefined) return <LoadingSpinner />
	if (enabled === false)
		return <Navigate to={`/app/${contextIdTag ?? HOME_CONTEXT}/feed`} replace />
	return children
}

export function IdpRoutes() {
	const { t } = useTranslation()

	return (
		<Routes>
			<Route
				path="/idp/:contextIdTag"
				element={
					<IdpGuard>
						<Idp title={t('Identities')}>
							<IdentitiesSettings />
						</Idp>
					</IdpGuard>
				}
			/>
			<Route
				path="/idp/:contextIdTag/settings"
				element={
					<IdpGuard>
						<Idp title={t('Provider Settings')}>
							<ProviderSettings />
						</Idp>
					</IdpGuard>
				}
			/>
			<Route path="/*" element={null} />
		</Routes>
	)
}

// vim: ts=4
