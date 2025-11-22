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
	LuAtSign as IcAt,
	LuRefreshCw as IcLoading,
	LuCheck as IcOk,
	LuTriangleAlert as IcError,
	LuDoorOpen as IcSignUp,
	LuChevronsLeft as IcGoBack

} from 'react-icons/lu'

import { useAuth, AuthState, useApi, useDialog, Button } from '@cloudillo/react'
import * as Types from '@cloudillo/base'

import { CloudilloLogo } from '../logo.js'
//import { webAuthnLogin } from './auth.js'

/////////////
// Helpers //
/////////////
function validIdentityTag(idTag: string) {
	return idTag.match(/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*$/)
}

///////////////////////////
// ProviderSelectionStep //
///////////////////////////
interface ProviderSelectionStepProps {
	onSelectProvider: (provider: 'idp' | 'domain') => void
}

function ProviderSelectionStep({ onSelectProvider }: ProviderSelectionStepProps) {
	const { t } = useTranslation()
	const dialog = useDialog()

	async function onClickIdentityInfo() {
		await dialog.tell(t('What is Identity?'), t('REGISTER-FORM-IDENTITY-INFO',
`Identification is essential on any platform where you make connections with others.

On most platforms, identity is controlled by the platform owner, leaving you no choice but to rely on their system. Cloudillo is different — it's open, with no central owner, giving you the freedom to choose your identity provider.

Cloudillo's identity system uses the Domain Name System (DNS) — the same system that the entire internet relies on for websites, emails and other services. While it involves some reliance on a provider, DNS is globally trusted and decentralized, making it a balanced and practical choice.

If you own a **domain name**, you can use it as your Cloudillo Identity (we prefix the domain with **"@"**, e.g., **@yourdomain.com**). You can create unlimited sub-identities using subdomains (e.g., **@alice.yourdomain.com**, **@bob.yourdomain.com**).

As an alternative you can use the **Cloudillo Identity Provider**, which is a service provided by the company behind the development of Cloudillo. Whit this you can use an Identity in the form **@yourname.cloudillo.net**. While it means trusting Cloudillo with your identity, **you still control where your data is stored** — unlike on most platforms.

Think of your identity as your **address** — it help others find and connect with you. This makes it possible for Cloudillo users to move their data freely from one storage provider to an other.`))
	}

	return <>
		<CloudilloLogo className="c-logo w-50 float-right ps-3 pb-3 slow"/>
		<header><h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1></header>

		<Trans i18nKey="REGISTER-FORM">
			<h3 className="my-3">Choose your Identity</h3>
			<p className="pb-2">
				Unlike traditional platforms that take control over your identity causing vendor lock-in,
				Cloudillo lets you choose your identity provider.
				It's an open platform with no central owner.
			</p><p className="pb-2">
				Cloudillo uses the Domain Name System (DNS),
				a widely trusted system, to manage identities.
			</p>
			<p><button type="button" className="c-link text text-primary" onClick={onClickIdentityInfo}>What is this identity thing and why should you care?</button></p>
			<h3 className="my-3">Pick an Option</h3>
		</Trans>

		<div className="c-container"><div className="row g-3">
			<div className="col col-md-6 c-panel primary mb-2">
				<Trans i18nKey="REGISTER-FORM-IDENTITY-PROVIDER">
					<h4>Use Cloudillo's Identity Provider (fast & easy)</h4>
					<p>Perfect if you want to start quickly or just explore Cloudillo.</p>
					<hr className="w-100"/>
					<ul className="ms-3">
						<li><em>@john.<b>cloudillo.net</b></em></li>
						<li><em>@johndoe.<b>cloudillo.net</b></em></li>
					</ul>
					<hr className="w-100"/>
					<p><b>Note:</b> Cloudillo IDs are free for now, but may require a small (€3/year) donation in the future to support the platform.</p>
				</Trans>
				<div className="h-100"/>
				<div className="c-group">
					<Button className="primary" onClick={() => onSelectProvider('idp')}>{t("Use Cloudillo's Identity Provider")}</Button>
				</div>
			</div><div className="col col-md-6 c-panel secondary mb-2">
				<Trans i18nKey="REGISTER-FORM-DOMAIN">
					<h4>Use your own domain name (more control & branding)</h4>
					<p>Great for businesses or users who want full control over their own identity.</p>
					<hr className="w-100"/>
					<ul className="ms-3">
						<li><em>@<b>yourdomain.com</b></em></li>
						<li><em>@john.<b>yourdomain.com</b></em></li>
					</ul>
					<hr className="w-100"/>
					<p><b>Setup Required:</b> You'll need to configure your domain provider, but we'll guide you through it. This small initial effort pays off by making it easier to build trust in the long run.</p>
				</Trans>
				<div className="h-100"/>
				<div className="c-group">
					<Button className="secondary" onClick={() => onSelectProvider('domain')}>{t("Use your own domain name")}</Button>
				</div>
			</div>
		</div></div>
	</>
}

