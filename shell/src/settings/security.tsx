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
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser'

import {
	LuFingerprint as IcPasskey,
	LuPlus as IcAdd,
	LuTrash as IcDelete,
	LuKey as IcApiKey,
	LuTriangleAlert as IcWarning,
	LuCopy as IcCopy,
	LuCheck as IcCheck,
	LuX as IcClose
} from 'react-icons/lu'

import { useAuth, useApi, useDialog, Button, Modal, LoadingSpinner } from '@cloudillo/react'
import type { WebAuthnCredential, ApiKeyListItem, CreateApiKeyResult } from '@cloudillo/core'

import { useSettings } from './settings.js'
import {
	setApiKey as swSetApiKey,
	getApiKey as swGetApiKey,
	deleteApiKey as swDeleteApiKey
} from '../pwa.js'

const AVAILABLE_SCOPES = [
	{
		value: 'apkg:publish',
		label: 'App Package Publish',
		description: 'Allows publishing app packages to the repository.'
	}
] as const

function scopeLabel(scope: string): string {
	return AVAILABLE_SCOPES.find((s) => s.value === scope)?.label ?? scope
}

// Create API Key Modal
interface CreateApiKeyModalProps {
	open: boolean
	onClose: () => void
	onCreated: (result: CreateApiKeyResult) => void
}

