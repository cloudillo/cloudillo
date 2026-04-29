// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { LuLock as IcLock, LuRefreshCw as IcLoading } from 'react-icons/lu'

import { useApi, useAuth, Button } from '@cloudillo/react'
import { registerServiceWorker, ensureEncryptionKey } from '../pwa.js'
import { CloudilloLogo } from '../logo.js'

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

	// Validate ref on mount
	React.useEffect(() => {
		async function validateRef() {
			if (!refId) {
				setRefValidating(false)
				setRefValid(false)
				setError(t('Invalid or missing reference ID'))
				return
			}

			// Wait for API to be ready
			if (!api) {
				return
			}

			try {
				await api.refs.get(refId)
				setRefValid(true)
				setRefValidating(false)
			} catch (_err) {
				setRefValid(false)
				setRefValidating(false)
				setError(t('Invalid or expired reference link'))
			}
		}

		validateRef()
	}, [api, refId, t])

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
			// IDP-typed registrations sit in 'verify-idp' until the IDP
			// activation email is clicked. Skipping ahead to /onboarding/join
			// would leave the user accumulating content under an identity that
			// gets auto-deleted at the IDP's 24h deadline. Read the live setting
			// and route accordingly.
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

	// Show loading state while validating ref
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