/////////////////////////
// IdpRegistrationForm //
/////////////////////////
interface IdpRegistrationFormProps {
	identityProviders: string[]
	selectedProvider: string
	setSelectedProvider: (provider: string) => void
	idTagInput: string
	setIdTagInput: (value: string) => void
	email: string
	setEmail: (value: string) => void
	verifyState: Types.RegisterVerifyResult | undefined
	progress: 'vfy' | undefined
	onVerify: (changed: 'idTag' | 'appDomain', idTag: string, provider?: string, appDomain?: string) => void
	onSubmit: (evt: React.FormEvent) => void
	onGoBack: () => void
}

function IdpRegistrationForm({
	identityProviders,
	selectedProvider,
	setSelectedProvider,
	idTagInput,
	setIdTagInput,
	email,
	setEmail,
	verifyState,
	progress,
	onVerify,
	onSubmit,
	onGoBack
}: IdpRegistrationFormProps) {
	const { t } = useTranslation()

	// When custom is selected (empty string), user types full identity tag (e.g., alice.example.com)
	const isCustom = selectedProvider === ''
	const isCustomProviderValid = !isCustom || (idTagInput && idTagInput.includes('.'))

	return <>
		<CloudilloLogo className={'c-logo w-50 float-right ps-3 pb-3' + (progress == 'vfy' ? ' fast' : ' slow')}/>
		<header><h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1></header>

		<h3 className="my-3">{t('Choose your Identity')}</h3>
		<p>{t('Enter your chosen Identity in the box below. Choose wisely, because changing it later will not be easy.')}</p>

		<label className="d-block my-3">{t('Identity Tag')}
			{ !isCustom && <div className="c-input-group">
				<div className="c-button icon"><IcAt/></div>
				<input className="c-input"
					name="idTag"
					onChange={(evt: React.ChangeEvent<HTMLInputElement>) => {
						setIdTagInput(evt.target.value)
						onVerify('idTag', evt.target.value, selectedProvider)
					}}
					value={idTagInput}
					placeholder={t('Choose a name')}
					aria-label={t('Identity Tag')}
				/>
				{ progress == 'vfy' && <IcLoading className="animate-rotate-cw my-auto f-none"/> }
				{ !progress && idTagInput && verifyState?.idTagError === '' && <IcOk className="text-success my-auto f-none"/> }
				{ !progress && idTagInput && verifyState?.idTagError && <IcError className="text-error my-auto f-none"/> }
				<div className="c-button">.</div>
				<select className="c-button"
					name="provider"
					onChange={(evt: React.ChangeEvent<HTMLSelectElement>) => {
						setSelectedProvider(evt.target.value)
						setIdTagInput('')
					}}
					value={selectedProvider}
					aria-label={t('Identity Provider')}
					style={{ flexGrow: 0, width: 'auto', minWidth: '150px' }}
				>
					{identityProviders.map(provider => (
						<option key={provider} value={provider}>{provider}</option>
					))}
					<option value="">{t('Custom...')}</option>
				</select>
			</div> }
			{ isCustom && <div className="c-input-group pe-2">
				<div className="c-button icon"><IcAt/></div>
				<input className="c-input"
					name="idTag"
					onChange={(evt: React.ChangeEvent<HTMLInputElement>) => {
						setIdTagInput(evt.target.value)
						if (evt.target.value.includes('.')) {
							onVerify('idTag', evt.target.value, '')
						}
					}}
					value={idTagInput}
					placeholder={t('alice.example.com')}
					aria-label={t('Identity Tag')}
				/>
				{ progress == 'vfy' && <IcLoading className="animate-rotate-cw my-auto f-none"/> }
				{ !progress && idTagInput && verifyState?.idTagError === '' && <IcOk className="text-success my-auto f-none"/> }
				{ !progress && idTagInput && verifyState?.idTagError && <IcError className="text-error my-auto f-none"/> }
				<button type="button" className="c-button" onClick={() => {
					setSelectedProvider(identityProviders[0] || 'cloudillo.net')
					setIdTagInput('')
				}}>{t('Back')}</button>
			</div> }
			{ verifyState?.idTagError == 'invalid' && <div className="c-panel error mt-2">
				<p>{t('REGISTER-FORM-ID-TAG-INVALID', 'The provided Identity Tag is not valid. Are you sure you provided a valid domain name?')}</p>
			</div> }
			{ verifyState?.idTagError == 'used' && <div className="c-panel error mt-2">
				<p>{t('REGISTER-FORM-ID-TAG-USED', 'The provided Identity Tag is already in use.')}</p>
			</div> }
			{ isCustom && idTagInput && !idTagInput.includes('.') && <div className="c-panel warning mt-2">
				<p>{t('REGISTER-FORM-CUSTOM-PROVIDER-INVALID', 'Please enter a full identity tag with at least one dot (e.g., alice.example.com)')}</p>
			</div> }
		</label>

		<label className="d-block my-3">{t('Contact email')}
			<input className="c-input px-3"
				name="email"
				onChange={(evt: React.ChangeEvent<HTMLInputElement>) => setEmail(evt.target.value)}
				value={email}
				placeholder={t('your@email.address')}
				aria-label={t('Email address')}
			/>
		</label>

		<footer className="c-group g-2 mt-2">
			<Button className="container-secondary" onClick={onGoBack}><IcGoBack/>{t('Go back')}</Button>
			<Button className="primary" type="submit" disabled={!isCustomProviderValid || verifyState?.idTagError !== '' || !email}><IcSignUp/>{t('Sign up')}</Button>
		</footer>
	</>
}

