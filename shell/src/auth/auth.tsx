// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as React from 'react'
import {
	Routes,
	Route,
	Link,
	Navigate,
	useParams,
	useLocation,
	useNavigate
} from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import {
	browserSupportsWebAuthnAutofill,
	browserSupportsWebAuthn,
	startRegistration,
	startAuthentication
} from '@simplewebauthn/browser'
import debounce from 'debounce'
import * as T from '@symbion/runtype'

import {
	LuCloudLightning as IcCloudillo,
	LuDelete as IcDelete,
	LuEye as IcEye,
	LuEyeOff as IcEyeOff,
	LuAtSign as IcAt,
	LuRefreshCw as IcLoading,
	LuCheck as IcOk,
	LuX as IcError,
	LuFingerprint as IcWebAuthn,
	LuLogIn as IcLogin,
	LuMail as IcMail,
	LuArrowLeft as IcBack
} from 'react-icons/lu'

import { useAuth, AuthState, useApi, useDialog, Button } from '@cloudillo/react'

import { useAppConfig, ServerError, arrayBufferToBase64Url, base64ToArrayBuffer } from '../utils.js'
import { CloudilloLogo } from '../logo.js'
import { Page } from '../ui.js'
import { RegisterForm } from '../profile/register.js'
import { validIdTag, validPassword } from './utils.js'
import { ResetPassword } from './reset-password.js'
import { IdpActivate } from './idp-activate.js'
import { registerServiceWorker } from '../pwa.js'

////////////
// Logout //
////////////
export async function logout() {
	const { api, setIdTag } = useApi()
	if (!api) throw new Error('Not authenticated')
	await api.auth.logout()
}

//////////////
// Web auth //
//////////////
import type { ApiClient } from '@cloudillo/base'

/**
 * Attempt WebAuthn login
 * Returns AuthState on success, undefined on failure/cancel
 */
export async function webAuthnLogin(api: ApiClient): Promise<AuthState | undefined> {
	try {
		// Get login challenge from backend
		const challengeData = await api.auth.getWebAuthnLoginChallenge()

		// Start browser authentication
		// Note: options come from webauthn-rs which may have slightly different types
		const response = await startAuthentication({
			optionsJSON: challengeData.options as Parameters<
				typeof startAuthentication
			>[0]['optionsJSON']
		})

		// Complete authentication with backend
		const result = await api.auth.webAuthnLogin({
			token: challengeData.token,
			response
		})

		// Set up SW with encryption key and token
		await registerServiceWorker(result.swEncryptionKey, result.token)

		return result
	} catch (err) {
		// NotAllowedError means user cancelled or no credentials available
		// Other errors should be logged but not throw
		console.log('WebAuthn login failed or cancelled:', err)
		return undefined
	}
}

//////////////
// AuthPage //
//////////////
interface AuthPageProps {
	title?: string
	children: React.ReactNode
}

function AuthPage({ title, children }: AuthPageProps) {
	return (
		<div className="c-panel p-3">
			{title && <h2>{title}</h2>}
			{children}
		</div>
	)
}

