// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { isSessionExpiredError } from '@cloudillo/core'
import {
	ActionBar,
	Alert,
	Button,
	Field,
	Form,
	LoadingSpinner,
	Logo,
	Text,
	useApi,
	PasswordInput,
	PasswordStrengthBar
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuLock as IcLock } from 'react-icons/lu'
import { useNavigate, useParams } from 'react-router-dom'

import { AuthLayout } from './AuthLayout.js'
import { rateLimitMessage } from './utils.js'

export function ResetPassword() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { api } = useApi()
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
			} catch (err) {
				if (isSessionExpiredError(err)) return // global toast + /login redirect already shown
				setRefValid(false)
				setRefValidating(false)
				// A failed-login ban blocks recovery API calls too — show the
				// blocked message instead of a misleading "invalid link" error.
				setError(rateLimitMessage(err, t) ?? t('Invalid or expired password reset link'))
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
			await api.auth.setPassword({
				refId,
				newPassword: password
			})
			setProgress('success')
			// Navigate to the login page
			setTimeout(() => {
				navigate('/login')
			}, 1500)
		} catch (err) {
			if (isSessionExpiredError(err)) return // global toast + /login redirect already shown
			setProgress('idle')
			setError(
				rateLimitMessage(err, t) ??
					(err instanceof Error ? err.message : t('Failed to reset password'))
			)
		}
	}

	// Show loading state while validating ref
	if (refValidating) {
		return (
			<AuthLayout logo={<Logo animated />} title={t('Reset Password')}>
				<Alert color="info" icon={<LoadingSpinner size="sm" />}>
					{t('Validating reset link...')}
				</Alert>
			</AuthLayout>
		)
	}

	// Show error if ref is invalid
	if (!refValid) {
		return (
			<AuthLayout logo={<Logo />} title={t('Reset Password')}>
				<Alert color="error">{error || t('Invalid or expired password reset link')}</Alert>
			</AuthLayout>
		)
	}

	return (
		<AuthLayout
			logo={<Logo animated={progress === 'loading'} />}
			title={t('Reset Password')}
			subtitle={t('Set Your New Password')}
		>
			<Text as="p">{t('Please choose a strong password to secure your account.')}</Text>

			<Form onSubmit={handleSubmit}>
				<Field label={t('New Password')}>
					<PasswordInput
						leading={<IcLock />}
						name="password"
						autoFocus
						onChange={(evt) => {
							setPassword(evt.target.value)
							setError(undefined)
						}}
						value={password}
						placeholder={t('Enter a strong password')}
						aria-label={t('New Password')}
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
						leading={<IcLock />}
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
					<Alert color="success">
						{t('Password reset successfully. Redirecting to login...')}
					</Alert>
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
						{t('Reset Password')}
					</Button>
				</ActionBar>
			</Form>
		</AuthLayout>
	)
}

// vim: ts=4
