// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { type ApiClient, FetchError, isSessionExpiredError, setApiToken } from '@cloudillo/core'
import {
	ActionBar,
	Alert,
	type AuthState,
	Button,
	Field,
	Form,
	Input,
	Logo,
	Switcher,
	Text,
	Toggle,
	useApi,
	useAuth,
	useToast,
	PasswordInput
} from '@cloudillo/react'
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser'
import type { TFunction } from 'i18next'
import { atom, useAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuArrowLeft as IcBack,
	LuLogIn as IcLogin,
	LuMail as IcMail,
	LuFingerprint as IcWebAuthn
} from 'react-icons/lu'
import { Navigate, Route, useNavigate } from 'react-router-dom'

interface NavigatorUA {
	userAgentData?: { platform: string }
}

import { RegisterForm } from '../profile/register.js'
import { installToken, setApiKey } from '../pwa.js'
import { feedPath, HOME_BASE, scopePath } from '../routes.js'
import { useAppConfig } from '../utils.js'
import { AuthLayout } from './AuthLayout.js'
import { IdpActivate } from './idp-activate.js'
import { QrLoginPanel } from './QrLoginPanel.js'
import { ResetPassword } from './reset-password.js'
import { rateLimitMessage } from './utils.js'

// ============================================================================
// Login Init Context — shares pre-fetched QR + WebAuthn data with login page
// ============================================================================

