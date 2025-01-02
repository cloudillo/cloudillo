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
import { startRegistration, startAuthentication } from '@simplewebauthn/browser'
import debounce from 'debounce'
import * as T from '@symbion/runtype'

import { IconContext } from 'react-icons'
import {
	LuCloudLightning as IcCloudillo,
	LuDelete as IcDelete,
	LuEye as IcEye,
	LuEyeOff as IcEyeOff,
	LuAtSign as IcAt,
	LuRefreshCw as IcLoading,
	LuCheck as IcOk,
	LuX as IcError

} from 'react-icons/lu'

import { useAuth, AuthState, useApi } from '@cloudillo/react'

import { ServerError, arrayBufferToBase64Url, base64ToArrayBuffer } from './utils.js'
import { CloudilloLogo } from './logo.js'
import { Page, useDialog } from './ui.js'

////////////
// Logout //
////////////
export async function logout() {
	const api = useApi()
	//await api.get('', '/auth/logout', T.any)
	const r = await api.get('', '/auth/logout')
}

//////////////
// Web auth //
//////////////
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
	//if (typeof challenge != 'string') throw new Error('Internal error')
	if (typeof options != 'object') throw new Error('Internal error')
	if (typeof token != 'string') throw new Error('Internal error')

	console.log('options', options)
	const response = await startRegistration({ optionsJSON: options })
	console.log('response', response)

	const res = await api.post('', '/auth/wa/register', { data: { response, token }})
	localStorage.setItem('credential', response.id)
	return response
}

export async function deleteWebAuthn(api: ReturnType<typeof useApi>) {
	const credential = localStorage.getItem('credential')
	if (credential) {
		await api.delete('', `/auth/wa/reg/${encodeURIComponent(credential)}`)
		localStorage.removeItem('credential')
	}
}

export async function webAuthnLogin(api: ReturnType<typeof useApi>): Promise<AuthState | undefined> {

	const regChallengeData: any = await api.get('', '/auth/wa/login-req')
	const { options, token } = regChallengeData
	//if (typeof challenge != 'string') throw new Error('Internal error')
	if (typeof options != 'object') throw new Error('Internal error')
	if (typeof token != 'string') throw new Error('Internal error')

	console.log('options', options)
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
function validPassword(password: string) {
	return password.length >= 8
}

function validIdTag(user: string) {
	return user.match(/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*$/)
}

export function LoginForm() {
	const { t } = useTranslation()
	const api = useApi()
	const navigate = useNavigate()
	const [auth, setAuth] = useAuth()
	const dialog = useDialog()

	const authEnc = localStorage.getItem('auth')

	const [idTag, setIdTag] = React.useState('')
	const [password, setPassword] = React.useState('')
	const [passwordVisible, setPasswordVisible] = React.useState(false)
	const [remember, setRemember] = React.useState(false)
	const [forgot, setForgot] = React.useState(false)
	const [error, setError] = React.useState<string | undefined>()

	async function onSubmit(evt: React.FormEvent) {
		evt.preventDefault()
		if (!validIdTag(idTag)) {
			await dialog.simple(t('Invalid user tag!'), t('You must provide a valid user tag!'))
			return
		}
		if (!forgot) {
			try {
				console.log('LOGIN', idTag)
				const auth = await api.post<AuthState>('', `/auth/login`, {
					data: { idTag, password, remember }
				})
				console.log({ auth })
				setAuth(auth as AuthState)
				navigate('/')
			} catch (err: any) {
				console.log('AUTH ARROR', err)
				setError('Login failed')
			}
		} else {
			console.log('FORGOT PASSWORD')
			try {
				const res = await api.post('', '/auth/passwd-req', { data: { idTag } })
				navigate('/register/passwd-sent')
				//setForgot(false)
			} catch (err: any) {
				console.log(err)
			}
		}
	}

	async function onWebAuthLogin(evt: React.FormEvent) {
		evt.preventDefault()
		const auth = await webAuthnLogin(api)
		console.log('AUTH', auth)
		setAuth(auth)
		navigate('/')
	}

	function onForgot(evt: React.MouseEvent) {
		evt.preventDefault()
		setForgot(!forgot)
		setError(undefined)
	}

	if (auth) {
		console.log('REDIRECT')
		return <Navigate to="/"/>
	} else {
		return <form className="c-panel p-3" onSubmit={onSubmit}>
			<header><h4>{t('Login')}</h4></header>

			<input className="c-input mb-3"
				name="user"
				onChange={(evt: React.ChangeEvent<HTMLInputElement>) => setIdTag(evt.target.value)}
				value={idTag}
				placeholder={t('your.user.tag or email@address')}
				aria-label={t('User tag or email address')}/>
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
					<button type="button" className="c-link" onClick={() => setPasswordVisible(!passwordVisible)}>
						{passwordVisible ? <IcEye/> : <IcEyeOff/>}
					</button>
				</div>
				<div className="form-check mb-3">
					<input className="form-check-input"
						name="remember"
						type="checkbox"
						onChange={value => setRemember(!!value)}/>
					<label className="form-check-label">{t('Remember me')}</label>
				</div>
			</>
			: /* forgotten password */ <>
			</>
			}

			<div className="c-invalid-feedback">{error}</div>
			<footer className="is-right">
				{ localStorage.getItem('credential')
					&& <button className="c-button secondary me-2" onClick={onWebAuthLogin}>{t('Login without password')}</button>
				}
				<button className="c-button primary me-2" type="submit">{!forgot ? t('Login') : t('Request password reset')}</button>
			</footer>
		</form>
	}
}

