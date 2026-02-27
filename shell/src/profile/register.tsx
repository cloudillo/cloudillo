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

import {
	LuDoorOpen as IcSignUp,
	LuChevronsLeft as IcGoBack,
	LuCircleCheck as IcSuccess,
	LuLightbulb as IcTip
} from 'react-icons/lu'

import { useAuth, useApi, useDebouncedValue, Button } from '@cloudillo/react'
import * as Types from '@cloudillo/core'
import { FetchError } from '@cloudillo/core'

import { CloudilloLogo } from '../logo.js'
import {
	ProviderSelectionStep,
	ProviderSelectorStep,
	IdTagInput,
	IdTagErrorPanel,
	AppDomainInput,
	AppDomainErrorPanel,
	DnsInstructions,
	IdTagError
} from './shared.js'

// Extended local type that includes 'network' error (not returned by API, but used for local error handling)
type LocalVerifyResult = Omit<Types.RegisterVerifyResult, 'idTagError'> & {
	idTagError?: IdTagError
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
	verifyState: LocalVerifyResult | undefined
	progress: 'vfy' | undefined
	onVerify: (
		changed: 'idTag' | 'appDomain',
		idTag: string,
		provider?: string,
		appDomain?: string
	) => void
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

	// Debounced display name for smooth animation (only animate when user pauses typing)
	const displayName = useDebouncedValue(idTagInput, 300)

	// When custom provider (contains a dot), user already selected their full provider domain
	const isCustom = selectedProvider.includes('.')
	const providerDomain = isCustom ? selectedProvider : selectedProvider

	return (
		<>
			<CloudilloLogo
				className={'c-logo w-50 float-right ps-3 pb-3' + (progress == 'vfy' ? ' slow' : '')}
			/>
			<header>
				<h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1>
			</header>

			{/* Identity preview panel with animation */}
			<div className="animate-fade-slide-up stagger-1">
				<h3 className="my-3">
					{t('Choose your name on {{provider}}', {
						provider: providerInfo?.name || selectedProvider
					})}
				</h3>
				<div className="c-panel mid text-center py-3 my-3">
					<p className="text-muted small mb-1">{t("You'll be known as")}</p>
					<p key={displayName} className="text-xl font-semibold mb-2 animate-scale-in">
						<span className={idTagInput ? 'text-accent' : 'text-disabled'}>
							@{idTagInput || 'yourname'}
						</span>
						<span className="text-primary">.{selectedProvider}</span>
					</p>
					<p className="text-muted small mb-0">
						{t('Pick something memorable that represents you.')}
					</p>
				</div>
			</div>

			{/* Name input with animation */}
			<div className="animate-fade-slide-up stagger-2">
				<IdTagInput
					value={idTagInput}
					onChange={setIdTagInput}
					onVerify={(value) => onVerify('idTag', value, selectedProvider)}
					progress={progress}
					error={verifyState?.idTagError}
					label={t('Your name')}
					placeholder={t('yourname')}
					suffix={selectedProvider}
					mode="idp"
				/>
				<IdTagErrorPanel error={verifyState?.idTagError} mode="idp" />
			</div>

			{/* Email input with animation */}
			<div className="animate-fade-slide-up stagger-3">
				<label className="d-block my-3">
					{t('Your email (for account recovery)')}
					<input
						className="c-input px-3"
						name="email"
						type="email"
						onChange={(evt: React.ChangeEvent<HTMLInputElement>) =>
							setEmail(evt.target.value)
						}
						value={email}
						placeholder={t('you@example.com')}
						aria-label={t('Email address')}
					/>
				</label>
			</div>

			{providerInfo && (
				<p className="text-muted small mt-3">
					<span className="me-1">ℹ️</span> {providerInfo.info}
				</p>
			)}

			<footer className="c-group g-2 mt-4">
				<Button className="container-secondary" onClick={onGoBack}>
					<IcGoBack />
					{t('Back')}
				</Button>
				<Button
					className="primary"
					type="submit"
					disabled={verifyState?.idTagError !== '' || !email || !idTagInput}
				>
					<IcSignUp />
					{t('Sign up')}
				</Button>
			</footer>
		</>
	)
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
	verifyState: LocalVerifyResult | undefined
	progress: 'vfy' | undefined
	onVerify: (
		changed: 'idTag' | 'appDomain',
		idTag: string,
		provider?: string,
		appDomain?: string
	) => void
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
	const showDnsInstructions =
		idTagInput &&
		verifyState?.idTagError != 'used' &&
		verifyState?.appDomainError != 'used' &&
		(verifyState?.idTagError == 'nodns' ||
			verifyState?.idTagError == 'address' ||
			verifyState?.appDomainError == 'nodns' ||
			verifyState?.appDomainError == 'address')

	// Show email field when domain validation passes
	const showEmailField = verifyState?.idTagError === '' && verifyState?.appDomainError === ''

	return (
		<>
			<CloudilloLogo
				className={'c-logo w-50 float-right ps-3 pb-3' + (progress == 'vfy' ? ' slow' : '')}
			/>
			<header>
				<h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1>
			</header>

			<h3 className="my-3">{t('Use your domain as your identity')}</h3>

			<IdTagInput
				value={idTagInput}
				onChange={setIdTagInput}
				onVerify={(value) => onVerify('idTag', value, appDomain)}
				progress={progress}
				error={verifyState?.idTagError}
				label={t('Your domain')}
				placeholder={t('example.com or alice.example.com')}
				mode="domain"
			/>
			<IdTagErrorPanel error={verifyState?.idTagError} mode="domain" />

			{idTagInput &&
				verifyState?.idTagError !== 'invalid' &&
				verifyState?.idTagError !== 'used' && (
					<>
						<AppDomainInput
							value={appDomain}
							onChange={setAppDomain}
							onVerify={(value) => onVerify('appDomain', idTagInput, value)}
							idTagInput={idTagInput}
							progress={progress}
							error={verifyState?.appDomainError}
							identityLabel={t('Your identity:')}
							accessLabel={t('Where will you access Cloudillo?')}
						/>
						<AppDomainErrorPanel
							error={verifyState?.appDomainError}
							idTagInput={idTagInput}
							appDomain={appDomain}
						/>
					</>
				)}

			{showDnsInstructions && (
				<DnsInstructions
					idTagInput={idTagInput}
					appDomain={appDomain}
					address={verifyState!.address[0]}
					idTagError={verifyState?.idTagError}
					appDomainError={verifyState?.appDomainError}
				/>
			)}

			{showEmailField && (
				<>
					<label className="d-block my-3">
						{t('Your email (for account recovery)')}
						<input
							className="c-input px-3"
							name="email"
							type="email"
							onChange={(evt: React.ChangeEvent<HTMLInputElement>) =>
								setEmail(evt.target.value)
							}
							value={email}
							placeholder={t('you@example.com')}
							aria-label={t('Email address')}
						/>
					</label>
				</>
			)}

			<footer className="c-group g-2 mt-4">
				<Button className="container-secondary" onClick={onGoBack}>
					<IcGoBack />
					{t('Back')}
				</Button>
				<Button
					className="primary"
					type="submit"
					disabled={
						verifyState?.idTagError !== '' ||
						verifyState?.appDomainError !== '' ||
						!email
					}
				>
					<IcSignUp />
					{t('Sign up')}
				</Button>
			</footer>
		</>
	)
}

