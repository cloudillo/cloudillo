// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type * as Types from '@cloudillo/core'
import {
	ActionBar,
	Alert,
	Badge,
	Button,
	Card,
	CodeBlock,
	Field,
	Grid,
	Heading,
	IconText,
	Input,
	Logo,
	Panel,
	RadioGroup,
	Text,
	type useApi,
	useDialog
} from '@cloudillo/react'
import debounce from 'debounce'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuAtSign as IcAt,
	LuUsers as IcCommunity,
	LuTriangleAlert as IcError,
	LuChevronsLeft as IcGoBack,
	LuRefreshCw as IcLoading,
	LuCheck as IcOk
} from 'react-icons/lu'

////////////////////
// Step headings //
////////////////////
export function CommunityTitle() {
	const { t } = useTranslation()
	return (
		<Heading level={1} className="mb-3">
			<IconText icon={<IcCommunity />}>{t('Create a Community')}</IconText>
		</Heading>
	)
}

function WelcomeTitle() {
	const { t } = useTranslation()
	return (
		<>
			<Logo className="w-50 float-right ps-3 pb-3" />
			<Heading level={1} className="mb-3">
				{t('Welcome to Cloudillo!')}
			</Heading>
		</>
	)
}

/** Trailing status icon of a verified input */
function VerifyIcon({ state }: { state?: 'checking' | 'valid' | 'warning' | 'invalid' }) {
	switch (state) {
		case 'checking':
			return <IcLoading className="animate-rotate-cw" />
		case 'valid':
			return <IcOk className="text-success" />
		case 'warning':
			return <IcError className="text-warning" />
		case 'invalid':
			return <IcError className="text-error" />
		default:
			return null
	}
}

///////////////////////////
// ProviderSelectionStep //
///////////////////////////
export interface ProviderSelectionStepProps {
	mode: 'register' | 'community'
	onSelectProvider: (provider: 'idp' | 'domain') => void
}

export function ProviderSelectionStep({ mode, onSelectProvider }: ProviderSelectionStepProps) {
	const { t } = useTranslation()
	const dialog = useDialog()

	async function onClickIdentityInfo() {
		await dialog.tell(
			t('What is Identity?'),
			t(
				'REGISTER-FORM-IDENTITY-INFO',
				`Your Cloudillo identity is how others find and connect with you — like an email address.

**Two options:**

1. **Use an Identity Provider** — Get an identity like **@yourname.cloudillo.net**. Quick setup, no technical knowledge needed.

2. **Use your own domain** — Get an identity like **@yourname.com**. Full control over your identity, but requires DNS setup.

Your identity is separate from where your data is stored. You control your data regardless of which option you choose.`
			)
		)
	}

	const register = mode === 'register'
	const beLabel = register ? t("You'll be") : t('Your community will be')

	return (
		<>
			{register ? <WelcomeTitle /> : <CommunityTitle />}

			<Heading level={3} className="my-3">
				{register
					? t('How would you like to be known?')
					: t('How would you like your community to be identified?')}
			</Heading>

			<Grid min="16rem" gap={3}>
				<Card
					className="animate-fade-slide-up stagger-1"
					title={
						register ? t('Use my own domain as my identity') : t('Use your own domain')
					}
					onClick={() => onSelectProvider('domain')}
				>
					<Text as="p" emphasis="muted">
						{beLabel}{' '}
						<Text weight="bold">{register ? '@yourname.com' : '@myteam.com'}</Text>
					</Text>
					<Text as="p" size="sm">
						{t('Full control, requires DNS setup')}
					</Text>
				</Card>
				<Card
					className="animate-fade-slide-up stagger-2"
					color="primary"
					title={t('Use an Identity Provider')}
					onClick={() => onSelectProvider('idp')}
				>
					<Text as="p" emphasis="muted">
						{beLabel}{' '}
						<Text weight="bold">
							{register ? '@yourname.provider.net' : '@myteam.provider.net'}
						</Text>
					</Text>
					<Text as="p" size="sm">
						{t('Quick setup - choose from available providers')}
					</Text>
				</Card>
			</Grid>

			{register && (
				<Text as="p" size="sm" emphasis="muted" className="mt-4">
					{t('This choice is hard to change later - pick what fits you best.')}{' '}
					<Button variant="link" size="sm" onClick={onClickIdentityInfo}>
						{t('Learn more')}
					</Button>
				</Text>
			)}
		</>
	)
}

