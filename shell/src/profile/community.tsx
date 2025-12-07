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
	LuPlus as IcCreate,
	LuChevronsLeft as IcGoBack,
	LuUsers as IcCommunity
} from 'react-icons/lu'

import { useAuth, useApi, Button } from '@cloudillo/react'
import * as Types from '@cloudillo/base'

import { useCommunitiesList, useContextSwitch } from '../context/index.js'
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
type LocalVerifyResult = Omit<Types.CommunityVerifyResult, 'idTagError'> & {
	idTagError?: IdTagError
}

/////////////////
// IdpNameStep //
/////////////////
interface IdpNameStepProps {
	selectedProvider: string
	providerInfo?: Types.IdpInfo
	idTagInput: string
	setIdTagInput: (value: string) => void
	displayName: string
	setDisplayName: (value: string) => void
	verifyState: LocalVerifyResult | undefined
	progress: 'vfy' | undefined
	onVerify: (idTag: string, provider?: string) => void
	onSubmit: (evt: React.FormEvent) => void
	onGoBack: () => void
}

function IdpNameStep({
	selectedProvider,
	providerInfo,
	idTagInput,
	setIdTagInput,
	displayName,
	setDisplayName,
	verifyState,
	progress,
	onVerify,
	onSubmit,
	onGoBack
}: IdpNameStepProps) {
	const { t } = useTranslation()

	return (
		<>
			<header>
				<h1 className="mb-3">
					<IcCommunity className="me-2" />
					{t('Create a Community')}
				</h1>
			</header>

			<h3 className="my-3">
				{t('Name your community on {{provider}}', {
					provider: providerInfo?.name || selectedProvider
				})}
			</h3>
			<p className="text-muted mb-3">
				{t('Your community will be')}{' '}
				<b>
					@{idTagInput || 'communityname'}.{selectedProvider}
				</b>
			</p>

			<IdTagInput
				value={idTagInput}
				onChange={setIdTagInput}
				onVerify={(value) => onVerify(value, selectedProvider)}
				progress={progress}
				error={verifyState?.idTagError}
				label={t('Community identifier')}
				placeholder={t('communityname')}
				suffix={selectedProvider}
				mode="idp"
			/>
			<IdTagErrorPanel error={verifyState?.idTagError} mode="idp" />

			<label className="d-block my-3">
				{t('Display name')}
				<input
					className="c-input px-3"
					name="displayName"
					type="text"
					onChange={(evt: React.ChangeEvent<HTMLInputElement>) =>
						setDisplayName(evt.target.value)
					}
					value={displayName}
					placeholder={t('My Community')}
					aria-label={t('Display name')}
				/>
			</label>

			<p className="small text-muted">{t('You can change the display name later.')}</p>

			<footer className="c-group g-2 mt-4">
				<Button className="container-secondary" onClick={onGoBack}>
					<IcGoBack />
					{t('Back')}
				</Button>
				<Button
					className="primary"
					type="submit"
					disabled={verifyState?.idTagError !== '' || !idTagInput}
				>
					<IcCreate />
					{t('Create Community')}
				</Button>
			</footer>
		</>
	)
}

/////////////////////
// DomainSetupStep //
/////////////////////
interface DomainSetupStepProps {
	idTagInput: string
	setIdTagInput: (value: string) => void
	appDomain: string
	setAppDomain: (value: string) => void
	displayName: string
	setDisplayName: (value: string) => void
	verifyState: LocalVerifyResult | undefined
	progress: 'vfy' | undefined
	onVerify: (idTag: string, appDomain?: string) => void
	onSubmit: (evt: React.FormEvent) => void
	onGoBack: () => void
}

