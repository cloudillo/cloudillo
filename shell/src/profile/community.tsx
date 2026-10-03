// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type * as Types from '@cloudillo/core'
import {
	ActionBar,
	Alert,
	Button,
	Card,
	EmptyState,
	Field,
	Form,
	Heading,
	HBox,
	Input,
	LoadingSpinner,
	Logo,
	Panel,
	ProfileCard,
	Text,
	TimeFormat,
	useApi,
	useAuth,
	VBox
} from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import debounce from 'debounce'
import { useAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuPlus as IcCreate,
	LuChevronsLeft as IcGoBack,
	LuArrowRight as IcUseInvite
} from 'react-icons/lu'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import {
	contextOnboardingAtom,
	useCommunitiesList,
	useContextSwitch,
	useCtx
} from '../context/index.js'
import { communityCreatePath } from '../routes.js'
import {
	AppDomainErrorPanel,
	AppDomainInput,
	CommunityTitle,
	DnsInstructions,
	type IdTagError,
	IdTagErrorPanel,
	IdTagInput,
	ProviderSelectionStep,
	ProviderSelectorStep
} from './shared.js'

// Extended local type that includes 'network' error (not returned by API, but used for local error handling)
type LocalVerifyResult = Omit<Types.CommunityVerifyResult, 'idTagError'> & {
	idTagError?: IdTagError
}

function DisplayNameField({
	value,
	onChange,
	placeholder
}: {
	value: string
	onChange: (value: string) => void
	placeholder: string
}) {
	const { t } = useTranslation()
	return (
		<Field label={t('Display name')} className="my-3">
			<Input
				name="displayName"
				type="text"
				onChange={(evt: React.ChangeEvent<HTMLInputElement>) => onChange(evt.target.value)}
				value={value}
				placeholder={placeholder}
			/>
		</Field>
	)
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
	onGoBack
}: IdpNameStepProps) {
	const { t } = useTranslation()

	return (
		<>
			<CommunityTitle />

			<Heading level={3} className="my-3">
				{t('Name your community on {{provider}}', {
					provider: providerInfo?.name || selectedProvider
				})}
			</Heading>
			<Text as="p" emphasis="muted" className="mb-3">
				{t('Your community will be')}{' '}
				<Text weight="bold">
					@{idTagInput || 'communityname'}.{selectedProvider}
				</Text>
			</Text>

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

			<DisplayNameField
				value={displayName}
				onChange={setDisplayName}
				placeholder={t('My Community')}
			/>

			<Text as="p" size="sm" emphasis="muted">
				{t('You can change the display name later.')}
			</Text>

			<ActionBar>
				<Button icon={<IcGoBack />} onClick={onGoBack}>
					{t('Back')}
				</Button>
				<Button
					color="primary"
					type="submit"
					icon={<IcCreate />}
					disabled={verifyState?.idTagError !== '' || !idTagInput}
				>
					{t('Create Community')}
				</Button>
			</ActionBar>
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
			<CommunityTitle />

			<Heading level={3} className="my-3">
				{t('Use your domain for your community')}
			</Heading>

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
				<DisplayNameField
					value={displayName}
					onChange={setDisplayName}
					placeholder={t('My Team')}
				/>
			)}

			<ActionBar>
				<Button icon={<IcGoBack />} onClick={onGoBack}>
					{t('Back')}
				</Button>
				<Button
					color="primary"
					type="submit"
					icon={<IcCreate />}
					disabled={verifyState?.idTagError !== '' || verifyState?.appDomainError !== ''}
				>
					{t('Create Community')}
				</Button>
			</ActionBar>
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
	const created = (
		<>
			<Text weight="bold">{communityName}</Text> ({communityIdTag})
		</>
	)

	return (
		<>
			<CommunityTitle />

			{progress === 'creating' && (
				<EmptyState
					size="lg"
					icon={<Logo size="6rem" animated />}
					title={t('Creating your community...')}
					description={t('This usually takes only a few seconds, please be patient...')}
				/>
			)}

			{progress === 'checking' && (
				<EmptyState
					size="lg"
					icon={<Logo size="6rem" animated />}
					title={t('Community created!')}
					description={t('Checking if your community is accessible...')}
				/>
			)}

			{progress === 'done' && (
				<EmptyState
					size="lg"
					icon={<Logo size="6rem" />}
					title={t('Your community is ready!')}
					description={created}
					actions={
						<Button color="primary" onClick={onOpenCommunity}>
							{t('Open Community')}
						</Button>
					}
				/>
			)}

			{progress === 'pending-dns' && (
				<>
					<EmptyState
						size="lg"
						icon={<Logo size="6rem" />}
						title={t('Community created!')}
						description={created}
					/>
					<Alert
						color="warning"
						title={t(
							'Your community has been created, but DNS propagation is still in progress.'
						)}
					>
						{t(
							"It's been added to your sidebar. You can try opening it in a few minutes."
						)}
					</Alert>
				</>
			)}

			{progress === 'error' && (
				<>
					<EmptyState
						size="lg"
						color="error"
						icon={<Logo size="6rem" />}
						title={t('Something went wrong')}
						description={t('Please try again or contact support.')}
						actions={
							<Button color="primary" onClick={onRetry}>
								{t('Try Again')}
							</Button>
						}
					/>
					{error && <Alert color="error">{error}</Alert>}
				</>
			)}
		</>
	)
}