//////////////////////////
// ProviderSelectorStep //
//////////////////////////
export interface ProviderSelectorStepProps {
	mode: 'register' | 'community'
	identityProviders: string[]
	providerInfoMap: Record<string, Types.IdpInfo>
	selectedProvider: string
	onSelectProvider: (provider: string) => void
	onProviderInfoFetched: (provider: string, info: Types.IdpInfo) => void
	onContinue: () => void
	onGoBack: () => void
	api: ReturnType<typeof useApi>['api']
}

// Radio value of the "Other provider" option (never a valid domain)
const CUSTOM_PROVIDER = ' custom'

export function ProviderSelectorStep({
	mode,
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
	const [customProviderState, setCustomProviderState] = React.useState<
		'idle' | 'checking' | 'valid' | 'invalid'
	>('idle')
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

	// Debounced provider check - use useMemo to create stable debounced function
	// and useEffect to clean up pending calls when dependencies change or unmount
	const checkCustomProvider = React.useMemo(
		() =>
			debounce(async (provider: string) => {
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
			}, 500),
		[api, onSelectProvider, onProviderInfoFetched]
	)

	// Clean up debounced function on unmount or when dependencies change
	React.useEffect(() => {
		return () => {
			checkCustomProvider.clear()
		}
	}, [checkCustomProvider])

	function handleCustomChange(value: string) {
		setCustomProvider(value)
		setCustomProviderState('idle')
		setCustomProviderInfo(undefined)
		onSelectProvider('')
		checkCustomProvider(value)
	}

	const isValid = selectedProvider !== '' && (!showCustom || customProviderState === 'valid')

	const previewName = mode === 'register' ? 'yourname' : 'communityname'

	const options = [
		...identityProviders.map((provider, index) => {
			const info = providerInfoMap[provider]
			return {
				value: provider,
				label: (
					<>
						{provider}{' '}
						{index === 0 && (
							<Badge variant="soft" size="sm">
								{t('Default')}
							</Badge>
						)}
					</>
				),
				description:
					info?.info ??
					(mode === 'register' ? t('Provider information not available') : undefined)
			}
		}),
		{
			value: CUSTOM_PROVIDER,
			label: t('Other provider...'),
			description: t('Enter a provider domain you know')
		}
	]

	return (
		<>
			{mode === 'register' ? <WelcomeTitle /> : <CommunityTitle />}

			<Heading level={3} className="my-3">
				{t('Choose an Identity Provider')}
			</Heading>
			<Panel variant="soft" className="my-3">
				<Text as="p" align="center" size="sm" emphasis="muted">
					{mode === 'register' ? t('Your identity will be') : t('Your community will be')}
				</Text>
				<Text
					as="p"
					key={selectedProvider}
					align="center"
					size="xl"
					weight="semibold"
					className="animate-scale-in"
				>
					<Text color="accent">@{previewName}</Text>
					<Text
						color={selectedProvider ? 'primary' : undefined}
						emphasis={selectedProvider ? undefined : 'disabled'}
					>
						.{selectedProvider || 'provider.net'}
					</Text>
				</Text>
			</Panel>

			<RadioGroup
				variant="card"
				aria-label={t('Choose an Identity Provider')}
				options={options}
				value={showCustom ? CUSTOM_PROVIDER : selectedProvider}
				onChange={(value) =>
					value === CUSTOM_PROVIDER ? handleCustomSelect() : handleProviderSelect(value)
				}
			/>

			{showCustom && (
				<Field label={t('Provider domain')} className="mt-2">
					<Input
						type="text"
						autoFocus
						value={customProvider}
						onChange={(e) => handleCustomChange(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault()
								if (isValid) onContinue()
							}
						}}
						placeholder={t('example.provider.net')}
						trailing={
							customProviderState === 'idle' ? undefined : (
								<VerifyIcon state={customProviderState} />
							)
						}
					/>
				</Field>
			)}
			{showCustom && customProviderState === 'invalid' && (
				<Alert color="error" compact className="mt-2">
					{t('This provider is not available or does not support Cloudillo identity.')}
				</Alert>
			)}
			{showCustom && customProviderState === 'valid' && customProviderInfo && (
				<Alert color="info" compact className="mt-2">
					{customProviderInfo.info}
				</Alert>
			)}

			<ActionBar>
				<Button icon={<IcGoBack />} onClick={onGoBack}>
					{t('Back')}
				</Button>
				<Button color="primary" onClick={onContinue} disabled={!isValid}>
					{mode === 'register' ? t('Continue with selected provider') : t('Continue')}
				</Button>
			</ActionBar>
		</>
	)
}