function DomainSetupStep({
	idTagInput,
	setIdTagInput,
	appDomain,
	setAppDomain,
	displayName,
	setDisplayName,
	verifyState,
	progress,
	onVerify,
	onSubmit,
	onGoBack
}: DomainSetupStepProps) {
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

	// Show name field when domain validation passes
	const showNameField = verifyState?.idTagError === '' && verifyState?.appDomainError === ''

	return (
		<>
			<header>
				<h1 className="mb-3">
					<IcCommunity className="me-2" />
					{t('Create a Community')}
				</h1>
			</header>

			<h3 className="my-3">{t('Use your domain for your community')}</h3>

			<IdTagInput
				value={idTagInput}
				onChange={setIdTagInput}
				onVerify={(value) => onVerify(value, appDomain)}
				progress={progress}
				error={verifyState?.idTagError}
				label={t('Community domain')}
				placeholder={t('myteam.com')}
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
							onVerify={(value) => onVerify(idTagInput, value)}
							idTagInput={idTagInput}
							progress={progress}
							error={verifyState?.appDomainError}
							identityLabel={t('Community identity:')}
							accessLabel={t('Where will the community be accessed?')}
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

			{showNameField && (
				<label className="d-block my-3">
					{t('Display name')}
					<input
						className="c-input px-3"
						name="displayName"
						type="text"
						onChange={(evt: React.ChangeEvent<HTMLInputElement>) =>
							setDisplayName(evt.target.value)
						}
						value={displayName}
						placeholder={t('My Team')}
						aria-label={t('Display name')}
					/>
				</label>
			)}

			<footer className="c-group g-2 mt-4">
				<Button className="container-secondary" onClick={onGoBack}>
					<IcGoBack />
					{t('Back')}
				</Button>
				<Button
					className="primary"
					type="submit"
					disabled={verifyState?.idTagError !== '' || verifyState?.appDomainError !== ''}
				>
					<IcCreate />
					{t('Create Community')}
				</Button>
			</footer>
		</>
	)
}

//////////////////
// ProgressStep //
//////////////////
interface ProgressStepProps {
	progress: 'creating' | 'checking' | 'done' | 'pending-dns' | 'error'
	error?: string
	communityIdTag: string
	communityName: string
	onRetry: () => void
	onOpenCommunity: () => void
}

function ProgressStep({
	progress,
	error,
	communityIdTag,
	communityName,
	onRetry,
	onOpenCommunity
}: ProgressStepProps) {
	const { t } = useTranslation()

	return (
		<>
			<header>
				<h1 className="mb-3">
					<IcCommunity className="me-2" />
					{t('Create a Community')}
				</h1>
			</header>

			{progress === 'creating' && (
				<div className="c-vbox align-items-center p-5">
					<CloudilloLogo className="c-logo w-50 ps-3 pb-3 slow" />
					<h3 className="my-3">{t('Creating your community...')}</h3>
					<p>{t('This usually takes only a few seconds, please be patient...')}</p>
				</div>
			)}

			{progress === 'checking' && (
				<div className="c-vbox align-items-center p-5">
					<CloudilloLogo className="c-logo w-50 ps-3 pb-3 slow" />
					<h3 className="my-3">{t('Community created!')}</h3>
					<p>{t('Checking if your community is accessible...')}</p>
				</div>
			)}

			{progress === 'done' && (
				<div className="c-vbox align-items-center p-5">
					<CloudilloLogo className="c-logo w-50 ps-3 pb-3" />
					<h3 className="my-3">{t('Your community is ready!')}</h3>
					<p>
						<strong>{communityName}</strong> ({communityIdTag})
					</p>
					<Button className="primary mt-3" onClick={onOpenCommunity}>
						{t('Open Community')}
					</Button>
				</div>
			)}

			{progress === 'pending-dns' && (
				<div className="c-vbox align-items-center p-5">
					<CloudilloLogo className="c-logo w-50 ps-3 pb-3" />
					<h3 className="my-3">{t('Community created!')}</h3>
					<p>
						<strong>{communityName}</strong> ({communityIdTag})
					</p>
					<div className="c-panel warning mt-3">
						<p>
							{t(
								'Your community has been created, but DNS propagation is still in progress.'
							)}
						</p>
						<p className="small text-muted mb-0">
							{t(
								"It's been added to your sidebar. You can try opening it in a few minutes."
							)}
						</p>
					</div>
				</div>
			)}

			{progress === 'error' && (
				<div className="c-vbox align-items-center p-5">
					<CloudilloLogo className="c-logo w-50 ps-3 pb-3" />
					<h3 className="my-3">{t('Something went wrong')}</h3>
					{error && <p className="c-panel error">{error}</p>}
					<p>{t('Please try again or contact support.')}</p>
					<Button className="primary mt-3" onClick={onRetry}>
						{t('Try Again')}
					</Button>
				</div>
			)}
		</>
	)
}