//////////////////
// RegisterForm //
//////////////////
function validIdentityTag(idTag: string) {
	return idTag.match(/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*$/)
}

export function RegisterForm() {
	const { t } = useTranslation()
	const api = useApi()
	const { registerToken } = useParams()
	const navigate = useNavigate()
	const [auth, setAuth] = useAuth()
	const dialog = useDialog()

	const [identityProvider, setIdentityProvider] = React.useState<'local' | 'domain' | undefined>(undefined)
	const [email, setEmail] = React.useState('szilu@w9.hu')
	const [idTag, setIdTag] = React.useState('')
	const [appDomain, setAppDomain] = React.useState('')
	//const [verifyState, setVerifyState] = React.useState<{ ip: string[], idTagOk: boolean, domainOk: boolean, apiIp: string, apiIpOk: boolean, appIp: string, appIpOk: boolean } | undefined>()
	const [verifyState, setVerifyState] = React.useState<{ ip: string[], idTagError: 'used' | 'nodns' | 'ip' | '', appError: 'used' | 'nodns' | 'ip' | '', apiIp: string, appIp: string } | undefined>()
	const [running, setRunning] = React.useState<'vfy' | 'reg' | undefined>()
	const [error, setError] = React.useState<string | undefined>()
	console.log('registerToken', registerToken)

	const onChangeVerify = React.useCallback(debounce(async function onVerify(idTag: string, appDomain?: string) {
		console.log('onChangeVerify')
		if (!validIdentityTag(idTag)) {
			await dialog.simple(t('Invalid identity tag!'), t('You must provide a valid identity tag!'))
			return
		}
		setRunning('vfy')
		console.log('VERIFY', identityProvider, idTag, appDomain, registerToken)
		const res = await api.post<{
			ip: string[],
			idTagError: 'used' | 'nodns' | 'ip' | '',
			appError: 'used' | 'nodns' | 'ip' | '',
			apiIp: string,
			appIp: string,
		}>('', '/auth/register-verify', {
			data: {
				type: identityProvider,
				idTag: identityProvider == 'domain' ? idTag : idTag + '.cloudillo.net',
				appDomain, registerToken
			}
		})
		console.log('RES', res)
		setRunning(undefined)
		setVerifyState(res)
	}, 500), [identityProvider, registerToken])

	async function onSubmit(evt: React.FormEvent) {
		evt.preventDefault()
		setRunning('reg')
		if (!validIdentityTag(idTag)) {
			await dialog.simple(t('Invalid identity tag!'), t('You must provide a valid identity tag!'))
			return
		}
		const res = await api.post('', '/auth/register', {
			data: { email, idTag, registerToken }
		})
		setRunning(undefined)
		console.log('RES', res)
	}

	async function onWebAuthLogin(evt: React.FormEvent) {
		evt.preventDefault()
		const auth = await webAuthnLogin(api)
		console.log('AUTH', auth)
		setAuth(auth)
		navigate('/')
	}

	return <form className="c-panel d-block p-4" onSubmit={onSubmit}>
		<CloudilloLogo className={'c-logo w-50 float-right ps-3 pb-3' + (running ? ' fast' : ' slow')}/>
		<header><h1 className="mb-3">{t('Join Cloudillo!')}</h1></header>

		{ !identityProvider && <>
			<Trans i18nKey="REGISTER-FORM">
				<h3 className="my-3">Choose your Identity</h3>
				<p>
					Identity is a cornerstone on any platform. On most platforms, it is controlled by the platform owner, leaving you no choice but to rely on their system.
					Cloudillo takes a different approach: it's an open platform with no central "owner", giving you the freedom to choose your identity provider.
				</p><p className="pb-2">
					Cloudillo's identity system leverages the Domain Name System (DNS) — a foundational concept of the internet.
					While this does involve some reliance on a provider, DNS has a globally established and trusted organizational system, making it a balanced and practical choice.
				</p><p className="pb-2">
					Until more options emerge from the ecosystem, you have two options to choose from.
				</p>
			</Trans>

			<h3 className="my-3">Your Identity Options on Cloudillo</h3>
			<div className="c-container"><div className="row g-3">
				<div className="col col-md-6 c-panel primary">
					<h4>Use Cloudillo's Identity Provider</h4>
					<hr className="w-100"/>
					<ul>
						<li><em>@john.<b>cloudillo.net</b></em></li>
						<li><em>@johndoe.<b>cloudillo.net</b></em></li>
					</ul>
					<hr className="w-100"/>
					<p>If you want to start fast and easy, or just want to try Cloudillo. You can read more about it here.</p>
					<hr className="w-100"/>
					<p>The Cloudillo Identity Provider is currently free, but in the future it will be restricted to users who support the development of the platform with a small donation fee. (2 EUR/year)
					</p>
					<div className="h-100"/>
					<div className="c-group">
						<button className="c-button primary" onClick={() => setIdentityProvider('local')}>Use Cloudillo's Identity Provider</button>
					</div>
				</div><div className="col col-md-6 c-panel secondary">
					<h4>Use your own Domain Name</h4>
					<hr className="w-100"/>
					<ul>
						<li><em>@yourdomain.com</em></li>
						<li><em>@john.yourdomain.com</em></li>
					</ul>
					<hr className="w-100"/>
					<p>If you want to build trust by using your own brand, or you want to have the most control over your identity.</p>
					<p>Using your own domain name involves some settings at your domain provider, so it is a bit more complex, but we will help you on the way.</p>
					<hr className="w-100"/>
					<p>The cost depends on your DNS provider, but if you are using an already registered domain name or a subdomain of such than it usually has no additional cost.
					</p><p className="pb-2">
						Donate to help fund the project and receive a Trust Badge,
						further enhancing trust when interacting within the network.
					</p>
					<div className="h-100"/>
					<div className="c-group">
						<button className="c-button secondary" onClick={() => setIdentityProvider('domain')}>Use your own Domain Name</button>
					</div>
				</div>
			</div></div>
		</> }

		{ identityProvider == 'local' && <>
			<Trans i18nKey="REGISTER-FORM">
				<h3 className="my-3">Choose your Identity</h3>
				<p>
					Enter your chosen Identity in the box below. Choose wisely, because changing it later will not be easy.
				</p>
			</Trans>

			<label className="d-block my-3">{t('Identity Tag')}
				<div className="c-input-group">
					<div className="c-button icon"><IcAt/></div>
					<input className="c-input"
						name="idTag"
						onChange={(evt: React.ChangeEvent<HTMLInputElement>) => (setIdTag(evt.target.value), onChangeVerify(evt.target.value))}
						value={idTag}
						placeholder={t('Choose a name')}
						aria-label={t('Identity tag')}
					/>
					{ running == 'vfy' && <IcLoading className="animate-rotate-cw my-auto f-none"/> }
					{ !running && idTag && verifyState?.idTagError == '' && <IcOk className="text-success my-auto f-none"/> }
					{ !running && idTag && verifyState?.idTagError && <IcError className="text-error my-auto f-none"/> }
					<div className="c-button">.cloudillo.net</div>
				</div>
			</label>

			<label className="my-3">{t('Email address')}
				<input className="c-input mb-3"
					name="email"
					onChange={(evt: React.ChangeEvent<HTMLInputElement>) => setEmail(evt.target.value)}
					value={email}
					placeholder={t('your@email.address')}
					aria-label={t('Email address')}
				/>
			</label>
			<div className="c-invalid-feedback">{error}</div>
			<footer className="c-group g-2">
				<button className="c-button primary" type="submit">{t('Sign up')}</button>
				<button className="c-button" onClick={() => setIdentityProvider(undefined)}>{t('Go back')}</button>
			</footer>
		</> }

		{ identityProvider == 'domain' && <>
			<Trans i18nKey="REGISTER-FORM">
				<h3 className="my-3">Choose your Identity</h3>
				<p className="pb-2">
					Enter your chosen Identity in the box below. Choose wisely, because you will not be able to easily change it later.
				</p><p>
					You should also choose an App Domain which you will use to access your Cloudillo Application.
					It can be the same as your choosen Identity Tag, but if you use this domain for other purposes (e.g. you have a website on it) than you can create a subdomain.
				</p>
			</Trans>

			<label className="d-block my-3">{t('Identity tag')}
				<div className="c-input-group">
					<div className="c-button icon"><IcAt/></div>
					<input className="c-input"
						name="idTag"
						onChange={(evt: React.ChangeEvent<HTMLInputElement>) => (setIdTag(evt.target.value), onChangeVerify(evt.target.value, appDomain))}
						value={idTag}
						placeholder={t('your.identity.tag')}
						aria-label={t('Identity tag')}
					/>
					{ running == 'vfy' && <IcLoading className="animate-rotate-cw my-auto f-none"/> }
					{ !running && idTag && verifyState?.idTagError == '' && <IcOk className="text-success my-auto f-none"/> }
					{ !running && idTag && verifyState?.idTagError == 'nodns' && <IcError className="text-warning my-auto f-none"/> }
					{ !running && idTag && verifyState?.idTagError && verifyState.idTagError != 'nodns' && <IcError className='text-error my-auto f-none'/> }
				</div>
				{ verifyState?.idTagError == 'used' && <Trans i18nKey="REGISTER-FORM-ID-TAG-USED">
					<div className="c-panel error mt-2">
						<p>The provided Identity Tag is already in use.</p>
					</div>
				</Trans>}
				{ verifyState?.idTagError == 'nodns' && <Trans i18nKey="REGISTER-FORM-ID-TAG-NOT-REG">
					<div className="c-panel warning mt-2">
						<p>The provided Identity Tag is not registered in the Domain Name System.
							You should make the changes below in your domain and try again.</p>
					</div>
				</Trans>}
				{ verifyState?.idTagError == 'ip' && <Trans i18nKey="REGISTER-FORM-ID-TAG-IP-DIFF">
					<div className="c-panel warning mt-2">
						<h4 className="mb-2">Are you sure?</h4>
						<p>The provided Identity Tag is registered in the Domain Name System, but it points to a different IP address ({verifyState.apiIp}).
							If you are sure about using this Identity Tag, you should make the changes below in your domain and try again.</p>
					</div>
				</Trans>}
			</label>

			<label className="d-block my-3">{t('App domain')}
				<div className="c-input-group">
					<input className="c-input"
						name="app-domain"
						onChange={(evt: React.ChangeEvent<HTMLInputElement>) => (setAppDomain(evt.target.value), onChangeVerify(idTag, evt.target.value))}
						value={appDomain}
						placeholder={idTag || t('your.app.domain')}
						aria-label={t('Identity tag')}
					/>
					{ running == 'vfy' && <IcLoading className="animate-rotate-cw my-auto f-none"/> }
					{ !running && idTag && verifyState?.appError == '' && <IcOk className="text-success my-auto f-none"/> }
					{ !running && idTag && verifyState?.appError == 'nodns' && <IcError className="text-warning my-auto f-none"/> }
					{ !running && idTag && verifyState?.appError && verifyState?.appError != 'nodns' && <IcError className="text-error my-auto f-none"/> }
				</div>
				{ verifyState?.appError == 'used' && <Trans i18nKey="REGISTER-FORM-APP-USED">
					<div className="c-panel error mt-2">
						<p>The provided app domain address is already in use.</p>
					</div>
				</Trans>}
				{ verifyState?.appError == 'nodns' && <Trans i18nKey="REGISTER-FORM-APP-IP-NOT-REG">
					<div className="c-panel warning mt-2">
						<p>The provided Application Domain is not registered in the Domain Name System.
							You should make the changes below in your domain and try again.</p>
					</div>
				</Trans>}
				{ verifyState?.appError == 'ip' && !appDomain && <Trans i18nKey="REGISTER-FORM-APP-IP-DIFF">
					<div className="c-panel error mt-2">
						<p>The provided Identity Tag as a domain address seems to be already in use
							(maybe you already have a website on this address).
						</p><p>You most certainly will not be able to use it as your Cloudillo App site. You can choose a subdomain (for example cloudillo.{idTag}), or you can use any other address.
						</p>
					</div>
				</Trans>}
				{ verifyState?.appError == 'ip' && appDomain && <Trans i18nKey="REGISTER-FORM-APP-IP-DIFF">
					<div className="c-panel error mt-2">
						<h4 className="mb-2">Are you sure?</h4>
						<p>The provided App Domain is registered in the Domain Name System, but it points to a different IP address ({verifyState.appIp}).
							If you are sure about using this Identity Tag, you should make the changes below in your domain and try again.</p>
					</div>
				</Trans>}
			</label>

			{ idTag && verifyState?.idTagError != 'used' && verifyState?.appError != 'used'
				&& (verifyState?.idTagError == 'nodns' || verifyState?.idTagError == 'ip' || verifyState?.appError == 'nodns' || verifyState?.appError == 'ip') && <div className="my-3">
				<h4 className="mb-2">DNS instructions</h4>
				<p>Please make the following changes in your domain's DNS settings to use it as your Cloudillo Identity.
					If you don't know what to do with it, don't panic! Send the instructions to your system administrator or webmaster:</p>
				<p>After the changes are made, you can get back here and continue with the registration.</p>
				<pre className="c-panel success">
					cl-o.{idTag.padEnd(20, ' ')} IN A {verifyState?.ip[0] + '\n'}
					{(appDomain || idTag).padEnd(25, ' ')} IN A {verifyState?.ip[0]}
				</pre>
			</div> }

			{ (verifyState?.idTagError == '' && verifyState?.appError == '') && <>
				<footer className="c-group">
					<button className="c-button" onClick={() => setIdentityProvider(undefined)}>{t('Go back')}</button>
				</footer>
			</> }

			{ verifyState && !verifyState?.idTagError && !verifyState?.appError && <>
				<label className="my-3">{t('Email address')}
					<input className="c-input mb-3"
						name="email"
						onChange={(evt: React.ChangeEvent<HTMLInputElement>) => setEmail(evt.target.value)}
						value={email}
						placeholder={t('your@email.address')}
						aria-label={t('Email address')}
					/>
				</label>

				<div className="c-invalid-feedback">{error}</div>
				<footer className="c-group g-2">
					<button className="c-button primary me-2" type="submit">{t('Sign up')}</button>
					<button className="c-button" onClick={() => setIdentityProvider(undefined)}>{t('Go back')}</button>
				</footer>
			</> }
		</> }

	</form>
}

