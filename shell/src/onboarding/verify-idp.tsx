// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { useApi } from '@cloudillo/react'
import { FetchError } from '@cloudillo/core'
import type { IdpStatusResponse } from '@cloudillo/core'

import { VerifyIdpContent, type ResendState } from './verify-idp-content.js'

const POLL_INTERVAL_MS = 10_000
const RESEND_COOLDOWN_MS = 60_000

export function VerifyIdp() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { api } = useApi()

	const [idp, setIdp] = React.useState<IdpStatusResponse | undefined>()
	const [loadError, setLoadError] = React.useState<string | undefined>()
	const [resendState, setResendState] = React.useState<ResendState>('idle')
	const [resendError, setResendError] = React.useState<string | undefined>()
	const cooldownTimerRef = React.useRef<number | undefined>(undefined)

	React.useEffect(() => {
		return () => {
			if (cooldownTimerRef.current !== undefined) {
				window.clearTimeout(cooldownTimerRef.current)
			}
		}
	}, [])

	// Polling drives both the initial render (provider/email/deadline come
	// from the same response as the live status) and the activation check.
	// The first call fires immediately so a fast click on the activation
	// email doesn't sit for 10s before being noticed.
	React.useEffect(() => {
		if (!api) return
		let cancelled = false
		const tick = async () => {
			try {
				const res = await api.profile.idpStatus()
				if (cancelled) return
				setIdp(res)
				if (res.expiresAt && new Date(res.expiresAt).getTime() <= Date.now()) {
					setResendState('expired')
				}
				if (res.status === 'active') {
					const next = res.onboarding ? `/onboarding/${res.onboarding}` : '/'
					navigate(next)
				}
			} catch (err) {
				console.warn('idp-status poll failed:', err)
				if (!idp) {
					setLoadError(t('Failed to load identity status. Try refreshing the page.'))
				}
			}
		}
		tick()
		const id = window.setInterval(tick, POLL_INTERVAL_MS)
		return () => {
			cancelled = true
			window.clearInterval(id)
		}
		// idp is intentionally excluded — including it would restart polling on
		// every status response and trigger a tight loop. The closure reads the
		// latest idp via setIdp's setter (above) which is enough.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [api, navigate, t])

	async function onResend() {
		if (!api || resendState !== 'idle') return
		setResendError(undefined)
		setResendState('sending')
		try {
			await api.profile.resendActivation()
			setResendState('cooldown')
			if (cooldownTimerRef.current !== undefined) {
				window.clearTimeout(cooldownTimerRef.current)
			}
			cooldownTimerRef.current = window.setTimeout(() => {
				cooldownTimerRef.current = undefined
				setResendState((s) => (s === 'cooldown' ? 'idle' : s))
			}, RESEND_COOLDOWN_MS)
		} catch (err: unknown) {
			// IDP returns 410 Gone when Identity.expires_at has already passed.
			if (err instanceof FetchError && err.httpStatus === 410) {
				setResendState('expired')
			} else {
				setResendState('idle')
				setResendError(t('Failed to resend activation email. Please try again.'))
			}
		}
	}

	return (
		<VerifyIdpContent
			idp={idp}
			loadError={loadError}
			resendError={resendError}
			resendState={resendState}
			onResend={onResend}
		/>
	)
}

// vim: ts=4
