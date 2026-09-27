// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type * as Types from '@cloudillo/core'
import { FetchError } from '@cloudillo/core'
import {
	ActionBar,
	Alert,
	Button,
	Center,
	Container,
	EmptyState,
	Field,
	Form,
	Input,
	List,
	ListItem,
	Logo,
	Panel,
	Stepper,
	Text,
	useApi,
	useAuth,
	useDebouncedValue
} from '@cloudillo/react'
import debounce from 'debounce'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuChevronsLeft as IcGoBack,
	LuDoorOpen as IcSignUp,
	LuCircleCheck as IcSuccess
} from 'react-icons/lu'
import { useNavigate, useParams } from 'react-router-dom'

import { AuthLayout } from '../auth/AuthLayout.js'
import {
	AppDomainErrorPanel,
	AppDomainInput,
	DnsInstructions,
	type IdTagError,
	IdTagErrorPanel,
	IdTagInput,
	ProviderSelectionStep,
	ProviderSelectorStep
} from './shared.js'

// Extended local type that includes 'network' error (not returned by API, but used for local error handling)
type LocalVerifyResult = Omit<Types.RegisterVerifyResult, 'idTagError'> & {
	idTagError?: IdTagError
}

////////////////
// EmailField //
////////////////
function EmailField({ email, setEmail }: { email: string; setEmail: (value: string) => void }) {
	const { t } = useTranslation()

	return (
		<Field label={t('Your email (for account recovery)')}>
			<Input
				name="email"
				type="email"
				onChange={(evt: React.ChangeEvent<HTMLInputElement>) => setEmail(evt.target.value)}
				value={email}
				placeholder={t('you@example.com')}
			/>
		</Field>
	)
}

/////////////////////////
// IdpRegistrationForm //
/////////////////////////
interface IdpRegistrationFormProps {
	selectedProvider: string
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
	onGoBack: () => void
}

function IdpRegistrationForm({
	selectedProvider,
	providerInfo,
	idTagInput,
	setIdTagInput,
	email,
	setEmail,
	verifyState,
	progress,
	onVerify,
	onGoBack
}: IdpRegistrationFormProps) {
	const { t } = useTranslation()

	// Debounced display name so the preview only updates when the user pauses typing
	const displayName = useDebouncedValue(idTagInput, 300)

	return (
		<>
			{/* Identity preview */}
			<Panel variant="soft" className="my-3">
				<Text as="p" align="center" size="sm" emphasis="muted">
					{t("You'll be known as")}
				</Text>
				<Text as="p" key={displayName} align="center" size="xl" weight="semibold">
					<Text
						color={idTagInput ? 'accent' : undefined}
						emphasis={idTagInput ? undefined : 'disabled'}
					>
						@{idTagInput || 'yourname'}
					</Text>
					<Text color="primary">.{selectedProvider}</Text>
				</Text>
				<Text as="p" align="center" size="sm" emphasis="muted">
					{t('Pick something memorable that represents you.')}
				</Text>
			</Panel>

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

			<EmailField email={email} setEmail={setEmail} />

			{providerInfo && <Alert color="info">{providerInfo.info}</Alert>}

			<ActionBar>
				<Button icon={<IcGoBack />} onClick={onGoBack}>
					{t('Back')}
				</Button>
				<Button
					color="primary"
					type="submit"
					icon={<IcSignUp />}
					disabled={verifyState?.idTagError !== '' || !email || !idTagInput}
				>
					{t('Sign up')}
				</Button>
			</ActionBar>
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
	onGoBack
}: DomainRegistrationFormProps) {
	const { t } = useTranslation()

	// Show DNS instructions when there are DNS issues
	const showDnsInstructions =
		idTagInput &&
		verifyState?.idTagError !== 'used' &&
		verifyState?.appDomainError !== 'used' &&
		verifyState?.appDomainError !== 'address' &&
		(verifyState?.idTagError === 'nodns' ||
			verifyState?.idTagError === 'address' ||
			verifyState?.appDomainError === 'nodns')

	// Show email field when domain validation passes
	const showEmailField = verifyState?.idTagError === '' && verifyState?.appDomainError === ''

	return (
		<>
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
							onVerify={(value) =>
								onVerify('appDomain', idTagInput, undefined, value)
							}
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

			{showEmailField && <EmailField email={email} setEmail={setEmail} />}

			<ActionBar>
				<Button icon={<IcGoBack />} onClick={onGoBack}>
					{t('Back')}
				</Button>
				<Button
					color="primary"
					type="submit"
					icon={<IcSignUp />}
					disabled={
						verifyState?.idTagError !== '' ||
						verifyState?.appDomainError !== '' ||
						!email
					}
				>
					{t('Sign up')}
				</Button>
			</ActionBar>
		</>
	)
}

