// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { IdpStatusResponse } from '@cloudillo/core'
import { FetchError, setApiToken } from '@cloudillo/core'
import {
	ActionBar,
	Alert,
	Button,
	Field,
	Form,
	LoadingSpinner,
	Logo,
	PasswordInput,
	PasswordStrengthBar,
	Text,
	useApi,
	useAuth
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'

import { AuthLayout } from '../auth/AuthLayout.js'
import { handOffMfa } from '../auth/mfa-handoff.js'
import { IcPassword } from '../icons.js'
import { installToken } from '../pwa.js'
import { onboardingNextPath } from './next-step.js'
import { type ResendState, VerifyIdpContent } from './verify-idp-content.js'

const POLL_INTERVAL_MS = 10_000
const RESEND_COOLDOWN_MS = 60_000

export function Welcome() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { api } = useApi()
	const [auth, setAuth] = useAuth()
	const { refId } = useParams<{ refId: string }>()
	const [password, setPassword] = React.useState('')
	const [confirmPassword, setConfirmPassword] = React.useState('')
	const [error, setError] = React.useState<string | undefined>()
	const [progress, setProgress] = React.useState<'idle' | 'loading' | 'success'>('idle')
	const [refValidating, setRefValidating] = React.useState(true)
	const [refValid, setRefValid] = React.useState(false)
	const [idp, setIdp] = React.useState<IdpStatusResponse | undefined>()
	const [idpLoadError, setIdpLoadError] = React.useState<string | undefined>()
	const [resendState, setResendState] = React.useState<ResendState>('idle')
	const [resendError, setResendError] = React.useState<string | undefined>()
	const cooldownTimerRef = React.useRef<number | undefined>(undefined)

	// Validate ref + fetch IDP status on mount. Both calls are unauthenticated
	// — the refId is the credential. The IDP-status endpoint short-circuits to
	// `status: 'active'` for tenants that aren't gated, so we can call it
	// unconditionally (no need to branch on registration type here).
	React.useEffect(() => {
		async function init() {
			if (!refId) {
				setRefValidating(false)
				setRefValid(false)
				setError(t('Invalid or missing reference ID'))
				return
			}
			if (!api) return

			try {
				await api.refs.get(refId)
				setRefValid(true)
			} catch (_err) {
				setRefValid(false)
				setRefValidating(false)
				setError(t('Invalid or expired reference link'))
				return
			}

			try {
				const res = await api.refs.idpStatus(refId)
				setIdp(res)
				if (
					res.status !== 'active' &&
					res.expiresAt &&
					new Date(res.expiresAt).getTime() <= Date.now()
				) {
					setResendState('expired')
				}
			} catch (err) {
				console.warn('refs.idpStatus failed on welcome page:', err)
				setIdpLoadError(t('Failed to load identity status. Try refreshing the page.'))
			}
			setRefValidating(false)
		}
		init()
	}, [api, refId, t])

	// Resume-on-reopen: the backend no longer consumes the welcome ref at
	// set-password, so returning to this link mid-flow must resume rather than
	// dead-end. If the user is already authenticated and an onboarding gate is
	// still set, jump straight to the saved step (carrying the refId in the URL
	// so it survives reload), skipping the password form.
	React.useEffect(() => {
		if (!api || !refId || !auth || progress !== 'idle') return
		let cancelled = false
		;(async function resume() {
			try {
				const setting = await api.settings.get('ui.onboarding')
				if (cancelled) return
				const step = setting.value
				if (typeof step === 'string' && step) {
					navigate('/onboarding/' + refId + '/' + step, { replace: true })
				}
			} catch (_err) {
				// No gate (404) → already-authenticated user reopened a stale
				// link; fall through to the (idempotent) password form.
			}
		})()
		return () => {
			cancelled = true
		}
	}, [api, refId, auth, navigate, progress])

	// Poll IDP status while the gate is engaged. Stops as soon as we see
	// `status === 'active'` (which switches the page to the password form).
	const shouldPoll = !!idp && idp.status !== 'active'
	React.useEffect(() => {
		if (!api || !refId || !shouldPoll) return

		let cancelled = false
		const id = window.setInterval(async () => {
			try {
				const res = await api.refs.idpStatus(refId)
				if (cancelled) return
				setIdp(res)
				if (
					res.status !== 'active' &&
					res.expiresAt &&
					new Date(res.expiresAt).getTime() <= Date.now()
				) {
					setResendState('expired')
				}
			} catch (err) {
				console.warn('refs.idpStatus poll failed:', err)
			}
		}, POLL_INTERVAL_MS)
		return () => {
			cancelled = true
			window.clearInterval(id)
		}
	}, [api, refId, shouldPoll])

	React.useEffect(() => {
		return () => {
			if (cooldownTimerRef.current !== undefined) {
				window.clearTimeout(cooldownTimerRef.current)
			}
		}
	}, [])

	async function onResend() {
		if (!api || !refId || resendState !== 'idle') return
		setResendError(undefined)
		setResendState('sending')
		try {
			await api.refs.resendActivation(refId)
			setResendState('cooldown')
			if (cooldownTimerRef.current !== undefined) {
				window.clearTimeout(cooldownTimerRef.current)
			}
			cooldownTimerRef.current = window.setTimeout(() => {
				cooldownTimerRef.current = undefined
				setResendState((s) => (s === 'cooldown' ? 'idle' : s))
			}, RESEND_COOLDOWN_MS)
		} catch (err: unknown) {
			if (err instanceof FetchError && err.httpStatus === 410) {
				setResendState('expired')
			} else {
				setResendState('idle')
				setResendError(t('Failed to resend activation email. Please try again.'))
			}
		}
	}

	async function handleSubmit(evt: React.FormEvent) {
		evt.preventDefault()
		if (!api || !refId) return

		// Validate passwords match
		if (password !== confirmPassword) {
			setError(t('Passwords do not match'))
			return
		}

		// Validate password length
		if (password.length < 8) {
			setError(t('Password must be at least 8 characters long'))
			return
		}

		setProgress('loading')
		setError(undefined)

		try {
			const res = await api.auth.setPassword({
				refId,
				newPassword: password
			})
			// TOTP step (enrolled, or `auth.mfa` required): the password is set, so the
			// login form finishes it (code or forced enrollment) and resumes the wizard
			if ('mfaToken' in res) {
				handOffMfa({
					mfaToken: res.mfaToken,
					secret: 'secret' in res ? res.secret : undefined,
					otpauthUri: 'otpauthUri' in res ? res.otpauthUri : undefined
				})
				navigate('/login', { state: { onboardingRefId: refId } })
				return
			}
			// Register SW with token (like login does)
			if (res.token) {
				await installToken(res.token)
			}

			setProgress('success')
			// Registry first, then `setAuth` — the settings read below runs in this
			// same async continuation, before Layout's `syncApiToken` effect commits.
			if (res.idTag && res.token) setApiToken(res.idTag, res.token)
			setAuth({ ...res })
			// The welcome refId rides in the URL (/onboarding/:refId/…) so the
			// wizard's Finish step can consume it (via api.onboarding.complete)
			// even after a reload. The backend left the ref intact, so the flow
			// stays reversible until then.
			const nextPath = await onboardingNextPath(api, refId)
			setTimeout(() => {
				navigate(nextPath)
			}, 500)
		} catch (err) {
			setProgress('idle')
			setError(err instanceof Error ? err.message : t('Failed to set password'))
		}
	}

	// Show loading state while validating ref / loading IDP status
	if (refValidating) {
		return (
			<AuthLayout logo={<Logo animated />} title={t('Welcome to Cloudillo!')}>
				<Alert color="info" icon={<LoadingSpinner size="sm" />} role="status">
					{t('Validating invitation link...')}
				</Alert>
			</AuthLayout>
		)
	}

	// Show error if ref is invalid
	if (!refValid) {
		return (
			<AuthLayout logo={<Logo />} title={t('Welcome to Cloudillo!')}>
				<Alert color="error">{error || t('Invalid or expired reference link')}</Alert>
			</AuthLayout>
		)
	}

	// Gate the password form on IDP activation. Domain-typed tenants and
	// already-active IDP tenants get `status: 'active'` from the backend
	// short-circuit and fall straight through.
	if (idp && idp.status !== 'active') {
		return (
			<VerifyIdpContent
				idp={idp}
				loadError={idpLoadError}
				resendError={resendError}
				resendState={resendState}
				onResend={onResend}
			/>
		)
	}
	if (!idp && idpLoadError) {
		return (
			<VerifyIdpContent
				idp={undefined}
				loadError={idpLoadError}
				resendError={resendError}
				resendState={resendState}
				onResend={onResend}
			/>
		)
	}

	return (
		<AuthLayout
			logo={<Logo animated={progress === 'loading'} />}
			title={t('Welcome to Cloudillo!')}
			subtitle={t('Set Your Password')}
		>
			<Text as="p">{t('Please choose a strong password to secure your account.')}</Text>

			<Form onSubmit={handleSubmit}>
				<Field label={t('Password')}>
					<PasswordInput
						leading={<IcPassword />}
						name="password"
						autoFocus
						onChange={(evt) => {
							setPassword(evt.target.value)
							setError(undefined)
						}}
						value={password}
						placeholder={t('Enter a strong password')}
						aria-label={t('Password')}
						disabled={progress === 'loading'}
					/>
				</Field>
				<PasswordStrengthBar password={password} />

				<Field
					label={t('Confirm Password')}
					error={
						confirmPassword && password !== confirmPassword
							? t('Passwords do not match')
							: undefined
					}
				>
					<PasswordInput
						leading={<IcPassword />}
						name="confirmPassword"
						onChange={(evt) => {
							setConfirmPassword(evt.target.value)
							setError(undefined)
						}}
						value={confirmPassword}
						placeholder={t('Confirm your password')}
						aria-label={t('Confirm Password')}
						disabled={progress === 'loading'}
					/>
				</Field>

				{error && <Alert color="error">{error}</Alert>}

				{progress === 'success' && (
					<Alert color="success">{t('Password set successfully. Redirecting...')}</Alert>
				)}

				<ActionBar>
					<Button
						color="primary"
						type="submit"
						loading={progress === 'loading'}
						disabled={
							progress === 'loading' ||
							!password ||
							!confirmPassword ||
							password !== confirmPassword ||
							password.length < 8
						}
					>
						{t('Set Password')}
					</Button>
				</ActionBar>
			</Form>
		</AuthLayout>
	)
}

// vim: ts=4