function CreateApiKeyModal({ open, onClose, onCreated }: CreateApiKeyModalProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const [name, setName] = React.useState('')
	const [selectedScopes, setSelectedScopes] = React.useState<string[]>([])
	const [isSubmitting, setIsSubmitting] = React.useState(false)
	const [error, setError] = React.useState<string | undefined>()

	React.useEffect(() => {
		if (open) {
			setName('')
			setSelectedScopes([])
			setError(undefined)
		}
	}, [open])

	function toggleScope(scope: string) {
		setSelectedScopes((prev) =>
			prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
		)
	}

	async function handleCreate() {
		if (!api) return
		setIsSubmitting(true)
		setError(undefined)

		try {
			const result = await api.auth.createApiKey({
				name: name || undefined,
				scopes: selectedScopes.length > 0 ? selectedScopes.join(',') : undefined
			})
			onCreated(result)
			onClose()
		} catch (err: unknown) {
			if (err instanceof Error) {
				setError(err.message)
			} else {
				setError(t('Failed to create API key'))
			}
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<Modal open={open} onClose={onClose}>
			<div className="c-dialog c-panel emph p-4" style={{ maxWidth: '500px', width: '100%' }}>
				<div className="c-hbox mb-3">
					<h3 className="flex-fill mb-0">{t('Create API Key')}</h3>
					<button className="c-link" onClick={onClose} aria-label={t('Close')}>
						<IcClose />
					</button>
				</div>

				{error && (
					<div className="c-panel bg-error-subtle p-2 mb-3">
						<span className="text-error">{error}</span>
					</div>
				)}

				<div className="mb-3">
					<label className="c-label">{t('Name (optional)')}</label>
					<input
						className="c-input"
						placeholder={t('e.g., CI pipeline')}
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				</div>

				<div className="mb-3">
					<label className="c-label">{t('Permissions')}</label>
					<div className="c-hint small mb-2">
						{t('Leave all unchecked for full access.')}
					</div>
					{AVAILABLE_SCOPES.map((scope) => (
						<label key={scope.value} className="c-hbox ai-start p-2">
							<input
								type="checkbox"
								className="c-toggle primary mr-2 mt-1"
								checked={selectedScopes.includes(scope.value)}
								onChange={() => toggleScope(scope.value)}
							/>
							<div>
								<span>{t(scope.label)}</span>
								<div className="c-hint small">{t(scope.description)}</div>
							</div>
						</label>
					))}
				</div>

				<div className="c-hbox jc-end g-2">
					<Button onClick={onClose}>{t('Cancel')}</Button>
					<Button primary disabled={isSubmitting} onClick={handleCreate}>
						{isSubmitting ? t('Creating...') : t('Create API Key')}
					</Button>
				</div>
			</div>
		</Modal>
	)
}

// API Key Created Modal (one-time plaintext key display)
interface ApiKeyCreatedModalProps {
	open: boolean
	result: CreateApiKeyResult | null
	onClose: () => void
}

function ApiKeyCreatedModal({ open, result, onClose }: ApiKeyCreatedModalProps) {
	const { t } = useTranslation()
	const [copied, setCopied] = React.useState(false)

	async function copyToClipboard() {
		if (!result) return
		try {
			await navigator.clipboard.writeText(result.plaintextKey)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch (err) {
			console.error('Failed to copy:', err)
		}
	}

	if (!result) return null

	const scopes = result.scopes?.split(',').filter(Boolean)

	return (
		<Modal open={open} onClose={onClose} closeOnBackdrop={false}>
			<div className="c-dialog c-panel emph p-4" style={{ maxWidth: '600px', width: '100%' }}>
				<div className="c-hbox ai-center mb-3">
					<IcApiKey className="text-primary mr-2" style={{ fontSize: '1.5rem' }} />
					<h3 className="flex-fill mb-0">{t('API Key Created')}</h3>
				</div>

				<div className="c-panel bg-warning-subtle p-2 mb-3">
					<div className="c-hbox ai-start">
						<IcWarning className="text-warning mr-2 mt-1 flex-shrink-0" />
						<div>
							<strong>{t('Save this key now!')}</strong>
							<p className="c-hint mb-0">
								{t('This key will only be shown once. Store it securely.')}
							</p>
						</div>
					</div>
				</div>

				<div className="mb-3">
					<label className="c-label">{t('API Key')}</label>
					<div className="c-hbox g-1">
						<code
							className="c-code flex-fill p-2"
							style={{ wordBreak: 'break-all', userSelect: 'all' }}
						>
							{result.plaintextKey}
						</code>
						<Button onClick={copyToClipboard} title={t('Copy API key')}>
							{copied ? <IcCheck /> : <IcCopy />}
						</Button>
					</div>
				</div>

				{scopes && scopes.length > 0 && (
					<div className="mb-3">
						<label className="c-label">{t('Scopes')}</label>
						<div className="c-hbox g-1 flex-wrap">
							{scopes.map((scope) => (
								<span key={scope} className="c-badge small">
									{scopeLabel(scope)}
								</span>
							))}
						</div>
					</div>
				)}

				<div className="c-hbox jc-end">
					<Button primary onClick={onClose}>
						{t("I've saved the key")}
					</Button>
				</div>
			</div>
		</Modal>
	)
}

export function SecuritySettings() {
	const { t } = useTranslation()
	const [_auth] = useAuth()
	const { api } = useApi()
	const dialog = useDialog()
	const { settings } = useSettings('sec')

	// Password change state
	const [currentPassword, setCurrentPassword] = React.useState('')
	const [newPassword, setNewPassword] = React.useState('')

	// WebAuthn state
	const [passkeys, setPasskeys] = React.useState<WebAuthnCredential[]>([])
	const [passkeyDescription, setPasskeyDescription] = React.useState('')
	const [isAddingPasskey, setIsAddingPasskey] = React.useState(false)
	const [webAuthnSupported] = React.useState(() => browserSupportsWebAuthn())

	// API Key state
	const [apiKeys, setApiKeys] = React.useState<ApiKeyListItem[]>([])
	const [stayLoggedIn, setStayLoggedIn] = React.useState(false)
	const [currentDeviceKeyPrefix, setCurrentDeviceKeyPrefix] = React.useState<string | undefined>()

	// Modal state
	const [showCreateModal, setShowCreateModal] = React.useState(false)
	const [showKeyCreatedModal, setShowKeyCreatedModal] = React.useState(false)
	const [createdKeyResult, setCreatedKeyResult] = React.useState<CreateApiKeyResult | null>(null)

	// Load passkeys and API keys on mount
	React.useEffect(
		function loadCredentials() {
			if (!api) return
			loadPasskeys()
			loadApiKeys()
			checkStayLoggedIn()
		},
		[api]
	)

	async function loadPasskeys() {
		if (!api) return
		try {
			const credentials = await api.auth.listWebAuthnCredentials()
			setPasskeys(credentials)
		} catch (err) {
			console.error('Failed to load passkeys:', err)
		}
	}

	async function loadApiKeys() {
		if (!api) return
		try {
			const keys = await api.auth.listApiKeys()
			setApiKeys(keys)
		} catch (err) {
			console.error('Failed to load API keys:', err)
		}
	}

	async function checkStayLoggedIn() {
		const storedKey = await swGetApiKey()
		setStayLoggedIn(!!storedKey)
		if (storedKey) {
			setCurrentDeviceKeyPrefix(storedKey.substring(0, 8))
		} else {
			setCurrentDeviceKeyPrefix(undefined)
		}
	}

	async function addPasskey() {
		if (!api) return
		setIsAddingPasskey(true)

		try {
			// Get registration challenge
			const challengeData = await api.auth.getWebAuthnRegChallenge()

			// Start browser registration
			// Note: options come from webauthn-rs which may have slightly different types
			const response = await startRegistration({
				optionsJSON: challengeData.options as Parameters<
					typeof startRegistration
				>[0]['optionsJSON']
			})

			// Complete registration with backend
			await api.auth.registerWebAuthnCredential({
				token: challengeData.token,
				response,
				description: passkeyDescription || undefined
			})

			setPasskeyDescription('')
			await loadPasskeys()

			await dialog.tell(
				t('Passkey added'),
				t('Your passkey has been registered successfully.')
			)
		} catch (err: unknown) {
			console.error('Failed to add passkey:', err)
			// NotAllowedError means user cancelled - don't show error
			if (err instanceof Error && err.name !== 'NotAllowedError') {
				await dialog.tell(t('Error'), err.message || t('Failed to add passkey'))
			}
		} finally {
			setIsAddingPasskey(false)
		}
	}

	async function deletePasskey(credentialId: string) {
		if (!api) return

		const confirmed = await dialog.confirm(
			t('Delete passkey?'),
			t(
				'This passkey will be permanently removed. You may lose access to your account if this is your only authentication method.'
			)
		)

		if (!confirmed) return

		try {
			await api.auth.deleteWebAuthnCredential(credentialId)
			await loadPasskeys()
		} catch (err: unknown) {
			if (err instanceof Error) {
				await dialog.tell(t('Error'), err.message || t('Failed to delete passkey'))
			}
		}
	}

	async function deleteApiKey(keyId: number, keyPrefix: string) {
		if (!api) return

		// Check if this is the current device's key
		const isCurrentDevice = currentDeviceKeyPrefix === keyPrefix

		const confirmed = await dialog.confirm(
			t('Delete API key?'),
			isCurrentDevice
				? t(
						'This is the API key for this device. Deleting it will log you out on next visit.'
					)
				: t('This API key will be permanently revoked.')
		)

		if (!confirmed) return

		try {
			await api.auth.deleteApiKey(keyId)
			if (isCurrentDevice) {
				await swDeleteApiKey()
				setStayLoggedIn(false)
				setCurrentDeviceKeyPrefix(undefined)
			}
			await loadApiKeys()
		} catch (err: unknown) {
			if (err instanceof Error) {
				await dialog.tell(t('Error'), err.message || t('Failed to delete API key'))
			}
		}
	}

	async function toggleStayLoggedIn(enabled: boolean) {
		if (!api) return

		if (enabled) {
			// Show security warning
			const confirmed = await dialog.confirm(
				t('Enable stay logged in?'),
				t(
					'This will create an API key stored on this device. Only use this on trusted devices. Anyone with access to this device will be able to access your account.'
				)
			)

			if (!confirmed) return

			try {
				// Create API key with device info as name
				const deviceName = `${navigator.platform || 'Device'} - ${new Date().toLocaleDateString()}`
				const result = await api.auth.createApiKey({
					name: deviceName
				})

				// Store the plaintext key in SW encrypted storage
				await swSetApiKey(result.plaintextKey)
				setStayLoggedIn(true)
				setCurrentDeviceKeyPrefix(result.plaintextKey.substring(0, 8))
				await loadApiKeys()
			} catch (err: unknown) {
				if (err instanceof Error) {
					await dialog.tell(t('Error'), err.message || t('Failed to create API key'))
				}
			}
		} else {
			// Find and delete the API key for this device
			if (currentDeviceKeyPrefix) {
				const matchingKey = apiKeys.find((k) => k.keyPrefix === currentDeviceKeyPrefix)

				if (matchingKey) {
					try {
						await api.auth.deleteApiKey(matchingKey.keyId)
					} catch (err) {
						console.error('Failed to delete API key:', err)
					}
				}
			}

			await swDeleteApiKey()
			setStayLoggedIn(false)
			setCurrentDeviceKeyPrefix(undefined)
			await loadApiKeys()
		}
	}

	function handleApiKeyCreated(result: CreateApiKeyResult) {
		setCreatedKeyResult(result)
		setShowKeyCreatedModal(true)
		loadApiKeys()
	}

	async function onChangePassword() {
		if (!api) throw new Error('Not authenticated')
		await api.auth.changePassword({ currentPassword, newPassword })
		setCurrentPassword('')
		setNewPassword('')
		await dialog.tell(t('Password changed'), t('Your password has been changed successfully.'))
	}

	if (!settings) return <LoadingSpinner />

	return (
		<>
			{/* Password Change Section */}
			<div className="c-panel">
				<h4 className="pb-2">{t('Change password')}</h4>
				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('Current password')}</span>
					<input
						className="c-input w-md"
						name="sec.current_password"
						type="password"
						value={currentPassword}
						onChange={(evt) => setCurrentPassword(evt.target.value)}
					/>
				</label>
				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('New password')}</span>
					<input
						className="c-input w-md"
						name="sec.new_password"
						type="password"
						value={newPassword}
						onChange={(evt) => setNewPassword(evt.target.value)}
					/>
				</label>
				<div className="c-group">
					<Button
						primary
						disabled={!currentPassword || !newPassword}
						onClick={onChangePassword}
					>
						{t('Change password')}
					</Button>
				</div>
			</div>

			{/* Passkeys Section */}
			{webAuthnSupported && (
				<div className="c-panel">
					<h4 className="c-hbox pb-2">
						<IcPasskey className="mr-2" />
						{t('Passkeys')}
					</h4>
					<p className="c-hint pb-2">
						{t('Use biometric authentication or security keys for passwordless login.')}
					</p>

					{/* List existing passkeys */}
					{passkeys.length > 0 && (
						<div className="mb-3">
							{passkeys.map((pk) => (
								<div key={pk.credentialId} className="c-hbox py-2 border-bottom">
									<IcPasskey className="mr-2" />
									<span className="flex-fill">{pk.description}</span>
									<button
										className="c-link text-error"
										onClick={() => deletePasskey(pk.credentialId)}
									>
										<IcDelete />
									</button>
								</div>
							))}
						</div>
					)}

					{/* Add new passkey */}
					<div className="c-hbox g-2">
						<input
							className="c-input w-lg"
							placeholder={t('Passkey name (optional)')}
							value={passkeyDescription}
							onChange={(e) => setPasskeyDescription(e.target.value)}
						/>
						<Button primary disabled={isAddingPasskey} onClick={addPasskey}>
							<IcAdd className="mr-1" />
							{t('Add passkey')}
						</Button>
					</div>
				</div>
			)}

			{/* Stay Logged In Section */}
			<div className="c-panel">
				<h4 className="c-hbox pb-2">
					<IcApiKey className="mr-2" />
					{t('Stay logged in')}
				</h4>
				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('Keep me logged in on this device')}</span>
					<input
						className="c-toggle primary"
						type="checkbox"
						checked={stayLoggedIn}
						onChange={(e) => toggleStayLoggedIn(e.target.checked)}
					/>
				</label>
				<div className="c-hbox text-warning pb-2">
					<IcWarning className="mr-2 flex-shrink-0" />
					<span className="c-hint">
						{t(
							'Only enable this on personal, trusted devices. The login credentials will be stored locally.'
						)}
					</span>
				</div>
			</div>

			{/* API Keys Section */}
			<div className="c-panel">
				<div className="c-hbox pb-2">
					<h4 className="c-hbox flex-fill mb-0">
						<IcApiKey className="mr-2" />
						{t('API Keys')}
					</h4>
					<Button primary className="small" onClick={() => setShowCreateModal(true)}>
						<IcAdd className="mr-1" />
						{t('Create API key')}
					</Button>
				</div>
				<p className="c-hint pb-2">
					{t(
						'API keys allow programmatic access or keeping devices logged in. Revoking a key will revoke its access.'
					)}
				</p>

				{apiKeys.length === 0 ? (
					<p className="c-hint">{t('No API keys yet.')}</p>
				) : (
					<div>
						{apiKeys.map((key) => {
							const isCurrentDevice = currentDeviceKeyPrefix === key.keyPrefix
							const scopes = key.scopes?.split(',').filter(Boolean)
							return (
								<div key={key.keyId} className="c-hbox py-2 border-bottom">
									<IcApiKey className="mr-2" />
									<div className="flex-fill">
										<div className="c-hbox ai-center g-1 flex-wrap">
											<span>{key.name || t('Unnamed key')}</span>
											{scopes && scopes.length > 0 ? (
												scopes.map((scope) => (
													<span key={scope} className="c-badge small">
														{scopeLabel(scope)}
													</span>
												))
											) : (
												<span className="c-badge small success">
													{t('Full access')}
												</span>
											)}
										</div>
										<div className="c-hint small">
											{key.keyPrefix}...
											{isCurrentDevice && (
												<span className="ml-2 text-primary">
													({t('this device')})
												</span>
											)}
										</div>
									</div>
									<button
										className="c-link text-error"
										onClick={() => deleteApiKey(key.keyId, key.keyPrefix)}
									>
										<IcDelete />
									</button>
								</div>
							)
						})}
					</div>
				)}
			</div>

			{/* Modals */}
			<CreateApiKeyModal
				open={showCreateModal}
				onClose={() => setShowCreateModal(false)}
				onCreated={handleApiKeyCreated}
			/>

			<ApiKeyCreatedModal
				open={showKeyCreatedModal}
				result={createdKeyResult}
				onClose={() => {
					setShowKeyCreatedModal(false)
					setCreatedKeyResult(null)
				}}
			/>
		</>
	)
}

// vim: ts=4