////////////////////////////
// DomainRegistrationForm //
////////////////////////////
interface DomainRegistrationFormProps {
	idTagInput: string
	setIdTagInput: (value: string) => void
	appDomain: string
	setAppDomain: (value: string) => void
	email: string
	setEmail: (value: string) => void
	verifyState: Types.RegisterVerifyResult | undefined
	progress: 'vfy' | undefined
	onVerify: (changed: 'idTag' | 'appDomain', idTag: string, provider?: string, appDomain?: string) => void
	onSubmit: (evt: React.FormEvent) => void
	onGoBack: () => void
}

function DomainRegistrationForm({
	idTagInput,
	setIdTagInput,
	appDomain,
	setAppDomain,
	email,
	setEmail,
	verifyState,
	progress,
	onVerify,
	onSubmit,
	onGoBack
}: DomainRegistrationFormProps) {
	const { t } = useTranslation()
	const dialog = useDialog()

	async function onClickDomainInfo() {
		await dialog.tell(t('Cloudillo Identity with Your Own Domain'), t('REGISTER-FORM-DOMAIN-INFO',
`To use Cloudillo with your own domain, you need two things:

1. **A Cloudillo Identity** – This is used by others to find and connect with you. It's based on a domain you own but doesn't interfere with your existing website. The Identity is usually prefixed with **"@"** and is called an **Identity Tag**.

2. **An App Domain** – The unique address where you access your Cloudillo application. Unlike most platforms with a single global URL, Cloudillo provides a personalized address for each user. Your App Domain can be the same as your Identity domain but doesn't have to be.

### Examples:

**Example 1:** You own **mycompany.com** and want to use a subdomain, **@ceo.mycompany.com** as your Cloudillo Identity. Since **ceo.mycompany.com** isn't used for a website, you can also use it as your App Domain.

**Example 2:** You want **@mycompany.com** as your Cloudillo Identity, but your website already uses **mycompany.com**. In this case, you'll need a separate App Domain, like **cloudillo.mycompany.com**.
`))
	}

	return <>
		<CloudilloLogo className={'c-logo w-50 float-right ps-3 pb-3' + (progress == 'vfy' ? ' fast' : ' slow')}/>
		<header><h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1></header>

		<h3 className="my-3">{t('Choose your Identity')}</h3>
		<p className="pb-2">
			{t('REGISTER-FORM-ID-TAG', "Enter your chosen Identity Tag in the box below. Your Identity Tag can be any domain name you control, it does not matter if you already use it for a website. Choose wisely, because you'll not be able to easily change it later.")}
		</p>
		<p><button type="button" className="c-link text text-primary" onClick={onClickDomainInfo}>{t('Read more')}</button></p>

		<label className="d-block my-3">{t('Identity Tag (domain name)')}
			<div className="c-input-group pe-2">
				<div className="c-button icon"><IcAt/></div>
				<input className="c-input"
					name="idTag"
					onChange={(evt: React.ChangeEvent<HTMLInputElement>) => {
						setIdTagInput(evt.target.value)
						onVerify('idTag', evt.target.value, appDomain)
					}}
					value={idTagInput}
					placeholder={t('your.identity.tag')}
					aria-label={t('Identity Tag')}
				/>
				{ progress == 'vfy' && <IcLoading className="animate-rotate-cw my-auto f-none"/> }
				{ !progress && idTagInput && verifyState?.idTagError === '' && <IcOk className="text-success my-auto f-none"/> }
				{ !progress && idTagInput && verifyState?.idTagError == 'nodns' && <IcError className="text-warning my-auto f-none"/> }
				{ !progress && idTagInput && verifyState?.idTagError && verifyState.idTagError != 'nodns' && <IcError className='text-error my-auto f-none'/> }
			</div>
			{ verifyState?.idTagError == 'invalid' && <div className="c-panel error mt-2">
				<p>{t('REGISTER-FORM-ID-TAG-INVALID', 'The provided Identity Tag is not valid. Are you sure you provided a valid domain name?')}</p>
			</div> }
			{ verifyState?.idTagError == 'used' && <div className="c-panel error mt-2">
				<p>{t('REGISTER-FORM-ID-TAG-USED', 'The provided Identity Tag is already in use.')}</p>
			</div> }
			{ verifyState?.idTagError == 'nodns' && <div className="c-panel warning mt-2">
				<p>{t('REGISTER-FORM-ID-TAG-NOT-REG', 'The provided Identity Tag is not registered in the Domain Name System. You should make the changes below in your domain and try again.')}</p>
			</div> }
			{ verifyState?.idTagError == 'address' && <div className="c-panel warning mt-2">
				<h4 className="mb-2">{t('Are you sure?')}</h4>
				<p>{t('REGISTER-FORM-ID-TAG-IP-DIFF', 'The provided Identity Tag is registered in the Domain Name System, but it points to a different IP address ({{apiIp}}). If you are sure about using this Identity Tag, you should make the changes below in your domain and try again.', { apiIp: verifyState.apiAddress })}</p>
			</div> }
		</label>

		<p className="my-1">{t('REGISTER-FORM-APP-DOMAIN', "You also need to choose an App Domain which you will use to access your Cloudillo Application. It is often the same as your Identity Tag (if you don't run an other webpage on it), but you can use a subdomain, or any other domain if you want.")}</p>

		<label className="d-block my-3">{t('App domain')}
			<div className="c-input-group px-2">
				<input className="c-input"
					name="app-domain"
					onChange={(evt: React.ChangeEvent<HTMLInputElement>) => {
						setAppDomain(evt.target.value)
						onVerify('appDomain', idTagInput, evt.target.value)
					}}
					value={appDomain}
					placeholder={idTagInput || t('your.app.domain')}
					aria-label={t('Identity Tag')}
				/>
				{ progress == 'vfy' && <IcLoading className="animate-rotate-cw my-auto f-none"/> }
				{ !progress && idTagInput && verifyState?.appDomainError === '' && <IcOk className="text-success my-auto f-none"/> }
				{ !progress && idTagInput && verifyState?.appDomainError == 'nodns' && <IcError className="text-warning my-auto f-none"/> }
				{ !progress && idTagInput && verifyState?.appDomainError && verifyState?.appDomainError != 'nodns' && <IcError className="text-error my-auto f-none"/> }
			</div>
			{ verifyState?.appDomainError == 'invalid' && <div className="c-panel error mt-2">
				<p>{t('REGISTER-FORM-APP-INVALID', 'The provided application domain is not valid. Are you sure you provided a valid domain name?')}</p>
			</div> }
			{ verifyState?.appDomainError == 'used' && <div className="c-panel error mt-2">
				<p>{t('REGISTER-FORM-APP-USED', 'The provided app domain address is already in use.')}</p>
			</div> }
			{ verifyState?.appDomainError == 'nodns' && <div className="c-panel warning mt-2">
				<p>{t('REGISTER-FORM-APP-IP-NOT-REG', 'The provided Application Domain is not registered in the Domain Name System. You should make the changes below in your domain and try again.')}</p>
			</div> }
			{ verifyState?.appDomainError == 'address' && !appDomain && <Trans i18nKey="REGISTER-FORM-APP-EMPTY-IP-DIFF" values={{ idTag: idTagInput }}>
				<div className="c-panel error mt-2">
					<p>The Identity Tag you provided appears to be already in use (perhaps for an existing website).
					</p><p>This means you likely <b>won't be able to use it as your Cloudillo App site</b>. You can either choose a subdomain (e.g., <b>cloudillo.{idTagInput}</b>) or use a different address.</p>
					<p><button type="button" className="c-link text text-primary" onClick={onClickDomainInfo}>Read more</button></p>
				</div>
			</Trans> }
			{ verifyState?.appDomainError == 'address' && appDomain && <div className="c-panel error mt-2">
				<h4 className="mb-2">{t('Are you sure?')}</h4>
				<p>{t('REGISTER-FORM-APP-IP-DIFF', 'The provided App Domain is registered in the Domain Name System, but it points to a different IP address ({{appIp}}). If you are sure about using this Identity Tag, you should make the changes below in your domain and try again.', { appIp: verifyState.appAddress})}</p>
			</div> }
		</label>

		{ idTagInput && verifyState?.idTagError != 'used' && verifyState?.appDomainError != 'used'
			&& (verifyState?.idTagError == 'nodns' || verifyState?.idTagError == 'address' || verifyState?.appDomainError == 'nodns' || verifyState?.appDomainError == 'address') && <div className="my-3">
			<h4 className="mb-2">{t('DNS instructions')}</h4>
			<p>{t("Please make the following changes in your domain's DNS settings to use it as your Cloudillo Identity. If you don't know what to do with it, don't panic! Send the instructions to your system administrator or webmaster:")}</p>
			<p>{t("After the changes are made, you can get back here and continue with the registration.")}</p>
			<pre className="c-panel success">
				cl-o.{idTagInput.padEnd(20, ' ')} IN A {verifyState!.address[0] + '\n'}
				{(appDomain || idTagInput).padEnd(25, ' ')} IN A {verifyState!.address[0]}
			</pre>
		</div> }

		{ (verifyState?.idTagError === '' && verifyState?.appDomainError === '') && <>
			<label className="my-3">{t('Email address')}
				<input className="c-input px-3 mb-3"
					name="email"
					onChange={(evt: React.ChangeEvent<HTMLInputElement>) => setEmail(evt.target.value)}
					value={email}
					placeholder={t('your@email.address')}
					aria-label={t('Email address')}
				/>
			</label>
		</> }

		<footer className="c-group g-2 mt-2">
			<Button className="container-secondary" onClick={onGoBack}><IcGoBack/>{t('Go back')}</Button>
			<Button className="primary me-2" type="submit" disabled={verifyState?.idTagError !== '' || verifyState?.appDomainError !== '' || !email}><IcSignUp/>{t('Sign up')}</Button>
		</footer>
	</>
}