export interface LoginInitData {
	qrLogin: { sessionId: string; secret: string }
	webAuthn: boolean
	maskedEmail?: string
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

export type WebAuthnLoginResult =
	| { ok: true; auth: AuthState; rememberFailed: boolean }
	/** `message` undefined means stay quiet: the user cancelled, or a global toast
	 *  already fired for this error. */
	| { ok: false; message?: string }

/**
 * Runs the passkey ceremony and installs the session. `rememberFailed` is true when
 * `remember` was asked for but the device key could not be created — the caller should
 * surface that, the session works, it just will not survive a restart.
 */
export async function webAuthnLogin(
	api: ApiClient,
	remember: boolean,
	t: TFunction
): Promise<WebAuthnLoginResult> {
	let tokenIdTag: string | undefined
	try {
		// The challenge is a 120 s JWT (CHALLENGE_EXPIRY_SECS, cloudillo-rs
		// webauthn.rs) — mint it here, at prompt time, never ahead of it.
		const challengeData = await api.auth.getWebAuthnLoginChallenge()
		// Note: options come from webauthn-rs which may have slightly different types
		const response = await startAuthentication({
			optionsJSON: challengeData.options as Parameters<
				typeof startAuthentication
			>[0]['optionsJSON']
		})
		const result = await api.auth.webAuthnLogin({ token: challengeData.token, response })
		// Registry before React state: `useContextAwareApi` reads the token during
		// the very render `setAuth` triggers (same ordering as boot.ts).
		tokenIdTag = result.idTag ?? api.idTag
		setApiToken(tokenIdTag, result.token)
		// Mint the encryption-key cookie BEFORE handing the token to the SW: on
		// Firefox/Safari the SW reads the swKey cookie to encrypt the stored token,
		// and on a fresh login no cookie exists yet — `setApiKey` inside
		// `createRememberMeKey` is what mints it.
		const rememberFailed = remember ? !(await createRememberMeKey(api)) : false
		await installToken(result.token)
		return { ok: true, auth: result, rememberFailed }
	} catch (err) {
		// The token was registered but the session never opened: leaving it in the
		// registry authenticates every later request from a logged-out page.
		if (tokenIdTag) setApiToken(tokenIdTag, undefined)
		return { ok: false, message: webAuthnErrorMessage(err, t) }
	}
}

/** @returns the message to show, or undefined to stay quiet. */
function webAuthnErrorMessage(err: unknown, t: TFunction): string | undefined {
	// Dismissing the OS dialog, or having no credential for this origin, is normal flow.
	if (err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
		console.log('Passkey prompt dismissed:', err.name)
		return undefined
	}
	if (isSessionExpiredError(err)) return undefined // global toast + /login redirect already shown
	console.warn('WebAuthn login failed:', err)
	const banMsg = rateLimitMessage(err, t)
	if (banMsg) return banMsg
	// The challenge endpoint 404s when the account holds no passkey — login-init said
	// it did, so it was removed in between.
	if (err instanceof FetchError && err.httpStatus === 404) {
		return t('No passkey is registered for this account.')
	}
	return err instanceof Error ? err.message : t('Passkey login failed')
}

/** @returns whether the device key was created — false means "Remember me"
 *  silently did nothing, which the caller should surface. */
async function createRememberMeKey(api: ApiClient): Promise<boolean> {
	try {
		const deviceName = `${(navigator as NavigatorUA).userAgentData?.platform || navigator.platform || 'Device'} - ${new Date().toLocaleDateString()}`
		const apiKeyResult = await api.auth.createApiKey({ name: deviceName })
		await setApiKey(apiKeyResult.plaintextKey)
		return true
	} catch (err) {
		console.warn('Failed to create remember-me API key:', err)
		return false
	}
}

/** The one place the "remember me didn't stick" copy lives. */
function rememberFailedMessage(t: TFunction): string {
	return t(
		'Could not keep you signed in on this device. You will need to log in again next time.'
	)
}

/** Both entry points — the auto-attempt effect and the manual button — route the
 *  finished ceremony through here, so the success, cancel and error handling exist once. */
function useWebAuthnLoginHandler() {
	const { t } = useTranslation()
	const [_auth, setAuth] = useAuth()
	const { error: toastError } = useToast()
	return React.useCallback(
		async (api: ApiClient, remember: boolean) => {
			const result = await webAuthnLogin(api, remember, t)
			if (!result.ok) {
				if (result.message) toastError(result.message)
				return
			}
			setAuth(result.auth)
			if (result.rememberFailed) toastError(rememberFailedMessage(t))
		},
		[t, setAuth, toastError]
	)
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
	const { error: toastError } = useToast()
	const runWebAuthnLogin = useWebAuthnLoginHandler()

	const [password, setPassword] = React.useState('')
	const [remember, setRemember] = React.useState(false)
	const [forgot, setForgot] = React.useState(false)
	const [error, setError] = React.useState<string | undefined>()
	const [webAuthnAttempted, setWebAuthnAttempted] = React.useState(false)
	const [hasPasskeys, setHasPasskeys] = React.useState<boolean | undefined>(undefined)

	// Chrome defers navigator.credentials.get() while the window is unfocused, so an
	// auto-prompt fired at boot sits invisible until the user comes back. Wait for
	// focus instead. One-way on purpose: the prompt is fired once, so a later blur
	// must not re-arm anything.
	const [focused, setFocused] = React.useState(() => document.hasFocus())
	React.useEffect(
		function trackFocus() {
			if (focused) return
			// Both signals, then re-ask the browser: a tab can become visible inside a
			// window that is not itself focused, and only `hasFocus()` knows.
			const onMaybeFocused = () => {
				if (document.hasFocus()) setFocused(true)
			}
			window.addEventListener('focus', onMaybeFocused)
			document.addEventListener('visibilitychange', onMaybeFocused)
			return () => {
				window.removeEventListener('focus', onMaybeFocused)
				document.removeEventListener('visibilitychange', onMaybeFocused)
			}
		},
		[focused]
	)

	// Forgot password state
	const [email, setEmail] = React.useState('')
	const [forgotStatus, setForgotStatus] = React.useState<'idle' | 'loading' | 'success'>('idle')
	const [forgotError, setForgotError] = React.useState<string | undefined>()

	// Use pre-fetched WebAuthn data from login-init context
	const loginInitData = useLoginInit()

	// Auto-attempt WebAuthn login. login-init only tells us whether passkeys exist;
	// the challenge itself is minted below, at prompt time.
	// loginInitData === undefined means "still loading from layout" — wait.
	React.useEffect(
		function attemptWebAuthnLogin() {
			if (!api || webAuthnAttempted || auth) return
			if (!browserSupportsWebAuthn()) return
			// Wait for loginInitData to be resolved (undefined = still loading)
			if (loginInitData === undefined) return
			// Don't burn the one-shot latch while the window is in the background.
			if (!focused) return

			setWebAuthnAttempted(true)

			if (!loginInitData?.webAuthn) {
				// `null` means boot's `setLoginInitData(null)` ran because login-init
				// threw — not that the tenant has no passkeys — so leave
				// `hasPasskeys` undefined and let the manual button survive.
				if (loginInitData) setHasPasskeys(false)
				return
			}
			setHasPasskeys(true)
			;(async () => {
				// `false`, not `remember`: this prompt fires the moment login-init resolves
				// and the window has focus, before the checkbox can be ticked, and the
				// `webAuthnAttempted` latch stops the effect ever re-running with a newer
				// value. "Remember me" with a passkey goes through the manual button below.
				await runWebAuthnLogin(api, false)
			})()
		},
		[api, webAuthnAttempted, auth, loginInitData, focused]
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
			setApiToken(authState.idTag ?? api.idTag, authState.token)

			// Mint the encryption-key cookie BEFORE handing the token to the
			// SW. On Firefox/Safari (no Cookie Store API) the SW reads the
			// swKey cookie to encrypt the token before persisting it; on a
			// fresh login that cookie is minted only inside setApiKey, which
			// runs as part of createRememberMeKey.
			if (remember && !(await createRememberMeKey(api))) {
				toastError(rememberFailedMessage(t))
			}

			// Token is stored in SW encrypted storage via installToken()
			await installToken(loginResult.token)
		} catch (err: unknown) {
			if (isSessionExpiredError(err)) return // global toast + /login redirect already shown
			console.error('Login failed:', err)
			setError(
				rateLimitMessage(err, t) ?? (err instanceof Error ? err.message : 'Login failed')
			)
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
			if (isSessionExpiredError(err)) return // global toast + /login redirect already shown
			console.error('forgotPassword error:', err)
			const banMsg = rateLimitMessage(err, t)
			if (banMsg) {
				// A rate-limit ban isn't an enumeration signal — surface it.
				setForgotStatus('idle')
				setForgotError(banMsg)
			} else {
				// Always show success for security (no email enumeration)
				setForgotStatus('success')
			}
		}
	}

