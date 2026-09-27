// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Fcd, LoadingSpinner, Nav } from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuFingerprint as IcIdp, LuSettings as IcSettings } from 'react-icons/lu'
import { Navigate, Outlet, Route, useLocation } from 'react-router-dom'

import { contextIdpEnabledAtom, useCtx } from '../context/index.js'
import { feedPath, idpPath } from '../routes.js'
import { IdentitiesSettings } from './identities.js'
import { ProviderSettings } from './settings.js'

export function Idp({ title, children }: { title: string; children?: React.ReactNode }) {
	const location = useLocation()
	const { t } = useTranslation()
	const basePath = idpPath(useCtx().base)

	return (
		// Keyed on the path so the mobile filter drawer closes on navigation
		<Fcd.Container key={location.pathname} className="g-1" filterLabel={title}>
			<Fcd.Filter>
				<Nav aria-label={t('Identity Provider')}>
					<Nav.Item
						href={`${basePath}/settings`}
						icon={<IcSettings />}
						label={t('Provider Settings')}
					/>
					<Nav.Item href={basePath} icon={<IcIdp />} label={t('Identities')} />
				</Nav>
			</Fcd.Filter>
			<Fcd.Content>{children}</Fcd.Content>
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
 *
 * Doubles as the layout route: the guard and the chrome wrap the same two pages.
 */
function IdpGuard() {
	const { t } = useTranslation()
	const location = useLocation()
	const ctx = useCtx()
	const contextIdpEnabled = useAtomValue(contextIdpEnabledAtom)

	const enabled = ctx.idTag ? contextIdpEnabled[ctx.idTag] : undefined

	// Not asked yet - the answer is coming
	if (enabled === undefined) return <LoadingSpinner className="auto-bg" />
	if (enabled === false) return <Navigate to={feedPath(ctx.base)} replace />

	const title = location.pathname.endsWith('/settings') ? t('Provider Settings') : t('Identities')
	return (
		<Idp title={title}>
			<Outlet />
		</Idp>
	)
}

/**
 * The `idp/…` branch of the context route. A plain function, not a component — see
 * `layout.tsx` for why.
 */
export function idpRoutes() {
	return (
		<Route path="idp" element={<IdpGuard />}>
			<Route index element={<IdentitiesSettings />} />
			<Route path="settings" element={<ProviderSettings />} />
		</Route>
	)
}

// vim: ts=4
