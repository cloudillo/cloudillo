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
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import debounce from 'debounce'
import * as T from '@symbion/runtype'

import {
	LuEye as IcEye,
	LuEyeOff as IcEyeOff,
	LuAtSign as IcAt,
	LuRefreshCw as IcLoading,
	LuCheck as IcOk,
	LuX as IcError

} from 'react-icons/lu'

import { useAuth, AuthState, useApi } from '@cloudillo/react'

import { CloudilloLogo } from '../logo.js'
import { useDialog } from '../ui.js'
import { webAuthnLogin } from './auth.js'
import { validPassword } from './utils.js'

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
	const [email, setEmail] = React.useState('')
	const [idTag, setIdTag] = React.useState('')
	const [appDomain, setAppDomain] = React.useState('')
	const [password, setPassword] = React.useState('')
	const [passwordVisible, setPasswordVisible] = React.useState(false)
	const [verifyState, setVerifyState] = React.useState<{ ip: string[], idTagError: 'used' | 'nodns' | 'ip' | false, appError: 'used' | 'nodns' | 'ip' | false, apiIp: string, appIp: string } | undefined>()
	const [progress, setProgress] = React.useState<undefined | 'vfy' | 'reg' | 'check' | 'done' | 'wait-dns'>()
	//const [running, setRunning] = React.useState<'vfy' | 'reg' | undefined>()
	//const [regResult, setRegResult] = React.useState(false)
	const [error, setError] = React.useState<string | undefined>()

	const passwordError = !validPassword(password)

	const onChangeVerify = React.useCallback(debounce((async function onVerify(idTag: string, appDomain?: string) {
		if (!validIdentityTag(idTag)) {
			await dialog.simple(t('Invalid identity tag!'), t('You must provide a valid identity tag!'))
			return
		}
		setProgress('vfy')
		try {
			const res = await api.post<{
				ip: string[],
				idTagError: 'used' | 'nodns' | 'ip' | false,
				appError: 'used' | 'nodns' | 'ip' | false,
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
			setProgress(undefined)
			setVerifyState(res)
		} catch (err) {
			console.log('ERROR', err)
			setProgress(undefined)
			setVerifyState(undefined)
		}
	}).bind(null), 500), [identityProvider, registerToken])

	async function onSubmit(evt: React.FormEvent) {
		evt.preventDefault()
		setProgress('reg')
		if (!validIdentityTag(idTag)) {
			await dialog.simple(t('Invalid identity tag!'), t('You must provide a valid identity tag!'))
			return
		}
		const res = await api.post('', '/auth/register', {
			data: {
				type: identityProvider,
				idTag: identityProvider == 'domain' ? idTag : idTag + '.cloudillo.net',
				appDomain,
				password,
				email,
				registerToken
			}
		})
		console.log('RES', res)
		setProgress('check')
		const checkRes = await fetch(`https://${appDomain || idTag}/idTag`)
		if (checkRes.ok) {
			const j = await checkRes.json()
			if (j.idTag == idTag) {
				setProgress('done')
			} else {
				setProgress('wait-dns')
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

	return <form className="c-panel d-block p-4" onSubmit={onSubmit}>
		{ (!progress || progress == 'vfy') && <>
			<CloudilloLogo className={'c-logo w-50 float-right ps-3 pb-3' + (progress == 'vfy' ? ' fast' : ' slow')}/>
			<header><h1 className="mb-3">{t('Join Cloudillo!')}</h1></header>
		</> }

		{/* Introduction */}
		{/****************/}
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
						<button className="c-button primary" onClick={evt => {evt.preventDefault(); setIdentityProvider('local')}}>Use Cloudillo's Identity Provider</button>
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
						<button className="c-button secondary" onClick={evt => {evt.preventDefault(); setIdentityProvider('domain')}}>Use your own Domain Name</button>
					</div>
				</div>
			</div></div>
		</> }

		{/* Local identity choosen */}
		{/**************************/}
		{ (!progress || progress == 'vfy') && identityProvider == 'local' && <>
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
						onChange={(evt: React.ChangeEvent<HTMLInputElement>) => (setIdTag(evt.target.value), setVerifyState(undefined), onChangeVerify(evt.target.value))}
						value={idTag}
						placeholder={t('Choose a name')}
						aria-label={t('Identity tag')}
					/>
					{ progress == 'vfy' && <IcLoading className="animate-rotate-cw my-auto f-none"/> }
					{ !progress && idTag && verifyState?.idTagError === false && <IcOk className="text-success my-auto f-none"/> }
					{ !progress && idTag && verifyState?.idTagError && <IcError className="text-error my-auto f-none"/> }
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

			<label className="my-3">{t('Password')}
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
			</label>

			{ password && passwordError && <div className="c-panel error mt-2">
				<p>{t('Password must be at least 8 characters long')}</p>
			</div> }

			<div className="c-invalid-feedback">{error}</div>
			<footer className="c-group g-2 mt-2">
				<button className="c-button primary" type="submit" disabled={verifyState?.idTagError !== false || verifyState?.appError !== false || passwordError}>{t('Sign up')}</button>
				<button className="c-button" onClick={() => setIdentityProvider(undefined)}>{t('Go back')}</button>
			</footer>
		</> }

		{/* Domain-based identity choosen */}
		{/*********************************/}
		{ (!progress || progress == 'vfy') && identityProvider == 'domain' && <>
			<Trans i18nKey="REGISTER-FORM">
				<h3 className="my-3">Choose your Identity</h3>
				<p className="pb-2">
					Enter your chosen Identity in the box below. Choose wisely, because you will not be able to easily change it later.
				</p><p>
					You need to choose an App Domain which you will use to access your Cloudillo Application.
					It can be the same as your choosen Identity Tag, but if you use this domain for other purposes (e.g. you have a website on it) than you can create a subdomain.
				</p>
			</Trans>

			<label className="d-block my-3">{t('Identity tag')}
				<div className="c-input-group">
					<div className="c-button icon"><IcAt/></div>
					<input className="c-input"
						name="idTag"
						onChange={(evt: React.ChangeEvent<HTMLInputElement>) => (setIdTag(evt.target.value), setVerifyState(undefined), onChangeVerify(evt.target.value, appDomain))}
						value={idTag}
						placeholder={t('your.identity.tag')}
						aria-label={t('Identity tag')}
					/>
					{ progress == 'vfy' && <IcLoading className="animate-rotate-cw my-auto f-none"/> }
					{ !progress && idTag && verifyState?.idTagError === false && <IcOk className="text-success my-auto f-none"/> }
					{ !progress && idTag && verifyState?.idTagError == 'nodns' && <IcError className="text-warning my-auto f-none"/> }
					{ !progress && idTag && verifyState?.idTagError && verifyState.idTagError != 'nodns' && <IcError className='text-error my-auto f-none'/> }
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
						onChange={(evt: React.ChangeEvent<HTMLInputElement>) => (setAppDomain(evt.target.value), setVerifyState(undefined), onChangeVerify(idTag, evt.target.value))}
						value={appDomain}
						placeholder={idTag || t('your.app.domain')}
						aria-label={t('Identity tag')}
					/>
					{ progress == 'vfy' && <IcLoading className="animate-rotate-cw my-auto f-none"/> }
					{ !progress && idTag && verifyState?.appError == false && <IcOk className="text-success my-auto f-none"/> }
					{ !progress && idTag && verifyState?.appError == 'nodns' && <IcError className="text-warning my-auto f-none"/> }
					{ !progress && idTag && verifyState?.appError && verifyState?.appError != 'nodns' && <IcError className="text-error my-auto f-none"/> }
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

			{ (verifyState?.idTagError == false && verifyState?.appError == false) && <>
				<label className="my-3">{t('Email address')}
					<input className="c-input mb-3"
						name="email"
						onChange={(evt: React.ChangeEvent<HTMLInputElement>) => setEmail(evt.target.value)}
						value={email}
						placeholder={t('your@email.address')}
						aria-label={t('Email address')}
					/>
				</label>

				<label className="my-3">{t('Password')}
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
				</label>

				{ password && passwordError && <div className="c-panel error mt-2">
					<p>{t('Password must be at least 8 characters long')}</p>
				</div> }
			</> }

			<div className="c-invalid-feedback">{error}</div>
			<footer className="c-group g-2 mt-2">
				<button className="c-button primary me-2" type="submit" disabled={verifyState?.idTagError !== false && verifyState?.appError !== false || passwordError}>{t('Sign up')}</button>
				<button className="c-button" onClick={() => setIdentityProvider(undefined)}>{t('Go back')}</button>
			</footer>
		</> }

		{/* In progress */}
		{/***************/}
		{ progress == 'reg' && <>
			<header><h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1></header>
			<div className="c-vbox align-items-center">
				<CloudilloLogo className="c-logo w-50 ps-3 pb-w fast"/>
			</div>
			<h3>{t('Registration is in progress')}</h3>
			<p>{t('This can take a few moments, please be patient...')}</p>
		</> }

		{/* Check App domain*/}
		{/*******************/}
		{ progress == 'check' && <>
			<header><h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1></header>
			<div className="c-vbox align-items-center">
				<CloudilloLogo className="c-logo w-50 ps-3 pb-w fast"/>
			</div>
			<h3>{t('Registration is successful')}</h3>
			<p>{t('Checking app domain...')}</p>
		</> }

		{/* Registration success */}
		{/************************/}
		{ progress == 'done' && <>
			<header><h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1></header>
			<div className="c-vbox align-items-center p-5">
				<CloudilloLogo className="c-logo w-50 ps-3 pb-w fast"/>
				<h3>{t('Your registration was successful.')}</h3>
				<p>{t('You can now log in using your App domain')}</p>
			</div>
			<div className="c-group">
				<a className="c-button primary" href={`https://${appDomain || idTag}`}>{appDomain || idTag}</a>
			</div>
		</> }

		{/* Wait for DNS */}
		{/****************/}
		{ progress == 'wait-dns' && <>
			<header><h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1></header>
			<div className="c-vbox align-items-center p-5">
				<CloudilloLogo className="c-logo w-50 ps-3 pb-w fast"/>
				<h3>{t('Your registration was successful.')}</h3>
				<p>{t('Your app domain does not seems to be available yet. If you just created it in the domain name system then it can be normal, because the domain name system needs some time to propagate changes. Please wait a while and try to log in on your app domain later. It can be a few hours.')}</p>
			</div>
			<div className="c-group">
				<a className="c-button primary" href={`https://${appDomain || idTag}`}>{appDomain || idTag}</a>
			</div>
		</> }
	</form>
}

// vim: ts=4
