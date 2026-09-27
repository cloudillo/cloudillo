// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { IdpStatusResponse } from '@cloudillo/core'
import { ActionBar, Alert, Button, HBox, LoadingSpinner, Logo, Text } from '@cloudillo/react'
import type { TFunction } from 'i18next'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuMail as IcMail } from 'react-icons/lu'

import { AuthLayout } from '../auth/AuthLayout.js'

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
			<AuthLayout logo={<Logo />} title={t('Verify your identity')}>
				<Alert color="error">{loadError}</Alert>
			</AuthLayout>
		)
	}

	if (!idp) {
		return (
			<AuthLayout logo={<Logo animated />} title={t('Verify your identity')}>
				<Alert color="info" icon={<LoadingSpinner size="sm" />} role="status">
					{t('Loading identity status...')}
				</Alert>
			</AuthLayout>
		)
	}

	const expired = resendState === 'expired'

	return (
		<AuthLayout
			logo={<Logo animated={!expired} />}
			title={t('Verify your identity')}
			footer={
				<HBox gap={2} align="center" role="status">
					<LoadingSpinner size="sm" />
					<Text size="sm" emphasis="muted">
						{t('Waiting for activation...')}
					</Text>
				</HBox>
			}
		>
			<Text as="p">
				{idp.providerName
					? t(
							'We sent a separate activation email from your identity provider {{provider}}. Click the link in that email to activate your federated identity — until you do, this account is held in a pending state and will be deleted automatically.',
							{ provider: idp.providerName }
						)
					: t(
							'We sent a separate activation email from your identity provider. Click the link in that email to activate your federated identity — until you do, this account is held in a pending state and will be deleted automatically.'
						)}
			</Text>

			{idp.email && (
				<HBox gap={2} align="center">
					<IcMail />
					<Text emphasis="muted">{t('Sent to: {{email}}', { email: idp.email })}</Text>
				</HBox>
			)}

			{!expired && idp.expiresAt && (
				<Alert
					color="warning"
					title={t('Your identity will be deleted in {{remaining}}', {
						remaining: formatRemaining(t, idp.expiresAt)
					})}
				>
					{t(
						"The deadline doesn't change if you resend — it was set when you registered. If it expires, you'll need to register again."
					)}
				</Alert>
			)}

			{expired && (
				<Alert color="error" title={t('Your identity has expired')}>
					{t('Please register again to create a new identity.')}
				</Alert>
			)}

			{resendError && <Alert color="error">{resendError}</Alert>}

			<ActionBar>
				<Button
					color="primary"
					onClick={onResend}
					loading={resendState === 'sending'}
					disabled={expired || resendState !== 'idle'}
				>
					{resendState === 'cooldown'
						? t('Email sent — check your inbox')
						: t('Resend activation email')}
				</Button>
			</ActionBar>
		</AuthLayout>
	)
}

// vim: ts=4