/////////////////////
// CreateCommunity //
/////////////////////
export function CreateCommunity() {
	const { t } = useTranslation()
	const { api } = useApi()
	const {
		contextIdTag,
		providerType,
		idpStep: idpStepParam,
		provider: providerParam
	} = useParams<{
		contextIdTag: string
		providerType?: 'idp' | 'domain'
		idpStep?: 'select' | 'name'
		provider?: string
	}>()
	const navigate = useNavigate()
	const [auth] = useAuth()
	const { addPendingCommunity } = useCommunitiesList()
	const { switchTo } = useContextSwitch()

	// State
	const [identityProviders, setIdentityProviders] = React.useState<string[]>(['cloudillo.net'])
	const identityProvider = idpStepParam ? 'idp' : providerType
	const [selectedProvider, setSelectedProvider] = React.useState<string>(
		providerParam || 'cloudillo.net'
	)
	const [providerInfoMap, setProviderInfoMap] = React.useState<Record<string, Types.IdpInfo>>({})
	const idpStep = idpStepParam || 'select'
	const [idTagInput, setIdTagInput] = React.useState('')
	const [appDomain, setAppDomain] = React.useState('')
	const [displayName, setDisplayName] = React.useState('')
	const [verifyState, setVerifyState] = React.useState<LocalVerifyResult | undefined>()
	const [verifyProgress, setVerifyProgress] = React.useState<'vfy' | undefined>()
	const [progress, setProgress] = React.useState<
		undefined | 'creating' | 'checking' | 'done' | 'pending-dns' | 'error'
	>()
	const [error, setError] = React.useState<string | undefined>()

	// Fetch identity providers on mount
	React.useEffect(() => {
		if (!api) return

		;(async function () {
			try {
				// Use profile verify to get identity providers list
				const res = await api.profile.verify({
					type: 'ref',
					idTag: '',
					token: ''
				})
				const providers =
					res.identityProviders && res.identityProviders.length > 0
						? res.identityProviders
						: ['cloudillo.net']
				setIdentityProviders(providers)
				// Only set selected provider from API if not provided in URL
				if (!providerParam) {
					setSelectedProvider(providers[0])
				}

				// Fetch provider info
				const infoMap: Record<string, Types.IdpInfo> = {}
				for (const provider of providers) {
					try {
						const info = await api.idp.getInfo(provider)
						infoMap[provider] = info
					} catch (e) {
						console.log(`Provider info not available for ${provider}`)
					}
				}
				setProviderInfoMap(infoMap)
			} catch (err) {
				console.log('Error fetching identity providers:', err)
			}
		})()
	}, [api])

	// Gateway selection handler
	function onSelectProviderType(provider: 'idp' | 'domain') {
		setIdTagInput('')
		setAppDomain('')
		setDisplayName('')
		setVerifyState(undefined)
		if (provider === 'idp') {
			navigate(`/communities/create/${contextIdTag}/idp/select`)
		} else {
			navigate(`/communities/create/${contextIdTag}/${provider}`)
		}
	}

	// IDP provider selection continue handler
	function onIdpProviderContinue() {
		setIdTagInput('')
		setVerifyState(undefined)
		navigate(
			`/communities/create/${contextIdTag}/idp/name/${encodeURIComponent(selectedProvider)}`
		)
	}

	// Go back handler
	function onGoBack() {
		if (identityProvider === 'idp' && idpStep === 'name') {
			setIdTagInput('')
			setVerifyState(undefined)
			navigate(`/communities/create/${contextIdTag}/idp/select`)
		} else {
			setIdTagInput('')
			setAppDomain('')
			setDisplayName('')
			setVerifyState(undefined)
			navigate(`/communities/create/${contextIdTag}`)
		}
	}

	// Debounced verification
	const onChangeVerify = React.useCallback(
		debounce(async function onVerify(idTag: string, providerOrAppDomain?: string) {
			if (!idTag || !api) return

			setVerifyProgress('vfy')
			setVerifyState(undefined)

			try {
				const fullIdTag =
					identityProvider === 'domain' ? idTag : idTag + '.' + selectedProvider

				const res = await api.profile.verify({
					type: identityProvider || 'idp',
					idTag: fullIdTag,
					appDomain: identityProvider === 'domain' ? providerOrAppDomain : undefined,
					token: ''
				})
				setVerifyProgress(undefined)
				setVerifyState(res)
			} catch (err) {
				console.log('ERROR', err)
				setVerifyProgress(undefined)
				// Set network error state so user knows verification failed
				setVerifyState({
					address: [],
					identityProviders: [],
					idTagError: 'network'
				})
			}
		}, 500),
		[identityProvider, selectedProvider, api]
	)

	// Check if domain is accessible
	async function checkDomainAccessible(idTag: string): Promise<boolean> {
		try {
			const res = await fetch(`https://cl-o.${idTag}/api/me`)
			return res.ok
		} catch (err) {
			return false
		}
	}

	// Submit handler
	async function onSubmit(evt: React.FormEvent) {
		evt.preventDefault()
		if (!api) return

		setProgress('creating')
		setError(undefined)

		const fullIdTag =
			identityProvider === 'domain' ? idTagInput : idTagInput + '.' + selectedProvider

		try {
			// Create the community
			const result = await api.communities.create(fullIdTag, {
				type: identityProvider || 'idp',
				name: displayName || idTagInput,
				appDomain: identityProvider === 'domain' ? appDomain : undefined,
				token: '' // Token will be generated by backend for authenticated user
			})

			setProgress('checking')

			// Check if accessible
			const accessible = await checkDomainAccessible(fullIdTag)

			if (accessible) {
				setProgress('done')
				addPendingCommunity({
					idTag: fullIdTag,
					name: displayName || idTagInput,
					isPending: false
				})
			} else {
				setProgress('pending-dns')
				addPendingCommunity({
					idTag: fullIdTag,
					name: displayName || idTagInput,
					isPending: true
				})
			}
		} catch (err) {
			console.log('ERROR creating community:', err)
			setProgress('error')
			setError(err instanceof Error ? err.message : 'Community creation failed')
		}
	}

	// Open community handler
	function handleOpenCommunity() {
		const fullIdTag =
			identityProvider === 'domain' ? idTagInput : idTagInput + '.' + selectedProvider

		switchTo(fullIdTag, '/feed').catch((err) => {
			console.error('Failed to switch to community:', err)
		})
	}

	// Retry handler
	function handleRetry() {
		setProgress(undefined)
		setError(undefined)
	}

	// Render progress step
	if (progress) {
		const fullIdTag =
			identityProvider === 'domain' ? idTagInput : idTagInput + '.' + selectedProvider

		return (
			<div className="c-panel d-block p-4">
				<ProgressStep
					progress={progress}
					error={error}
					communityIdTag={fullIdTag}
					communityName={displayName || idTagInput}
					onRetry={handleRetry}
					onOpenCommunity={handleOpenCommunity}
				/>
			</div>
		)
	}

	// Render the appropriate step
	return (
		<form className="c-panel d-block p-4" onSubmit={onSubmit}>
			{/* Gateway: Choose IDP vs Domain */}
			{!identityProvider && (
				<ProviderSelectionStep mode="community" onSelectProvider={onSelectProviderType} />
			)}

			{/* IDP flow - Step 1: Provider selection */}
			{identityProvider === 'idp' && idpStep === 'select' && (
				<ProviderSelectorStep
					mode="community"
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

			{/* IDP flow - Step 2: Name entry */}
			{identityProvider === 'idp' && idpStep === 'name' && (
				<IdpNameStep
					selectedProvider={selectedProvider}
					providerInfo={providerInfoMap[selectedProvider]}
					idTagInput={idTagInput}
					setIdTagInput={setIdTagInput}
					displayName={displayName}
					setDisplayName={setDisplayName}
					verifyState={verifyState}
					progress={verifyProgress}
					onVerify={(idTag) => onChangeVerify(idTag, selectedProvider)}
					onSubmit={onSubmit}
					onGoBack={onGoBack}
				/>
			)}

			{/* Domain setup */}
			{identityProvider === 'domain' && (
				<DomainSetupStep
					idTagInput={idTagInput}
					setIdTagInput={setIdTagInput}
					appDomain={appDomain}
					setAppDomain={setAppDomain}
					displayName={displayName}
					setDisplayName={setDisplayName}
					verifyState={verifyState}
					progress={verifyProgress}
					onVerify={onChangeVerify}
					onSubmit={onSubmit}
					onGoBack={onGoBack}
				/>
			)}
		</form>
	)
}
// vim: ts=4
