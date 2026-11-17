// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { ImmersiveOverlay } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'

import { useCtx } from '../../context/index.js'
import { contextPath, HOME_BASE } from '../../routes.js'
import { ApprovePairView } from './ApprovePairView.js'

/**
 * `/~/pair/:sessionId` — the desktop CLI's browser link; same screen as scanning its QR, except
 * the user types the verification code. Another context's URL would scope the key to that
 * community, so a link to one is pinned back to home (the CLI only ever emits `/~/pair/…`).
 * The card's Account select re-homes the page with `state.pairContext`, which only an
 * in-app navigation can set, so a switch the user chose stays put.
 */
export function PairPage() {
	const { t } = useTranslation()
	const { sessionId } = useParams()
	const navigate = useNavigate()
	const location = useLocation()
	const { base, isHome } = useCtx()
	const done = () => navigate(base, { replace: true })

	if (!sessionId) return null
	if (!isHome && !location.state?.pairContext) {
		// contextPath leaves its tail unencoded
		return (
			<Navigate replace to={contextPath(HOME_BASE, 'pair', encodeURIComponent(sessionId))} />
		)
	}
	return (
		<ImmersiveOverlay open onClose={done} aria-label={t('Pair this device?')}>
			<ApprovePairView sessionId={sessionId} onDone={done} />
		</ImmersiveOverlay>
	)
}

// vim: ts=4
