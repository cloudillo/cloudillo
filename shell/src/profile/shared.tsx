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
import { useTranslation } from 'react-i18next'
import debounce from 'debounce'

import {
	LuRefreshCw as IcLoading,
	LuCheck as IcOk,
	LuTriangleAlert as IcError,
	LuChevronsLeft as IcGoBack,
	LuUsers as IcCommunity
} from 'react-icons/lu'

import { useApi, useDialog, Button } from '@cloudillo/react'
import * as Types from '@cloudillo/base'

import { CloudilloLogo } from '../logo.js'

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

	if (mode === 'register') {
		return (
			<>
				<CloudilloLogo className="c-logo w-50 float-right ps-3 pb-3" />
				<header>
					<h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1>
				</header>

				<h3 className="my-3">{t('How would you like to be known?')}</h3>

				<div className="c-container">
					<div className="row g-3">
						<div className="col col-md-6">
							<div
								className="c-panel clickable h-100"
								onClick={() => onSelectProvider('domain')}
								style={{ cursor: 'pointer' }}
							>
								<h4 className="mb-2">{t('Use my own domain as my identity')}</h4>
								<p className="text-muted mb-2">
									{t("You'll be")} <b>@yourname.com</b>
								</p>
								<p className="small">{t('Full control, requires DNS setup')}</p>
							</div>
						</div>
						<div className="col col-md-6">
							<div
								className="c-panel primary clickable h-100"
								onClick={() => onSelectProvider('idp')}
								style={{ cursor: 'pointer' }}
							>
								<h4 className="mb-2">{t('Use an Identity Provider')}</h4>
								<p className="text-muted mb-2">
									{t("You'll be")} <b>@yourname.provider.net</b>
								</p>
								<p className="small">
									{t('Quick setup - choose from available providers')}
								</p>
							</div>
						</div>
					</div>
				</div>

				<p className="text-muted mt-4 small">
					<span className="me-2">ℹ️</span>
					{t('This choice is hard to change later - pick what fits you best.')}{' '}
					<button
						type="button"
						className="c-link text text-primary small"
						onClick={onClickIdentityInfo}
					>
						{t('Learn more')}
					</button>
				</p>
			</>
		)
	}

	// Community mode
	return (
		<>
			<header>
				<h1 className="mb-3">
					<IcCommunity className="me-2" />
					{t('Create a Community')}
				</h1>
			</header>

			<h3 className="my-3">{t('How would you like your community to be identified?')}</h3>

			<div className="c-container">
				<div className="row g-3">
					<div className="col col-md-6">
						<div
							className="c-panel clickable h-100"
							onClick={() => onSelectProvider('domain')}
							style={{ cursor: 'pointer' }}
						>
							<h4 className="mb-2">{t('Use your own domain')}</h4>
							<p className="text-muted mb-2">
								{t('Your community will be')} <b>@myteam.com</b>
							</p>
							<p className="small">{t('Full control, requires DNS setup')}</p>
						</div>
					</div>
					<div className="col col-md-6">
						<div
							className="c-panel primary clickable h-100"
							onClick={() => onSelectProvider('idp')}
							style={{ cursor: 'pointer' }}
						>
							<h4 className="mb-2">{t('Use an Identity Provider')}</h4>
							<p className="text-muted mb-2">
								{t('Your community will be')} <b>@myteam.provider.net</b>
							</p>
							<p className="small">
								{t('Quick setup - choose from available providers')}
							</p>
						</div>
					</div>
				</div>
			</div>
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

	// Debounced provider check
	const checkCustomProvider = React.useCallback(
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

	function handleCustomChange(value: string) {
		setCustomProvider(value)
		setCustomProviderState('idle')
		setCustomProviderInfo(undefined)
		onSelectProvider('')
		checkCustomProvider(value)
	}

	const isValid = selectedProvider !== '' && (!showCustom || customProviderState === 'valid')

	const previewName = mode === 'register' ? 'yourname' : 'communityname'

	return (
		<>
			{mode === 'register' ? (
				<>
					<CloudilloLogo className="c-logo w-50 float-right ps-3 pb-3" />
					<header>
						<h1 className="mb-3">{t('Welcome to Cloudillo!')}</h1>
					</header>
				</>
			) : (
				<header>
					<h1 className="mb-3">
						<IcCommunity className="me-2" />
						{t('Create a Community')}
					</h1>
				</header>
			)}

			<h3 className="my-3">{t('Choose an Identity Provider')}</h3>
			<p className="text-muted mb-3">
				{mode === 'register' ? t('Your identity will be') : t('Your community will be')}{' '}
				<b>
					@{previewName}.{selectedProvider || 'provider.net'}
				</b>
			</p>

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
									{index === 0 && (
										<span className="badge bg-secondary ms-2">
											{t('Default')}
										</span>
									)}
									{info && (
										<div
											className={`mt-2 mb-0 ${isSelected ? 'text-lg text-accent font-medium' : 'text-sm text-disabled'}`}
										>
											{info.info}
										</div>
									)}
									{!info && mode === 'register' && (
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
							<p className="text-muted small mb-0">
								{t('Enter a provider domain you know')}
							</p>
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
									{customProviderState === 'checking' && (
										<IcLoading className="animate-rotate-cw my-auto f-none" />
									)}
									{customProviderState === 'valid' && (
										<IcOk className="text-success my-auto f-none" />
									)}
									{customProviderState === 'invalid' && (
										<IcError className="text-error my-auto f-none" />
									)}
								</div>
							)}
							{showCustom && customProviderState === 'invalid' && (
								<div className="c-panel error mt-2 mb-0 p-2 small">
									{t(
										'This provider is not available or does not support Cloudillo identity.'
									)}
								</div>
							)}
							{showCustom &&
								customProviderState === 'valid' &&
								customProviderInfo && (
									<div className="c-panel info mt-2 mb-0 p-2 small">
										{customProviderInfo.info}
									</div>
								)}
						</div>
					</div>
				</div>
			</div>

			<footer className="c-group g-2 mt-4">
				<Button className="container-secondary" onClick={onGoBack}>
					<IcGoBack />
					{t('Back')}
				</Button>
				<Button className="primary" onClick={onContinue} disabled={!isValid}>
					{mode === 'register' ? t('Continue with selected provider') : t('Continue')}
				</Button>
			</footer>
		</>
	)
}
// vim: ts=4