/////////////////
// IdTagInput //
/////////////////
export type IdTagError = '' | 'invalid' | 'used' | 'nodns' | 'address' | 'network' | undefined

export interface IdTagInputProps {
	value: string
	onChange: (value: string) => void
	onVerify: (value: string) => void
	progress?: 'vfy'
	error?: IdTagError
	label: string
	placeholder: string
	suffix?: string // e.g., "cloudillo.net" for IDP mode, undefined for domain mode
	mode: 'idp' | 'domain' // affects icon colors for nodns/address errors
}

export function IdTagInput({
	value,
	onChange,
	onVerify,
	progress,
	error,
	label,
	placeholder,
	suffix,
	mode
}: IdTagInputProps) {
	const showWarning =
		error === 'network' || (mode === 'domain' && (error === 'nodns' || error === 'address'))
	const showError = !!error && error !== 'network' && !showWarning
	const state = progress
		? 'checking'
		: !value
			? undefined
			: error === ''
				? 'valid'
				: showWarning
					? 'warning'
					: showError
						? 'invalid'
						: undefined

	return (
		<Field label={label} className="my-3">
			<Input
				name="idTag"
				onChange={(evt: React.ChangeEvent<HTMLInputElement>) => {
					onChange(evt.target.value)
					onVerify(evt.target.value)
				}}
				value={value}
				placeholder={placeholder}
				autoFocus
				leading={<IcAt />}
				trailing={
					<>
						<VerifyIcon state={state} />
						{suffix && <Text emphasis="muted">.{suffix}</Text>}
					</>
				}
			/>
		</Field>
	)
}

/////////////////////
// IdTagErrorPanel //
/////////////////////
export interface IdTagErrorPanelProps {
	error?: IdTagError
	mode: 'idp' | 'domain'
}

export function IdTagErrorPanel({ error, mode }: IdTagErrorPanelProps) {
	const { t } = useTranslation()

	if (error === 'network') {
		return (
			<Alert color="warning" className="mt-2">
				{t(
					'Could not verify availability. Please check your internet connection and try again.'
				)}
			</Alert>
		)
	}

	if (error === 'invalid') {
		return (
			<Alert color="error" className="mt-2">
				{mode === 'idp'
					? t(
							'This name contains invalid characters. Use only letters, numbers, and hyphens.'
						)
					: t('Please enter a valid domain name (e.g., example.com)')}
			</Alert>
		)
	}

	if (error === 'used') {
		return (
			<Alert color="error" className="mt-2">
				{mode === 'idp'
					? t('This name is already taken. Please try another one.')
					: t('This domain is already registered with this Cloudillo instance.')}
			</Alert>
		)
	}

	return null
}

////////////////////
// AppDomainInput //
////////////////////
export interface AppDomainInputProps {
	value: string
	onChange: (value: string) => void
	onVerify: (value: string) => void
	idTagInput: string
	progress?: 'vfy'
	error?: IdTagError
	identityLabel: string // "Your identity:" or "Community identity:"
	accessLabel: string // "Where will you access Cloudillo?" or "Where will the community be accessed?"
}

