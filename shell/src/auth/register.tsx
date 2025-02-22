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

import { useAuth, AuthState, useApi, useDialog, Button } from '@cloudillo/react'

import { CloudilloLogo } from '../logo.js'
//import { webAuthnLogin } from './auth.js'
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

	const [show, setShow] = React.useState(false)
	const [identityProvider, setIdentityProvider] = React.useState<'local' | 'domain' | undefined>(undefined)
	const [email, setEmail] = React.useState('')
	const [idTag, setIdTag] = React.useState('')
	const [appDomain, setAppDomain] = React.useState('')
	const [password, setPassword] = React.useState('')
	const [passwordVisible, setPasswordVisible] = React.useState(false)
	const [verifyState, setVerifyState] = React.useState<{ ip: string[], idTagError: 'invalid' | 'used' | 'nodns' | 'ip' | false, appDomainError: 'invalid' | 'used' | 'nodns' | 'ip' | false, apiIp: string, appIp: string } | undefined>()
	const [progress, setProgress] = React.useState<undefined | 'vfy' | 'reg' | 'check' | 'done' | 'wait-dns' | 'error'>()
	//const [running, setRunning] = React.useState<'vfy' | 'reg' | undefined>()
	//const [regResult, setRegResult] = React.useState(false)
	const [error, setError] = React.useState<string | undefined>()

	const passwordError = !validPassword(password)

	React.useEffect(function () {
		console.log('RegisterForm.useEffect', api.idTag)
		if (!api.idTag) return
		(async function () {
			console.log('RegisterForm.useEffect', api.idTag)
			const res = await api.post('', '/auth/register-verify', {
				data: { type: 'ref', idTag: '', registerToken }
			})
			setShow(true)
		})()
	}, [api])

	async function onClickIdentityInfo() {
		console.log('Dialog')
		await dialog.tell(t('What is Identity?'), t('REGISTER-FORM-IDENTITY-INFO', `Identity is essential on any platform where you make connections with others.

		On most platforms, identity is controlled by the platform owner, leaving you no choice but to rely on their system. Cloudillo is different — it's open, with no central owner, giving you the freedom to choose your identity provider.

		Cloudillo's identity system uses the Domain Name System (DNS) — the same system that the entire internet relies on for websites, emails and other services. While it involves some reliance on a provider, DNS is globally trusted and decentralized, making it a balanced and practical choice.

		If you own a domain name, you can use it as your Cloudillo Identity (e.g., @yourdomain.com) and create unlimited sub-identities (e.g., @alice.yourdomain.com, @bob.yourdomain.com).

		The Cloudillo Identity Provider is a service provided by the company behind the development of Cloudillo. While it means trusting Cloudillo with your identity, you still control where your data is stored — unlike on most platforms.

		Think of your identity as your address — it help others find and connect with you.
`))
	}

	async function onClickDomainInfo() {
		await dialog.tell(t('Cloudillo Identity with Your Own Domain'), t('REGISTER-FORM-DOMAIN-INFO', `
			To use Cloudillo with your own domain, you need two things:

			1. A Cloudillo Identity – This is used by others to find and connect with you. It's based on a domain you own but doesn't interfere with your existing website. The Identity is usually prefixed with "@" and is called an Identity Tag.

			2. An App Domain – The unique address where you access your Cloudillo application. Unlike most platforms with a single global URL, Cloudillo provides a personalized address for each user. Your App Domain can be the same as your Identity domain but doesn't have to be.

			Examples:

			Example 1: You own mycompany.com and want to use a subdomain, @ceo.mycompany.com as your Cloudillo Identity. Since ceo.mycompany.com isn't used for a website, you can also use it as your App Domain.

			Example 2: You want @mycompany.com as your Cloudillo Identity, but your website already uses mycompany.com. In this case, you'll need a separate App Domain, like app.mycompany.com.
		`))
	}

	function onChangeIdentityProvider(evt: React.SyntheticEvent, provider: 'local' | 'domain' | undefined) {
		evt.preventDefault()
		setIdentityProvider(provider)
		setIdTag('')
		setAppDomain('')
	}

	const onChangeVerify = React.useCallback(debounce((async function onVerify(idTag: string, appDomain?: string) {
		if (!idTag) return

		setProgress('vfy')
		try {
			const res = await api.post<{
				ip: string[],
				idTagError: 'invalid' | 'used' | 'nodns' | 'ip' | false,
				appDomainError: 'invalid' | 'used' | 'nodns' | 'ip' | false,
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
		try {
			const checkRes = await fetch(`https://${appDomain || idTag}/.well-known/cloudillo/id-tag`)
			if (checkRes.ok) {
				const j = await checkRes.json()
				if (j.idTag == idTag) {
					setProgress('done')
				} else {
					setProgress('wait-dns')
				}
			} else {
				setProgress('wait-dns')
			}
		} catch (err) {
			console.log('ERROR', err)
			setProgress('wait-dns')
		}
	}

	if (!show) return <div className="c-panel">
		<CloudilloLogo className="c-logo w-50 float-right ps-3 pb-3 slow"/>
		<header><h1 className="mb-3">{t('This registration link is invalid!')}</h1></header>
	</div>

	return <form className="c-panel d-block p-4" onSubmit={onSubmit}>
		{ (!progress || progress == 'vfy') && <>
			<CloudilloLogo className={'c-logo w-50 float-right ps-3 pb-3' + (progress == 'vfy' ? ' fast' : ' slow')}/>
			<header><h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1></header>
		</> }

		{/* Introduction */}
		{/****************/}
		{ !identityProvider && <>
			<Trans i18nKey="REGISTER-FORM">
				<h3 className="my-3">Choose your Identity</h3>
				<p className="pb-2">
					Unlike traditional platforms that take control over your identity causing vendor lock-in,
					Cloudillo lets you choose your identity provider.
					It’s an open platform with no central owner.
				</p><p className="pb-2">
					Cloudillo uses the Domain Name System (DNS),
					a widely trusted system, to manage identities.
				</p>
				<p><button type="button" className="c-link text-primary" onClick={onClickIdentityInfo}>What is this identity thing and why should you care?</button></p>
				<h3 className="my-3">Pick an Option</h3>
			</Trans>

			<div className="c-container"><div className="row g-3">
				<div className="col col-md-6 c-panel primary mb-2">
					<h4>Use Cloudillo's Identity Provider (Fast & Easy)</h4>
					<p>Perfect if you want to start quickly or just explore Cloudillo.</p>
					<hr className="w-100"/>
					<ul className="ms-3">
						<li><em>@john.<b>cloudillo.net</b></em></li>
						<li><em>@johndoe.<b>cloudillo.net</b></em></li>
					</ul>
					<hr className="w-100"/>
					<p><b>Note:</b> Cloudillo IDs are free for now, but may require a small (€3/year) donation in the future to support the platform.</p>
					<div className="h-100"/>
					<div className="c-group">
						<Button className="primary" onClick={evt => onChangeIdentityProvider(evt, 'local')}>Use Cloudillo's Identity Provider</Button>
					</div>
				</div><div className="col col-md-6 c-panel secondary mb-2">
					<h4>Use your own Domain Name (More Control & Branding)</h4>
					<p>Great for businesses or users who want full control over their own identity.</p>
					<hr className="w-100"/>
					<ul className="ms-3">
						<li><em>@<b>yourdomain.com</b></em></li>
						<li><em>@john.<b>yourdomain.com</b></em></li>
					</ul>
					<hr className="w-100"/>
					<p><b>Setup Required:</b> You'll need to configure your domain provider, but we'll guide you through it. This small initial effort pays off by making it easier to build trust in the long run.</p>
					<div className="h-100"/>
					<div className="c-group">
						<Button className="secondary" onClick={evt => onChangeIdentityProvider(evt, 'domain')}>Use your own Domain Name</Button>
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
				{ verifyState?.idTagError == 'invalid' && <Trans i18nKey="REGISTER-FORM-ID-TAG-INVALID">
					<div className="c-panel error mt-2">
						<p>The provided Identity Tag is not valid. Are you sure you provided a valid domain name?</p>
					</div>
				</Trans>}
				{ verifyState?.idTagError == 'used' && <Trans i18nKey="REGISTER-FORM-ID-TAG-USED">
					<div className="c-panel error mt-2">
						<p>The provided Identity Tag is already in use.</p>
					</div>
				</Trans>}
			</label>

			<label className="my-3">{t('Contact email:')}
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
						autoComplete="off"
						placeholder={t('Password')}
						aria-label={t('Password')}/>
					<button type="button" className="c-link p-2" onClick={() => setPasswordVisible(!passwordVisible)}>
						{passwordVisible ? <IcEye/> : <IcEyeOff/>}
					</button>
				</div>
			</label>

			{ password && passwordError && <div className="c-panel error mt-2">
				<p>{t('Password must be at least 8 characters long')}</p>
			</div> }

			<div className="c-invalid-feedback">{error}</div>
			<footer className="c-group g-2 mt-2">
				<Button className="container-secondary" onClick={evt => onChangeIdentityProvider(evt, undefined)}>{t('Go back')}</Button>
				<Button className="primary" type="submit" disabled={verifyState?.idTagError !== false || verifyState?.appDomainError !== false || passwordError}>{t('Sign up')}</Button>
			</footer>
		</> }

		{/* Domain-based identity choosen */}
		{/*********************************/}
		{ (!progress || progress == 'vfy') && identityProvider == 'domain' && <>
			<Trans i18nKey="REGISTER-FORM">
				<h3 className="my-3">Choose your Identity</h3>
				<p className="pb-2">
					Enter your chosen Identity Tag in the box below. Your Identity Tag can be any domain name you control, it does not matter if you already use it for a website. Choose wisely, because you'll not be able to easily change it later.
				</p>
				<p><button type="button" className="c-link text-primary" onClick={onClickDomainInfo}>Read more!</button></p>
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
				{ verifyState?.idTagError == 'invalid' && <Trans i18nKey="REGISTER-FORM-ID-TAG-INVALID">
					<div className="c-panel error mt-2">
						<p>The provided Identity Tag is not valid. Are you sure you provided a valid domain name?</p>
					</div>
				</Trans>}
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

			<Trans i18nKey="REGISTER-FORM">
				<p className="my-1">
					You also need to choose an App Domain which you will use to access your Cloudillo Application. It is often the same as your Identity Tag (if you don't run an other webpage on it), but you can use a subdomain, or any other domain if you want.
				</p>
			</Trans>

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
					{ !progress && idTag && verifyState?.appDomainError == false && <IcOk className="text-success my-auto f-none"/> }
					{ !progress && idTag && verifyState?.appDomainError == 'nodns' && <IcError className="text-warning my-auto f-none"/> }
					{ !progress && idTag && verifyState?.appDomainError && verifyState?.appDomainError != 'nodns' && <IcError className="text-error my-auto f-none"/> }
				</div>
				{ verifyState?.appDomainError == 'invalid' && <Trans i18nKey="REGISTER-FORM-APP-INVALID">
					<div className="c-panel error mt-2">
						<p>The provided application domain is not valid. Are you sure you provided a valid domain name?</p>
					</div>
				</Trans>}
				{ verifyState?.appDomainError == 'used' && <Trans i18nKey="REGISTER-FORM-APP-USED">
					<div className="c-panel error mt-2">
						<p>The provided app domain address is already in use.</p>
					</div>
				</Trans>}
				{ verifyState?.appDomainError == 'nodns' && <Trans i18nKey="REGISTER-FORM-APP-IP-NOT-REG">
					<div className="c-panel warning mt-2">
						<p>The provided Application Domain is not registered in the Domain Name System.
							You should make the changes below in your domain and try again.</p>
					</div>
				</Trans>}
				{ verifyState?.appDomainError == 'ip' && !appDomain && <Trans i18nKey="REGISTER-FORM-APP-IP-DIFF">
					<div className="c-panel error mt-2">
						<p>The Identity Tag you provided appears to be already in use (perhaps for an existing website).
						</p><p>This means you likely <b>won’t be able to use it as your Cloudillo App site</b>. You can either choose a subdomain (e.g., <b>cloudillo.cloudillo.net</b>) or use a different address.</p>
						<p><button type="button" className="c-link text-primary" onClick={onClickDomainInfo}>Read more!</button></p>
					</div>
				</Trans>}
				{ verifyState?.appDomainError == 'ip' && appDomain && <Trans i18nKey="REGISTER-FORM-APP-IP-DIFF">
					<div className="c-panel error mt-2">
						<h4 className="mb-2">Are you sure?</h4>
						<p>The provided App Domain is registered in the Domain Name System, but it points to a different IP address ({verifyState.appIp}).
							If you are sure about using this Identity Tag, you should make the changes below in your domain and try again.</p>
					</div>
				</Trans>}
			</label>

			{ idTag && verifyState?.idTagError != 'used' && verifyState?.appDomainError != 'used'
				&& (verifyState?.idTagError == 'nodns' || verifyState?.idTagError == 'ip' || verifyState?.appDomainError == 'nodns' || verifyState?.appDomainError == 'ip') && <div className="my-3">
				<h4 className="mb-2">DNS instructions</h4>
				<p>Please make the following changes in your domain's DNS settings to use it as your Cloudillo Identity.
					If you don't know what to do with it, don't panic! Send the instructions to your system administrator or webmaster:</p>
				<p>After the changes are made, you can get back here and continue with the registration.</p>
				<pre className="c-panel success">
					cl-o.{idTag.padEnd(20, ' ')} IN A {verifyState?.ip[0] + '\n'}
					{(appDomain || idTag).padEnd(25, ' ')} IN A {verifyState?.ip[0]}
				</pre>
			</div> }

			{ (verifyState?.idTagError == false && verifyState?.appDomainError == false) && <>
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
						<button type="button" className="c-link p-2" onClick={() => setPasswordVisible(!passwordVisible)}>
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
				<Button className="container-secondary" onClick={evt => onChangeIdentityProvider(evt, undefined)}>{t('Go back')}</Button>
				<Button className="primary me-2" type="submit" disabled={verifyState?.idTagError !== false && verifyState?.appDomainError !== false || passwordError}>{t('Sign up')}</Button>
			</footer>
		</> }

		{/* In progress */}
		{/***************/}
		{ progress == 'reg' && <>
			<header><h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1></header>
			<div className="c-vbox align-items-center">
				<CloudilloLogo className="c-logo w-50 ps-3 pb-w fast"/>
			</div>
			<h3 className="my-3">{t('Registration is in progress')}</h3>
			<p>{t('This usually takes only 10-20 seconds, please be patient...')}</p>
		</> }

		{/* Check App domain*/}
		{/*******************/}
		{ progress == 'check' && <>
			<header><h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1></header>
			<div className="c-vbox align-items-center">
				<CloudilloLogo className="c-logo w-50 ps-3 pb-w fast"/>
			</div>
			<h3 className="my-3">{t('Registration is successful')}</h3>
			<p>{t('Checking app domain...')}</p>
		</> }

		{/* Registration success */}
		{/************************/}
		{ progress == 'done' && <>
			<header><h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1></header>
			<div className="c-vbox align-items-center p-5">
				<CloudilloLogo className="c-logo w-50 ps-3 pb-w fast"/>
				<h3 className="my-3">{t('Your registration was successful.')}</h3>
				<p>{t('You can now log in using your App domain')}</p>
			</div>
			<div className="c-group">
				<a className="c-button primary" href={`https://${appDomain || (identityProvider == 'domain' ? idTag : idTag + '.cloudillo.net')}`}>{t('Proceed to')} {appDomain || (identityProvider == 'domain' ? idTag : idTag + '.cloudillo.net')}</a>
			</div>
		</> }

		{/* Wait for DNS */}
		{/****************/}
		{ progress == 'wait-dns' && <>
			<header><h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1></header>
			<div className="c-vbox align-items-center p-5">
				<CloudilloLogo className="c-logo w-50 ps-3 pb-w"/>
				<h3 className="my-3">{t('Your registration was successful.')}</h3>
				<p>{t('However we could not verify the availability of your App domain. If you just created it in the domain name system then it can be normal, because the domain name system needs some time to propagate changes.')}</p>
				<p>{t('Please wait some time (it can take a few hours) and try to log in on your app domain later. It can be a few hours.')}</p>
			</div>
			<div className="c-group">
				<a className="c-button primary" href={`https://${appDomain || (identityProvider == 'domain' ? idTag : idTag + '.cloudillo.net')}`}>{t('Proceed to')} {appDomain || (identityProvider == 'domain' ? idTag : idTag + '.cloudillo.net')}</a>
			</div>
		</> }

		{/* Registration error */}
		{/**********************/}
		{ progress == 'error' && <>
			<header><h1 className="mb-3">{t('Something went wrong!')}</h1></header>
			<div className="c-vbox align-items-center p-5">
				<CloudilloLogo className="c-logo w-50 ps-3 pb-w"/>
				<h3 className="my-3">{t('Your registration was unsuccessful.')}</h3>
				<p>{t('Please contact us, we try our best to fix the problem.')}</p>
			</div>
		</> }
	</form>
}

// vim: ts=4
