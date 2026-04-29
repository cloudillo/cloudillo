// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { atom, useAtom } from 'jotai'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser'

import {
	LuEye as IcEye,
	LuEyeOff as IcEyeOff,
	LuRefreshCw as IcLoading,
	LuCheck as IcOk,
	LuFingerprint as IcWebAuthn,
	LuLogIn as IcLogin,
	LuMail as IcMail,
	LuArrowLeft as IcBack
} from 'react-icons/lu'

import { useAuth, type AuthState, useApi, useDialog, Button } from '@cloudillo/react'
import type { ApiClient } from '@cloudillo/core'

import { useAppConfig } from '../utils.js'
import { RegisterForm } from '../profile/register.js'
import { validPassword } from './utils.js'
import { ResetPassword } from './reset-password.js'
import { IdpActivate } from './idp-activate.js'
import { QrLoginPanel } from './QrLoginPanel.js'
import { registerServiceWorker, ensureEncryptionKey } from '../pwa.js'

// ============================================================================
// Login Init Context — shares pre-fetched QR + WebAuthn data with login page
// ============================================================================

export interface LoginInitData {
	qrLogin: { sessionId: string; secret: string }
	webAuthn: { options?: unknown; token: string } | null
}

// undefined = still loading, null = no pre-fetched data, LoginInitData = ready
export const loginInitAtom = atom<LoginInitData | null | undefined>(undefined)

// undefined = still loading, null = no pre-fetched data, LoginInitData = ready
const LoginInitContext = React.createContext<LoginInitData | null | undefined>(undefined)

export function useLoginInit() {
	return React.useContext(LoginInitContext)
}

//////////////
// Web auth //
//////////////

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

		// Set up SW with token
		await registerServiceWorker(result.token)
		await ensureEncryptionKey()

		return result
	} catch (err) {
		// NotAllowedError means user cancelled or no credentials available
		// Other errors should be logged but not throw
		console.log('WebAuthn login failed or cancelled:', err)
		return undefined
	}
}

///////////////
// LoginForm //
///////////////
export function LoginForm() {
	const { t } = useTranslation()
	const { api } = useApi()
	const [appConfig, _setAppConfig] = useAppConfig()
	const _navigate = useNavigate()
	const [auth, setAuth] = useAuth()
	const _dialog = useDialog()

	const [password, setPassword] = React.useState('')
	const [passwordVisible, setPasswordVisible] = React.useState(false)
	const [_remember, setRemember] = React.useState(false)
	const [forgot, setForgot] = React.useState(false)
	const [error, setError] = React.useState<string | undefined>()
	const [webAuthnAttempted, setWebAuthnAttempted] = React.useState(false)
	const [hasPasskeys, setHasPasskeys] = React.useState<boolean | undefined>(undefined)

	// Forgot password state
	const [email, setEmail] = React.useState('')
	const [forgotStatus, setForgotStatus] = React.useState<'idle' | 'loading' | 'success'>('idle')
	const [forgotError, setForgotError] = React.useState<string | undefined>()

	// Use pre-fetched WebAuthn data from login-init context
	const loginInitData = useLoginInit()

	// Auto-attempt WebAuthn login using pre-fetched challenge from login-init.
	// loginInitData === undefined means "still loading from layout" — wait.
	React.useEffect(
		function attemptWebAuthnLogin() {
			if (!api || webAuthnAttempted || auth) return
			if (!browserSupportsWebAuthn()) return
			// Wait for loginInitData to be resolved (undefined = still loading)
			if (loginInitData === undefined) return

			setWebAuthnAttempted(true)

			if (!loginInitData?.webAuthn) {
				setHasPasskeys(false)
				return
			}
			setHasPasskeys(true)
			const challengeData = loginInitData.webAuthn
			;(async () => {
				try {
					const response = await startAuthentication({
						optionsJSON: challengeData.options as Parameters<
							typeof startAuthentication
						>[0]['optionsJSON']
					})
					const result = await api.auth.webAuthnLogin({
						token: challengeData.token,
						response
					})
					await registerServiceWorker(result.token)
					await ensureEncryptionKey()
					setAuth(result)
				} catch (_err) {
					console.log('WebAuthn auto-login not available')
				}
			})()
		},
		[api, webAuthnAttempted, auth, loginInitData]
	)

	async function onSubmit(evt: React.FormEvent) {
		evt.preventDefault()

		try {
			if (!api?.idTag) {
				setError('Identity tag not set')
				return
			}

			const loginResult = await api.auth.login({
				idTag: api.idTag,
				password
			})
			const authState: AuthState = { ...loginResult }
			setAuth(authState)
			// Token is stored in SW encrypted storage via registerServiceWorker()

			// Set up SW with token
			await registerServiceWorker(loginResult.token)
			await ensureEncryptionKey()
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
		evt.preventDefault()
		if (!api) return

		// Basic email validation
		if (!email?.includes('@')) {
			setForgotError(t('Please enter a valid email address'))
			return
		}

		setForgotStatus('loading')
		setForgotError(undefined)

		try {
			await api.auth.forgotPassword({ email })
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
				) : forgotStatus !== 'success' ? (
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
							<IcOk style={{ fontSize: '1.5rem', color: 'var(--col-success)' }} />
							<p className="mb-0">
								{t(
									"If an account with this email exists, you'll receive a password reset link shortly."
								)}
							</p>
						</div>
					</div>
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
									variant="primary"
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
							<Button type="submit" variant="primary" disabled={!api?.idTag}>
								<IcLogin />
								{t('Login')}
							</Button>
							{browserSupportsWebAuthn() && hasPasskeys !== false && (
								<WebAuth idTag={api?.idTag || ''} />
							)}
						</>
					)}
				</footer>
			</form>
		)
	}
}