//////////////////
// RegisterForm //
//////////////////

export function RegisterForm() {
	const { t } = useTranslation()
	const { api } = useApi()
	const {
		token,
		providerType,
		idpStep: idpStepParam,
		provider: providerParam
	} = useParams<{
		token: string
		providerType?: 'idp' | 'domain'
		idpStep?: 'select' | 'name'
		provider?: string
	}>()
	const navigate = useNavigate()
	const [auth, setAuth] = useAuth()

	const [show, setShow] = React.useState<boolean | undefined>()
	const [tokenError, setTokenError] = React.useState<'invalid' | 'rate-limit' | undefined>()
	const [identityProviders, setIdentityProviders] = React.useState<string[]>([])
	// If idpStepParam is present, we're in IDP flow; otherwise use providerType
	const identityProvider = idpStepParam ? 'idp' : providerType
	const [selectedProvider, setSelectedProvider] = React.useState<string>(
		providerParam || 'cloudillo.net'
	)
	const [providerInfoMap, setProviderInfoMap] = React.useState<Record<string, Types.IdpInfo>>({})
	const idpStep = idpStepParam || 'select' // Get IDP step from URL, default to 'select'
	const [email, setEmail] = React.useState('')
	const [idTagInput, setIdTagInput] = React.useState('')
	const [appDomain, setAppDomain] = React.useState('')
	const [verifyState, setVerifyState] = React.useState<LocalVerifyResult | undefined>()
	const [progress, setProgress] = React.useState<
		undefined | 'vfy' | 'reg' | 'check' | 'done' | 'wait-dns' | 'error'
	>()
	const [error, setError] = React.useState<string | undefined>()

	// Initial verification to check if token is valid
	React.useEffect(
		function () {
			console.log('RegisterForm.useEffect', api?.idTag)
			if (!api?.idTag) return
			;(async function () {
				console.log('RegisterForm.useEffect', api?.idTag)
				try {
					const res = await api!.profile.verify({
						type: 'ref',
						idTag: '',
						token
					})
					console.log('REF VERIFY RES', res)
					setShow(true)
					const providers =
						res.identityProviders && res.identityProviders.length > 0
							? res.identityProviders
							: ['cloudillo.net']
					setIdentityProviders(providers)
					// Only set selected provider from API if not provided in URL
					if (!providerParam) {
						setSelectedProvider(providers[0])
					}

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
					if (err instanceof FetchError && err.httpStatus === 429) {
						setTokenError('rate-limit')
					} else {
						setTokenError('invalid')
					}
					setShow(false)
				}
			})()
		},
		[api]
	)

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
		navigate(`/register/${token}/idp/name/${encodeURIComponent(selectedProvider)}`)
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
	// Debounced verification - use useMemo to create stable debounced function
	const onChangeVerify = React.useMemo(
		() =>
			debounce(
				async function onVerify(
					changed: 'idTag' | 'appDomain',
					idTag: string,
					provider?: string,
					appDomain?: string
				) {
					if (!idTag || !api || !identityProvider || !token) return

					const effectiveProvider = provider || selectedProvider

					setProgress('vfy')
					console.log('ON VERIFY', changed, idTag, effectiveProvider, appDomain)
					if (changed == 'appDomain')
						setVerifyState((vs) => (!vs ? undefined : { ...vs, appDomainError: '' }))
					else setVerifyState(undefined)
					try {
						const res = await api.profile.verify({
							type: identityProvider,
							idTag:
								identityProvider == 'domain'
									? idTag
									: effectiveProvider
										? idTag + '.' + effectiveProvider
										: idTag,
							appDomain,
							token
						})
						console.log('RES', res)
						setProgress(undefined)
						setVerifyState(res)
					} catch (err) {
						console.log('ERROR', err)
						setProgress(undefined)
						// Set network error state so user knows verification failed
						setVerifyState({
							address: [],
							identityProviders: [],
							idTagError: 'network'
						})
					}
				}.bind(null),
				500
			),
		[identityProvider, selectedProvider, token, api]
	)

	// Clean up debounced function on unmount or when dependencies change
	React.useEffect(() => {
		return () => {
			onChangeVerify.clear()
		}
	}, [onChangeVerify])

	async function onSubmit(evt: React.FormEvent) {
		evt.preventDefault()
		if (!api || !identityProvider || !token) return
		setProgress('reg')
		// For custom provider (empty string), idTagInput already contains the full tag (e.g., alice.example.com)
		const fullIdTag =
			identityProvider == 'domain'
				? idTagInput
				: selectedProvider === ''
					? idTagInput
					: idTagInput + '.' + selectedProvider

		try {
			const res = await api.profile.register({
				type: identityProvider,
				idTag: fullIdTag,
				appDomain,
				email,
				token
			})
			console.log('RES', res)
			setProgress('check')

			// For IDP registration, construct the proper app domain
			const checkDomain =
				appDomain ||
				(identityProvider == 'domain'
					? idTagInput
					: selectedProvider === ''
						? idTagInput
						: idTagInput + '.' + selectedProvider)

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

	// Invalid token or rate limit
	if (show == undefined) return
	if (!show)
		return (
			<div className="c-panel">
				<CloudilloLogo className="c-logo w-50 float-right ps-3 pb-3" />
				<header>
					{tokenError === 'rate-limit' ? (
						<>
							<h1 className="mb-3">{t('Too many requests')}</h1>
							<p className="text-muted">{t('Please wait a moment and try again.')}</p>
						</>
					) : (
						<h1 className="mb-3">{t('This registration link is invalid!')}</h1>
					)}
				</header>
			</div>
		)

	// Render the appropriate step
	return (
		<form className="c-panel d-block p-4" onSubmit={onSubmit}>
			{/* Gateway: Choose IDP vs Domain */}
			{(!progress || progress == 'vfy') && !identityProvider && (
				<ProviderSelectionStep mode="register" onSelectProvider={onSelectProviderType} />
			)}

			{/* IDP flow - Step 1: Provider selection */}
			{(!progress || progress == 'vfy') &&
				identityProvider == 'idp' &&
				idpStep === 'select' && (
					<ProviderSelectorStep
						mode="register"
						identityProviders={identityProviders}
						providerInfoMap={providerInfoMap}
						selectedProvider={selectedProvider}
						onSelectProvider={setSelectedProvider}
						onProviderInfoFetched={(provider, info) =>
							setProviderInfoMap((prev) => ({ ...prev, [provider]: info }))
						}
						onContinue={onIdpProviderContinue}
						onGoBack={onGoBack}
						api={api}
					/>
				)}

			{/* IDP flow - Step 2: Name selection */}
			{(!progress || progress == 'vfy') &&
				identityProvider == 'idp' &&
				idpStep === 'name' && (
					<IdpRegistrationForm
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
					/>
				)}

			{/* Domain registration form */}
			{(!progress || progress == 'vfy') && identityProvider == 'domain' && (
				<DomainRegistrationForm
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
				/>
			)}

			{/* In progress */}
			{/***************/}
			{progress == 'reg' && (
				<>
					<header>
						<h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1>
					</header>
					<div className="c-vbox align-items-center">
						<CloudilloLogo className="c-logo w-50 ps-3 pb-w slow" />
					</div>
					<h3 className="my-3">{t('Registration is in progress')}</h3>
					<p>{t('This usually takes only 10-20 seconds, please be patient...')}</p>
				</>
			)}

			{/* Check App domain*/}
			{/*******************/}
			{progress == 'check' && (
				<>
					<header>
						<h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1>
					</header>
					<div className="c-vbox align-items-center">
						<CloudilloLogo className="c-logo w-50 ps-3 pb-w slow" />
					</div>
					<h3 className="my-3">{t('Registration is successful')}</h3>
					<p>{t('Checking app domain...')}</p>
				</>
			)}

			{/* Registration success */}
			{/************************/}
			{progress == 'done' && (
				<>
					<div className="c-vbox align-items-center">
						<CloudilloLogo className="c-logo" style={{ maxWidth: '8rem' }} />

						<div className="c-success-header">
							<IcSuccess className="c-success-icon" aria-hidden="true" />
							<h1 className="mb-0">{t('Registration Successful!')}</h1>
							<p className="text-muted">{t('Welcome to Cloudillo!')}</p>
						</div>

						{identityProvider == 'idp' ? (
							<div className="w-100" style={{ maxWidth: '28rem' }}>
								<h3 className="mb-3">{t('What happens next?')}</h3>

								<div className="c-step-card">
									<div className="c-step-number">1</div>
									<div className="c-step-content">
										<strong>{t('Activation email')}</strong>
										<span className="text-muted">
											{' '}
											{t('from your Identity Provider')}
										</span>
										<hr className="my-2" />
										<p className="text-muted small mb-0">
											{t('Click to activate your federated identity')}
										</p>
									</div>
								</div>

								<div className="c-step-card">
									<div className="c-step-number">2</div>
									<div className="c-step-content">
										<strong>{t('Onboarding email')}</strong>
										<span className="text-muted">
											{' '}
											{t('from this Cloudillo instance')}
										</span>
										<hr className="my-2" />
										<p className="text-muted small mb-0">
											{t('Click to set up your account and password')}
										</p>
									</div>
								</div>

								<div className="c-info-tip mt-3">
									<IcTip className="c-info-tip-icon" aria-hidden="true" />
									<div>
										<p className="mb-1">{t('Check your inbox to continue.')}</p>
										<p className="text-muted small mb-0">
											{t(
												'It may take up to an hour before your account is fully ready.'
											)}
										</p>
									</div>
								</div>
							</div>
						) : (
							<div className="w-100" style={{ maxWidth: '28rem' }}>
								<p className="mb-3">
									{t(
										'We have sent an onboarding link to your email address. Please check your inbox to continue setting up your account.'
									)}
								</p>
								{identityProvider == 'domain' && (
									<div className="c-info-tip">
										<IcTip className="c-info-tip-icon" aria-hidden="true" />
										<p className="text-muted small mb-0">
											{t(
												'If you set up custom DNS records, it may take some time for changes to propagate.'
											)}
										</p>
									</div>
								)}
							</div>
						)}

						<p className="text-muted mt-4">{t("You're all set here!")}</p>
					</div>
				</>
			)}

			{/* Wait for DNS */}
			{/****************/}
			{progress == 'wait-dns' && (
				<>
					<div className="c-vbox align-items-center">
						<CloudilloLogo className="c-logo" style={{ maxWidth: '8rem' }} />

						<div className="c-success-header">
							<IcSuccess className="c-success-icon" aria-hidden="true" />
							<h1 className="mb-0">{t('Registration Successful!')}</h1>
							<p className="text-muted">{t('Welcome to Cloudillo!')}</p>
						</div>

						{identityProvider == 'idp' ? (
							<div className="w-100" style={{ maxWidth: '28rem' }}>
								<h3 className="mb-3">{t('What happens next?')}</h3>

								<div className="c-step-card">
									<div className="c-step-number">1</div>
									<div className="c-step-content">
										<strong>{t('Activation email')}</strong>
										<span className="text-muted">
											{' '}
											{t('from your Identity Provider')}
										</span>
										<hr className="my-2" />
										<p className="text-muted small mb-0">
											{t('Click to activate your federated identity')}
										</p>
									</div>
								</div>

								<div className="c-step-card">
									<div className="c-step-number">2</div>
									<div className="c-step-content">
										<strong>{t('Onboarding email')}</strong>
										<span className="text-muted">
											{' '}
											{t('from this Cloudillo instance')}
										</span>
										<hr className="my-2" />
										<p className="text-muted small mb-0">
											{t('Click to set up your account and password')}
										</p>
									</div>
								</div>

								<div className="c-info-tip mt-3">
									<IcTip className="c-info-tip-icon" aria-hidden="true" />
									<div>
										<p className="mb-1">{t('Check your inbox to continue.')}</p>
										<p className="text-muted small mb-0">
											{t(
												'It may take up to an hour before your account is fully ready.'
											)}
										</p>
									</div>
								</div>
							</div>
						) : (
							<div className="w-100" style={{ maxWidth: '28rem' }}>
								<p className="mb-3">
									{t(
										'We have sent an onboarding link to your email address. Please check your inbox to continue setting up your account.'
									)}
								</p>
								{identityProvider == 'domain' && (
									<div className="c-info-tip">
										<IcTip className="c-info-tip-icon" aria-hidden="true" />
										<p className="text-muted small mb-0">
											{t(
												'If you set up custom DNS records, it may take some time for changes to propagate.'
											)}
										</p>
									</div>
								)}
							</div>
						)}

						<p className="text-muted mt-4">{t("You're all set here!")}</p>
					</div>
				</>
			)}

			{/* Registration error */}
			{/**********************/}
			{progress == 'error' && (
				<>
					<header>
						<h1 className="mb-3">{t('Something went wrong!')}</h1>
					</header>
					<div className="c-vbox align-items-center p-5">
						<CloudilloLogo className="c-logo w-50 ps-3 pb-w" />
						<h3 className="my-3">{t('Your registration was unsuccessful.')}</h3>
						{error && <p className="c-panel error">{error}</p>}
						<p>{t('Please contact the administrator of the server or try again.')}</p>
					</div>
					<div className="c-group">
						<Button
							className="primary"
							onClick={() => {
								setProgress(undefined)
								setError(undefined)
							}}
						>
							{t('Try again')}
						</Button>
					</div>
				</>
			)}
		</form>
	)
}

// vim: ts=4