////////////////////////
// InviteChooserStep //
////////////////////////
interface InviteChooserStepProps {
	onSelectInvite: (refId: string) => void
}

function InviteChooserStep({ onSelectInvite }: InviteChooserStepProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const [invites, setInvites] = React.useState<ActionView[] | undefined>()
	const [loading, setLoading] = React.useState(true)

	React.useEffect(
		function loadInvites() {
			if (!api) return
			;(async function () {
				try {
					const actions = await api.actions.list({ type: 'PRINVT', status: ['C', 'A'] })
					// The PRINVT action shares its ref's expiry; used refs still slip through
					// (use_ref doesn't update the action) and are caught in onSubmit.
					const now = Date.now()
					setInvites(
						actions.filter(({ expiresAt }) => {
							if (expiresAt === undefined) return true
							const ms =
								typeof expiresAt === 'number'
									? expiresAt * 1000
									: Date.parse(expiresAt)
							return !(ms <= now)
						})
					)
				} catch (err) {
					console.log('Error loading community invites:', err)
					setInvites([])
				} finally {
					setLoading(false)
				}
			})()
		},
		[api]
	)

	return (
		<>
			<CommunityTitle />

			<Heading level={3} className="my-3">
				{t('Select an invitation')}
			</Heading>
			<Text as="p" emphasis="muted" className="mb-3">
				{t('Community creation requires an invitation from a server administrator.')}
			</Text>

			{loading && <LoadingSpinner label={t('Loading invitations...')} />}

			{!loading && invites && invites.length > 0 && (
				<VBox gap={2}>
					{invites.map((invite) => {
						const content = invite.content as
							| {
									refId?: string
									inviteUrl?: string
									nodeName?: string
									message?: string
							  }
							| undefined
						return (
							<Card key={invite.actionId}>
								<HBox gap={2} align="center">
									<ProfileCard className="flex-fill" profile={invite.issuer} />
									<TimeFormat time={invite.createdAt} />
								</HBox>
								{content?.message && (
									<Text as="p" emphasis="muted">
										{content.message}
									</Text>
								)}
								<ActionBar>
									<Button
										color="primary"
										icon={<IcUseInvite />}
										onClick={() =>
											content?.refId && onSelectInvite(content.refId)
										}
										disabled={!content?.refId}
									>
										{t('Use this invite')}
									</Button>
								</ActionBar>
							</Card>
						)
					})}
				</VBox>
			)}

			{!loading && (!invites || invites.length === 0) && (
				<Alert color="info">
					{t(
						"You don't have any community creation invites yet. Ask your server administrator for one."
					)}
				</Alert>
			)}
		</>
	)
}