//////////////////
// RegisterForm //
//////////////////

export function RegisterForm() {
	const { t } = useTranslation()
	const { api } = useApi()
	const { token, providerType } = useParams<{ token: string, providerType?: 'idp' | 'domain' }>()
	const navigate = useNavigate()
	const [auth, setAuth] = useAuth()

	const [show, setShow] = React.useState<boolean | undefined>()
	const [identityProviders, setIdentityProviders] = React.useState<string[]>([])
	const identityProvider = providerType
	const [selectedProvider, setSelectedProvider] = React.useState<string>('cloudillo.net')
	// FIXME: Remove this default email and make it empty string for production
	const [email, setEmail] = React.useState('szilu@w9.hu')
	const [idTagInput, setIdTagInput] = React.useState('')
	const [appDomain, setAppDomain] = React.useState('')
	const [verifyState, setVerifyState] = React.useState<Types.RegisterVerifyResult | undefined>()
	const [progress, setProgress] = React.useState<undefined | 'vfy' | 'reg' | 'check' | 'done' | 'wait-dns' | 'error'>()
	const [error, setError] = React.useState<string | undefined>()

	// Initial verification to check if token is valid
	React.useEffect(function () {
		console.log('RegisterForm.useEffect', api?.idTag)
		if (!api?.idTag) return
		(async function () {
			console.log('RegisterForm.useEffect', api?.idTag)
			try {
				const res = await api!.request('POST', '/auth/register-verify', Types.tRegisterVerifyResult, {
					data: { type: 'ref', idTag: '', token }
				})
				console.log('REF VERIFY RES', res)
				setShow(true)
				const providers = res.identityProviders && res.identityProviders.length > 0 ? res.identityProviders : ['cloudillo.net']
				setIdentityProviders(providers)
				setSelectedProvider(providers[0])
			} catch (err) {
				console.log('ERROR', err)
				setShow(false)
			}
		})()
	}, [api])

	// Provider selection handler
	function onSelectProvider(provider: 'idp' | 'domain') {
		setIdTagInput('')
		setAppDomain('')
		setVerifyState(undefined)
		navigate(`/register/${token}/${provider}`)
	}

	// Go back handler
	function onGoBack() {
		setIdTagInput('')
		setAppDomain('')
		setVerifyState(undefined)
		navigate(`/register/${token}`)
	}

	console.log('VERIFY STATE', verifyState)
	const onChangeVerify = React.useCallback(debounce((async function onVerify(changed: 'idTag' | 'appDomain', idTag: string, provider?: string, appDomain?: string) {
		if (!idTag || !api) return

		const effectiveProvider = provider || selectedProvider

		setProgress('vfy')
		console.log('ON VERIFY', changed, idTag, effectiveProvider, appDomain)
		if (changed == 'appDomain') setVerifyState(vs => !vs ? undefined : { ...vs, appDomainError: '' })
			else setVerifyState(undefined)
		try {
			const res = await api.request('POST', '/auth/register-verify', Types.tRegisterVerifyResult, {
				data: {
					type: identityProvider,
					idTag: identityProvider == 'domain' ? idTag
						: effectiveProvider ? idTag + '.' + effectiveProvider
						: idTag,
					appDomain, token
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
	}).bind(null), 500), [identityProvider, selectedProvider, token, api])

	async function onSubmit(evt: React.FormEvent) {
		evt.preventDefault()
		if (!api) return
		setProgress('reg')
		// For custom provider (empty string), idTagInput already contains the full tag (e.g., alice.example.com)
		const fullIdTag = identityProvider == 'domain' ? idTagInput
			: selectedProvider === '' ? idTagInput
			: idTagInput + '.' + selectedProvider

		try {
			const res = await api.request('POST', '/auth/register', T.any, {
				data: {
					type: identityProvider,
					idTag: fullIdTag,
					appDomain,
					email,
					token
				}
			})
			console.log('RES', res)
			setProgress('check')

			try {
				const checkRes = await fetch(`https://${appDomain || idTagInput}/.well-known/cloudillo/id-tag`)
				if (checkRes.ok) {
					const j = await checkRes.json()
					if (j.idTag == fullIdTag) {
						setProgress('done')
					} else {
						setProgress('wait-dns')
					}
				} else {
					setProgress('wait-dns')
				}
			} catch (err) {
				console.log('ERROR checking domain', err)
				setProgress('wait-dns')
			}
		} catch (err) {
			console.log('ERROR during registration', err)
			setError(err instanceof Error ? err.message : 'Registration failed')
			setProgress('error')
		}
	}

	// Invalid token
	if (show == undefined) return
	if (!show) return <div className="c-panel">
		<CloudilloLogo className="c-logo w-50 float-right ps-3 pb-3 slow"/>
		<header><h1 className="mb-3">{t('This registration link is invalid!')}</h1></header>
	</div>

	// Render the appropriate step
	return <form className="c-panel d-block p-4" onSubmit={onSubmit}>
		{/* Provider selection step */}
		{ (!progress || progress == 'vfy') && !identityProvider && <ProviderSelectionStep onSelectProvider={onSelectProvider} /> }

		{/* IDP registration form */}
		{ (!progress || progress == 'vfy') && identityProvider == 'idp' && <IdpRegistrationForm
			identityProviders={identityProviders}
			selectedProvider={selectedProvider}
			setSelectedProvider={setSelectedProvider}
			idTagInput={idTagInput}
			setIdTagInput={setIdTagInput}
			email={email}
			setEmail={setEmail}
			verifyState={verifyState}
			progress={progress}
			onVerify={onChangeVerify}
			onSubmit={onSubmit}
			onGoBack={onGoBack}
		/> }

		{/* Domain registration form */}
		{ (!progress || progress == 'vfy') && identityProvider == 'domain' && <DomainRegistrationForm
			idTagInput={idTagInput}
			setIdTagInput={setIdTagInput}
			appDomain={appDomain}
			setAppDomain={setAppDomain}
			email={email}
			setEmail={setEmail}
			verifyState={verifyState}
			progress={progress}
			onVerify={onChangeVerify}
			onSubmit={onSubmit}
			onGoBack={onGoBack}
		/> }

		{/* In progress */}
		{/***************/}
		{ progress == 'reg' && <>
			<header><h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1></header>
			<div className="c-vbox align-items-center">
				<CloudilloLogo className="c-logo w-50 ps-3 pb-w slow"/>
			</div>
			<h3 className="my-3">{t('Registration is in progress')}</h3>
			<p>{t('This usually takes only 10-20 seconds, please be patient...')}</p>
		</> }

		{/* Check App domain*/}
		{/*******************/}
		{ progress == 'check' && <>
			<header><h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1></header>
			<div className="c-vbox align-items-center">
				<CloudilloLogo className="c-logo w-50 ps-3 pb-w slow"/>
			</div>
			<h3 className="my-3">{t('Registration is successful')}</h3>
			<p>{t('Checking app domain...')}</p>
		</> }

		{/* Registration success */}
		{/************************/}
		{ progress == 'done' && <>
			<header><h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1></header>
			<div className="c-vbox align-items-center p-5">
				<CloudilloLogo className="c-logo w-50 ps-3 pb-w slow"/>
				<h3 className="my-3">{t('Your registration was successful.')}</h3>
				<p>{t('You can now log in using your App domain')}</p>
			</div>
			<div className="c-group">
				<a className="c-button primary" href={`https://${appDomain || (identityProvider == 'domain' ? idTagInput : selectedProvider === '' ? idTagInput : idTagInput + '.' + selectedProvider)}`}>{t('Proceed to {{appDomain}}', { appDomain: appDomain || (identityProvider == 'domain' ? idTagInput : selectedProvider === '' ? idTagInput : idTagInput + '.' + selectedProvider) })}</a>
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
				<p>{t('Please wait some time (it can take a few hours) and try to log in on your app domain later.')}</p>
			</div>
			<div className="c-group">
				<a className="c-button primary" href={`https://${appDomain || (identityProvider == 'domain' ? idTagInput : selectedProvider === '' ? idTagInput : idTagInput + '.' + selectedProvider)}`}>{t('Proceed to {{appDomain}}', { appDomain: appDomain || (identityProvider == 'domain' ? idTagInput : selectedProvider === '' ? idTagInput : idTagInput + '.' + selectedProvider) })}</a>
			</div>
		</> }

		{/* Registration error */}
		{/**********************/}
		{ progress == 'error' && <>
			<header><h1 className="mb-3">{t('Something went wrong!')}</h1></header>
			<div className="c-vbox align-items-center p-5">
				<CloudilloLogo className="c-logo w-50 ps-3 pb-w"/>
				<h3 className="my-3">{t('Your registration was unsuccessful.')}</h3>
				{ error && <p className="c-panel error">{error}</p> }
				<p>{t('Please contact the administrator of the server or try again.')}</p>
			</div>
			<div className="c-group">
				<Button className="primary" onClick={() => {
					setProgress(undefined)
					setError(undefined)
				}}>{t('Try again')}</Button>
			</div>
		</> }
	</form>
}

// vim: ts=4