	if (auth) {
		// After login, layout.tsx will load settings and handle onboarding redirect
		const menuPath = appConfig?.menu?.find((m) => m.id === appConfig.defaultMenu)?.path
		// Menu paths are context-relative templates; a fresh login always lands at home.
		const navTo = menuPath ? scopePath(HOME_BASE, menuPath) : feedPath(HOME_BASE)
		return <Navigate to={navTo} />
	} else {
		return (
			<AuthLayout
				logo={<Logo animated={forgotStatus === 'loading'} />}
				title={
					forgot
						? t('Reset Password')
						: api?.idTag
							? t('Sign in to {{idTag}}', { idTag: api.idTag })
							: t('Sign in')
				}
				width="md"
			>
				<Switcher gap={3}>
					<Form onSubmit={forgot ? onForgotSubmit : onSubmit}>
						{!forgot ? (
							<>
								<Field label={t('Password')}>
									<PasswordInput
										name="password"
										onChange={(evt) => setPassword(evt.target.value)}
										value={password}
										placeholder={t('Password')}
										aria-label={t('Password')}
									/>
								</Field>
								<Toggle
									color="primary"
									name="remember"
									label={t('Remember me on this device')}
									checked={remember}
									onChange={(e) => setRemember(e.target.checked)}
								/>
								<Button variant="link" onClick={onForgot}>
									{t('Forgot password?')}
								</Button>
							</>
						) : forgotStatus !== 'success' ? (
							<>
								{loginInitData?.maskedEmail && (
									<Text as="p" size="sm" emphasis="muted">
										{t('Your registered email: {{email}}', {
											email: loginInitData.maskedEmail
										})}
									</Text>
								)}
								<Text as="p" emphasis="muted">
									{t(
										"Enter your email address and we'll send you a link to reset your password."
									)}
								</Text>
								<Field label={t('Email address')} error={forgotError}>
									<Input
										leading={<IcMail />}
										name="email"
										type="email"
										value={email}
										onChange={(evt: React.ChangeEvent<HTMLInputElement>) => {
											setEmail(evt.target.value)
											setForgotError(undefined)
										}}
										placeholder={t('Email address')}
										disabled={forgotStatus === 'loading'}
										autoFocus
									/>
								</Field>
							</>
						) : (
							<Alert color="success">
								{t(
									"If an account with this email exists, you'll receive a password reset link shortly."
								)}
							</Alert>
						)}

						{!forgot && error && <Alert color="error">{error}</Alert>}
						<ActionBar>
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
											color="primary"
											loading={forgotStatus === 'loading'}
											disabled={forgotStatus === 'loading' || !email}
											onClick={onForgotSubmit}
										>
											{t('Send reset link')}
										</Button>
									)}
								</>
							) : (
								<>
									<Button type="submit" color="primary" disabled={!api?.idTag}>
										<IcLogin />
										{t('Login')}
									</Button>
									{browserSupportsWebAuthn() && hasPasskeys !== false && (
										<WebAuth remember={remember} />
									)}
								</>
							)}
						</ActionBar>
					</Form>
					<QrLoginPanel className="d-none md:d-flex" />
				</Switcher>
			</AuthLayout>
		)
	}
}

interface WebAuthProps {
	remember?: boolean
}

export function WebAuth({ remember }: WebAuthProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const runWebAuthnLogin = useWebAuthnLoginHandler()

	async function handleWebAuthnLogin() {
		if (!api) return
		await runWebAuthnLogin(api, remember ?? false)
	}

	if (!browserSupportsWebAuthn()) {
		return null
	}

	return (
		<Button onClick={handleWebAuthnLogin}>
			<IcWebAuthn className="me-1" />
			{t('Login with passkey')}
		</Button>
	)
}

function LoginPage({ children }: { children: React.ReactNode }) {
	const [loginInitData] = useAtom(loginInitAtom)
	return <LoginInitContext.Provider value={loginInitData}>{children}</LoginInitContext.Provider>
}

/**
 * The context-free bootstrap routes: login, registration, password reset, IdP activation.
 * Their shapes are pinned by the backend's SPA fallback allowlist
 * (`cloudillo-rs/crates/cloudillo/src/routes/static_files.rs`), so they stay absolute
 * and top-level.
 *
 * A plain function, not a component — see `layout.tsx` for why.
 */
export function authRoutes() {
	return (
		<>
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
		</>
	)
}

// vim: ts=4
