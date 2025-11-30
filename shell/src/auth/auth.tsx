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
import { Routes, Route, Link, Navigate, useParams, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { browserSupportsWebAuthnAutofill, browserSupportsWebAuthn, startRegistration, startAuthentication } from '@simplewebauthn/browser'
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
	LuLogIn as IcLogin

} from 'react-icons/lu'

import { useAuth, AuthState, useApi, useDialog, Button } from '@cloudillo/react'

import { useAppConfig, ServerError, arrayBufferToBase64Url, base64ToArrayBuffer } from '../utils.js'
import { CloudilloLogo } from '../logo.js'
import { Page } from '../ui.js'
import { RegisterForm } from './register.js'
import { validIdTag, validPassword } from './utils.js'

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
// NOTE: WebAuthn is not supported in the Rust backend
// Keeping these functions commented for reference
/*
function publicKeyCredentialToJSON(item: any): any {
	if (item instanceof Array) return item.map(publicKeyCredentialToJSON)
	else if (item instanceof ArrayBuffer || item instanceof Uint8Array) return arrayBufferToBase64Url(new Uint8Array(item))
	else if (item instanceof Object) {
		const obj: Record<any,any> = {}
		for (const key in item) {
			obj[key] = publicKeyCredentialToJSON(item[key])
		}
		return obj
	}
	return item
}

export async function addWebAuthn(api: ReturnType<typeof useApi>, idTag: string, name: string) {
	const regChallengeData = await api.get('', '/auth/wa/register-req', {
		type: T.struct({ options: T.any, token: T.string })
	})
	const { options, token } = regChallengeData
	if (typeof options != 'object') throw new Error('Internal error')
	if (typeof token != 'string') throw new Error('Internal error')

	console.log('options', options)
	const response = await startRegistration({ optionsJSON: options })
	console.log('response', response)

	const res = await api.post('', '/auth/wa/register', { data: { response, token }})
	localStorage.setItem('crredential', response.id)
	return response
}

export async function webAuthnLoginReq(api: ReturnType<typeof useApi>) {
	const regChallengeData: any = await api.get('', '/auth/wa/login-req')
	const { options, token } = regChallengeData
	if (typeof options != 'object') throw new Error('Internal error')
	if (typeof token != 'string') throw new Error('Internal error')
}

export async function webAuthnLogin(api: ReturnType<typeof useApi>): Promise<AuthState | undefined> {
	const regChallengeData: any = await api.get('', '/auth/wa/login-req')
	const { options, token } = regChallengeData
	if (typeof options != 'object') throw new Error('Internal error')
	if (typeof token != 'string') throw new Error('Internal error')

	console.log('options', options)
	console.log('browserSupportsWebAuthnAutofill', await browserSupportsWebAuthnAutofill())
	const regData = await startAuthentication({ optionsJSON: options })
	console.log('regData', regData)

	const res = await api.post<AuthState>('', '/auth/wa/login', {
		data: {
			response: regData,
			token
		}
	})
	console.log({res})
	return res
}

export async function deleteWebAuthn(api: ReturnType<typeof useApi>) {
	const credential = localStorage.getItem('credential')
	if (credential) {
		await api.delete('', `/auth/wa/reg/${encodeURIComponent(credential)}`)
		localStorage.removeItem('credential')
	}
}
*/

//////////////
// AuthPage //
//////////////
interface AuthPageProps {
	title?: string
	children: React.ReactNode
}