///////////////
// LoginForm //
///////////////
export function LoginForm() {
	const { t } = useTranslation()
	const { api, setIdTag } = useApi()
	const [appConfig, setAppConfig] = useAppConfig()
	const navigate = useNavigate()
	const [auth, setAuth] = useAuth()
	const dialog = useDialog()

	const [password, setPassword] = React.useState('')
	const [passwordVisible, setPasswordVisible] = React.useState(false)
	const [remember, setRemember] = React.useState(false)
	const [forgot, setForgot] = React.useState(false)
	const [error, setError] = React.useState<string | undefined>()
	const [webAuthnAttempted, setWebAuthnAttempted] = React.useState(false)

	// Forgot password state
	const [email, setEmail] = React.useState('')
	const [forgotStatus, setForgotStatus] = React.useState<'idle' | 'loading' | 'success'>('idle')
	const [forgotError, setForgotError] = React.useState<string | undefined>()

	// Auto-attempt WebAuthn login on page load
	React.useEffect(
		function attemptWebAuthnLogin() {
			if (!api || webAuthnAttempted || auth) return
			if (!browserSupportsWebAuthn()) return

			setWebAuthnAttempted(true)

			;(async () => {
				try {
					const result = await webAuthnLogin(api)
					if (result) {
						setAuth(result)
						// Token is stored in SW encrypted storage via registerServiceWorker()
					}
				} catch (err) {
					// Silently fail - user can use password
					console.log('WebAuthn auto-login not available')
				}
			})()
		},
		[api, webAuthnAttempted, auth]
	)

	async function onSubmit(evt: React.FormEvent) {
		evt.preventDefault()

		try {
			if (!api || !api.idTag) {
				setError('Identity tag not set')
				return
			}

			const loginResult = await api.auth.login({
				idTag: api.idTag,
				password
			})
			const authState: AuthState = { ...loginResult }
			console.log('onLoggedIn', { authState })
			setAuth(authState)
			// Token is stored in SW encrypted storage via registerServiceWorker()

			// Set up SW with encryption key and token
			await registerServiceWorker(loginResult.swEncryptionKey, loginResult.token)
		} catch (err: unknown) {
			console.error('Login failed:', err)
			setError(err instanceof Error ? err.message : 'Login failed')
		}
	}

	function onForgot(evt: React.MouseEvent) {
		evt.preventDefault()
		setForgot(!forgot)
		setError(undefined)
		// Reset forgot password state when toggling
		setForgotStatus('idle')
		setEmail('')
		setForgotError(undefined)
	}

	async function onForgotSubmit(evt: React.FormEvent) {
		console.log('onForgotSubmit called', { evt, api, email })
		evt.preventDefault()
		if (!api) {
			console.log('No API available')
			return
		}

		// Basic email validation
		if (!email || !email.includes('@')) {
			console.log('Invalid email')
			setForgotError(t('Please enter a valid email address'))
			return
		}

		console.log('Calling forgotPassword API...')
		setForgotStatus('loading')
		setForgotError(undefined)

		try {
			const result = await api.auth.forgotPassword({ email })
			console.log('forgotPassword result:', result)
			setForgotStatus('success')
		} catch (err) {
			console.error('forgotPassword error:', err)
			// Always show success for security (no email enumeration)
			setForgotStatus('success')
		}
	}

	if (auth) {
		// After login, layout.tsx will load settings and handle onboarding redirect
		const navTo =
			appConfig?.menu?.find((m) => m.id === appConfig.defaultMenu)?.path || '/app/feed'
		return <Navigate to={navTo} />
	} else {
		return (
			<form className="c-panel p-3" onSubmit={forgot ? onForgotSubmit : onSubmit}>
				<header>
					<h2>{forgot ? t('Reset Password') : t('Login')}</h2>
				</header>

				{!forgot ? (
					<>
						<div className="c-input-group mb-3">
							<input
								className="c-input"
								name="password"
								onChange={(evt: React.ChangeEvent<HTMLInputElement>) =>
									setPassword(evt.target.value)
								}
								value={password}
								type={passwordVisible ? 'text' : 'password'}
								placeholder={t('Password')}
								aria-label={t('Password')}
							/>
							<button
								type="button"
								className="c-link px-1"
								onClick={() => setPasswordVisible(!passwordVisible)}
							>
								{passwordVisible ? <IcEye /> : <IcEyeOff />}
							</button>
						</div>
						<div className="form-check mb-3">
							<input
								className="form-check-input"
								name="remember"
								type="checkbox"
								onChange={(value) => setRemember(!!value)}
							/>
							<label className="form-check-label">
								{t('Remember me on this device')}
							</label>
						</div>
						<div className="mb-3">
							<button type="button" className="c-link small" onClick={onForgot}>
								{t('Forgot password?')}
							</button>
						</div>
					</>
				) : (
					<>
						{forgotStatus !== 'success' ? (
							<>
								<p className="text-muted mb-3">
									{t(
										"Enter your email address and we'll send you a link to reset your password."
									)}
								</p>
								<div className="c-input-group mb-3">
									<span className="c-button icon">
										<IcMail />
									</span>
									<input
										className="c-input"
										name="email"
										type="email"
										value={email}
										onChange={(evt: React.ChangeEvent<HTMLInputElement>) => {
											setEmail(evt.target.value)
											setForgotError(undefined)
										}}
										placeholder={t('Email address')}
										aria-label={t('Email address')}
										disabled={forgotStatus === 'loading'}
										autoFocus
									/>
								</div>
								{forgotError && (
									<div className="c-invalid-feedback mb-2">{forgotError}</div>
								)}
							</>
						) : (
							<div className="c-panel success p-3 mb-3">
								<div className="c-hbox align-items-center g-2">
									<IcOk
										style={{ fontSize: '1.5rem', color: 'var(--col-success)' }}
									/>
									<p className="mb-0">
										{t(
											"If an account with this email exists, you'll receive a password reset link shortly."
										)}
									</p>
								</div>
							</div>
						)}
					</>
				)}

				{!forgot && <div className="c-invalid-feedback">{error}</div>}
				<footer className="c-group g-2">
					{forgot ? (
						<>
							<Button
								type="button"
								onClick={() => {
									setForgot(false)
									setForgotStatus('idle')
									setEmail('')
									setForgotError(undefined)
								}}
							>
								<IcBack />
								{t('Back')}
							</Button>
							{forgotStatus !== 'success' && (
								<Button
									type="button"
									primary
									disabled={forgotStatus === 'loading' || !email}
									onClick={onForgotSubmit}
								>
									{forgotStatus === 'loading' && (
										<IcLoading className="animate-rotate-cw" />
									)}
									{t('Send reset link')}
								</Button>
							)}
						</>
					) : (
						<>
							<Button type="submit" primary disabled={!api?.idTag}>
								<IcLogin />
								{t('Login')}
							</Button>
							{browserSupportsWebAuthn() && <WebAuth idTag={api?.idTag || ''} />}
						</>
					)}
				</footer>
			</form>
		)
	}
}

