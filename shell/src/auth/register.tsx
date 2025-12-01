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
import { useTranslation } from 'react-i18next'
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
`Your Cloudillo identity is how others find and connect with you — like an email address.

**Two options:**

1. **Use an Identity Provider** — Get an identity like **@yourname.cloudillo.net**. Quick setup, no technical knowledge needed.

2. **Use your own domain** — Get an identity like **@yourname.com**. Full control over your identity, but requires DNS setup.

Your identity is separate from where your data is stored. You control your data regardless of which option you choose.`))
	}

	return <>
		<CloudilloLogo className="c-logo w-50 float-right ps-3 pb-3 slow"/>
		<header><h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1></header>

		<h3 className="my-3">{t('How would you like to be known?')}</h3>

		<div className="c-container"><div className="row g-3">
			<div className="col col-md-6">
				<div className="c-panel clickable h-100" onClick={() => onSelectProvider('domain')} style={{ cursor: 'pointer' }}>
					<h4 className="mb-2">🌐 {t('Use my own domain as my identity')}</h4>
					<p className="text-muted mb-2">{t("You'll be")} <b>@yourname.com</b></p>
					<p className="small">{t('Full control, requires DNS setup')}</p>
				</div>
			</div>
			<div className="col col-md-6">
				<div className="c-panel primary clickable h-100" onClick={() => onSelectProvider('idp')} style={{ cursor: 'pointer' }}>
					<h4 className="mb-2">⚡ {t('Use an Identity Provider')}</h4>
					<p className="text-muted mb-2">{t("You'll be")} <b>@yourname.provider.net</b></p>
					<p className="small">{t('Quick setup - choose from available providers')}</p>
				</div>
			</div>
		</div></div>

		<p className="text-muted mt-4 small">
			<span className="me-2">ℹ️</span>
			{t('This choice is hard to change later - pick what fits you best.')}
			{' '}
			<button type="button" className="c-link text text-primary small" onClick={onClickIdentityInfo}>{t('Learn more')}</button>
		</p>
	</>
}

/////////////////////////
// ProviderSelectorStep //
/////////////////////////
interface ProviderSelectorStepProps {
	identityProviders: string[]
	providerInfoMap: Record<string, Types.IdpInfo>
	selectedProvider: string
	onSelectProvider: (provider: string) => void
	onProviderInfoFetched: (provider: string, info: Types.IdpInfo) => void
	onContinue: () => void
	onGoBack: () => void
	api: ReturnType<typeof useApi>['api']
}