/////////////////////
// CreateCommunity //
/////////////////////
export function CreateCommunity() {
	const { api } = useApi()
	const {
		providerType,
		idpStep: idpStepParam,
		provider: providerParam
	} = useParams<{
		providerType?: 'idp' | 'domain'
		idpStep?: 'select' | 'name'
		provider?: string
	}>()
	const ctx = useCtx()
	const navigate = useNavigate()
	const location = useLocation()
	const [auth] = useAuth()
	const { addPendingCommunity } = useCommunitiesList()
	const { switchTo } = useContextSwitch()
	const [, setContextOnboarding] = useAtom(contextOnboardingAtom)

	// Invite gating
	const isSadm = auth?.roles?.includes('SADM')
	const inviteParam = new URLSearchParams(location.search).get('invite')
	const [inviteRef, setInviteRef] = React.useState<string | undefined>(inviteParam || undefined)

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
					} catch (_e) {
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
			navigate(communityCreatePath(ctx.base, ['idp', 'select']))
		} else {
			navigate(communityCreatePath(ctx.base, [provider]))
		}
	}

	// IDP provider selection continue handler
	function onIdpProviderContinue() {
		setIdTagInput('')
		setVerifyState(undefined)
		navigate(communityCreatePath(ctx.base, ['idp', 'name', selectedProvider]))
	}

	// Go back handler
	function onGoBack() {
		if (identityProvider === 'idp' && idpStep === 'name') {
			setIdTagInput('')
			setVerifyState(undefined)
			navigate(communityCreatePath(ctx.base, ['idp', 'select']))
		} else {
			setIdTagInput('')
			setAppDomain('')
			setDisplayName('')
			setVerifyState(undefined)
			navigate(communityCreatePath(ctx.base))
		}
	}

	// Debounced verification - use useMemo to create stable debounced function
	const onChangeVerify = React.useMemo(
		() =>
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

	// Clean up debounced function on unmount or when dependencies change
	React.useEffect(() => {
		return () => {
			onChangeVerify.clear()
		}
	}, [onChangeVerify])

	// Check if domain is accessible
	async function checkDomainAccessible(idTag: string): Promise<boolean> {
		try {
			const res = await fetch(`https://cl-o.${idTag}/api/me`)
			return res.ok
		} catch (_err) {
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
				token: '', // Token will be generated by backend for authenticated user
				inviteRef: inviteRef || undefined
			})

			// Identity not yet activated by the IDP — backend reports this via
			// the response's `onboarding` field. The community is held in
			// pending state until the user clicks the IDP activation email.
			const verifyIdpPending = result.onboarding === 'verify-idp'

			if (verifyIdpPending) {
				setContextOnboarding((prev) => ({ ...prev, [fullIdTag]: 'verify-idp' }))
			}

			setProgress('checking')

			// Check if accessible
			const accessible = await checkDomainAccessible(fullIdTag)

			if (verifyIdpPending) {
				setProgress('done')
				addPendingCommunity({
					idTag: fullIdTag,
					name: displayName || idTagInput,
					isPending: true,
					pendingReason: 'verify-idp'
				})
			} else if (accessible) {
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
					isPending: true,
					pendingReason: 'dns'
				})
			}
		} catch (err) {
			console.log('ERROR creating community:', err)
			setProgress('error')
			setError(err instanceof Error ? err.message : 'Community creation failed')
			// Invite rejected ("Ref has expired" / "Ref has already been used"): drop it so
			// Retry returns to the chooser instead of resubmitting the dead ref.
			if (err instanceof Error && /^Ref has /.test(err.message)) setInviteRef(undefined)
		}
	}

	// Open community handler
	async function handleOpenCommunity() {
		const fullIdTag =
			identityProvider === 'domain' ? idTagInput : idTagInput + '.' + selectedProvider
		try {
			await switchTo(fullIdTag)
		} catch (err) {
			console.error('Failed to switch to community:', err)
		}
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
			<Panel padding={4}>
				<ProgressStep
					progress={progress}
					error={error}
					communityIdTag={fullIdTag}
					communityName={displayName || idTagInput}
					onRetry={handleRetry}
					onOpenCommunity={handleOpenCommunity}
				/>
			</Panel>
		)
	}

	// Non-SADM users without invite need to pick one first
	const needsInvite = !isSadm && !inviteRef

	// Render the appropriate step
	return (
		<Panel padding={4}>
			<Form onSubmit={onSubmit}>
				{/* Invite chooser step for non-SADM users */}
				{needsInvite && !identityProvider && (
					<InviteChooserStep onSelectInvite={(refId) => setInviteRef(refId)} />
				)}

				{/* Gateway: Choose IDP vs Domain */}
				{!needsInvite && !identityProvider && (
					<ProviderSelectionStep
						mode="community"
						onSelectProvider={onSelectProviderType}
					/>
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
			</Form>
		</Panel>
	)
}
// vim: ts=4