///////////////////////
// PasswordResetForm //
///////////////////////
export function PasswordResetForm() {
	const { t } = useTranslation()
	const { api, setIdTag } = useApi()
	const navigate = useNavigate()
	const location = useLocation()
	const dialog = useDialog()
	const [_, code] = location.search.match(/code=([^\&]+)/) || []

	const [password, setPassword] = React.useState('')
	const [error, setError] = React.useState<string | undefined>()

	async function onSubmit(evt: React.FormEvent) {
		evt.preventDefault()
		if (!validPassword(password)) {
			await dialog.tell(t('Invalid password!'), t('You must provide a strong password!'))
			return
		}
		try {
			if (!api) {
				setError('Not authenticated')
				return
			}
			// Note: This endpoint may not exist in Rust backend yet
			// await api.auth.changePassword({ idTag: api.idTag, newPassword: password })
			setError('Password reset not yet implemented in Rust backend')
			navigate('/register/passwd-set')
		} catch (err: any) {
			console.error('Password reset failed:', err)
			setError(err.message || 'Password reset failed')
		}
	}

	return (
		<AuthPage title="Set new password">
			<form className="c-form" onSubmit={onSubmit}>
				<label className="c-label">
					New password
					<input
						className="c-input"
						onChange={(evt: React.ChangeEvent<HTMLInputElement>) =>
							setPassword(evt.target.value)
						}
						value={password}
						type="password"
						placeholder={t('New password')}
						aria-label={t('New password')}
					/>
				</label>
				{error && <div className="c-invalid-feedback">{error}</div>}
				<div className="c-group">
					<button className="c-button" type="submit">
						{t('Change password')}
					</button>
				</div>
			</form>
		</AuthPage>
	)
}

function PasswordResetSent() {
	const { t } = useTranslation()

	return (
		<AuthPage title={t('Confirmation email sent')}>
			<p>{t('PasswordResetSent', 'We have sent you a confirmation link in email.')}</p>
		</AuthPage>
	)
}

function PasswordSet() {
	const { t } = useTranslation()

	return (
		<AuthPage title={t('Password set')}>
			<p>{t('PasswordSet', 'Your password has been set.')}</p>
			<Link className="c-button" to="/login">
				{t('You can now log in')}
			</Link>
			.
		</AuthPage>
	)
}