interface WebAuthProps {
	idTag: string
}

export function WebAuth({ idTag: _idTag }: WebAuthProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const [_auth, setAuth] = useAuth()

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
	const { api } = useApi()
	const [oldPassword, setOldPassword] = React.useState('')
	const [password, setPassword] = React.useState('')
	const [error, setError] = React.useState<string | undefined>()

	async function changePassword() {
		if (!validPassword(password)) {
			alert(t('You must provide a strong password!'))
			return
		}
		try {
			if (!api?.idTag) {
				setError('Not authenticated')
				return
			}
			await api.auth.changePassword({
				currentPassword: oldPassword,
				newPassword: password
			})
			alert(t('Password changed successfully'))
		} catch (err: unknown) {
			console.error('Password change failed:', err)
			setError(err instanceof Error ? err.message : t('Incorrect password!'))
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

function LoginPage({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
	const [loginInitData] = useAtom(loginInitAtom)
	return (
		<LoginInitContext.Provider value={loginInitData}>
			<div className="c-container">
				{wide ? (
					<div className="row">
						<div className="col-0 col-md-1 col-lg-2" />
						<div className="col col-md-10 col-lg-8">
							<div className="flex-fill-x">{children}</div>
						</div>
						<div className="col-0 col-md-1 col-lg-2" />
					</div>
				) : (
					<div className="row">
						<div className="col-0 col-md-1 col-lg-2" />
						<div className="col col-md-5 col-lg-4">
							<div className="flex-fill-x">{children}</div>
						</div>
						<div className="col col-md-5 col-lg-4 d-none md:d-flex align-items-center justify-content-center">
							<QrLoginPanel />
						</div>
						<div className="col-0 col-md-1 col-lg-2" />
					</div>
				)}
			</div>
		</LoginInitContext.Provider>
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
					<LoginPage wide>
						<RegisterForm />
					</LoginPage>
				}
			/>
			<Route
				path="/register/:token/:providerType"
				element={
					<LoginPage wide>
						<RegisterForm />
					</LoginPage>
				}
			/>
			<Route
				path="/register/:token/idp/:idpStep"
				element={
					<LoginPage wide>
						<RegisterForm />
					</LoginPage>
				}
			/>
			<Route
				path="/register/:token/idp/:idpStep/:provider"
				element={
					<LoginPage wide>
						<RegisterForm />
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
					<LoginPage wide>
						<IdpActivate />
					</LoginPage>
				}
			/>
			<Route path="/*" element={null} />
		</Routes>
	)
}

// vim: ts=4
