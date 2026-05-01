// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { LuMail as IcMail, LuRefreshCw as IcLoading } from 'react-icons/lu'
import type { TFunction } from 'i18next'

import { Button } from '@cloudillo/react'
import type { IdpStatusResponse } from '@cloudillo/core'

import { CloudilloLogo } from '../logo.js'

export type ResendState = 'idle' | 'sending' | 'cooldown' | 'expired'

export interface VerifyIdpContentProps {
	/** undefined while the first status fetch is in flight */
	idp: IdpStatusResponse | undefined
	/** fatal load error — when set, panel renders the error and nothing else */
	loadError?: string
	/** transient resend error (recoverable) — shown above the resend button */
	resendError?: string
	resendState: ResendState
	onResend: () => void
}

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

/**
 * Presentational verify-idp panel — owns no fetching or polling. The 1s
 * countdown ticker lives here because it's purely visual; everything else
 * (status fetch, polling, resend cooldown) is driven by the parent and
 * passed down as props.
 *
 * Used both by `verify-idp.tsx` (post-auth onboarding step) and
 * `welcome.tsx` (pre-auth welcome page that gates the password form on
 * IDP activation).
 */
export function VerifyIdpContent({
	idp,
	loadError,
	resendError,
	resendState,
	onResend
}: VerifyIdpContentProps) {
	const { t } = useTranslation()
	const [, forceTick] = React.useReducer((n: number) => n + 1, 0)

	// 1s ticker so the countdown re-renders without re-fetching.
	const showCountdown = !loadError && !!idp
	React.useEffect(() => {
		if (!showCountdown) return
		const id = window.setInterval(forceTick, 1_000)
		return () => window.clearInterval(id)
	}, [showCountdown])

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
					variant="primary"
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