interface WebAuthProps {
	idTag: string
}

export function WebAuth({ idTag }: WebAuthProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth, setAuth] = useAuth()

	async function handleWebAuthnLogin() {
		if (!api) return

		const result = await webAuthnLogin(api)
		if (result) {
			setAuth(result)
			// Token is stored in SW encrypted storage via registerServiceWorker()
		}
	}

	if (!browserSupportsWebAuthn()) {
		return null
	}

	return (
		<Button onClick={handleWebAuthnLogin}>
			<IcWebAuthn className="mr-1" />
			{t('Login with passkey')}
		</Button>
	)
}

export function Password() {
	const { t } = useTranslation()
	const { api, setIdTag } = useApi()
	const [oldPassword, setOldPassword] = React.useState('')
	const [password, setPassword] = React.useState('')
	const [error, setError] = React.useState<string | undefined>()

	async function changePassword() {
		if (!validPassword(password)) {
			alert(t('You must provide a strong password!'))
			return
		}
		try {
			if (!api || !api.idTag) {
				setError('Not authenticated')
				return
			}
			await api.auth.changePassword({
				currentPassword: oldPassword,
				newPassword: password
			})
			alert(t('Password changed successfully'))
		} catch (err: any) {
			console.error('Password change failed:', err)
			setError(err.message || t('Incorrect password!'))
		}
	}

	return (
		<div>
			<input
				className="c-input"
				onChange={(evt: React.ChangeEvent<HTMLInputElement>) =>
					setOldPassword(evt.target.value)
				}
				autoComplete="current-password"
				value={oldPassword}
				type="password"
				placeholder={t('Current password')}
				aria-label={t('Current password')}
			/>
			<input
				className="c-input"
				onChange={(evt: React.ChangeEvent<HTMLInputElement>) =>
					setPassword(evt.target.value)
				}
				autoComplete="new-password"
				value={password}
				type="password"
				placeholder={t('New password')}
				aria-label={t('New password')}
			/>
			{error && <div className="c-invalid-feedback">{error}</div>}
			<button className="c-button" onClick={changePassword}>
				{t('Set password')}
			</button>
		</div>
	)
}

function LoginPage({ children }: { children: React.ReactNode }) {
	return (
		<div className="c-container">
			<div className="row">
				<div className="col-0 col-md-1 col-lg-2" />
				<div className="col col-md-10 col-lg-8">
					<div className="flex-fill-x">{children}</div>
				</div>
				<div className="col-0 col-md-1 col-lg-2" />
			</div>
		</div>
	)
}

export function AuthRoutes() {
	return (
		<Routes>
			<Route
				path="/login"
				element={
					<LoginPage>
						<LoginForm />
					</LoginPage>
				}
			/>
			<Route
				path="/register/:token"
				element={
					<LoginPage>
						<RegisterForm />
					</LoginPage>
				}
			/>
			<Route
				path="/register/:token/:providerType"
				element={
					<LoginPage>
						<RegisterForm />
					</LoginPage>
				}
			/>
			<Route
				path="/register/:token/idp/:idpStep"
				element={
					<LoginPage>
						<RegisterForm />
					</LoginPage>
				}
			/>
			<Route
				path="/register/:token/idp/:idpStep/:provider"
				element={
					<LoginPage>
						<RegisterForm />
					</LoginPage>
				}
			/>
			<Route
				path="/passwd"
				element={
					<LoginPage>
						<PasswordResetForm />
					</LoginPage>
				}
			/>
			<Route
				path="/passwd-sent"
				element={
					<LoginPage>
						<PasswordResetSent />
					</LoginPage>
				}
			/>
			<Route
				path="/passwd-set"
				element={
					<LoginPage>
						<PasswordSet />
					</LoginPage>
				}
			/>
			<Route
				path="/reset-password/:refId"
				element={
					<LoginPage>
						<ResetPassword />
					</LoginPage>
				}
			/>
			<Route
				path="/idp/activate/:refId"
				element={
					<LoginPage>
						<IdpActivate />
					</LoginPage>
				}
			/>
			<Route path="/*" element={null} />
		</Routes>
	)
}

// vim: ts=4