function AuthPage({ title, children }: AuthPageProps) {
	return <div className="c-panel p-3">
		{title && <h2>{title}</h2>}
		{children}
	</div>
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

	function onLoggedIn(authState: AuthState) {
		console.log('onLoggedIn', { authState })
		setAuth(authState)
		if (authState.token) localStorage.setItem('loginToken', authState.token)
	}

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
			const authState: AuthState = {
				...loginResult,
				settings: Object.fromEntries(loginResult.settings || [])
			}
			onLoggedIn(authState)
		} catch (err: any) {
			console.error('Login failed:', err)
			setError(err.message || 'Login failed')
		}
	}

	function onForgot(evt: React.MouseEvent) {
		evt.preventDefault()
		setForgot(!forgot)
		setError(undefined)
	}

	if (auth) {
		const navTo =
			auth.settings?.['ui.onboarding'] && `/onboarding/${auth.settings['ui.onboarding']}`
			|| appConfig?.menu?.find(m => m.id === appConfig.defaultMenu)?.path
			|| '/app/feed'
		return <Navigate to={navTo}/>
	} else {
		return <form className="c-panel p-3" onSubmit={onSubmit}>
			<header><h2>{t('Login')}</h2></header>

			{ !forgot
			? <>
				<div className="c-input-group mb-3">
					<input className="c-input"
						name="password"
						onChange={(evt: React.ChangeEvent<HTMLInputElement>) => setPassword(evt.target.value)}
						value={password}
						type={passwordVisible ? 'text' : 'password'}
						placeholder={t('Password')}
						aria-label={t('Password')}/>
					<button type="button" className="c-link px-1" onClick={() => setPasswordVisible(!passwordVisible)}>
						{passwordVisible ? <IcEye/> : <IcEyeOff/>}
					</button>
				</div>
				<div className="form-check mb-3">
					<input className="form-check-input"
						name="remember"
						type="checkbox"
						onChange={value => setRemember(!!value)}/>
					<label className="form-check-label">{t('Remember me on this device')}</label>
				</div>
			</>
			: /* forgotten password */ <>
			</>
			}

			<div className="c-invalid-feedback">{error}</div>
			<footer className="c-group g-2">
				<Button type="submit" primary disabled={!api?.idTag}><IcLogin/>{t('Login')}</Button>
			</footer>
		</form>
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

	return <AuthPage title="Set new password">
			<form className="c-form" onSubmit={onSubmit}>
				<label className="c-label">New password
					<input className="c-input"
						onChange={(evt: React.ChangeEvent<HTMLInputElement>) => setPassword(evt.target.value)}
						value={password}
						type="password"
						placeholder={t('New password')}
						aria-label={t('New password')}/>
				</label>
				{error && <div className="c-invalid-feedback">{error}</div>}
				<div className="c-group">
					<button className="c-button" type="submit">{t('Change password')}</button>
				</div>
			</form>
	</AuthPage>
}

function PasswordResetSent() {
	const { t } = useTranslation()

	return <AuthPage title={t('Confirmation email sent')}>
		<p>{t('PasswordResetSent', 'We have sent you a confirmation link in email.')}</p>
	</AuthPage>
}

function PasswordSet() {
	const { t } = useTranslation()

	return <AuthPage title={t('Password set')}>
		<p>{t('PasswordSet', 'Your password has been set.')}</p>
		<Link className="c-button" to="/login">{t('You can now log in')}</Link>.
	</AuthPage>
}

interface WebAuthProps {
	idTag: string
	credentials: any[]
}

export function WebAuth({ idTag, credentials }: WebAuthProps) {
	// WebAuthn is not supported in the Rust backend
	return <>
	</>
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

	return <div>
		<input className="c-input"
			onChange={(evt: React.ChangeEvent<HTMLInputElement>) => setOldPassword(evt.target.value)}
			autoComplete="current-password"
			value={oldPassword}
			type="password"
			placeholder={t('Current password')}
			aria-label={t('Current password')}/>
		<input className="c-input"
			onChange={(evt: React.ChangeEvent<HTMLInputElement>) => setPassword(evt.target.value)}
			autoComplete="new-password"
			value={password}
			type="password"
			placeholder={t('New password')}
			aria-label={t('New password')}/>
		{error && <div className="c-invalid-feedback">{error}</div>}
		<button className="c-button" onClick={changePassword}>{t('Set password')}</button>
	</div>
}

function LoginPage({ children }: { children: React.ReactNode }) {
	return <div className="c-container"><div className="row">
		<div className="col-0 col-md-1 col-lg-2"/>
		<div className="col col-md-10 col-lg-8">
			<div className="flex-fill-x">
				{children}
			</div>
		</div>
		<div className="col-0 col-md-1 col-lg-2"/>
	</div></div>
}

export function AuthRoutes() {
	return <Routes>
		<Route path="/login" element={<LoginPage><LoginForm/></LoginPage>}/>
		<Route path="/register/:token" element={<LoginPage><RegisterForm/></LoginPage>}/>
		<Route path="/register/:token/:providerType" element={<LoginPage><RegisterForm/></LoginPage>}/>
		<Route path="/register/:token/idp/:idpStep" element={<LoginPage><RegisterForm/></LoginPage>}/>
		<Route path="/passwd" element={<LoginPage><PasswordResetForm/></LoginPage>}/>
		<Route path="/passwd-sent" element={<LoginPage><PasswordResetSent/></LoginPage>}/>
		<Route path="/passwd-set" element={<LoginPage><PasswordSet/></LoginPage>}/>
		<Route path="/*" element={null}/>
	</Routes>
}

// vim: ts=4