///////////////////////
// PasswordResetForm //
///////////////////////
export function PasswordResetForm() {
	const { t } = useTranslation()
	const api = useApi()
	const navigate = useNavigate()
	const location = useLocation()
	const dialog = useDialog()
	const [_, code] = location.search.match(/code=([^\&]+)/) || []

	const [auth, setAuth] = useAuth()

	const [password, setPassword] = React.useState('')

	async function onSubmit(evt: React.FormEvent) {
		evt.preventDefault()
		if (!validPassword(password)) {
			await dialog.simple(t('Invalid password!'), t('You must provide a strong password!'))
			return
		}
		console.log('RESET PASSWORD')
		try {
			const res = await api.post('', '/auth/passwd', {
				data: { code, password }
			})
			console.log(res)
			navigate('/register/passwd-set')
		} catch (err: any) {
			console.log(err)
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
				<div className="c-buttongroup float-right">
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
		<Link className="c-button float-right" to="/login">{t('You can now log in')}</Link>.
	</AuthPage>
}

interface WebAuthProps {
	idTag: string
	credentials: any[]
}

export function WebAuth({ idTag, credentials }: WebAuthProps) {
	const api = useApi()

	if (!credentials.find(cred => cred.keyId == localStorage.getItem('credential'))) {
		console.log('Removing revoked local credential')
		localStorage.removeItem('credential')
	}

	const [webauthSet, setWebauthSet] = React.useState(localStorage.getItem('credential') != null)
	const [creds, setCreds] = React.useState(credentials)
	console.log('CREDS', credentials, localStorage.getItem('credential'))

	async function onWebAuth(evt: React.MouseEvent) {
		evt.preventDefault()
		try {
			await addWebAuthn(api, idTag, idTag)
			setWebauthSet(true)
		} catch (err: any) {
			console.log(err)
			alert(err.errStr)
		}
	}

	async function onDeleteWebauth(evt: React.MouseEvent, keyId: string) {
		evt.preventDefault()
		console.log('delete webauthn', keyId)
		if (confirm(`Are you sure?`)) {
			try {
				await api.delete('', '/auth/wa/reg/' + encodeURIComponent(keyId))
				setCreds(creds.filter(c => c.keyId != keyId))
			} catch (err: any) {
				console.log(err)
				alert(err.errStr)
			}
		}
	}

	return <>
	</>
}

export function Password() {
	const { t } = useTranslation()
	const api = useApi()
	const [oldPassword, setOldPassword] = React.useState('')
	const [password, setPassword] = React.useState('')

	async function changePassword() {
		console.log('changePassword')
		if (!validPassword(password)) {
			alert(t('You must provide a strong password!'))
			return
		}
		try {
			const res = await api.post('', '/auth/passwd', {
				data: {oldPassword, password }
			})
			console.log(res)
			alert(t('Password changed successfully'))
		} catch (err: any) {
			console.log(err)
			alert(err.errStr || t('Incorrect password!'))
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
		<Route path="/register/:registerToken" element={<LoginPage><RegisterForm/></LoginPage>}/>
		<Route path="/passwd" element={<LoginPage><PasswordResetForm/></LoginPage>}/>
		<Route path="/passwd-sent" element={<LoginPage><PasswordResetSent/></LoginPage>}/>
		<Route path="/passwd-set" element={<LoginPage><PasswordSet/></LoginPage>}/>
		<Route path="/*" element={null}/>
	</Routes>
}

// vim: ts=4