//////////////////////
// RegisterComplete //
//////////////////////
function RegisterComplete({ identityProvider }: { identityProvider?: 'idp' | 'domain' }) {
	const { t } = useTranslation()

	return (
		<AuthLayout logo={<Logo />} title={t('Welcome to Cloudillo!')}>
			<EmptyState
				size="sm"
				color="success"
				icon={<IcSuccess />}
				title={t('Registration Successful!')}
			/>

			{identityProvider == 'idp' ? (
				<>
					<Text as="p" weight="semibold">
						{t('What happens next?')}
					</Text>
					<List marker="number">
						<ListItem
							title={t('Activation email') + ' ' + t('from your Identity Provider')}
							subtitle={t('Click to activate your federated identity')}
						/>
						<ListItem
							title={t('Onboarding email') + ' ' + t('from this Cloudillo instance')}
							subtitle={t('Click to set up your account and password')}
						/>
					</List>
					<Alert color="info" title={t('Check your inbox to continue.')}>
						{t('It may take up to an hour before your account is fully ready.')}
					</Alert>
				</>
			) : (
				<>
					<Text as="p">
						{t(
							'We have sent an onboarding link to your email address. Please check your inbox to continue setting up your account.'
						)}
					</Text>
					{identityProvider == 'domain' && (
						<Alert color="info">
							{t(
								'If you set up custom DNS records, it may take some time for changes to propagate.'
							)}
						</Alert>
					)}
				</>
			)}

			<Text as="p" align="center" emphasis="muted" className="mt-3">
				{t("You're all set here!")}
			</Text>
		</AuthLayout>
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
	const [_auth, _setAuth] = useAuth()

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
						} catch (_e) {
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
			<AuthLayout
				logo={<Logo />}
				title={
					tokenError === 'rate-limit'
						? t('Too many requests')
						: t('This registration link is invalid!')
				}
				subtitle={
					tokenError === 'rate-limit'
						? t('Please wait a moment and try again.')
						: undefined
				}
			/>
		)

	// Registering / checking the app domain
	if (progress == 'reg' || progress == 'check')
		return (
			<AuthLayout
				logo={<Logo animated />}
				title={t('Welcome to Cloudillo!')}
				subtitle={
					progress == 'reg'
						? t('Registration is in progress')
						: t('Registration is successful')
				}
			>
				<Text as="p" role="status">
					{progress == 'reg'
						? t('This usually takes only 10-20 seconds, please be patient...')
						: t('Checking app domain...')}
				</Text>
			</AuthLayout>
		)

	if (progress == 'done' || progress == 'wait-dns')
		return <RegisterComplete identityProvider={identityProvider} />

	if (progress == 'error')
		return (
			<AuthLayout
				logo={<Logo />}
				title={t('Something went wrong!')}
				subtitle={t('Your registration was unsuccessful.')}
			>
				{error && <Alert color="error">{error}</Alert>}
				<Text as="p">
					{t('Please contact the administrator of the server or try again.')}
				</Text>
				<ActionBar>
					<Button
						color="primary"
						onClick={() => {
							setProgress(undefined)
							setError(undefined)
						}}
					>
						{t('Try again')}
					</Button>
				</ActionBar>
			</AuthLayout>
		)

	// Wizard steps: gateway → (idp: provider → name | domain: domain form)
	const stepCount = identityProvider == 'domain' ? 2 : 3
	const step = !identityProvider ? 0 : identityProvider == 'idp' && idpStep === 'name' ? 2 : 1
	const stepper = (
		<Center className="pt-3">
			<Stepper count={stepCount} current={step} />
		</Center>
	)

	// Gateway and IdP provider selection render their own logo + heading (shared.tsx)
	if (!identityProvider || (identityProvider == 'idp' && idpStep === 'select'))
		return (
			<>
				{stepper}
				<Container>
					<Center
						className="p-3"
						style={{ '--center-min-height': '100%' } as React.CSSProperties}
					>
						<Panel className="w-100" style={{ maxWidth: '40rem' }}>
							{!identityProvider ? (
								<ProviderSelectionStep
									mode="register"
									onSelectProvider={onSelectProviderType}
								/>
							) : (
								<ProviderSelectorStep
									mode="register"
									identityProviders={identityProviders}
									providerInfoMap={providerInfoMap}
									selectedProvider={selectedProvider}
									onSelectProvider={setSelectedProvider}
									onProviderInfoFetched={(provider, info) =>
										setProviderInfoMap((prev) => ({
											...prev,
											[provider]: info
										}))
									}
									onContinue={onIdpProviderContinue}
									onGoBack={onGoBack}
									api={api}
								/>
							)}
						</Panel>
					</Center>
				</Container>
			</>
		)

	return (
		<>
			{stepper}
			<AuthLayout
				logo={<Logo animated={progress == 'vfy'} />}
				title={t('Welcome to Cloudillo!')}
				subtitle={
					identityProvider == 'idp'
						? t('Choose your name on {{provider}}', {
								provider:
									providerInfoMap[selectedProvider]?.name || selectedProvider
							})
						: t('Use your domain as your identity')
				}
			>
				<Form onSubmit={onSubmit}>
					{identityProvider == 'idp' ? (
						<IdpRegistrationForm
							selectedProvider={selectedProvider}
							providerInfo={providerInfoMap[selectedProvider]}
							idTagInput={idTagInput}
							setIdTagInput={setIdTagInput}
							email={email}
							setEmail={setEmail}
							verifyState={verifyState}
							progress={progress}
							onVerify={onChangeVerify}
							onGoBack={onGoBack}
						/>
					) : (
						<DomainRegistrationForm
							idTagInput={idTagInput}
							setIdTagInput={setIdTagInput}
							appDomain={appDomain}
							setAppDomain={(value) => {
								setAppDomain(value)
								setVerifyState((vs) =>
									!vs ? undefined : { ...vs, appDomainError: '' }
								)
							}}
							email={email}
							setEmail={setEmail}
							verifyState={verifyState}
							progress={progress}
							onVerify={onChangeVerify}
							onGoBack={onGoBack}
						/>
					)}
				</Form>
			</AuthLayout>
		</>
	)
}

// vim: ts=4