function ProviderSelectorStep({
	identityProviders,
	providerInfoMap,
	selectedProvider,
	onSelectProvider,
	onProviderInfoFetched,
	onContinue,
	onGoBack,
	api
}: ProviderSelectorStepProps) {
	const { t } = useTranslation()
	const [showCustom, setShowCustom] = React.useState(false)
	const [customProvider, setCustomProvider] = React.useState('')
	const [customProviderState, setCustomProviderState] = React.useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle')
	const [customProviderInfo, setCustomProviderInfo] = React.useState<Types.IdpInfo | undefined>()

	function handleProviderSelect(provider: string) {
		setShowCustom(false)
		setCustomProviderState('idle')
		setCustomProviderInfo(undefined)
		onSelectProvider(provider)
	}

	function handleCustomSelect() {
		setShowCustom(true)
		setCustomProviderState('idle')
		setCustomProviderInfo(undefined)
		onSelectProvider('')
	}

	// Debounced provider check
	const checkCustomProvider = React.useCallback(debounce(async (provider: string) => {
		if (!provider.includes('.') || !api) {
			setCustomProviderState('idle')
			return
		}

		setCustomProviderState('checking')
		try {
			const info = await api.idp.getInfo(provider)
			setCustomProviderState('valid')
			setCustomProviderInfo(info)
			onSelectProvider(provider)
			onProviderInfoFetched(provider, info)
		} catch (e) {
			console.log(`Provider ${provider} is not available`, e)
			setCustomProviderState('invalid')
			setCustomProviderInfo(undefined)
			onSelectProvider('')
		}
	}, 500), [api, onSelectProvider, onProviderInfoFetched])

	function handleCustomChange(value: string) {
		setCustomProvider(value)
		setCustomProviderState('idle')
		setCustomProviderInfo(undefined)
		onSelectProvider('')
		checkCustomProvider(value)
	}

	const isValid = selectedProvider !== '' && (!showCustom || customProviderState === 'valid')

	return <>
		<CloudilloLogo className="c-logo w-50 float-right ps-3 pb-3 slow"/>
		<header><h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1></header>

		<h3 className="my-3">{t('Choose an Identity Provider')}</h3>
		<p className="text-muted mb-3">{t("Your identity will be")} <b>@yourname.{selectedProvider || 'provider.net'}</b></p>

		<div className="c-vbox g-2 mb-3">
			{identityProviders.map((provider, index) => {
				const info = providerInfoMap[provider]
				const isSelected = !showCustom && selectedProvider === provider
				return (
					<div
						key={provider}
						className={`c-panel clickable ${isSelected ? 'primary' : ''}`}
						onClick={() => handleProviderSelect(provider)}
						style={{ cursor: 'pointer' }}
					>
						<div className="d-flex align-items-center">
							<input
								type="radio"
								name="provider"
								checked={isSelected}
								onChange={() => handleProviderSelect(provider)}
								className="me-3"
							/>
							<div className="flex-grow-1">
								<strong>{provider}</strong>
								{index === 0 && <span className="badge bg-secondary ms-2">{t('Default')}</span>}
								{info && (
									<div className={`mt-2 mb-0 ${isSelected ? 'text-lg text-accent font-medium' : 'text-sm text-disabled'}`}>
										{info.info}
									</div>
								)}
								{!info && (
									<div className="mt-2 mb-0 text-sm text-disabled">
										{t('Provider information not available')}
									</div>
								)}
							</div>
						</div>
					</div>
				)
			})}

			{/* Other provider option */}
			<div
				className={`c-panel clickable ${showCustom ? 'primary' : ''}`}
				onClick={handleCustomSelect}
				style={{ cursor: 'pointer' }}
			>
				<div className="d-flex align-items-center">
					<input
						type="radio"
						name="provider"
						checked={showCustom}
						onChange={handleCustomSelect}
						className="me-3"
					/>
					<div className="flex-grow-1">
						<strong>{t('Other provider...')}</strong>
						<p className="text-muted small mb-0">{t('Enter a provider domain you know')}</p>
						{showCustom && (
							<div className="c-input-group mt-2">
								<input
									className="c-input"
									type="text"
									value={customProvider}
									onChange={(e) => handleCustomChange(e.target.value)}
									placeholder={t('example.provider.net')}
									onClick={(e) => e.stopPropagation()}
								/>
								{customProviderState === 'checking' && <IcLoading className="animate-rotate-cw my-auto f-none"/>}
								{customProviderState === 'valid' && <IcOk className="text-success my-auto f-none"/>}
								{customProviderState === 'invalid' && <IcError className="text-error my-auto f-none"/>}
							</div>
						)}
						{showCustom && customProviderState === 'invalid' && (
							<div className="c-panel error mt-2 mb-0 p-2 small">
								{t('This provider is not available or does not support Cloudillo identity.')}
							</div>
						)}
						{showCustom && customProviderState === 'valid' && customProviderInfo && (
							<div className="c-panel info mt-2 mb-0 p-2 small">
								{customProviderInfo.info}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>

		<footer className="c-group g-2 mt-4">
			<Button className="container-secondary" onClick={onGoBack}><IcGoBack/>{t('Back')}</Button>
			<Button className="primary" onClick={onContinue} disabled={!isValid}>{t('Continue with selected provider')}</Button>
		</footer>
	</>
}

/////////////////////////
// IdpRegistrationForm //
/////////////////////////
interface IdpRegistrationFormProps {
	identityProviders: string[]
	selectedProvider: string
	setSelectedProvider: (provider: string) => void
	providerInfo?: Types.IdpInfo
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
	providerInfo,
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

	// When custom provider (contains a dot), user already selected their full provider domain
	const isCustom = selectedProvider.includes('.')
	const providerDomain = isCustom ? selectedProvider : selectedProvider

	return <>
		<CloudilloLogo className={'c-logo w-50 float-right ps-3 pb-3' + (progress == 'vfy' ? ' fast' : ' slow')}/>
		<header><h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1></header>

		<h3 className="my-3">{t('Choose your name on {{provider}}', { provider: providerInfo?.name || selectedProvider })}</h3>
		<p className="text-muted mb-3">{t("You'll be known as")} <b>@{idTagInput || 'yourname'}.{selectedProvider}</b></p>

		<label className="d-block my-3">{t('Your name')}
			<div className="c-input-group">
				<div className="c-button icon"><IcAt/></div>
				<input className="c-input"
					name="idTag"
					onChange={(evt: React.ChangeEvent<HTMLInputElement>) => {
						setIdTagInput(evt.target.value)
						onVerify('idTag', evt.target.value, selectedProvider)
					}}
					value={idTagInput}
					placeholder={t('yourname')}
					aria-label={t('Your name')}
					autoFocus
				/>
				{ progress == 'vfy' && <IcLoading className="animate-rotate-cw my-auto f-none"/> }
				{ !progress && idTagInput && verifyState?.idTagError === '' && <IcOk className="text-success my-auto f-none"/> }
				{ !progress && idTagInput && verifyState?.idTagError && <IcError className="text-error my-auto f-none"/> }
				<div className="c-button">.{selectedProvider}</div>
			</div>
			{ verifyState?.idTagError == 'invalid' && <div className="c-panel error mt-2">
				<p>{t('This name contains invalid characters. Use only letters, numbers, and hyphens.')}</p>
			</div> }
			{ verifyState?.idTagError == 'used' && <div className="c-panel error mt-2">
				<p>{t('This name is already taken. Please try another one.')}</p>
			</div> }
		</label>

		<p className="small">{t('Pick something memorable that represents you.')}</p>

		<label className="d-block my-3">{t('Your email (for account recovery)')}
			<input className="c-input px-3"
				name="email"
				type="email"
				onChange={(evt: React.ChangeEvent<HTMLInputElement>) => setEmail(evt.target.value)}
				value={email}
				placeholder={t('you@example.com')}
				aria-label={t('Email address')}
			/>
		</label>

		{providerInfo && (
			<p className="text-muted small mt-3">
				<span className="me-1">ℹ️</span> {providerInfo.info}
			</p>
		)}

		<footer className="c-group g-2 mt-4">
			<Button className="container-secondary" onClick={onGoBack}><IcGoBack/>{t('Back')}</Button>
			<Button className="primary" type="submit" disabled={verifyState?.idTagError !== '' || !email || !idTagInput}><IcSignUp/>{t('Sign up')}</Button>
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

	// Show DNS instructions when there are DNS issues
	const showDnsInstructions = idTagInput && verifyState?.idTagError != 'used' && verifyState?.appDomainError != 'used'
		&& (verifyState?.idTagError == 'nodns' || verifyState?.idTagError == 'address' || verifyState?.appDomainError == 'nodns' || verifyState?.appDomainError == 'address')

	// Show email field when domain validation passes
	const showEmailField = verifyState?.idTagError === '' && verifyState?.appDomainError === ''

	return <>
		<CloudilloLogo className={'c-logo w-50 float-right ps-3 pb-3' + (progress == 'vfy' ? ' fast' : ' slow')}/>
		<header><h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1></header>

		<h3 className="my-3">{t('Use your domain as your identity')}</h3>

		<label className="d-block my-3">{t('Your domain')}
			<div className="c-input-group pe-2">
				<div className="c-button icon"><IcAt/></div>
				<input className="c-input"
					name="idTag"
					onChange={(evt: React.ChangeEvent<HTMLInputElement>) => {
						setIdTagInput(evt.target.value)
						onVerify('idTag', evt.target.value, appDomain)
					}}
					value={idTagInput}
					placeholder={t('example.com or alice.example.com')}
					aria-label={t('Your domain')}
					autoFocus
				/>
				{ progress == 'vfy' && <IcLoading className="animate-rotate-cw my-auto f-none"/> }
				{ !progress && idTagInput && verifyState?.idTagError === '' && <IcOk className="text-success my-auto f-none"/> }
				{ !progress && idTagInput && (verifyState?.idTagError == 'nodns' || verifyState?.idTagError == 'address') && <IcError className="text-warning my-auto f-none"/> }
				{ !progress && idTagInput && verifyState?.idTagError && verifyState.idTagError != 'nodns' && verifyState.idTagError != 'address' && <IcError className='text-error my-auto f-none'/> }
			</div>
			{ verifyState?.idTagError == 'invalid' && <div className="c-panel error mt-2">
				<p>{t('Please enter a valid domain name (e.g., example.com)')}</p>
			</div> }
			{ verifyState?.idTagError == 'used' && <div className="c-panel error mt-2">
				<p>{t('This domain is already registered with this Cloudillo instance.')}</p>
			</div> }
		</label>

		{idTagInput && verifyState?.idTagError !== 'invalid' && verifyState?.idTagError !== 'used' && <>
			<div className="my-3">
				<label className="d-block">{t('Where will you access Cloudillo?')}
					<p className="text-muted small mb-2">{t("Your identity:")} <b>@{idTagInput}</b> ✓</p>
					<div className="c-input-group px-2">
						<span className="c-button text-muted">{t('App address:')}</span>
						<input className="c-input"
							name="app-domain"
							onChange={(evt: React.ChangeEvent<HTMLInputElement>) => {
								setAppDomain(evt.target.value)
								onVerify('appDomain', idTagInput, evt.target.value)
							}}
							value={appDomain}
							placeholder={idTagInput}
							aria-label={t('App address')}
						/>
						{ progress == 'vfy' && <IcLoading className="animate-rotate-cw my-auto f-none"/> }
						{ !progress && verifyState?.appDomainError === '' && <IcOk className="text-success my-auto f-none"/> }
						{ !progress && (verifyState?.appDomainError == 'nodns' || verifyState?.appDomainError == 'address') && <IcError className="text-warning my-auto f-none"/> }
						{ !progress && verifyState?.appDomainError && verifyState?.appDomainError != 'nodns' && verifyState?.appDomainError != 'address' && <IcError className="text-error my-auto f-none"/> }
					</div>
				</label>
				<p className="text-muted small mt-2">
					💡 {t('Usually the same as your identity domain. Use a subdomain (like app.example.com) only if your main domain already has a website.')}
				</p>
			</div>

			{ verifyState?.appDomainError == 'invalid' && <div className="c-panel error mt-2">
				<p>{t('Please enter a valid domain name.')}</p>
			</div> }
			{ verifyState?.appDomainError == 'used' && <div className="c-panel error mt-2">
				<p>{t('This app address is already in use.')}</p>
			</div> }
			{ verifyState?.appDomainError == 'address' && !appDomain && <div className="c-panel warning mt-2">
				<p>{t('Your identity domain appears to have an existing website. Use a subdomain for Cloudillo (e.g., cloudillo.{{idTag}})', { idTag: idTagInput })}</p>
			</div> }
		</>}

		{ showDnsInstructions && <div className="c-panel warning my-3">
			<h4 className="mb-2">{t('One small step: connect your domain')}</h4>
			<p className="small">{t('Add these records in your domain settings:')}</p>
			<pre className="c-panel bg-light p-2 small" style={{ overflowX: 'auto' }}>
				{`cl-o.${idTagInput.padEnd(20, ' ')} IN A ${verifyState!.address[0]}\n${(appDomain || idTagInput).padEnd(25, ' ')} IN A ${verifyState!.address[0]}`}
			</pre>
			<p className="small text-muted mb-0">
				{t("Where to do this: GoDaddy, Namecheap, Cloudflare → 'DNS Settings'")}
				<br/>
				{t("Not sure? Send this to whoever manages your domain.")}
				<br/>
				{t("Changes can take 5-30 minutes to work.")}
			</p>
		</div> }

		{ showEmailField && <>
			<label className="d-block my-3">{t('Your email (for account recovery)')}
				<input className="c-input px-3"
					name="email"
					type="email"
					onChange={(evt: React.ChangeEvent<HTMLInputElement>) => setEmail(evt.target.value)}
					value={email}
					placeholder={t('you@example.com')}
					aria-label={t('Email address')}
				/>
			</label>
		</> }

		<footer className="c-group g-2 mt-4">
			<Button className="container-secondary" onClick={onGoBack}><IcGoBack/>{t('Back')}</Button>
			<Button className="primary" type="submit" disabled={verifyState?.idTagError !== '' || verifyState?.appDomainError !== '' || !email}><IcSignUp/>{t('Sign up')}</Button>
		</footer>
	</>
}

//////////////////
// RegisterForm //
//////////////////

export function RegisterForm() {
	const { t } = useTranslation()
	const { api } = useApi()
	const { token, providerType, idpStep: idpStepParam } = useParams<{ token: string, providerType?: 'idp' | 'domain', idpStep?: 'select' | 'name' }>()
	const navigate = useNavigate()
	const [auth, setAuth] = useAuth()

	const [show, setShow] = React.useState<boolean | undefined>()
	const [identityProviders, setIdentityProviders] = React.useState<string[]>([])
	// If idpStepParam is present, we're in IDP flow; otherwise use providerType
	const identityProvider = idpStepParam ? 'idp' : providerType
	const [selectedProvider, setSelectedProvider] = React.useState<string>('cloudillo.net')
	const [providerInfoMap, setProviderInfoMap] = React.useState<Record<string, Types.IdpInfo>>({})
	const idpStep = idpStepParam || 'select' // Get IDP step from URL, default to 'select'
	const [email, setEmail] = React.useState('')
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

				// Fetch provider info for each provider (with fallback if API not available)
				const infoMap: Record<string, Types.IdpInfo> = {}
				for (const provider of providers) {
					try {
						const info = await api.idp.getInfo(provider)
						infoMap[provider] = info
					} catch (e) {
						// Provider info not available, use default
						console.log(`Provider info not available for ${provider}`)
					}
				}
				setProviderInfoMap(infoMap)
			} catch (err) {
				console.log('ERROR', err)
				setShow(false)
			}
		})()
	}, [api])

	// Gateway selection handler (IDP vs Domain)
	function onSelectProviderType(provider: 'idp' | 'domain') {
		setIdTagInput('')
		setAppDomain('')
		setVerifyState(undefined)
		if (provider === 'idp') {
			navigate(`/register/${token}/idp/select`)
		} else {
			navigate(`/register/${token}/${provider}`)
		}
	}

	// IDP provider selection continue handler
	function onIdpProviderContinue() {
		setIdTagInput('')
		setVerifyState(undefined)
		navigate(`/register/${token}/idp/name`)
	}

	// Go back handler
	function onGoBack() {
		if (identityProvider === 'idp' && idpStep === 'name') {
			// Go back to provider selection
			setIdTagInput('')
			setVerifyState(undefined)
			navigate(`/register/${token}/idp/select`)
		} else {
			// Go back to gateway
			setIdTagInput('')
			setAppDomain('')
			setVerifyState(undefined)
			navigate(`/register/${token}`)
		}
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

			// For IDP registration, construct the proper app domain
			const checkDomain = appDomain || (identityProvider == 'domain' ? idTagInput : selectedProvider === '' ? idTagInput : idTagInput + '.' + selectedProvider)

			try {
				const checkRes = await fetch(`https://${checkDomain}/.well-known/cloudillo/id-tag`)
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
		{/* Gateway: Choose IDP vs Domain */}
		{ (!progress || progress == 'vfy') && !identityProvider && <ProviderSelectionStep onSelectProvider={onSelectProviderType} /> }

		{/* IDP flow - Step 1: Provider selection */}
		{ (!progress || progress == 'vfy') && identityProvider == 'idp' && idpStep === 'select' && <ProviderSelectorStep
			identityProviders={identityProviders}
			providerInfoMap={providerInfoMap}
			selectedProvider={selectedProvider}
			onSelectProvider={setSelectedProvider}
			onProviderInfoFetched={(provider, info) => setProviderInfoMap(prev => ({ ...prev, [provider]: info }))}
			onContinue={onIdpProviderContinue}
			onGoBack={onGoBack}
			api={api}
		/> }

		{/* IDP flow - Step 2: Name selection */}
		{ (!progress || progress == 'vfy') && identityProvider == 'idp' && idpStep === 'name' && <IdpRegistrationForm
			identityProviders={identityProviders}
			selectedProvider={selectedProvider}
			setSelectedProvider={setSelectedProvider}
			providerInfo={providerInfoMap[selectedProvider]}
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
				<p>{t('We have sent an onboarding link to your email address. Please check your inbox to continue setting up your account.')}</p>
				{identityProvider == 'idp' && <p className="text-muted small">{t('It may take up to an hour before your account is fully ready.')}</p>}
				{identityProvider == 'domain' && <p className="text-muted small">{t('If you set up custom DNS records, it may take some time for changes to propagate.')}</p>}
				<p className="text-muted small">{t('You can close this page now.')}</p>
			</div>
		</> }

		{/* Wait for DNS */}
		{/****************/}
		{ progress == 'wait-dns' && <>
			<header><h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1></header>
			<div className="c-vbox align-items-center p-5">
				<CloudilloLogo className="c-logo w-50 ps-3 pb-w"/>
				<h3 className="my-3">{t('Your registration was successful.')}</h3>
				<p>{t('We have sent an onboarding link to your email address. Please check your inbox to continue setting up your account.')}</p>
				{identityProvider == 'idp' && <p className="text-muted small">{t('It may take up to an hour before your account is fully ready.')}</p>}
				{identityProvider == 'domain' && <p className="text-muted small">{t('If you set up custom DNS records, it may take some time for changes to propagate.')}</p>}
				<p className="text-muted small">{t('You can close this page now.')}</p>
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
