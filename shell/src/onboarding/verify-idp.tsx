// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { LuMail as IcMail, LuRefreshCw as IcLoading } from 'react-icons/lu'
import type { TFunction } from 'i18next'

import { useApi, Button } from '@cloudillo/react'
import { FetchError } from '@cloudillo/core'
import type { IdpStatusResponse } from '@cloudillo/core'

import { CloudilloLogo } from '../logo.js'

const POLL_INTERVAL_MS = 10_000
const RESEND_COOLDOWN_MS = 60_000

function formatRemaining(t: TFunction, expiresAt: string): string {
	const ms = new Date(expiresAt).getTime() - Date.now()
	if (ms <= 0) return t('expired')
	const totalMinutes = Math.floor(ms / 60_000)
	const hours = Math.floor(totalMinutes / 60)
	const minutes = totalMinutes % 60
	if (hours > 0) {
		return t('{{hours}}h {{minutes}}m', { hours, minutes })
	}
	return t('{{minutes}}m', { minutes })
}

export function VerifyIdp() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { api } = useApi()

	const [idp, setIdp] = React.useState<IdpStatusResponse | undefined>()
	const [loadError, setLoadError] = React.useState<string | undefined>()
	const [resendState, setResendState] = React.useState<
		'idle' | 'sending' | 'cooldown' | 'expired'
	>('idle')
	const [resendError, setResendError] = React.useState<string | undefined>()
	const [, forceTick] = React.useReducer((n: number) => n + 1, 0)
	const cooldownTimerRef = React.useRef<number | undefined>(undefined)

	// 1s ticker so the countdown re-renders without re-fetching.
	React.useEffect(() => {
		const id = window.setInterval(forceTick, 1_000)
		return () => window.clearInterval(id)
	}, [])

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

	if (loadError) {
		return (
			<div className="c-panel p-4">
				<CloudilloLogo className="c-logo w-50 float-right ps-3 pb-3" />
				<header>
					<h1 className="mb-3">{t('Verify your identity')}</h1>
				</header>
				<div className="c-panel error mt-3">
					<p>{loadError}</p>
				</div>
			</div>
		)
	}

	if (!idp) {
		return (
			<div className="c-panel p-4">
				<CloudilloLogo className="c-logo w-50 float-right ps-3 pb-3 slow" />
				<header>
					<h1 className="mb-3">{t('Verify your identity')}</h1>
				</header>
				<div className="c-panel info mt-3">
					<p>
						<IcLoading className="animate-rotate-cw me-2" />
						{t('Loading identity status...')}
					</p>
				</div>
			</div>
		)
	}

	const expired = resendState === 'expired'

	return (
		<div className="c-panel p-4">
			<CloudilloLogo className="c-logo w-50 float-right ps-3 pb-3" />
			<header>
				<h1 className="mb-3">{t('Verify your identity')}</h1>
			</header>

			<p className="my-3">
				{idp.providerName
					? t(
							'We sent a separate activation email from your identity provider {{provider}}. Click the link in that email to activate your federated identity — until you do, this account is held in a pending state and will be deleted automatically.',
							{ provider: idp.providerName }
						)
					: t(
							'We sent a separate activation email from your identity provider. Click the link in that email to activate your federated identity — until you do, this account is held in a pending state and will be deleted automatically.'
						)}
			</p>

			{idp.email && (
				<p className="my-3 text-muted">
					<IcMail className="me-2" />
					{t('Sent to: {{email}}', { email: idp.email })}
				</p>
			)}

			{!expired && idp.expiresAt && (
				<div className="c-panel warning my-4 p-3">
					<p className="mb-1">
						<strong>
							{t('Your identity will be deleted in {{remaining}}', {
								remaining: formatRemaining(t, idp.expiresAt)
							})}
						</strong>
					</p>
					<p className="text-muted small mb-0">
						{t(
							"The deadline doesn't change if you resend — it was set when you registered. If it expires, you'll need to register again."
						)}
					</p>
				</div>
			)}

			{expired && (
				<div className="c-panel error my-4 p-3">
					<p className="mb-1">
						<strong>{t('Your identity has expired')}</strong>
					</p>
					<p className="mb-0">{t('Please register again to create a new identity.')}</p>
				</div>
			)}

			{resendError && (
				<div className="c-panel error mt-3">
					<p>{resendError}</p>
				</div>
			)}

			<div className="c-group g-2 mt-4">
				<Button
					className="primary"
					onClick={onResend}
					disabled={expired || resendState !== 'idle'}
				>
					{resendState === 'sending' && <IcLoading className="animate-rotate-cw me-2" />}
					{resendState === 'cooldown'
						? t('Email sent — check your inbox')
						: t('Resend activation email')}
				</Button>
			</div>

			<p className="mt-4 text-muted small">
				<IcLoading className="animate-rotate-cw me-2" />
				{t('Waiting for activation...')}
			</p>
		</div>
	)
}

// vim: ts=4