export function AppDomainInput({
	value,
	onChange,
	onVerify,
	idTagInput,
	progress,
	error,
	identityLabel,
	accessLabel
}: AppDomainInputProps) {
	const { t } = useTranslation()

	const showWarning = error === 'nodns' || error === 'address'
	const state = progress
		? 'checking'
		: error === ''
			? 'valid'
			: showWarning
				? 'warning'
				: error
					? 'invalid'
					: undefined

	return (
		<>
			<Text as="p" size="sm" emphasis="muted" className="mt-3">
				{identityLabel} <Text weight="bold">@{idTagInput}</Text> ✓
			</Text>
			<Field
				label={accessLabel}
				hint={t(
					'Usually the same as your identity domain. Use a subdomain only if your main domain already has a website.'
				)}
				className="mb-3"
			>
				<Input
					name="app-domain"
					onChange={(evt: React.ChangeEvent<HTMLInputElement>) => {
						onChange(evt.target.value)
						onVerify(evt.target.value)
					}}
					value={value}
					placeholder={idTagInput}
					leading={<Text emphasis="muted">{t('App address:')}</Text>}
					trailing={<VerifyIcon state={state} />}
				/>
			</Field>
		</>
	)
}

/////////////////////////
// AppDomainErrorPanel //
/////////////////////////
export interface AppDomainErrorPanelProps {
	error?: IdTagError
	idTagInput: string
	appDomain: string
}

export function AppDomainErrorPanel({ error, idTagInput, appDomain }: AppDomainErrorPanelProps) {
	const { t } = useTranslation()

	if (error === 'invalid') {
		return (
			<Alert color="error" className="mt-2">
				{t('Please enter a valid domain name.')}
			</Alert>
		)
	}

	if (error === 'used') {
		return (
			<Alert color="error" className="mt-2">
				{t('This app address is already in use.')}
			</Alert>
		)
	}

	if (error === 'address') {
		return (
			<Alert color="warning" className="mt-2">
				{!appDomain
					? t(
							'Your domain already has a website. Use the App address field above to set a subdomain for Cloudillo (e.g., cloudillo.{{idTag}}).',
							{ idTag: idTagInput }
						)
					: t(
							'This app address also points to another website. Try a different subdomain in the App address field (e.g., cloudillo.{{idTag}}).',
							{ idTag: idTagInput }
						)}
			</Alert>
		)
	}

	return null
}

/////////////////////
// DnsInstructions //
/////////////////////
export interface DnsInstructionsProps {
	idTagInput: string
	appDomain: string
	address: string
	idTagError?: IdTagError
	appDomainError?: IdTagError
}

export function DnsInstructions({
	idTagInput,
	appDomain,
	address,
	idTagError,
	appDomainError
}: DnsInstructionsProps) {
	const { t } = useTranslation()

	const recordType = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(address) ? 'A' : 'CNAME'
	const needsApiDns = idTagError === 'nodns' || idTagError === 'address'
	const needsAppDns = appDomainError === 'nodns' || appDomainError === 'address'

	const records: string[] = []
	if (needsApiDns) {
		records.push(`cl-o.${idTagInput} IN ${recordType} ${address}`)
	}
	if (needsAppDns) {
		records.push(`${appDomain || idTagInput} IN ${recordType} ${address}`)
	}

	return (
		<Alert color="warning" title={t('One small step: connect your domain')} className="my-3">
			<Text as="p" size="sm">
				{t('Add these records in your domain settings:')}
			</Text>
			<CodeBlock copyable>{records.join('\n')}</CodeBlock>
			<Text as="p" size="sm" emphasis="muted" className="mt-2">
				{t("Where to do this: GoDaddy, Namecheap, Cloudflare - 'DNS Settings'")}{' '}
				{t('Changes can take up to an hour to work.')}
			</Text>
		</Alert>
	)
}

// vim: ts=4
