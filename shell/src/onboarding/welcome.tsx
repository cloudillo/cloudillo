// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { LuLock as IcLock, LuRefreshCw as IcLoading } from 'react-icons/lu'

import { useApi, useAuth, Button } from '@cloudillo/react'
import { FetchError } from '@cloudillo/core'
import type { IdpStatusResponse } from '@cloudillo/core'
import { registerServiceWorker, ensureEncryptionKey } from '../pwa.js'
import { CloudilloLogo } from '../logo.js'
import { VerifyIdpContent, type ResendState } from './verify-idp-content.js'

const POLL_INTERVAL_MS = 10_000
const RESEND_COOLDOWN_MS = 60_000

export function Welcome() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { api } = useApi()
	const [_auth, setAuth] = useAuth()
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
			console.log('setPassword RES', res)

			// Register SW with token (like login does)
			if (res.token) {
				await registerServiceWorker(res.token)
				await ensureEncryptionKey()
			}

			setProgress('success')
			setAuth({ ...res })
			// IDP-typed registrations should already have cleared
			// `ui.onboarding` via the refId-scoped IDP-status call above. The
			// post-auth `/onboarding/verify-idp` redirect remains as a
			// defensive fallback for race conditions where the clear hasn't
			// propagated yet.
			let nextPath = '/onboarding/join'
			try {
				const settings = await api.settings.list({ prefix: 'ui.onboarding' })
				const onboarding = settings.find((s) => s.key === 'ui.onboarding')?.value
				if (onboarding === 'verify-idp') {
					nextPath = '/onboarding/verify-idp'
				}
			} catch (settingsErr) {
				console.warn(
					'Failed to read ui.onboarding after setPassword, defaulting to join:',
					settingsErr
				)
			}
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
			<div className="c-panel p-4">
				<CloudilloLogo className="c-logo w-50 float-right ps-3 pb-3 slow" />
				<header>
					<h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1>
				</header>
				<div className="c-panel info mt-3">
					<p>
						<IcLoading className="animate-rotate-cw me-2" />
						{t('Validating invitation link...')}
					</p>
				</div>
			</div>
		)
	}

	// Show error if ref is invalid
	if (!refValid) {
		return (
			<div className="c-panel p-4">
				<CloudilloLogo className="c-logo w-50 float-right ps-3 pb-3" />
				<header>
					<h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1>
				</header>
				<div className="c-panel error mt-3">
					<p>{error || t('Invalid or expired reference link')}</p>
				</div>
			</div>
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
		<div className="c-panel p-4">
			<CloudilloLogo className="c-logo w-50 float-right ps-3 pb-3" />
			<header>
				<h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1>
			</header>

			<h3 className="my-3">{t('Set Your Password')}</h3>
			<p className="pb-4">{t('Please choose a strong password to secure your account.')}</p>

			<form onSubmit={handleSubmit}>
				<label className="d-block my-3">
					{t('Password')}
					<div className="c-input-group">
						<div className="c-button icon">
							<IcLock />
						</div>
						<input
							className="c-input"
							name="password"
							type="password"
							onChange={(evt: React.ChangeEvent<HTMLInputElement>) => {
								setPassword(evt.target.value)
								setError(undefined)
							}}
							value={password}
							placeholder={t('Enter a strong password')}
							aria-label={t('Password')}
							disabled={progress === 'loading'}
						/>
					</div>
				</label>

				<label className="d-block my-3">
					{t('Confirm Password')}
					<div className="c-input-group">
						<div className="c-button icon">
							<IcLock />
						</div>
						<input
							className="c-input"
							name="confirmPassword"
							type="password"
							onChange={(evt: React.ChangeEvent<HTMLInputElement>) => {
								setConfirmPassword(evt.target.value)
								setError(undefined)
							}}
							value={confirmPassword}
							placeholder={t('Confirm your password')}
							aria-label={t('Confirm Password')}
							disabled={progress === 'loading'}
						/>
					</div>
				</label>

				{error && (
					<div className="c-panel error mt-3">
						<p>{error}</p>
					</div>
				)}

				{progress === 'success' && (
					<div className="c-panel success mt-3">
						<p>{t('Password set successfully. Redirecting...')}</p>
					</div>
				)}

				<footer className="c-group g-2 mt-4">
					<Button
						className="primary"
						type="submit"
						disabled={progress === 'loading' || !password || !confirmPassword}
					>
						{progress === 'loading' && <IcLoading className="animate-rotate-cw" />}
						{progress !== 'loading' && t('Set Password')}
					</Button>
				</footer>
			</form>
		</div>
	)
}

// vim: ts=4
